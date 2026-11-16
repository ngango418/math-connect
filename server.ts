import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { GoogleGenAI, Type } from '@google/genai';
import {
  authenticateTeacher,
  createTeacherAccount,
  getTeacherByToken,
  loadDb,
  revokeSession,
  saveDb,
} from './server/store.ts';
import type {
  ClassroomInfo,
  DailyAssignmentRecord,
  DailyGradeRecord,
  GroupNumber,
  MissionAllocationConfig,
  MissionCard,
  PublicStudentMissionResponse,
  Student,
  TeacherUser,
} from './shared/types.ts';
import { verifyQrAccessToken } from './shared/qrToken.ts';

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

function normalizeClassId(raw: string | undefined): string {
  const trimmed = (raw || '').trim();
  return trimmed || '9/23';
}

function normalizeGroupNumber(raw: string | number | undefined): GroupNumber {
  const n = Number(raw);
  if (n >= 1 && n <= 8) return Math.round(n) as GroupNumber;
  return 1;
}

function normalizeScore(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isNaN(n) && n >= 1 && n <= 10) return Number(n.toFixed(1));
  return 7;
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
  app.use(express.json({ limit: '8mb' }));

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

  // Public Student QR Mission Endpoint (locked to 1 class + 1 group + 1 date via QR token)
  app.get('/api/public/mission', (req, res) => {
    const db = loadDb();
    const rawClass = String(req.query.class || '').trim();
    const classId = rawClass || db.classes[0]?.id || '9/1';
    const groupNumber = normalizeGroupNumber(req.query.group as string | undefined);
    const date =
      typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : getTodayDateString();
    const qrToken = String(req.query.k || '');

    if (!verifyQrAccessToken(classId, groupNumber, date, qrToken)) {
      res.status(403).json({
        error: 'Mã QR không hợp lệ hoặc thông tin lớp/nhóm trong đường dẫn đã bị thay đổi. Vui lòng quét đúng mã QR của nhóm bạn.',
      });
      return;
    }

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
      .map(({ id, studentCode, name, birthDate, to, groupNumber: gn, isLeader, note }) => ({
        id,
        studentCode,
        name,
        birthDate,
        to,
        groupNumber: gn,
        isLeader,
        note,
      }));

    const targetDate = exactAssignment ? date : activeAssignment?.date || date;
    const gradeRecord = db.grades.find(
      (g) => g.classId === classId && g.date === targetDate && g.publishedToStudents
    );

    const publishedGrade = gradeRecord?.entries.find((e) => e.groupNumber === groupNumber) || null;

    const payload: PublicStudentMissionResponse = {
      classId,
      groupNumber,
      date: targetDate,
      lessonTopic: activeAssignment?.lessonTopic || `Buổi học lớp ${classId}`,
      students,
      cards: resolvedCards,
      homework: groupPlan?.homework || 'Chưa có bài tập về nhà cho nhóm hôm nay.',
      teacherNote: groupPlan?.teacherNote || '',
      publishedGrade,
      allGroupScores: null,
    };

    res.json(payload);
  });

  // In-memory ring buffer for live classroom completion notifications (60s TTL)
  const recentCompletionEvents: Array<{
    id: string;
    classId: string;
    groupNumber: GroupNumber;
    cardTitle: string;
    allCompleted: boolean;
    completedCount: number;
    totalCards: number;
    timestamp: number;
  }> = [];

  app.post('/api/public/mission-complete', (req, res) => {
    const body = req.body as {
      id?: string;
      classId?: string;
      groupNumber?: number;
      cardTitle?: string;
      allCompleted?: boolean;
      completedCount?: number;
      totalCards?: number;
      date?: string;
      k?: string;
    };
    const classId = String(body.classId || '').trim();
    const groupNumber = normalizeGroupNumber(body.groupNumber);
    const date =
      typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
        ? body.date
        : getTodayDateString();
    if (!verifyQrAccessToken(classId, groupNumber, date, body.k)) {
      res.status(403).json({ error: 'Mã QR không hợp lệ.' });
      return;
    }
    const evt = {
      id: body.id || `evt-${crypto.randomUUID().slice(0, 8)}`,
      classId,
      groupNumber,
      cardTitle: String(body.cardTitle || 'Nhiệm vụ nhóm').slice(0, 140),
      allCompleted: Boolean(body.allCompleted),
      completedCount: Number(body.completedCount) || 1,
      totalCards: Number(body.totalCards) || 1,
      timestamp: Date.now(),
    };
    const cutoff = Date.now() - 60_000;
    while (recentCompletionEvents.length > 0 && recentCompletionEvents[0].timestamp < cutoff) {
      recentCompletionEvents.shift();
    }
    recentCompletionEvents.push(evt);
    res.status(201).json(evt);
  });

  app.get('/api/public/completions', (req, res) => {
    const classId = String(req.query.class || '').trim();
    const since = Number(req.query.since || 0);
    const cutoff = Math.max(since, Date.now() - 60_000);
    const events = recentCompletionEvents.filter(
      (e) => (!classId || e.classId === classId) && e.timestamp > cutoff
    );
    res.json({ events });
  });

  // Public list of available classes for Student Portal dropdown
  app.get('/api/public/classes', (_req, res) => {
    const db = loadDb();
    res.json({ classes: db.classes });
  });

  // Protected Teacher Workspace Endpoints
  app.get('/api/workspace', requireTeacherAuth, (_req, res) => {
    const db = loadDb();
    res.json({
      classes: db.classes,
      students: db.students,
      coreMissions: db.coreMissions,
      allocationConfig: db.allocationConfig,
      assignments: db.assignments,
      grades: db.grades,
    });
  });

  // Dynamic Class Management
  app.post('/api/classes', requireTeacherAuth, (req, res) => {
    const { name } = req.body as { name?: string };
    const clean = (name || '').trim();
    if (!clean) {
      res.status(400).json({ error: 'Tên lớp không được để trống.' });
      return;
    }
    const db = loadDb();
    if (db.classes.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
      res.status(409).json({ error: `Lớp ${clean} đã tồn tại.` });
      return;
    }
    const created: ClassroomInfo = {
      id: clean,
      name: clean,
      createdAt: getTodayDateString(),
    };
    db.classes.push(created);
    saveDb(db);
    res.status(201).json(created);
  });

  app.delete('/api/classes/:classId', requireTeacherAuth, (req, res) => {
    const classId = decodeURIComponent(String(req.params.classId));
    const db = loadDb();
    if (db.classes.length <= 1) {
      res.status(400).json({ error: 'Hệ thống cần giữ lại ít nhất 1 lớp học.' });
      return;
    }
    db.classes = db.classes.filter((c) => c.id !== classId);
    db.students = db.students.filter((s) => s.classId !== classId);
    db.assignments = db.assignments.filter((a) => a.classId !== classId);
    db.grades = db.grades.filter((g) => g.classId !== classId);
    saveDb(db);
    res.json({ ok: true });
  });

  // AI-Powered Excel Roster Parser via Gemini
  app.post('/api/ai/parse-roster', requireTeacherAuth, async (req, res) => {
    const { rawRows, defaultClassId, sheetName } = req.body as {
      rawRows?: unknown[];
      defaultClassId?: string;
      sheetName?: string;
    };

    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      res.status(400).json({ error: 'Không có dữ liệu bảng tính để AI phân tích.' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ. Bạn vẫn có thể dùng chế độ đọc Excel chuẩn.',
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const truncatedRows = rawRows.slice(0, 120);
      const prompt = `Bạn là trợ lý giáo viên chủ nhiệm Việt Nam. Hãy đọc dữ liệu thô trích xuất từ file Excel danh sách học sinh dưới đây (tên sheet: "${sheetName || 'Sheet1'}", lớp mặc định: "${defaultClassId || '9/23'}").
Hãy chuẩn hóa từng học sinh thành JSON theo đúng schema:
- studentCode: Mã học sinh (nếu không có thì tự sinh theo dạng "<TenLop>-01", "<TenLop>-02"...).
- name: Họ và tên đầy đủ (nếu file tách riêng cột "Họ" / "Họ lót" và "Tên" thì ghép lại thành họ tên đầy đủ).
- birthDate: Ngày tháng năm sinh định dạng DD/MM/YYYY (ví dụ "15/08/2012", nếu Excel trả số serial hoặc YYYY-MM-DD thì chuyển về DD/MM/YYYY, nếu trống để "").
- classId: Tên lớp học (nếu file có cột Lớp thì lấy giá trị đó, nếu không dùng "${defaultClassId || '9/23'}").
- to: Số Tổ (từ 1 đến 4, mặc định 1).
- groupNumber: Số Nhóm (từ 1 đến 8; nếu trống thì suy từ Tổ hoặc đánh số tuần tự 1..8).
- isLeader: true nếu học sinh là Nhóm trưởng / Tổ trưởng / NT / có dấu tick (x, ✓, true, 1, "Có"), ngược lại false.
- score: Điểm đánh giá năng lực từ 1 đến 10 (mặc định 7 nếu không có trong file).
- note: Ghi chú thêm nếu có (hoặc "").

Bỏ qua các dòng tiêu đề trường/sở, dòng trống hoặc dòng tổng cộng không phải học sinh.

Dữ liệu thô từ Excel:
${JSON.stringify(truncatedRows)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                studentCode: { type: Type.STRING },
                name: { type: Type.STRING },
                birthDate: { type: Type.STRING },
                classId: { type: Type.STRING },
                to: { type: Type.INTEGER },
                groupNumber: { type: Type.INTEGER },
                isLeader: { type: Type.BOOLEAN },
                score: { type: Type.NUMBER },
                note: { type: Type.STRING },
              },
              required: ['name', 'birthDate', 'classId', 'to', 'groupNumber', 'isLeader', 'score'],
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '[]').trim()) as Array<Partial<Student>>;
      res.json({ students: parsed });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'AI không thể phân tích file Excel lúc này.',
      });
    }
  });

  // Students CRUD
  app.post('/api/students', requireTeacherAuth, (req, res) => {
    const body = req.body as Partial<Student>;
    if (!body.name || !body.name.trim()) {
      res.status(400).json({ error: 'Tên học sinh không được để trống.' });
      return;
    }
    const db = loadDb();
    const classId = normalizeClassId(body.classId);
    if (!db.classes.some((c) => c.id === classId)) {
      db.classes.push({ id: classId, name: classId, createdAt: getTodayDateString() });
    }
    const cleanCode = classId.replace('/', '');
    const newStudent: Student = {
      id: `stu-${crypto.randomUUID().slice(0, 8)}`,
      studentCode:
        body.studentCode?.trim() ||
        `${cleanCode}-${String(db.students.filter((s) => s.classId === classId).length + 1).padStart(2, '0')}`,
      name: body.name.trim(),
      birthDate: (body.birthDate || '').trim(),
      classId,
      to: Math.min(4, Math.max(1, Number(body.to) || 1)),
      groupNumber: normalizeGroupNumber(body.groupNumber),
      isLeader: Boolean(body.isLeader),
      score: normalizeScore(body.score),
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
      birthDate: body.birthDate !== undefined ? body.birthDate.trim() : current.birthDate,
      classId: body.classId !== undefined ? normalizeClassId(body.classId) : current.classId,
      to: body.to !== undefined ? Math.min(4, Math.max(1, Number(body.to) || 1)) : current.to,
      groupNumber: body.groupNumber !== undefined ? normalizeGroupNumber(body.groupNumber) : current.groupNumber,
      isLeader: body.isLeader !== undefined ? Boolean(body.isLeader) : current.isLeader,
      score: body.score !== undefined ? normalizeScore(body.score) : current.score,
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
      classId?: string;
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
            ...(patchItem.to !== undefined ? { to: Math.min(4, Math.max(1, Number(patchItem.to) || 1)) } : {}),
            ...(patchItem.groupNumber !== undefined ? { groupNumber: normalizeGroupNumber(patchItem.groupNumber) } : {}),
            ...(patchItem.isLeader !== undefined ? { isLeader: Boolean(patchItem.isLeader) } : {}),
            ...(patchItem.score !== undefined ? { score: normalizeScore(patchItem.score) } : {}),
            ...(patchItem.birthDate !== undefined ? { birthDate: patchItem.birthDate } : {}),
            ...(patchItem.note !== undefined ? { note: patchItem.note } : {}),
          };
        }
      }
      saveDb(db);
      res.json({ students: db.students, classes: db.classes });
      return;
    }

    for (const item of incoming) {
      if (!item.name || !item.name.trim()) continue;
      const cls = normalizeClassId(item.classId || targetClass);
      if (!db.classes.some((c) => c.id === cls)) {
        db.classes.push({ id: cls, name: cls, createdAt: getTodayDateString() });
      }
      const cleanCode = cls.replace('/', '');
      const existingByCode = item.studentCode
        ? db.students.find((s) => s.classId === cls && s.studentCode.toLowerCase() === item.studentCode!.trim().toLowerCase())
        : undefined;

      if (existingByCode && mode === 'import-merge') {
        existingByCode.name = item.name.trim();
        existingByCode.birthDate = item.birthDate !== undefined ? item.birthDate.trim() : existingByCode.birthDate;
        existingByCode.to = Math.min(4, Math.max(1, Number(item.to) || existingByCode.to));
        existingByCode.groupNumber = item.groupNumber ? normalizeGroupNumber(item.groupNumber) : existingByCode.groupNumber;
        existingByCode.isLeader = item.isLeader !== undefined ? Boolean(item.isLeader) : existingByCode.isLeader;
        existingByCode.score = item.score !== undefined ? normalizeScore(item.score) : existingByCode.score;
        existingByCode.note = item.note !== undefined ? item.note.trim() : existingByCode.note;
      } else {
        db.students.push({
          id: `stu-${crypto.randomUUID().slice(0, 8)}`,
          studentCode:
            item.studentCode?.trim() ||
            `${cleanCode}-${String(db.students.filter((s) => s.classId === cls).length + 1).padStart(2, '0')}`,
          name: item.name.trim(),
          birthDate: (item.birthDate || '').trim(),
          classId: cls,
          to: Math.min(4, Math.max(1, Number(item.to) || 1)),
          groupNumber: normalizeGroupNumber(item.groupNumber),
          isLeader: Boolean(item.isLeader),
          score: normalizeScore(item.score),
          note: item.note?.trim() || '',
        });
      }
    }

    saveDb(db);
    res.json({ students: db.students, classes: db.classes });
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
      ([1, 2, 3, 4, 5, 6, 7, 8] as GroupNumber[]).forEach((g) => {
        if (assignment.groups[g]) {
          assignment.groups[g].cardIds = assignment.groups[g].cardIds.filter((id) => id !== cardId);
        }
      });
    }
    saveDb(db);
    res.json({ ok: true });
  });

  // Mission Allocation Config
  app.put('/api/allocation-config', requireTeacherAuth, (req, res) => {
    const payload = req.body as MissionAllocationConfig;
    const db = loadDb();
    db.allocationConfig = payload;
    saveDb(db);
    res.json(db.allocationConfig);
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
      entries: payload.entries.map((e) => ({
        ...e,
        finalScore: Math.min(
          10,
          Math.max(0, Number((e.baseScore - e.penaltyPoints + e.bonusPoints).toFixed(2)))
        ),
      })),
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
