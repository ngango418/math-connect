export type ClassId = '9/23' | '9/26' | '9/28';

export const CLASS_IDS: ClassId[] = ['9/23', '9/26', '9/28'];

export type GroupNumber = 1 | 2 | 3 | 4 | 5;

export const GROUP_NUMBERS: GroupNumber[] = [1, 2, 3, 4, 5];

export type SeedLevel = 1 | 2 | 3 | 4 | 5;

export interface Student {
  id: string;
  studentCode: string;
  name: string;
  classId: ClassId;
  to: number; // Tổ 1, 2, 3, 4...
  groupNumber: GroupNumber; // Nhóm 1 -> 5
  seed: SeedLevel; // 1 = Cao nhất, 5 = Thấp nhất
  note?: string;
}

export interface MissionCard {
  id: string;
  missionId: number; // 1..5 (5 nhiệm vụ cứng)
  code: string; // e.g., "NV1-A", "NV1-B", "NV1-B (Bản sao)"
  title: string;
  description: string;
  durationMinutes: number;
  isDuplicate?: boolean;
}

export interface CoreMission {
  id: number; // 1..5
  title: string;
  summary: string;
  cards: MissionCard[];
}

export interface GroupDailyPlan {
  groupNumber: GroupNumber;
  cardIds: string[]; // Variable number of cards per group on that day; allows duplicate cardIds if desired or duplicate cards
  homework: string;
  teacherNote?: string;
}

export interface DailyAssignmentRecord {
  id: string; // `${classId}_${date}`
  classId: ClassId;
  date: string; // YYYY-MM-DD
  lessonTopic: string;
  groups: Record<GroupNumber, GroupDailyPlan>;
  updatedAt: string;
}

export interface GroupGradeEntry {
  groupNumber: GroupNumber;
  qualityOrder: number; // 1 = Thấp nhất -> 5 = Cao nhất (xếp thứ tự từ thấp đến cao)
  score: number; // 0 - 10
  completedCardsCount: number;
  feedback: string;
}

export interface DailyGradeRecord {
  id: string; // `${classId}_${date}`
  classId: ClassId;
  date: string; // YYYY-MM-DD
  lessonTopic: string;
  entries: GroupGradeEntry[];
  publishedToStudents: boolean;
  updatedAt: string;
}

export interface TeacherUser {
  id: string;
  email: string;
  name: string;
  subject: string;
}

export interface PublicStudentMissionResponse {
  classId: ClassId;
  groupNumber: GroupNumber;
  date: string;
  lessonTopic: string;
  students: Pick<Student, 'id' | 'studentCode' | 'name' | 'to' | 'groupNumber' | 'note'>[];
  cards: MissionCard[];
  homework: string;
  teacherNote: string;
  publishedGrade: GroupGradeEntry | null;
  allGroupRankings: Array<{ groupNumber: GroupNumber; qualityOrder: number; score: number }> | null;
}

export interface WorkspaceSnapshot {
  students: Student[];
  coreMissions: CoreMission[];
  assignments: DailyAssignmentRecord[];
  grades: DailyGradeRecord[];
}
