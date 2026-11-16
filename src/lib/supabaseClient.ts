import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  ClassroomInfo,
  CoreMission,
  DailyAssignmentRecord,
  DailyGradeRecord,
  GroupDailyPlan,
  GroupGradeEntry,
  GroupNumber,
  MissionCard,
  Student,
} from '../../shared/types.ts';

function readSupabaseConfig(): { url: string; anonKey: string } {
  const url = String(
    import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || ''
  ).trim();
  const anonKey = String(
    import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  ).trim();
  return { url, anonKey };
}

export function isSupabaseEnvConfigured(): boolean {
  const { url, anonKey } = readSupabaseConfig();
  return Boolean(url && anonKey);
}

export function getSupabaseUrl(): string {
  return readSupabaseConfig().url;
}

export function getSupabaseProjectRef(): string {
  const url = readSupabaseConfig().url;
  const match = url.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return match ? match[1] : url;
}

let cachedSupabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseEnvConfigured()) return null;
  if (cachedSupabase) return cachedSupabase;
  const { url, anonKey } = readSupabaseConfig();
  cachedSupabase = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return cachedSupabase;
}

export interface DbClassRow {
  id: string;
  name: string;
  created_at: string;
}

export interface DbStudentRow {
  id: string;
  student_code: string;
  name: string;
  birth_date: string;
  class_id: string;
  to: number;
  group_number: number;
  is_leader: boolean;
  score: number;
  note: string;
}

export interface DbCoreMissionRow {
  id: number;
  title: string;
  summary: string;
  cards: MissionCard[];
}

export interface DbDailyAssignmentRow {
  id: string;
  class_id: string;
  date: string;
  lesson_topic: string;
  groups: Record<GroupNumber, GroupDailyPlan>;
  updated_at: string;
}

export interface DbDailyGradeRow {
  id: string;
  class_id: string;
  date: string;
  lesson_topic: string;
  entries: GroupGradeEntry[];
  published_to_students: boolean;
  updated_at: string;
}

export function toDbClass(c: ClassroomInfo): DbClassRow {
  return { id: c.id, name: c.name, created_at: c.createdAt };
}

export function fromDbClass(row: DbClassRow): ClassroomInfo {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export function toDbStudent(s: Student): DbStudentRow {
  return {
    id: s.id,
    student_code: s.studentCode,
    name: s.name,
    birth_date: s.birthDate || '',
    class_id: s.classId,
    to: s.to,
    group_number: s.groupNumber,
    is_leader: Boolean(s.isLeader),
    score: Number(s.score ?? 7),
    note: s.note || '',
  };
}

export function fromDbStudent(row: DbStudentRow): Student {
  return {
    id: row.id,
    studentCode: row.student_code,
    name: row.name,
    birthDate: row.birth_date || '',
    classId: row.class_id,
    to: Math.min(4, Math.max(1, Number(row.to) || 1)),
    groupNumber: Math.min(8, Math.max(1, Number(row.group_number) || 1)) as GroupNumber,
    isLeader: Boolean(row.is_leader),
    score: Number(row.score ?? 7),
    note: row.note || '',
  };
}

export function toDbMission(m: CoreMission): DbCoreMissionRow {
  return { id: m.id, title: m.title, summary: m.summary, cards: m.cards };
}

export function fromDbMission(row: DbCoreMissionRow): CoreMission {
  return {
    id: Number(row.id),
    title: row.title,
    summary: row.summary || '',
    cards: Array.isArray(row.cards) ? row.cards : [],
  };
}

export function toDbAssignment(a: DailyAssignmentRecord): DbDailyAssignmentRow {
  return {
    id: a.id,
    class_id: a.classId,
    date: a.date,
    lesson_topic: a.lessonTopic,
    groups: a.groups,
    updated_at: a.updatedAt,
  };
}

export function fromDbAssignment(row: DbDailyAssignmentRow): DailyAssignmentRecord {
  return {
    id: row.id,
    classId: row.class_id,
    date: row.date,
    lessonTopic: row.lesson_topic,
    groups: row.groups,
    updatedAt: row.updated_at,
  };
}

export function toDbGrade(g: DailyGradeRecord): DbDailyGradeRow {
  return {
    id: g.id,
    class_id: g.classId,
    date: g.date,
    lesson_topic: g.lessonTopic,
    entries: g.entries,
    published_to_students: Boolean(g.publishedToStudents),
    updated_at: g.updatedAt,
  };
}

export function fromDbGrade(row: DbDailyGradeRow): DailyGradeRecord {
  return {
    id: row.id,
    classId: row.class_id,
    date: row.date,
    lessonTopic: row.lesson_topic,
    entries: Array.isArray(row.entries) ? row.entries : [],
    publishedToStudents: Boolean(row.published_to_students),
    updatedAt: row.updated_at,
  };
}
