export type ClassId = string;

export interface ClassroomInfo {
  id: string;
  name: string;
  createdAt: string;
}

export type GroupNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const GROUP_NUMBERS: GroupNumber[] = [1, 2, 3, 4, 5, 6, 7, 8];

export const DEFAULT_CLASS_NAMES: string[] = [
  '9/1',
  '9/2',
  '9/3',
  '9/4',
  '9/5',
  '9/6',
  '9/7',
  '9/8',
  '9/9',
  '9/10',
];

export interface Student {
  id: string;
  studentCode: string;
  name: string;
  birthDate: string; // DD/MM/YYYY hoặc YYYY-MM-DD
  classId: string;
  to: number; // Tổ 1, 2, 3, 4
  groupNumber: GroupNumber; // Nhóm 1 -> 8
  isLeader: boolean; // Nhóm trưởng (tick / untick)
  score: number; // Điểm đánh giá năng lực 1 -> 10
  note?: string;
}

export interface MissionCard {
  id: string;
  missionId: number; // 1..5
  code: string;
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

export interface MissionAllocationConfig {
  cardsPerGroup: Record<GroupNumber, number>;
  missionCounts: Record<number, number>; // Số nhóm/thẻ dùng cho mỗi trong 5 nhiệm vụ (ví dụ 2 hoặc 3 nhóm trùng)
  allowRepeatSameGroup: boolean;
}

export interface GroupDailyPlan {
  groupNumber: GroupNumber;
  cardIds: string[];
  homework: string;
  teacherNote?: string;
}

export interface DailyAssignmentRecord {
  id: string; // `${classId}_${date}`
  classId: string;
  date: string; // YYYY-MM-DD
  lessonTopic: string;
  groups: Record<GroupNumber, GroupDailyPlan>;
  updatedAt: string;
}

export interface GroupGradeEntry {
  groupNumber: GroupNumber;
  baseScore: number; // Điểm giáo viên cho (0-10)
  bonusPoints: number; // Điểm cộng (+)
  penaltyPoints: number; // Điểm trừ (-)
  finalScore: number; // = baseScore - penaltyPoints + bonusPoints
  feedback: string;
}

export interface DailyGradeRecord {
  id: string; // `${classId}_${date}`
  classId: string;
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
  classId: string;
  groupNumber: GroupNumber;
  date: string;
  lessonTopic: string;
  students: Pick<Student, 'id' | 'studentCode' | 'name' | 'birthDate' | 'to' | 'groupNumber' | 'isLeader' | 'note'>[];
  cards: MissionCard[];
  homework: string;
  teacherNote: string;
  publishedGrade: GroupGradeEntry | null;
  allGroupScores: Array<{ groupNumber: GroupNumber; baseScore: number; bonusPoints: number; penaltyPoints: number; finalScore: number }> | null;
}

export interface WorkspaceSnapshot {
  classes: ClassroomInfo[];
  students: Student[];
  coreMissions: CoreMission[];
  allocationConfig: MissionAllocationConfig;
  assignments: DailyAssignmentRecord[];
  grades: DailyGradeRecord[];
}
