import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
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
import { createClientSeedSnapshot, createDefaultAllocationConfig } from './defaultSeedData.ts';
import { getFirebaseServices, isFirebaseEnvConfigured } from './firebaseClient.ts';

const TOKEN_STORAGE_KEY = 'classqr_teacher_token';
const LOCAL_SNAPSHOT_KEY = 'classqr_local_snapshot_v3';
const LOCAL_TEACHERS_KEY = 'classqr_local_teachers_v1';
const LOCAL_SESSION_KEY = 'classqr_local_session_v1';

export type StorageBackendMode = 'firebase' | 'server' | 'local';

let detectedBackendMode: StorageBackendMode = isFirebaseEnvConfigured() ? 'firebase' : 'server';

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

function makeDocSafeId(raw: string): string {
  return raw.replace(/\//g, '-');
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

function mapFirestoreError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
    return 'Firestore từ chối quyền ghi (permission-denied). Hãy mở tab Liên kết Firebase, chép bộ Rules và nhấn Publish trên Firebase Console.';
  }
  if (msg.includes('not-found') || msg.includes('does not exist') || msg.includes('FAILED_PRECONDITION')) {
    return 'Dự án Firebase này chưa bật Firestore Database. Hãy vào Firebase Console → Build → Firestore Database → Create database.';
  }
  return msg;
}

type BatchOp =
  | { type: 'set'; ref: ReturnType<typeof doc>; data: unknown }
  | { type: 'delete'; ref: ReturnType<typeof doc> };

async function commitChunkedBatch(
  db: NonNullable<ReturnType<typeof getFirebaseServices>>['db'],
  ops: BatchOp[]
): Promise<void> {
  const CHUNK_SIZE = 400;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const chunk = ops.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.type === 'set') {
        batch.set(op.ref, op.data);
      } else {
        batch.delete(op.ref);
      }
    }
    await batch.commit();
  }
}

export async function initializeFirestoreDatabase(forceReset = false): Promise<{
  created: boolean;
  counts: { missions: number; students: number; assignments: number; grades: number };
}> {
  const fb = getFirebaseServices();
  if (!fb) {
    throw new Error('Chưa cấu hình đầy đủ biến môi trường VITE_FIREBASE_* cho ứng dụng.');
  }
  try {
    const [missionsSnap, classesSnap] = await Promise.all([
      getDocs(collection(fb.db, 'coreMissions')),
      getDocs(collection(fb.db, 'classes')),
    ]);

    if (!missionsSnap.empty && !classesSnap.empty && !forceReset) {
      const [studentsSnap, assignSnap, gradesSnap] = await Promise.all([
        getDocs(collection(fb.db, 'students')),
        getDocs(collection(fb.db, 'dailyAssignments')),
        getDocs(collection(fb.db, 'dailyGrades')),
      ]);
      return {
        created: false,
        counts: {
          missions: missionsSnap.size,
          students: studentsSnap.size,
          assignments: assignSnap.size,
          grades: gradesSnap.size,
        },
      };
    }

    const ops: BatchOp[] = [];
    if (forceReset) {
      const [oldStudents, oldClasses, oldAssign, oldGrades] = await Promise.all([
        getDocs(collection(fb.db, 'students')),
        getDocs(collection(fb.db, 'classes')),
        getDocs(collection(fb.db, 'dailyAssignments')),
        getDocs(collection(fb.db, 'dailyGrades')),
      ]);
      for (const d of oldStudents.docs) ops.push({ type: 'delete', ref: d.ref });
      for (const d of oldClasses.docs) ops.push({ type: 'delete', ref: d.ref });
      for (const d of oldAssign.docs) ops.push({ type: 'delete', ref: d.ref });
      for (const d of oldGrades.docs) ops.push({ type: 'delete', ref: d.ref });
    }

    const seed = createClientSeedSnapshot();

    for (const c of seed.classes) {
      ops.push({ type: 'set', ref: doc(fb.db, 'classes', makeDocSafeId(c.id)), data: c });
    }
    for (const m of seed.coreMissions) {
      ops.push({ type: 'set', ref: doc(fb.db, 'coreMissions', String(m.id)), data: m });
    }
    ops.push({ type: 'set', ref: doc(fb.db, 'settings', 'allocationConfig'), data: seed.allocationConfig });

    for (const s of seed.students) {
      ops.push({ type: 'set', ref: doc(fb.db, 'students', s.id), data: s });
    }
    for (const a of seed.assignments) {
      ops.push({ type: 'set', ref: doc(fb.db, 'dailyAssignments', makeDocSafeId(a.id)), data: a });
    }
    for (const g of seed.grades) {
      ops.push({ type: 'set', ref: doc(fb.db, 'dailyGrades', makeDocSafeId(g.id)), data: g });
    }
    await commitChunkedBatch(fb.db, ops);

    return {
      created: true,
      counts: {
        missions: seed.coreMissions.length,
        students: seed.students.length,
        assignments: seed.assignments.length,
        grades: seed.grades.length,
      },
    };
  } catch (err) {
    throw new Error(mapFirestoreError(err));
  }
}

async function seedFirestoreIfEmpty(): Promise<void> {
  await initializeFirestoreDatabase(false);
}

function waitForFirebaseUser(): Promise<TeacherUser | null> {
  const fb = getFirebaseServices();
  if (!fb) return Promise.resolve(null);
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(fb.auth, (user) => {
      unsub();
      if (!user) {
        resolve(null);
      } else {
        resolve({
          id: user.uid,
          email: user.email || '',
          name: user.displayName || 'Giáo viên',
          subject: 'Khối 9',
        });
      }
    });
  });
}

function mapFirebaseAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found')) {
    return 'Email hoặc mật khẩu Firebase không đúng.';
  }
  if (msg.includes('auth/email-already-in-use')) {
    return 'Email này đã được đăng ký trên Firebase.';
  }
  if (msg.includes('auth/operation-not-allowed')) {
    return 'Chức năng đăng nhập Email/Password chưa được bật trong Firebase Console → Authentication → Sign-in method.';
  }
  if (msg.includes('auth/unauthorized-domain')) {
    return 'Tên miền này chưa được thêm vào Authorized domains trong Firebase Console → Authentication → Settings.';
  }
  return msg;
}

export async function loginTeacher(email: string, password: string): Promise<{ token: string; user: TeacherUser }> {
  const fb = getFirebaseServices();
  if (fb) {
    detectedBackendMode = 'firebase';
    try {
      const cred = await signInWithEmailAndPassword(fb.auth, email.trim(), password);
      const user: TeacherUser = {
        id: cred.user.uid,
        email: cred.user.email || email.trim(),
        name: cred.user.displayName || 'Giáo viên',
        subject: 'Khối 9',
      };
      return { token: await cred.user.getIdToken(), user };
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
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
  const fb = getFirebaseServices();
  if (fb) {
    detectedBackendMode = 'firebase';
    try {
      const cred = await createUserWithEmailAndPassword(fb.auth, email.trim(), password);
      if (name.trim()) {
        await updateProfile(cred.user, { displayName: name.trim() });
      }
      const user: TeacherUser = {
        id: cred.user.uid,
        email: cred.user.email || email.trim(),
        name: name.trim() || 'Giáo viên',
        subject: subject.trim() || 'Khối 9',
      };
      return { token: await cred.user.getIdToken(), user };
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
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
  const fb = getFirebaseServices();
  if (fb) {
    detectedBackendMode = 'firebase';
    return waitForFirebaseUser();
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
  const fb = getFirebaseServices();
  if (fb) {
    await signOut(fb.auth);
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
  const fb = getFirebaseServices();
  if (!fb) {
    throw new Error('Chức năng đặt lại mật khẩu qua email chỉ dùng khi đã kết nối Firebase.');
  }
  if (!email.trim()) {
    throw new Error('Vui lòng nhập email trước khi yêu cầu đặt lại mật khẩu.');
  }
  await sendPasswordResetEmail(fb.auth, email.trim());
}

function sortClassroomsNaturally(list: ClassroomInfo[]): ClassroomInfo[] {
  return [...list].sort((a, b) =>
    a.name.localeCompare(b.name, 'vi', { numeric: true, sensitivity: 'base' })
  );
}

export async function fetchPublicClasses(): Promise<ClassroomInfo[]> {
  const fb = getFirebaseServices();
  if (fb) {
    try {
      const snap = await getDocs(collection(fb.db, 'classes'));
      const list = snap.docs.map((d) => d.data() as ClassroomInfo);
      if (list.length > 0) return sortClassroomsNaturally(list);
    } catch {
      // fall through to default
    }
    return createClientSeedSnapshot().classes;
  }

  try {
    const res = await serverFetch<{ classes: ClassroomInfo[] }>('/api/public/classes');
    return res.classes;
  } catch {
    return getLocalSnapshot().classes;
  }
}

export async function fetchPublicStudentMission(
  classId: string,
  groupNumber: number,
  date: string
): Promise<PublicStudentMissionResponse> {
  const fb = getFirebaseServices();
  if (fb) {
    detectedBackendMode = 'firebase';
    const [missionsSnap, studentsSnap, assignSnap, gradesSnap] = await Promise.all([
      getDocs(collection(fb.db, 'coreMissions')),
      getDocs(query(collection(fb.db, 'students'), where('classId', '==', classId))),
      getDocs(query(collection(fb.db, 'dailyAssignments'), where('classId', '==', classId))),
      getDocs(query(collection(fb.db, 'dailyGrades'), where('classId', '==', classId))),
    ]);

    const coreMissions = missionsSnap.docs.map((d) => d.data() as CoreMission);
    const studentsList = studentsSnap.docs.map((d) => normalizeStudentRecord(d.data() as Student));
    const assignmentsList = assignSnap.docs.map((d) => d.data() as DailyAssignmentRecord);
    const gradesList = gradesSnap.docs.map((d) => d.data() as DailyGradeRecord);

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
  const gradeRecord = grades.find(
    (g) => g.classId === classId && g.date === targetDate && g.publishedToStudents
  );
  const publishedGrade = gradeRecord?.entries.find((e) => e.groupNumber === groupNumber) || null;
  const allGroupScores = gradeRecord
    ? [...gradeRecord.entries]
        .sort((a, b) => b.finalScore - a.finalScore)
        .map((e) => ({
          groupNumber: e.groupNumber,
          baseScore: e.baseScore,
          bonusPoints: e.bonusPoints,
          penaltyPoints: e.penaltyPoints,
          finalScore: e.finalScore,
        }))
    : null;

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
    allGroupScores,
  };
}

export async function fetchWorkspace(): Promise<WorkspaceSnapshot> {
  const fb = getFirebaseServices();
  if (fb) {
    detectedBackendMode = 'firebase';
    await seedFirestoreIfEmpty();
    const [classesSnap, studentsSnap, missionsSnap, settingsSnap, assignSnap, gradesSnap] = await Promise.all([
      getDocs(collection(fb.db, 'classes')),
      getDocs(collection(fb.db, 'students')),
      getDocs(collection(fb.db, 'coreMissions')),
      getDocs(collection(fb.db, 'settings')),
      getDocs(collection(fb.db, 'dailyAssignments')),
      getDocs(collection(fb.db, 'dailyGrades')),
    ]);
    const allocDoc = settingsSnap.docs.find((d) => d.id === 'allocationConfig');
    return {
      classes: sortClassroomsNaturally(classesSnap.docs.map((d) => d.data() as ClassroomInfo)),
      students: studentsSnap.docs
        .map((d) => normalizeStudentRecord(d.data() as Student))
        .sort((a, b) => a.studentCode.localeCompare(b.studentCode, 'vi', { numeric: true })),
      coreMissions: missionsSnap.docs
        .map((d) => d.data() as CoreMission)
        .sort((a, b) => a.id - b.id),
      allocationConfig: (allocDoc?.data() as MissionAllocationConfig | undefined) || createDefaultAllocationConfig(),
      assignments: assignSnap.docs.map((d) => d.data() as DailyAssignmentRecord),
      grades: gradesSnap.docs.map((d) => d.data() as DailyGradeRecord),
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

  const fb = getFirebaseServices();
  if (fb) {
    await setDoc(doc(fb.db, 'classes', makeDocSafeId(clean)), created);
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
  const fb = getFirebaseServices();
  if (fb) {
    await deleteDoc(doc(fb.db, 'classes', makeDocSafeId(classId)));
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
  const fb = getFirebaseServices();
  if (fb) {
    const created: Student = {
      ...payload,
      id: `stu-${crypto.randomUUID().slice(0, 8)}`,
    };
    await setDoc(doc(fb.db, 'students', created.id), created);
    return created;
  }

  if (detectedBackendMode === 'local') {
    const snap = getLocalSnapshot();
    const created: Student = {
      ...payload,
      id: `stu-${crypto.randomUUID().slice(0, 8)}`,
    };
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
  const fb = getFirebaseServices();
  if (fb) {
    const snap = await getDocs(query(collection(fb.db, 'students'), where('id', '==', id)));
    const current = snap.docs[0]?.data() as Student | undefined;
    if (!current) throw new Error('Không tìm thấy học sinh.');
    const updated: Student = { ...normalizeStudentRecord(current), ...payload };
    await setDoc(doc(fb.db, 'students', id), updated);
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
  const fb = getFirebaseServices();
  if (fb) {
    await deleteDoc(doc(fb.db, 'students', id));
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
  const fb = getFirebaseServices();
  if (fb) {
    const snap = await fetchWorkspace();
    const { students: updated, classes: nextClasses } = applyBulkStudentTransform(
      snap.students,
      snap.classes,
      payload
    );
    const ops: BatchOp[] = [];
    const existingIds = new Set(snap.students.map((s) => s.id));
    const nextIds = new Set(updated.map((s) => s.id));
    for (const oldId of existingIds) {
      if (!nextIds.has(oldId)) {
        ops.push({ type: 'delete', ref: doc(fb.db, 'students', oldId) });
      }
    }
    for (const stu of updated) {
      ops.push({ type: 'set', ref: doc(fb.db, 'students', stu.id), data: stu });
    }
    for (const cls of nextClasses) {
      ops.push({ type: 'set', ref: doc(fb.db, 'classes', makeDocSafeId(cls.id)), data: cls });
    }
    await commitChunkedBatch(fb.db, ops);
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
  const fb = getFirebaseServices();
  if (fb) {
    const snap = await fetchWorkspace();
    const mission = snap.coreMissions.find((m) => m.id === missionId);
    if (!mission) throw new Error('Không tìm thấy nhiệm vụ.');
    const updated: CoreMission = {
      ...mission,
      ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
      ...(payload.summary !== undefined ? { summary: payload.summary.trim() } : {}),
    };
    await setDoc(doc(fb.db, 'coreMissions', String(missionId)), updated);
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
  const fb = getFirebaseServices();
  if (fb) {
    const snap = await fetchWorkspace();
    const mission = snap.coreMissions.find((m) => m.id === missionId);
    if (!mission) throw new Error('Không tìm thấy nhiệm vụ.');
    const card: MissionCard = {
      id: `c-${missionId}-${crypto.randomUUID().slice(0, 6)}`,
      missionId,
      ...payload,
    };
    mission.cards.push(card);
    await setDoc(doc(fb.db, 'coreMissions', String(missionId)), mission);
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
  const fb = getFirebaseServices();
  if (fb) {
    const snap = await fetchWorkspace();
    const batch = writeBatch(fb.db);
    for (const mission of snap.coreMissions) {
      const nextCards = mission.cards.filter((c) => c.id !== cardId);
      if (nextCards.length !== mission.cards.length) {
        batch.set(doc(fb.db, 'coreMissions', String(mission.id)), { ...mission, cards: nextCards });
      }
    }
    await batch.commit();
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
  const fb = getFirebaseServices();
  if (fb) {
    await setDoc(doc(fb.db, 'settings', 'allocationConfig'), config);
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

  const fb = getFirebaseServices();
  if (fb) {
    await setDoc(doc(fb.db, 'dailyAssignments', makeDocSafeId(id)), record);
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
      finalScore: Number((e.baseScore - e.penaltyPoints + e.bonusPoints).toFixed(2)),
    })),
    updatedAt: new Date().toISOString(),
  };

  const fb = getFirebaseServices();
  if (fb) {
    await setDoc(doc(fb.db, 'dailyGrades', makeDocSafeId(id)), record);
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
