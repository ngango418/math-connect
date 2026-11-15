import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  authenticateTeacher,
  createTeacherAccount,
  getTeacherByToken,
  loadDb,
  revokeSession,
  saveDb,
} from './server/store.ts';
import type {
  ClassId,
  DailyAssignmentRecord,
  DailyGradeRecord,
  GroupNumber,
  MissionCard,
  PublicStudentMissionResponse,
  SeedLevel,
  Student,
  TeacherUser,
} from './shared/types.ts';

const PORT = Number(process.env.PORT || 3000);

interface AuthenticatedRequest extends Request {
  teacher?: TeacherUser;
}

function extractToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return undefined;
}

function requireTeacherAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  const teacher = getTeacherByToken(token);
  if (!teacher) {
    res.status(401).json({ error: 'Vui lòng đăng nhập tài khoản giáo viên để thực hiện thao tác này.' });
    return;
  }
  req.teacher = teacher;
  next();
}

function normalizeClassId(raw: string | undefined): ClassId {
  if (!raw) return '9/23';
  const cleaned = raw.replace('-', '/').trim();
  if (cleaned === '9/23' || cleaned === '9/26' || cleaned === '9/28') {
    return cleaned;
  }
  return '9/23';
}

function normalizeGroupNumber(raw: string | number | undefined): GroupNumber {
  const n = Number(raw);
  if (n >= 1 && n <= 5) return n as GroupNumber;
  return 1;
}

function normalizeSeed(raw: unknown): SeedLevel {
  const n = Number(raw);
  if (n >= 1 && n <= 5) return Math.round(n) as SeedLevel;
  return 3;
}

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Auth endpoints
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'Vui lòng nhập đầy đủ email và mật khẩu.' });
      return;
    }
    const result = authenticateTeacher(email, password);
    if (!result) {
      res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác.' });
      return;
    }
    res.json(result);
  });

  app.post('/api/auth/register', (req, res) => {
    const { email, password, name, subject } = req.body as {
      email?: string;
      password?: string;
      name?: string;
      subject?: string;
    };
    if (!email || !password || password.length < 6) {
      res.status(400).json({ error: 'Email hợp lệ và mật khẩu tối thiểu 6 ký tự là bắt buộc.' });
      return;
    }
    try {
      createTeacherAccount(email, password, name || 'Giáo viên', subject || 'Khối 9');
      const auth = authenticateTeacher(email, password);
      res.status(201).json(auth);
    } catch (err) {
      res.status(409).json({ error: err instanceof Error ? err.message : 'Không thể tạo tài khoản.' });
    }
  });

  app.get('/api/auth/me', (req, res) => {
    const token = extractToken(req);
    const teacher = getTeacherByToken(token);
    if (!teacher) {
      res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn.' });
      return;
    }
    res.json({ user: teacher });
  });

  app.post('/api/auth/logout', (req, res) => {
    revokeSession(extractToken(req));
    res.json({ ok: true });
  });

  // Public Student QR Mission Endpoint
  app.get('/api/public/mission', (req, res) => {
    const classId = normalizeClassId(String(req.query.class || '9/23'));
    const groupNumber = normalizeGroupNumber(req.query.group as string | undefined);
    const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : getTodayDateString();

    const db = loadDb();

    // Find assignment for exact date, or fallback to latest assignment for that class if none on exact date
    const exactAssignment = db.assignments.find((a) => a.classId === classId && a.date === date);
    const fallbackAssignment = !exactAssignment
      ? [...db.assignments]
          .filter((a) => a.classId === classId)
          .sort((a, b) => b.date.localeCompare(a.date))[0]
      : undefined;

    const activeAssignment = exactAssignment || fallbackAssignment;
    const allCards = db.coreMissions.flatMap((m) => m.cards);
    const groupPlan = activeAssignment?.groups[groupNumber];

    const resolvedCards: MissionCard[] = (groupPlan?.cardIds || [])
      .map((cid) => allCards.find((c) => c.id === cid))
      .filter((c): c is MissionCard => Boolean(c));

    const students = db.students
      .filter((s) => s.classId === classId && s.groupNumber === groupNumber)
      .map(({ id, studentCode, name, to, groupNumber: gn, note }) => ({
        id,
        studentCode,
        name,
        to,
        groupNumber: gn,
        note,
      }));

    const gradeRecord = db.grades.find(
      (g) => g.classId === classId && g.date === (exactAssignment ? date : activeAssignment?.date || date) && g.publishedToStudents
    );

    const publishedGrade = gradeRecord?.entries.find((e) => e.groupNumber === groupNumber) || null;
    const allGroupRankings = gradeRecord
      ? [...gradeRecord.entries]
          .sort((a, b) => b.qualityOrder - a.qualityOrder)
          .map((e) => ({ groupNumber: e.groupNumber, qualityOrder: e.qualityOrder, score: e.score }))
      : null;

    const payload: PublicStudentMissionResponse = {
      classId,
      groupNumber,
      date: exactAssignment ? date : activeAssignment?.date || date,
      lessonTopic: activeAssignment?.lessonTopic || `Buổi học lớp ${classId}`,
      students,
      cards: resolvedCards,
      homework: groupPlan?.homework || 'Chưa có bài tập về nhà cho nhóm hôm nay.',
      teacherNote: groupPlan?.teacherNote || '',
      publishedGrade,
      allGroupRankings,
    };

    res.json(payload);
  });

  // Protected Teacher Workspace Endpoints
  app.get('/api/workspace', requireTeacherAuth, (_req, res) => {
    const db = loadDb();
    res.json({
      students: db.students,
      coreMissions: db.coreMissions,
      assignments: db.assignments,
      grades: db.grades,
    });
  });

  app.post('/api/students', requireTeacherAuth, (req, res) => {
    const body = req.body as Partial<Student>;
    if (!body.name || !body.name.trim()) {
      res.status(400).json({ error: 'Tên học sinh không được để trống.' });
      return;
    }
    const db = loadDb();
    const classId = normalizeClassId(body.classId);
    const cleanCode = classId.replace('/', '');
    const newStudent: Student = {
      id: `stu-${crypto.randomUUID().slice(0, 8)}`,
      studentCode:
        body.studentCode?.trim() ||
        `${cleanCode}-${String(db.students.filter((s) => s.classId === classId).length + 1).padStart(2, '0')}`,
      name: body.name.trim(),
      classId,
      to: Math.max(1, Number(body.to) || 1),
      groupNumber: normalizeGroupNumber(body.groupNumber),
      seed: normalizeSeed(body.seed),
      note: body.note?.trim() || '',
    };
    db.students.push(newStudent);
    saveDb(db);
    res.status(201).json(newStudent);
  });

  app.put('/api/students/:id', requireTeacherAuth, (req, res) => {
    const { id } = req.params;
    const body = req.body as Partial<Student>;
    const db = loadDb();
    const idx = db.students.findIndex((s) => s.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Không tìm thấy học sinh.' });
      return;
    }
    const current = db.students[idx];
    const updated: Student = {
      ...current,
      studentCode: body.studentCode !== undefined ? body.studentCode.trim() : current.studentCode,
      name: body.name !== undefined ? body.name.trim() : current.name,
      classId: body.classId !== undefined ? normalizeClassId(body.classId) : current.classId,
      to: body.to !== undefined ? Math.max(1, Number(body.to) || 1) : current.to,
      groupNumber: body.groupNumber !== undefined ? normalizeGroupNumber(body.groupNumber) : current.groupNumber,
      seed: body.seed !== undefined ? normalizeSeed(body.seed) : current.seed,
      note: body.note !== undefined ? body.note.trim() : current.note,
    };
    db.students[idx] = updated;
    saveDb(db);
    res.json(updated);
  });

  app.delete('/api/students/:id', requireTeacherAuth, (req, res) => {
    const { id } = req.params;
    const db = loadDb();
    db.students = db.students.filter((s) => s.id !== id);
    saveDb(db);
    res.json({ ok: true });
  });

  app.post('/api/students/bulk', requireTeacherAuth, (req, res) => {
    const { mode, classId: rawClassId, students: incoming } = req.body as {
      mode: 'import-merge' | 'import-replace' | 'patch';
      classId?: ClassId;
      students: Array<Partial<Student> & { id?: string }>;
    };
    if (!Array.isArray(incoming)) {
      res.status(400).json({ error: 'Danh sách học sinh không hợp lệ.' });
      return;
    }
    const db = loadDb();
    const targetClass = rawClassId ? normalizeClassId(rawClassId) : undefined;

    if (mode === 'import-replace' && targetClass) {
      db.students = db.students.filter((s) => s.classId !== targetClass);
    }

    if (mode === 'patch') {
      for (const patchItem of incoming) {
        if (!patchItem.id) continue;
        const idx = db.students.findIndex((s) => s.id === patchItem.id);
        if (idx !== -1) {
          db.students[idx] = {
            ...db.students[idx],
            ...(patchItem.to !== undefined ? { to: Math.max(1, Number(patchItem.to) || 1) } : {}),
            ...(patchItem.groupNumber !== undefined ? { groupNumber: normalizeGroupNumber(patchItem.groupNumber) } : {}),
            ...(patchItem.seed !== undefined ? { seed: normalizeSeed(patchItem.seed) } : {}),
            ...(patchItem.note !== undefined ? { note: patchItem.note } : {}),
          };
        }
      }
      saveDb(db);
      res.json({ students: db.students });
      return;
    }

    for (const item of incoming) {
      if (!item.name || !item.name.trim()) continue;
      const cls = normalizeClassId(item.classId || targetClass);
      const cleanCode = cls.replace('/', '');
      const existingByCode = item.studentCode
        ? db.students.find((s) => s.classId === cls && s.studentCode.toLowerCase() === item.studentCode!.trim().toLowerCase())
        : undefined;

      if (existingByCode && mode === 'import-merge') {
        existingByCode.name = item.name.trim();
        existingByCode.to = Math.max(1, Number(item.to) || existingByCode.to);
        existingByCode.groupNumber = item.groupNumber ? normalizeGroupNumber(item.groupNumber) : existingByCode.groupNumber;
        existingByCode.seed = item.seed ? normalizeSeed(item.seed) : existingByCode.seed;
        existingByCode.note = item.note !== undefined ? item.note.trim() : existingByCode.note;
      } else {
        db.students.push({
          id: `stu-${crypto.randomUUID().slice(0, 8)}`,
          studentCode:
            item.studentCode?.trim() ||
            `${cleanCode}-${String(db.students.filter((s) => s.classId === cls).length + 1).padStart(2, '0')}`,
          name: item.name.trim(),
          classId: cls,
          to: Math.max(1, Number(item.to) || 1),
          groupNumber: normalizeGroupNumber(item.groupNumber),
          seed: normalizeSeed(item.seed),
          note: item.note?.trim() || '',
        });
      }
    }

    saveDb(db);
    res.json({ students: db.students });
  });

  // Core Missions & Cards Endpoints
  app.put('/api/missions/:missionId', requireTeacherAuth, (req, res) => {
    const missionId = Number(req.params.missionId);
    const { title, summary } = req.body as { title?: string; summary?: string };
    const db = loadDb();
    const mission = db.coreMissions.find((m) => m.id === missionId);
    if (!mission) {
      res.status(404).json({ error: 'Không tìm thấy nhiệm vụ.' });
      return;
    }
    if (title !== undefined) mission.title = title.trim();
    if (summary !== undefined) mission.summary = summary.trim();
    saveDb(db);
    res.json(mission);
  });

  app.post('/api/missions/:missionId/cards', requireTeacherAuth, (req, res) => {
    const missionId = Number(req.params.missionId);
    const { code, title, description, durationMinutes, isDuplicate } = req.body as Partial<MissionCard>;
    const db = loadDb();
    const mission = db.coreMissions.find((m) => m.id === missionId);
    if (!mission) {
      res.status(404).json({ error: 'Không tìm thấy nhiệm vụ.' });
      return;
    }
    if (!title || !title.trim()) {
      res.status(400).json({ error: 'Tiêu đề thẻ không được để trống.' });
      return;
    }
    const card: MissionCard = {
      id: `c-${missionId}-${crypto.randomUUID().slice(0, 6)}`,
      missionId,
      code: code?.trim() || `NV${missionId}-T${String(mission.cards.length + 1).padStart(2, '0')}`,
      title: title.trim(),
      description: description?.trim() || '',
      durationMinutes: Math.max(1, Number(durationMinutes) || 10),
      isDuplicate: Boolean(isDuplicate),
    };
    mission.cards.push(card);
    saveDb(db);
    res.status(201).json(card);
  });

  app.delete('/api/cards/:cardId', requireTeacherAuth, (req, res) => {
    const { cardId } = req.params;
    const db = loadDb();
    for (const mission of db.coreMissions) {
      mission.cards = mission.cards.filter((c) => c.id !== cardId);
    }
    for (const assignment of db.assignments) {
      ([1, 2, 3, 4, 5] as GroupNumber[]).forEach((g) => {
        if (assignment.groups[g]) {
          assignment.groups[g].cardIds = assignment.groups[g].cardIds.filter((id) => id !== cardId);
        }
      });
    }
    saveDb(db);
    res.json({ ok: true });
  });

  // Daily Assignment Endpoint
  app.put('/api/assignments', requireTeacherAuth, (req, res) => {
    const payload = req.body as Omit<DailyAssignmentRecord, 'id' | 'updatedAt'>;
    const classId = normalizeClassId(payload.classId);
    if (!payload.date || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
      res.status(400).json({ error: 'Ngày học không hợp lệ (YYYY-MM-DD).' });
      return;
    }
    const db = loadDb();
    const id = `${classId}_${payload.date}`;
    const record: DailyAssignmentRecord = {
      id,
      classId,
      date: payload.date,
      lessonTopic: payload.lessonTopic?.trim() || `Bài học ngày ${payload.date} — Lớp ${classId}`,
      groups: payload.groups,
      updatedAt: new Date().toISOString(),
    };
    const idx = db.assignments.findIndex((a) => a.id === id);
    if (idx !== -1) {
      db.assignments[idx] = record;
    } else {
      db.assignments.push(record);
    }
    saveDb(db);
    res.json(record);
  });

  // Daily Gradebook Endpoint
  app.put('/api/grades', requireTeacherAuth, (req, res) => {
    const payload = req.body as Omit<DailyGradeRecord, 'id' | 'updatedAt'>;
    const classId = normalizeClassId(payload.classId);
    if (!payload.date || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
      res.status(400).json({ error: 'Ngày chấm điểm không hợp lệ.' });
      return;
    }
    const db = loadDb();
    const id = `${classId}_${payload.date}`;
    const record: DailyGradeRecord = {
      id,
      classId,
      date: payload.date,
      lessonTopic: payload.lessonTopic?.trim() || `Buổi học ngày ${payload.date}`,
      entries: payload.entries,
      publishedToStudents: Boolean(payload.publishedToStudents),
      updatedAt: new Date().toISOString(),
    };
    const idx = db.grades.findIndex((g) => g.id === id);
    if (idx !== -1) {
      db.grades[idx] = record;
    } else {
      db.grades.push(record);
    }
    saveDb(db);
    res.json(record);
  });

  const isProduction = process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(process.cwd(), 'dist'));
  if (isProduction) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*path', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClassQR Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
