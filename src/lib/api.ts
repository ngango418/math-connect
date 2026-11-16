import type {
  ClassroomInfo,
  CoreMission,
  DailyAssignmentRecord,
  DailyGradeRecord,
  GroupNumber,
  MissionAllocationConfig,
  MissionCard,
  PublicStudentMissionResponse,
  Student,
  TeacherUser,
  WorkspaceSnapshot,
} from '../../shared/types.ts';
import { verifyQrAccessToken } from '../../shared/qrToken.ts';
import { createClientSeedSnapshot, createDefaultAllocationConfig } from './defaultSeedData.ts';
import {
  fromDbAssignment,
  fromDbClass,
  fromDbGrade,
  fromDbMission,
  fromDbStudent,
  getSupabaseClient,
  isSupabaseEnvConfigured,
  toDbAssignment,
  toDbClass,
  toDbGrade,
  toDbMission,
  toDbStudent,
  type DbClassRow,
  type DbCoreMissionRow,
  type DbDailyAssignmentRow,
  type DbDailyGradeRow,
  type DbStudentRow,
} from './supabaseClient.ts';

const TOKEN_STORAGE_KEY = 'classqr_teacher_token';
const LOCAL_SNAPSHOT_KEY = 'classqr_local_snapshot_v3';
const LOCAL_TEACHERS_KEY = 'classqr_local_teachers_v1';
const LOCAL_SESSION_KEY = 'classqr_local_session_v1';

export type StorageBackendMode = 'supabase' | 'server' | 'local';

let detectedBackendMode: StorageBackendMode = isSupabaseEnvConfigured() ? 'supabase' : 'server';

export function getActiveStorageMode(): StorageBackendMode {
  return detectedBackendMode;
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

interface LocalTeacherRecord extends TeacherUser {
  password: string;
}

function getLocalTeachers(): LocalTeacherRecord[] {
  const raw = localStorage.getItem(LOCAL_TEACHERS_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as LocalTeacherRecord[];
    } catch {
      // fall through
    }
  }
  const initial: LocalTeacherRecord[] = [
    {
      id: 'teacher-1',
      email: 'giaovien@truonghoc.edu.vn',
      name: 'Giáo viên Chủ nhiệm',
      subject: 'Tổ Chuyên môn Khối 9',
      password: '123456',
    },
  ];
  localStorage.setItem(LOCAL_TEACHERS_KEY, JSON.stringify(initial));
  return initial;
}

function saveLocalTeachers(list: LocalTeacherRecord[]): void {
  localStorage.setItem(LOCAL_TEACHERS_KEY, JSON.stringify(list));
}

function normalizeStudentRecord(raw: Partial<Student>): Student {
  return {
    id: raw.id || `stu-${crypto.randomUUID().slice(0, 8)}`,
    studentCode: raw.studentCode || '',
    name: raw.name || '',
    birthDate: raw.birthDate || '',
    classId: raw.classId || '9/1',
    to: Math.min(4, Math.max(1, Number(raw.to) || 1)),
    groupNumber: normalizeGroupNumber(raw.groupNumber),
    isLeader: Boolean(raw.isLeader),
    score: normalizeScore(raw.score ?? 7),
    note: raw.note || '',
  };
}

function sortClassroomsNaturally(list: ClassroomInfo[]): ClassroomInfo[] {
  return [...list].sort((a, b) =>
    a.name.localeCompare(b.name, 'vi', { numeric: true, sensitivity: 'base' })
  );
}

function getLocalSnapshot(): WorkspaceSnapshot {
  const raw = localStorage.getItem(LOCAL_SNAPSHOT_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<WorkspaceSnapshot>;
      const seed = createClientSeedSnapshot();
      return {
        classes: parsed.classes && parsed.classes.length > 0 ? parsed.classes : seed.classes,
        students: Array.isArray(parsed.students) ? parsed.students.map(normalizeStudentRecord) : seed.students,
        coreMissions: parsed.coreMissions && parsed.coreMissions.length > 0 ? parsed.coreMissions : seed.coreMissions,
        allocationConfig: parsed.allocationConfig || seed.allocationConfig,
        assignments: Array.isArray(parsed.assignments) ? parsed.assignments : seed.assignments,
        grades: Array.isArray(parsed.grades) ? parsed.grades : seed.grades,
      };
    } catch {
      // fall through
    }
  }
  const seed = createClientSeedSnapshot();
  localStorage.setItem(LOCAL_SNAPSHOT_KEY, JSON.stringify(seed));
  return seed;
}

function saveLocalSnapshot(snapshot: WorkspaceSnapshot): void {
  localStorage.setItem(LOCAL_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

function normalizeClassId(raw: string): string {
  const c = (raw || '').trim();
  return c || '9/1';
}

function normalizeGroupNumber(raw: unknown): GroupNumber {
  const n = Number(raw);
  if (n >= 1 && n <= 8) return Math.round(n) as GroupNumber;
  return 1;
}

function normalizeScore(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isNaN(n) && n >= 1 && n <= 10) return Number(n.toFixed(1));
  return 7;
}

class ServerUnavailableError extends Error {
  constructor() {
    super('STATIC_HOST_FALLBACK');
  }
}

async function serverFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch {
    throw new ServerUnavailableError();
  }

  const contentType = res.headers.get('content-type') || '';
  if (res.status === 404 && !contentType.includes('application/json')) {
    throw new ServerUnavailableError();
  }
  if (res.status === 404 && url.startsWith('/api/auth/')) {
    throw new ServerUnavailableError();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Lỗi máy chủ (${res.status})`);
  }
  return data as T;
}

function mapSupabaseError(err: unknown): string {
  const raw = err instanceof Error ? err.message : (err as { message?: string })?.message || String(err);
  if (
    raw.includes('Could not find the table') ||
    raw.includes('PGRST205') ||
    (raw.includes('relation') && raw.includes('does not exist'))
  ) {
    return 'Database Supabase chưa có các bảng dữ liệu. Hãy vào tab "Liên kết Database", chép đoạn mã SQL và chạy trong Supabase → SQL Editor.';
  }
  if (raw.includes('row-level security') || raw.includes('permission denied')) {
    return 'Supabase từ chối quyền ghi (RLS). Hãy kiểm tra lại bước đăng nhập hoặc chạy đầy đủ đoạn SQL phân quyền trong tab "Liên kết Database".';
  }
  if (raw.includes('Invalid login credentials')) {
    return 'Email hoặc mật khẩu Supabase không chính xác.';
  }
  if (raw.includes('User already registered')) {
    return 'Email này đã được đăng ký trên Supabase.';
  }
  if (raw.includes('Email not confirmed')) {
    return 'Email chưa được xác nhận. Kiểm tra hộp thư hoặc vào Supabase → Authentication → Providers → Email tắt "Confirm email".';
  }
  return raw;
}

export async function initializeSupabaseDatabase(forceReset = false): Promise<{
  created: boolean;
  counts: { missions: number; students: number; assignments: number; grades: number };
}> {
  const sb = getSupabaseClient();
  if (!sb) {
    throw new Error('Chưa cấu hình URL và Anon Key cho Supabase.');
  }

  const { data: existingMissions, error: mErr } = await sb.from('core_missions').select('id');
  if (mErr) throw new Error(mapSupabaseError(mErr));

  const { data: existingClasses, error: cErr } = await sb.from('classes').select('id');
  if (cErr) throw new Error(mapSupabaseError(cErr));

  if (
    !forceReset &&
    existingMissions &&
    existingMissions.length > 0 &&
    existingClasses &&
    existingClasses.length > 0
  ) {
    const [stuRes, assignRes, gradeRes] = await Promise.all([
      sb.from('students').select('id', { count: 'exact', head: true }),
      sb.from('daily_assignments').select('id', { count: 'exact', head: true }),
      sb.from('daily_grades').select('id', { count: 'exact', head: true }),
    ]);
    return {
      created: false,
      counts: {
        missions: existingMissions.length,
        students: stuRes.count || 0,
        assignments: assignRes.count || 0,
        grades: gradeRes.count || 0,
      },
    };
  }

  if (forceReset) {
    await Promise.all([
      sb.from('students').delete().neq('id', ''),
      sb.from('classes').delete().neq('id', ''),
      sb.from('daily_assignments').delete().neq('id', ''),
      sb.from('daily_grades').delete().neq('id', ''),
    ]);
  }

  const seed = createClientSeedSnapshot();

  const { error: clsErr } = await sb.from('classes').upsert(seed.classes.map(toDbClass));
  if (clsErr) throw new Error(mapSupabaseError(clsErr));

  const { error: misErr } = await sb.from('core_missions').upsert(seed.coreMissions.map(toDbMission));
  if (misErr) throw new Error(mapSupabaseError(misErr));

  const { error: setErr } = await sb
    .from('app_settings')
    .upsert({ id: 'allocationConfig', data: seed.allocationConfig });
  if (setErr) throw new Error(mapSupabaseError(setErr));

  const dbStudents = seed.students.map(toDbStudent);
  for (let i = 0; i < dbStudents.length; i += 200) {
    const { error: stuErr } = await sb.from('students').upsert(dbStudents.slice(i, i + 200));
    if (stuErr) throw new Error(mapSupabaseError(stuErr));
  }

  const { error: assignErr } = await sb
    .from('daily_assignments')
    .upsert(seed.assignments.map(toDbAssignment));
  if (assignErr) throw new Error(mapSupabaseError(assignErr));

  if (seed.grades.length > 0) {
    const { error: gradeErr } = await sb.from('daily_grades').upsert(seed.grades.map(toDbGrade));
    if (gradeErr) throw new Error(mapSupabaseError(gradeErr));
  }

  return {
    created: true,
    counts: {
      missions: seed.coreMissions.length,
      students: seed.students.length,
      assignments: seed.assignments.length,
      grades: seed.grades.length,
    },
  };
}

export async function loginTeacher(email: string, password: string): Promise<{ token: string; user: TeacherUser }> {
  const sb = getSupabaseClient();
  if (sb) {
    detectedBackendMode = 'supabase';
    const { data, error } = await sb.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw new Error(mapSupabaseError(error));
    const meta = (data.user.user_metadata || {}) as { name?: string; subject?: string };
    return {
      token: data.session?.access_token || 'supabase-session',
      user: {
        id: data.user.id,
        email: data.user.email || email.trim(),
        name: meta.name || 'Giáo viên',
        subject: meta.subject || 'Khối 9',
      },
    };
  }

  try {
    const res = await serverFetch<{ token: string; user: TeacherUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    detectedBackendMode = 'server';
    setStoredToken(res.token);
    return res;
  } catch (err) {
    if (!(err instanceof ServerUnavailableError)) throw err;
    detectedBackendMode = 'local';
    const teachers = getLocalTeachers();
    const found = teachers.find(
      (t) => t.email.toLowerCase() === email.trim().toLowerCase() && t.password === password
    );
    if (!found) {
      throw new Error('Email hoặc mật khẩu không chính xác.');
    }
    const user: TeacherUser = {
      id: found.id,
      email: found.email,
      name: found.name,
      subject: found.subject,
    };
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(user));
    setStoredToken('local-demo-token');
    return { token: 'local-demo-token', user };
  }
}

export async function registerTeacher(
  email: string,
  password: string,
  name: string,
  subject: string
): Promise<{ token: string; user: TeacherUser }> {
  const sb = getSupabaseClient();
  if (sb) {
    detectedBackendMode = 'supabase';
    const { data, error } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          name: name.trim() || 'Giáo viên',
          subject: subject.trim() || 'Khối 9',
        },
      },
    });
    if (error) throw new Error(mapSupabaseError(error));
    if (!data.session) {
      throw new Error(
        'Tài khoản đã được tạo! Hãy mở email để xác nhận, HOẶC vào Supabase → Authentication → Providers → Email và tắt "Confirm email" để đăng nhập ngay.'
      );
    }
    return {
      token: data.session.access_token,
      user: {
        id: data.user?.id || 'sb-teacher',
        email: data.user?.email || email.trim(),
        name: name.trim() || 'Giáo viên',
        subject: subject.trim() || 'Khối 9',
      },
    };
  }

  try {
    const res = await serverFetch<{ token: string; user: TeacherUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, subject }),
    });
    detectedBackendMode = 'server';
    setStoredToken(res.token);
    return res;
  } catch (err) {
    if (!(err instanceof ServerUnavailableError)) throw err;
    detectedBackendMode = 'local';
    const teachers = getLocalTeachers();
    const normalized = email.trim().toLowerCase();
    if (teachers.some((t) => t.email.toLowerCase() === normalized)) {
      throw new Error('Email này đã được đăng ký.');
    }
    const created: LocalTeacherRecord = {
      id: `teacher-${crypto.randomUUID().slice(0, 8)}`,
      email: normalized,
      name: name.trim() || 'Giáo viên',
      subject: subject.trim() || 'Khối 9',
      password,
    };
    teachers.push(created);
    saveLocalTeachers(teachers);
    const user: TeacherUser = {
      id: created.id,
      email: created.email,
      name: created.name,
      subject: created.subject,
    };
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(user));
    setStoredToken('local-demo-token');
    return { token: 'local-demo-token', user };
  }
}

export async function fetchCurrentTeacher(): Promise<TeacherUser | null> {
  const sb = getSupabaseClient();
  if (sb) {
    detectedBackendMode = 'supabase';
    const { data } = await sb.auth.getSession();
    const u = data.session?.user;
    if (!u) return null;
    const meta = (u.user_metadata || {}) as { name?: string; subject?: string };
    return {
      id: u.id,
      email: u.email || '',
      name: meta.name || 'Giáo viên',
      subject: meta.subject || 'Khối 9',
    };
  }

  const token = getStoredToken();
  if (!token) return null;

  try {
    const res = await serverFetch<{ user: TeacherUser }>('/api/auth/me');
    detectedBackendMode = 'server';
    return res.user;
  } catch (err) {
    if (err instanceof ServerUnavailableError || token === 'local-demo-token') {
      detectedBackendMode = 'local';
      const raw = localStorage.getItem(LOCAL_SESSION_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as TeacherUser;
      } catch {
        return null;
      }
    }
    setStoredToken(null);
    return null;
  }
}

export async function logoutTeacher(): Promise<void> {
  const sb = getSupabaseClient();
  if (sb) {
    await sb.auth.signOut();
    return;
  }

  try {
    await serverFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // ignore
  }
  localStorage.removeItem(LOCAL_SESSION_KEY);
  setStoredToken(null);
}

export async function resetTeacherPassword(email: string): Promise<void> {
  if (!email.trim()) {
    throw new Error('Vui lòng nhập email trước khi yêu cầu đặt lại mật khẩu.');
  }
  const sb = getSupabaseClient();
  if (!sb) {
    throw new Error('Chức năng đặt lại mật khẩu qua email chỉ dùng khi đã kết nối Supabase.');
  }
  const { error } = await sb.auth.resetPasswordForEmail(email.trim());
  if (error) throw new Error(mapSupabaseError(error));
}

export async function fetchPublicClasses(): Promise<ClassroomInfo[]> {
  const sb = getSupabaseClient();
  if (sb) {
    try {
      const { data, error } = await sb.from('classes').select('*');
      if (!error && data && data.length > 0) {
        return sortClassroomsNaturally((data as DbClassRow[]).map(fromDbClass));
      }
    } catch {
      // fall through
    }
    return createClientSeedSnapshot().classes;
  }

  try {
    const res = await serverFetch<{ classes: ClassroomInfo[] }>('/api/public/classes');
    return sortClassroomsNaturally(res.classes);
  } catch {
    return sortClassroomsNaturally(getLocalSnapshot().classes);
  }
}

export async function fetchPublicStudentMission(
  classId: string,
  groupNumber: number,
  date: string,
  qrToken: string
): Promise<PublicStudentMissionResponse> {
  if (!verifyQrAccessToken(classId, groupNumber as GroupNumber, date, qrToken)) {
    throw new Error(
      'Mã QR không hợp lệ hoặc thông tin lớp/nhóm trong đường dẫn đã bị thay đổi. Vui lòng quét đúng mã QR của nhóm bạn.'
    );
  }

  const sb = getSupabaseClient();
  if (sb) {
    detectedBackendMode = 'supabase';
    const [mRes, sRes, aRes, gRes] = await Promise.all([
      sb.from('core_missions').select('*'),
      sb.from('students').select('*').eq('class_id', classId).eq('group_number', groupNumber),
      sb.from('daily_assignments').select('*').eq('class_id', classId),
      sb.from('daily_grades').select('*').eq('class_id', classId).eq('published_to_students', true),
    ]);

    const coreMissions = ((mRes.data || []) as DbCoreMissionRow[]).map(fromDbMission);
    const studentsList = ((sRes.data || []) as DbStudentRow[]).map(fromDbStudent);
    const assignmentsList = ((aRes.data || []) as DbDailyAssignmentRow[]).map(fromDbAssignment);
    const gradesList = ((gRes.data || []) as DbDailyGradeRow[]).map(fromDbGrade);

    if (coreMissions.length === 0) {
      const seed = createClientSeedSnapshot();
      return buildPublicMissionResponse(
        classId,
        groupNumber as GroupNumber,
        date,
        seed.coreMissions,
        seed.students,
        seed.assignments,
        seed.grades
      );
    }

    return buildPublicMissionResponse(
      classId,
      groupNumber as GroupNumber,
      date,
      coreMissions,
      studentsList,
      assignmentsList,
      gradesList
    );
  }

  try {
    const params = new URLSearchParams({
      class: classId,
      group: String(groupNumber),
      date,
      k: qrToken,
    });
    const res = await serverFetch<PublicStudentMissionResponse>(`/api/public/mission?${params.toString()}`);
    detectedBackendMode = 'server';
    return res;
  } catch (err) {
    if (!(err instanceof ServerUnavailableError)) throw err;
    detectedBackendMode = 'local';
    const snap = getLocalSnapshot();
    return buildPublicMissionResponse(
      classId,
      groupNumber as GroupNumber,
      date,
      snap.coreMissions,
      snap.students,
      snap.assignments,
      snap.grades
    );
  }
}

function buildPublicMissionResponse(
  classId: string,
  groupNumber: GroupNumber,
  date: string,
  coreMissions: CoreMission[],
  students: Student[],
  assignments: DailyAssignmentRecord[],
  grades: DailyGradeRecord[]
): PublicStudentMissionResponse {
  const exactAssignment = assignments.find((a) => a.classId === classId && a.date === date);
  const fallbackAssignment = !exactAssignment
    ? [...assignments]
        .filter((a) => a.classId === classId)
        .sort((a, b) => b.date.localeCompare(a.date))[0]
    : undefined;
  const activeAssignment = exactAssignment || fallbackAssignment;
  const allCards = coreMissions.flatMap((m) => m.cards);
  const groupPlan = activeAssignment?.groups[groupNumber];
  const resolvedCards: MissionCard[] = (groupPlan?.cardIds || [])
    .map((cid) => allCards.find((c) => c.id === cid))
    .filter((c): c is MissionCard => Boolean(c));

  const groupStudents = students
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
  const gradeRecord =
    grades.find(
      (g) => g.classId === classId && g.date === date && g.publishedToStudents
    ) ||
    grades.find(
      (g) => g.classId === classId && g.date === targetDate && g.publishedToStudents
    );
  const publishedGrade = gradeRecord?.entries.find((e) => e.groupNumber === groupNumber) || null;

  return {
    classId,
    groupNumber,
    date: targetDate,
    lessonTopic: activeAssignment?.lessonTopic || `Buổi học lớp ${classId}`,
    students: groupStudents,
    cards: resolvedCards,
    homework: groupPlan?.homework || 'Chưa có bài tập về nhà cho nhóm hôm nay.',
    teacherNote: groupPlan?.teacherNote || '',
    publishedGrade,
    allGroupScores: null,
  };
}

export async function fetchWorkspace(): Promise<WorkspaceSnapshot> {
  const sb = getSupabaseClient();
  if (sb) {
    detectedBackendMode = 'supabase';
    await initializeSupabaseDatabase(false);
    const [clsRes, stuRes, misRes, setRes, assignRes, gradeRes] = await Promise.all([
      sb.from('classes').select('*'),
      sb.from('students').select('*'),
      sb.from('core_missions').select('*'),
      sb.from('app_settings').select('*').eq('id', 'allocationConfig').maybeSingle(),
      sb.from('daily_assignments').select('*'),
      sb.from('daily_grades').select('*'),
    ]);

    if (clsRes.error) throw new Error(mapSupabaseError(clsRes.error));
    if (stuRes.error) throw new Error(mapSupabaseError(stuRes.error));
    if (misRes.error) throw new Error(mapSupabaseError(misRes.error));

    return {
      classes: sortClassroomsNaturally(((clsRes.data || []) as DbClassRow[]).map(fromDbClass)),
      students: ((stuRes.data || []) as DbStudentRow[])
        .map(fromDbStudent)
        .sort((a, b) => a.studentCode.localeCompare(b.studentCode, 'vi', { numeric: true })),
      coreMissions: ((misRes.data || []) as DbCoreMissionRow[])
        .map(fromDbMission)
        .sort((a, b) => a.id - b.id),
      allocationConfig:
        (setRes.data?.data as MissionAllocationConfig | undefined) || createDefaultAllocationConfig(),
      assignments: ((assignRes.data || []) as DbDailyAssignmentRow[]).map(fromDbAssignment),
      grades: ((gradeRes.data || []) as DbDailyGradeRow[]).map(fromDbGrade),
    };
  }

  if (detectedBackendMode === 'local') {
    return getLocalSnapshot();
  }

  try {
    const res = await serverFetch<WorkspaceSnapshot>('/api/workspace');
    detectedBackendMode = 'server';
    return res;
  } catch (err) {
    if (!(err instanceof ServerUnavailableError)) throw err;
    detectedBackendMode = 'local';
    return getLocalSnapshot();
  }
}

export async function createClassroom(name: string): Promise<ClassroomInfo> {
  const clean = name.trim();
  const created: ClassroomInfo = {
    id: clean,
    name: clean,
    createdAt: new Date().toISOString().slice(0, 10),
  };

  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb.from('classes').upsert(toDbClass(created));
    if (error) throw new Error(mapSupabaseError(error));
    return created;
  }

  if (detectedBackendMode === 'local') {
    const snap = getLocalSnapshot();
    if (snap.classes.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error(`Lớp ${clean} đã tồn tại.`);
    }
    snap.classes.push(created);
    saveLocalSnapshot(snap);
    return created;
  }

  return serverFetch<ClassroomInfo>('/api/classes', {
    method: 'POST',
    body: JSON.stringify({ name: clean }),
  });
}

export async function deleteClassroom(classId: string): Promise<void> {
  const sb = getSupabaseClient();
  if (sb) {
    await Promise.all([
      sb.from('classes').delete().eq('id', classId),
      sb.from('students').delete().eq('class_id', classId),
      sb.from('daily_assignments').delete().eq('class_id', classId),
      sb.from('daily_grades').delete().eq('class_id', classId),
    ]);
    return;
  }

  if (detectedBackendMode === 'local') {
    const snap = getLocalSnapshot();
    snap.classes = snap.classes.filter((c) => c.id !== classId);
    snap.students = snap.students.filter((s) => s.classId !== classId);
    snap.assignments = snap.assignments.filter((a) => a.classId !== classId);
    snap.grades = snap.grades.filter((g) => g.classId !== classId);
    saveLocalSnapshot(snap);
    return;
  }

  await serverFetch(`/api/classes/${encodeURIComponent(classId)}`, {
    method: 'DELETE',
  });
}

export async function aiParseExcelRoster(
  rawRows: Record<string, unknown>[],
  defaultClassId: string,
  sheetName: string
): Promise<Array<Partial<Student>>> {
  const res = await serverFetch<{ students: Array<Partial<Student>> }>('/api/ai/parse-roster', {
    method: 'POST',
    body: JSON.stringify({ rawRows, defaultClassId, sheetName }),
  });
  return res.students;
}

export async function createStudent(payload: Omit<Student, 'id'>): Promise<Student> {
  const created: Student = {
    ...payload,
    id: `stu-${crypto.randomUUID().slice(0, 8)}`,
  };

  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb.from('students').insert(toDbStudent(created));
    if (error) throw new Error(mapSupabaseError(error));
    return created;
  }

  if (detectedBackendMode === 'local') {
    const snap = getLocalSnapshot();
    snap.students.push(created);
    saveLocalSnapshot(snap);
    return created;
  }

  return serverFetch<Student>('/api/students', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateStudent(id: string, payload: Partial<Student>): Promise<Student> {
  const sb = getSupabaseClient();
  if (sb) {
    const { data: existing, error: fErr } = await sb
      .from('students')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (fErr) throw new Error(mapSupabaseError(fErr));
    if (!existing) throw new Error('Không tìm thấy học sinh.');
    const updated: Student = { ...fromDbStudent(existing as DbStudentRow), ...payload };
    const { error: uErr } = await sb.from('students').upsert(toDbStudent(updated));
    if (uErr) throw new Error(mapSupabaseError(uErr));
    return updated;
  }

  if (detectedBackendMode === 'local') {
    const snap = getLocalSnapshot();
    const idx = snap.students.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error('Không tìm thấy học sinh.');
    snap.students[idx] = { ...snap.students[idx], ...payload };
    saveLocalSnapshot(snap);
    return snap.students[idx];
  }

  return serverFetch<Student>(`/api/students/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteStudent(id: string): Promise<void> {
  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb.from('students').delete().eq('id', id);
    if (error) throw new Error(mapSupabaseError(error));
    return;
  }

  if (detectedBackendMode === 'local') {
    const snap = getLocalSnapshot();
    snap.students = snap.students.filter((s) => s.id !== id);
    saveLocalSnapshot(snap);
    return;
  }

  await serverFetch(`/api/students/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function bulkStudentsAction(payload: {
  mode: 'import-merge' | 'import-replace' | 'patch';
  classId?: string;
  students: Array<Partial<Student> & { id?: string }>;
}): Promise<{ students: Student[]; classes?: ClassroomInfo[] }> {
  const sb = getSupabaseClient();
  if (sb) {
    const snap = await fetchWorkspace();
    const { students: updated, classes: nextClasses } = applyBulkStudentTransform(
      snap.students,
      snap.classes,
      payload
    );
    const nextIds = new Set(updated.map((s) => s.id));
    const removedIds = snap.students.filter((s) => !nextIds.has(s.id)).map((s) => s.id);

    if (removedIds.length > 0) {
      for (let i = 0; i < removedIds.length; i += 200) {
        const { error: delErr } = await sb
          .from('students')
          .delete()
          .in('id', removedIds.slice(i, i + 200));
        if (delErr) throw new Error(mapSupabaseError(delErr));
      }
    }

    const dbClasses = nextClasses.map(toDbClass);
    const { error: clsErr } = await sb.from('classes').upsert(dbClasses);
    if (clsErr) throw new Error(mapSupabaseError(clsErr));

    const dbStudents = updated.map(toDbStudent);
    for (let i = 0; i < dbStudents.length; i += 200) {
      const { error: upErr } = await sb.from('students').upsert(dbStudents.slice(i, i + 200));
      if (upErr) throw new Error(mapSupabaseError(upErr));
    }
    return { students: updated, classes: nextClasses };
  }

  if (detectedBackendMode === 'local') {
    const snap = getLocalSnapshot();
    const res = applyBulkStudentTransform(snap.students, snap.classes, payload);
    snap.students = res.students;
    snap.classes = res.classes;
    saveLocalSnapshot(snap);
    return { students: snap.students, classes: snap.classes };
  }

  return serverFetch<{ students: Student[]; classes?: ClassroomInfo[] }>('/api/students/bulk', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function applyBulkStudentTransform(
  currentList: Student[],
  currentClasses: ClassroomInfo[],
  payload: {
    mode: 'import-merge' | 'import-replace' | 'patch';
    classId?: string;
    students: Array<Partial<Student> & { id?: string }>;
  }
): { students: Student[]; classes: ClassroomInfo[] } {
  let list = [...currentList];
  const classes = [...currentClasses];
  const targetClass = payload.classId ? normalizeClassId(payload.classId) : undefined;

  if (payload.mode === 'import-replace' && targetClass) {
    list = list.filter((s) => s.classId !== targetClass);
  }

  if (payload.mode === 'patch') {
    for (const patchItem of payload.students) {
      if (!patchItem.id) continue;
      const idx = list.findIndex((s) => s.id === patchItem.id);
      if (idx !== -1) {
        list[idx] = {
          ...list[idx],
          ...(patchItem.to !== undefined ? { to: Math.min(4, Math.max(1, Number(patchItem.to) || 1)) } : {}),
          ...(patchItem.groupNumber !== undefined
            ? { groupNumber: normalizeGroupNumber(patchItem.groupNumber) }
            : {}),
          ...(patchItem.isLeader !== undefined ? { isLeader: Boolean(patchItem.isLeader) } : {}),
          ...(patchItem.score !== undefined ? { score: normalizeScore(patchItem.score) } : {}),
          ...(patchItem.birthDate !== undefined ? { birthDate: patchItem.birthDate } : {}),
          ...(patchItem.note !== undefined ? { note: patchItem.note } : {}),
        };
      }
    }
    return { students: list, classes };
  }

  for (const item of payload.students) {
    if (!item.name || !item.name.trim()) continue;
    const cls = normalizeClassId(item.classId || targetClass || classes[0]?.id || '9/1');
    if (!classes.some((c) => c.id === cls)) {
      classes.push({ id: cls, name: cls, createdAt: new Date().toISOString().slice(0, 10) });
    }
    const cleanCode = cls.replace(/[^a-zA-Z0-9]/g, '');
    const existingByCode = item.studentCode
      ? list.find((s) => s.classId === cls && s.studentCode.toLowerCase() === item.studentCode!.trim().toLowerCase())
      : undefined;

    if (existingByCode && payload.mode === 'import-merge') {
      existingByCode.name = item.name.trim();
      existingByCode.birthDate = item.birthDate !== undefined ? item.birthDate.trim() : existingByCode.birthDate;
      existingByCode.to = Math.min(4, Math.max(1, Number(item.to) || existingByCode.to));
      existingByCode.groupNumber = item.groupNumber
        ? normalizeGroupNumber(item.groupNumber)
        : existingByCode.groupNumber;
      existingByCode.isLeader = item.isLeader !== undefined ? Boolean(item.isLeader) : existingByCode.isLeader;
      existingByCode.score = item.score !== undefined ? normalizeScore(item.score) : existingByCode.score;
      existingByCode.note = item.note !== undefined ? item.note.trim() : existingByCode.note;
    } else {
      list.push({
        id: `stu-${crypto.randomUUID().slice(0, 8)}`,
        studentCode:
          item.studentCode?.trim() ||
          `${cleanCode}-${String(list.filter((s) => s.classId === cls).length + 1).padStart(2, '0')}`,
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
  return { students: list, classes };
}

export async function updateCoreMission(
  missionId: number,
  payload: { title?: string; summary?: string }
): Promise<CoreMission> {
  const sb = getSupabaseClient();
  if (sb) {
    const { data: existing, error: fErr } = await sb
      .from('core_missions')
      .select('*')
      .eq('id', missionId)
      .maybeSingle();
    if (fErr) throw new Error(mapSupabaseError(fErr));
    if (!existing) throw new Error('Không tìm thấy nhiệm vụ.');
    const mission = fromDbMission(existing as DbCoreMissionRow);
    const updated: CoreMission = {
      ...mission,
      ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
      ...(payload.summary !== undefined ? { summary: payload.summary.trim() } : {}),
    };
    const { error: uErr } = await sb.from('core_missions').upsert(toDbMission(updated));
    if (uErr) throw new Error(mapSupabaseError(uErr));
    return updated;
  }

  if (detectedBackendMode === 'local') {
    const snap = getLocalSnapshot();
    const mission = snap.coreMissions.find((m) => m.id === missionId);
    if (!mission) throw new Error('Không tìm thấy nhiệm vụ.');
    if (payload.title !== undefined) mission.title = payload.title.trim();
    if (payload.summary !== undefined) mission.summary = payload.summary.trim();
    saveLocalSnapshot(snap);
    return mission;
  }

  return serverFetch<CoreMission>(`/api/missions/${missionId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function addMissionCard(
  missionId: number,
  payload: Omit<MissionCard, 'id' | 'missionId'>
): Promise<MissionCard> {
  const sb = getSupabaseClient();
  if (sb) {
    const { data: existing, error: fErr } = await sb
      .from('core_missions')
      .select('*')
      .eq('id', missionId)
      .maybeSingle();
    if (fErr) throw new Error(mapSupabaseError(fErr));
    if (!existing) throw new Error('Không tìm thấy nhiệm vụ.');
    const mission = fromDbMission(existing as DbCoreMissionRow);
    const card: MissionCard = {
      id: `c-${missionId}-${crypto.randomUUID().slice(0, 6)}`,
      missionId,
      ...payload,
    };
    mission.cards.push(card);
    const { error: uErr } = await sb.from('core_missions').upsert(toDbMission(mission));
    if (uErr) throw new Error(mapSupabaseError(uErr));
    return card;
  }

  if (detectedBackendMode === 'local') {
    const snap = getLocalSnapshot();
    const mission = snap.coreMissions.find((m) => m.id === missionId);
    if (!mission) throw new Error('Không tìm thấy nhiệm vụ.');
    const card: MissionCard = {
      id: `c-${missionId}-${crypto.randomUUID().slice(0, 6)}`,
      missionId,
      ...payload,
    };
    mission.cards.push(card);
    saveLocalSnapshot(snap);
    return card;
  }

  return serverFetch<MissionCard>(`/api/missions/${missionId}/cards`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteMissionCard(cardId: string): Promise<void> {
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb.from('core_missions').select('*');
    if (error) throw new Error(mapSupabaseError(error));
    const missions = ((data || []) as DbCoreMissionRow[]).map(fromDbMission);
    for (const mission of missions) {
      const nextCards = mission.cards.filter((c) => c.id !== cardId);
      if (nextCards.length !== mission.cards.length) {
        const { error: uErr } = await sb
          .from('core_missions')
          .upsert(toDbMission({ ...mission, cards: nextCards }));
        if (uErr) throw new Error(mapSupabaseError(uErr));
      }
    }
    return;
  }

  if (detectedBackendMode === 'local') {
    const snap = getLocalSnapshot();
    for (const m of snap.coreMissions) {
      m.cards = m.cards.filter((c) => c.id !== cardId);
    }
    for (const a of snap.assignments) {
      ([1, 2, 3, 4, 5, 6, 7, 8] as GroupNumber[]).forEach((g) => {
        if (a.groups[g]) {
          a.groups[g].cardIds = a.groups[g].cardIds.filter((id) => id !== cardId);
        }
      });
    }
    saveLocalSnapshot(snap);
    return;
  }

  await serverFetch(`/api/cards/${encodeURIComponent(cardId)}`, {
    method: 'DELETE',
  });
}

export async function saveAllocationConfig(
  config: MissionAllocationConfig
): Promise<MissionAllocationConfig> {
  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb.from('app_settings').upsert({ id: 'allocationConfig', data: config });
    if (error) throw new Error(mapSupabaseError(error));
    return config;
  }

  if (detectedBackendMode === 'local') {
    const snap = getLocalSnapshot();
    snap.allocationConfig = config;
    saveLocalSnapshot(snap);
    return config;
  }

  return serverFetch<MissionAllocationConfig>('/api/allocation-config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export async function saveDailyAssignment(
  payload: Omit<DailyAssignmentRecord, 'id' | 'updatedAt'>
): Promise<DailyAssignmentRecord> {
  const id = `${payload.classId}_${payload.date}`;
  const record: DailyAssignmentRecord = {
    id,
    ...payload,
    updatedAt: new Date().toISOString(),
  };

  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb.from('daily_assignments').upsert(toDbAssignment(record));
    if (error) throw new Error(mapSupabaseError(error));
    return record;
  }

  if (detectedBackendMode === 'local') {
    const snap = getLocalSnapshot();
    const idx = snap.assignments.findIndex((a) => a.id === id);
    if (idx !== -1) snap.assignments[idx] = record;
    else snap.assignments.push(record);
    saveLocalSnapshot(snap);
    return record;
  }

  return serverFetch<DailyAssignmentRecord>('/api/assignments', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function saveDailyGrade(
  payload: Omit<DailyGradeRecord, 'id' | 'updatedAt'>
): Promise<DailyGradeRecord> {
  const id = `${payload.classId}_${payload.date}`;
  const record: DailyGradeRecord = {
    id,
    ...payload,
    entries: payload.entries.map((e) => ({
      ...e,
      finalScore: Math.min(
        10,
        Math.max(0, Number((e.baseScore - e.penaltyPoints + e.bonusPoints).toFixed(2)))
      ),
    })),
    updatedAt: new Date().toISOString(),
  };

  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb.from('daily_grades').upsert(toDbGrade(record));
    if (error) throw new Error(mapSupabaseError(error));
    return record;
  }

  if (detectedBackendMode === 'local') {
    const snap = getLocalSnapshot();
    const idx = snap.grades.findIndex((g) => g.id === id);
    if (idx !== -1) snap.grades[idx] = record;
    else snap.grades.push(record);
    saveLocalSnapshot(snap);
    return record;
  }

  return serverFetch<DailyGradeRecord>('/api/grades', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
