import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  ClassroomInfo,
  CoreMission,
  DailyAssignmentRecord,
  DailyGradeRecord,
  MissionAllocationConfig,
  Student,
  TeacherUser,
} from '../shared/types.ts';
import { createClientSeedSnapshot } from '../src/lib/defaultSeedData.ts';

interface StoredTeacherAccount extends TeacherUser {
  passwordHash: string;
  salt: string;
}

interface StoredSession {
  token: string;
  teacherId: string;
  expiresAt: number;
}

export interface DatabaseSchema {
  teachers: StoredTeacherAccount[];
  sessions: StoredSession[];
  classes: ClassroomInfo[];
  students: Student[];
  coreMissions: CoreMission[];
  allocationConfig: MissionAllocationConfig;
  assignments: DailyAssignmentRecord[];
  grades: DailyGradeRecord[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hash, 'hex'));
}

function createInitialDb(): DatabaseSchema {
  const salt = crypto.randomBytes(16).toString('hex');
  const defaultPasswordHash = hashPassword('123456', salt);
  const seed = createClientSeedSnapshot();

  return {
    teachers: [
      {
        id: 'teacher-1',
        email: 'giaovien@truonghoc.edu.vn',
        name: 'Giáo viên Chủ nhiệm',
        subject: 'Tổ Chuyên môn Khối 9',
        salt,
        passwordHash: defaultPasswordHash,
      },
    ],
    sessions: [],
    classes: seed.classes,
    students: seed.students,
    coreMissions: seed.coreMissions,
    allocationConfig: seed.allocationConfig,
    assignments: seed.assignments,
    grades: seed.grades,
  };
}

let cachedDb: DatabaseSchema | null = null;

export function loadDb(): DatabaseSchema {
  if (cachedDb) return cachedDb;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    cachedDb = createInitialDb();
    saveDb(cachedDb);
    return cachedDb;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
    // Migrate older v1 schema cleanly if needed
    if (!parsed.classes || !parsed.allocationConfig || !parsed.students?.[0] || parsed.students[0].score === undefined) {
      cachedDb = createInitialDb();
      if (parsed.teachers && parsed.teachers.length > 0) {
        cachedDb.teachers = parsed.teachers;
      }
      saveDb(cachedDb);
      return cachedDb;
    }
    cachedDb = parsed as DatabaseSchema;
    return cachedDb;
  } catch {
    cachedDb = createInitialDb();
    saveDb(cachedDb);
    return cachedDb;
  }
}

export function saveDb(db: DatabaseSchema): void {
  cachedDb = db;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

export function createTeacherAccount(email: string, password: string, name: string, subject: string): TeacherUser {
  const db = loadDb();
  const normalized = email.trim().toLowerCase();
  if (db.teachers.some((t) => t.email.toLowerCase() === normalized)) {
    throw new Error('Email này đã được đăng ký.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const teacher: StoredTeacherAccount = {
    id: `teacher-${crypto.randomUUID().slice(0, 8)}`,
    email: normalized,
    name: name.trim() || 'Giáo viên',
    subject: subject.trim() || 'Khối 9',
    salt,
    passwordHash,
  };
  db.teachers.push(teacher);
  saveDb(db);
  return { id: teacher.id, email: teacher.email, name: teacher.name, subject: teacher.subject };
}

export function authenticateTeacher(email: string, password: string): { token: string; user: TeacherUser } | null {
  const db = loadDb();
  const normalized = email.trim().toLowerCase();
  const found = db.teachers.find((t) => t.email.toLowerCase() === normalized);
  if (!found) return null;
  if (!verifyPassword(password, found.salt, found.passwordHash)) return null;

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
  db.sessions = db.sessions.filter((s) => s.expiresAt > Date.now());
  db.sessions.push({ token, teacherId: found.id, expiresAt });
  saveDb(db);

  return {
    token,
    user: {
      id: found.id,
      email: found.email,
      name: found.name,
      subject: found.subject,
    },
  };
}

export function getTeacherByToken(token: string | undefined): TeacherUser | null {
  if (!token) return null;
  const db = loadDb();
  const now = Date.now();
  const session = db.sessions.find((s) => s.token === token && s.expiresAt > now);
  if (!session) return null;
  const teacher = db.teachers.find((t) => t.id === session.teacherId);
  if (!teacher) return null;
  return {
    id: teacher.id,
    email: teacher.email,
    name: teacher.name,
    subject: teacher.subject,
  };
}

export function revokeSession(token: string | undefined): void {
  if (!token) return;
  const db = loadDb();
  db.sessions = db.sessions.filter((s) => s.token !== token);
  saveDb(db);
}
