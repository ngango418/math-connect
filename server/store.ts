import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  ClassId,
  CoreMission,
  DailyAssignmentRecord,
  DailyGradeRecord,
  GroupNumber,
  SeedLevel,
  Student,
  TeacherUser,
} from '../shared/types.ts';

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
  students: Student[];
  coreMissions: CoreMission[];
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

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getYesterdayDateString(): string {
  const now = new Date(Date.now() - 86400000);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function createInitialCoreMissions(): CoreMission[] {
  return [
    {
      id: 1,
      title: 'Nhiệm vụ 1: Khởi động & Thu thập dữ liệu',
      summary: 'Quan sát tình huống thực tế, đọc nhanh ngữ liệu và ghi nhận các thông số ban đầu.',
      cards: [
        {
          id: 'c-1-1',
          missionId: 1,
          code: 'NV1-T01',
          title: 'Quan sát mẫu vật & liệt kê hiện tượng',
          description: 'Ghi chép ít nhất 4 đặc điểm nổi bật của mẫu bài học vào phiếu nhóm.',
          durationMinutes: 8,
        },
        {
          id: 'c-1-2',
          missionId: 1,
          code: 'NV1-T02',
          title: 'Thu thập số liệu thực nghiệm nhanh',
          description: 'Đo đạc 3 lần liên tiếp và lập bảng giá trị trung bình cho cả nhóm.',
          durationMinutes: 10,
        },
        {
          id: 'c-1-3',
          missionId: 1,
          code: 'NV1-T02 (Bản sao)',
          title: 'Thu thập số liệu thực nghiệm nhanh (Thẻ trùng)',
          description: 'Đo đạc 3 lần liên tiếp và lập bảng giá trị trung bình cho cả nhóm.',
          durationMinutes: 10,
          isDuplicate: true,
        },
      ],
    },
    {
      id: 2,
      title: 'Nhiệm vụ 2: Phân tích & Giải quyết vấn đề',
      summary: 'Xác định nguyên nhân, mối liên hệ nhân quả và đề xuất hướng xử lý trọng tâm.',
      cards: [
        {
          id: 'c-2-1',
          missionId: 2,
          code: 'NV2-T01',
          title: 'Lập sơ đồ tư duy nguyên nhân – hệ quả',
          description: 'Trình bày sơ đồ nhánh trên giấy A3 trong thời gian quy định.',
          durationMinutes: 12,
        },
        {
          id: 'c-2-2',
          missionId: 2,
          code: 'NV2-T02',
          title: 'Giải bài toán tình huống trọng tâm',
          description: 'Hoàn thành 2 câu hỏi phân tích chuyên sâu và kiểm tra chéo đáp án.',
          durationMinutes: 12,
        },
        {
          id: 'c-2-3',
          missionId: 2,
          code: 'NV2-T01 (Bản sao)',
          title: 'Lập sơ đồ tư duy nguyên nhân – hệ quả (Thẻ trùng)',
          description: 'Trình bày sơ đồ nhánh trên giấy A3 trong thời gian quy định.',
          durationMinutes: 12,
          isDuplicate: true,
        },
      ],
    },
    {
      id: 3,
      title: 'Nhiệm vụ 3: Thực hành & Lập luận chuyên sâu',
      summary: 'Áp dụng công thức/kiến thức nền tảng để giải quyết bài tập thực hành theo nhóm.',
      cards: [
        {
          id: 'c-3-1',
          missionId: 3,
          code: 'NV3-T01',
          title: 'Thực hành lắp ghép / giải mẫu chuẩn',
          description: 'Thực hiện đúng quy trình 4 bước và đánh dấu điểm kiểm tra trung gian.',
          durationMinutes: 15,
        },
        {
          id: 'c-3-2',
          missionId: 3,
          code: 'NV3-T02',
          title: 'Đối chiếu sai số & hiệu chỉnh kết quả',
          description: 'Tìm 2 lỗi sai phổ biến trong lời giải mẫu và viết lại phương án đúng.',
          durationMinutes: 10,
        },
      ],
    },
    {
      id: 4,
      title: 'Nhiệm vụ 4: Phản biện & Trình bày nhóm',
      summary: 'Đại diện nhóm báo cáo kết quả, đặt câu hỏi phản biện cho các nhóm còn lại.',
      cards: [
        {
          id: 'c-4-1',
          missionId: 4,
          code: 'NV4-T01',
          title: 'Thuyết trình ngắn 3 phút trước lớp',
          description: 'Cử 1 bạn trình bày chính và 1 bạn ghi nhận câu hỏi từ các nhóm bạn.',
          durationMinutes: 8,
        },
        {
          id: 'c-4-2',
          missionId: 4,
          code: 'NV4-T02',
          title: 'Đặt 2 câu hỏi phản biện nhóm bạn',
          description: 'Chuẩn bị 2 câu hỏi chất vấn nhắm vào phần lập luận của nhóm kế bên.',
          durationMinutes: 7,
        },
        {
          id: 'c-4-3',
          missionId: 4,
          code: 'NV4-T02 (Bản sao)',
          title: 'Đặt 2 câu hỏi phản biện nhóm bạn (Thẻ trùng)',
          description: 'Chuẩn bị 2 câu hỏi chất vấn nhắm vào phần lập luận của nhóm kế bên.',
          durationMinutes: 7,
          isDuplicate: true,
        },
      ],
    },
    {
      id: 5,
      title: 'Nhiệm vụ 5: Tổng hợp & Vận dụng mở rộng',
      summary: 'Rút ra kết luận bài học và liên hệ ứng dụng thực tiễn ở mức nâng cao.',
      cards: [
        {
          id: 'c-5-1',
          missionId: 5,
          code: 'NV5-T01',
          title: 'Viết thông điệp tổng kết 5 dòng',
          description: 'Chốt 3 từ khóa cốt lõi và 1 ứng dụng thực tế liên quan đến bài học.',
          durationMinutes: 8,
        },
        {
          id: 'c-5-2',
          missionId: 5,
          code: 'NV5-T02',
          title: 'Thử thách mở rộng liên môn',
          description: 'Đề xuất một tình huống mới áp dụng kiến thức vừa học vào đời sống.',
          durationMinutes: 10,
        },
      ],
    },
  ];
}

function buildSeedStudents(): Student[] {
  const rosters: Record<ClassId, Array<{ name: string; to: number; groupNumber: GroupNumber; seed: SeedLevel; note?: string }>> = {
    '9/23': [
      { name: 'Nguyễn Minh Anh', to: 1, groupNumber: 1, seed: 1, note: 'Nhóm trưởng' },
      { name: 'Trần Hoàng Bảo', to: 1, groupNumber: 1, seed: 3 },
      { name: 'Lê Thảo Chi', to: 1, groupNumber: 2, seed: 2 },
      { name: 'Phạm Quốc Dũng', to: 1, groupNumber: 2, seed: 4 },
      { name: 'Hoàng Gia Hân', to: 2, groupNumber: 3, seed: 1, note: 'Thư ký' },
      { name: 'Vũ Đức Khang', to: 2, groupNumber: 3, seed: 5 },
      { name: 'Đặng Khánh Linh', to: 2, groupNumber: 4, seed: 2 },
      { name: 'Bùi Nhật Minh', to: 2, groupNumber: 4, seed: 3 },
      { name: 'Ngô Phương Nghi', to: 3, groupNumber: 5, seed: 1 },
      { name: 'Đỗ Tuấn Phong', to: 3, groupNumber: 5, seed: 4 },
      { name: 'Dương Ngọc Quỳnh', to: 3, groupNumber: 1, seed: 2 },
      { name: 'Phan Thanh Sơn', to: 3, groupNumber: 2, seed: 5 },
    ],
    '9/26': [
      { name: 'Võ Hải Đăng', to: 1, groupNumber: 1, seed: 1, note: 'Nhóm trưởng' },
      { name: 'Nguyễn Ngọc Hà', to: 1, groupNumber: 1, seed: 3 },
      { name: 'Trịnh Gia Huy', to: 1, groupNumber: 2, seed: 2 },
      { name: 'Lý Bảo Ngọc', to: 1, groupNumber: 2, seed: 4 },
      { name: 'Mai Anh Quân', to: 2, groupNumber: 3, seed: 1 },
      { name: 'Tạ Minh Tâm', to: 2, groupNumber: 3, seed: 3 },
      { name: 'Hồ Thảo Vy', to: 2, groupNumber: 4, seed: 2 },
      { name: 'Chu Quang Vinh', to: 2, groupNumber: 4, seed: 5 },
      { name: 'Đinh Lan Anh', to: 3, groupNumber: 5, seed: 2 },
      { name: 'Kiều Tiến Đạt', to: 3, groupNumber: 5, seed: 4 },
    ],
    '9/28': [
      { name: 'Lương Khánh An', to: 1, groupNumber: 1, seed: 1, note: 'Nhóm trưởng' },
      { name: 'Nguyễn Hữu Bình', to: 1, groupNumber: 1, seed: 4 },
      { name: 'Phạm Thùy Dương', to: 1, groupNumber: 2, seed: 2 },
      { name: 'Trần Văn Hiếu', to: 1, groupNumber: 2, seed: 3 },
      { name: 'Đoàn Bảo Khánh', to: 2, groupNumber: 3, seed: 1 },
      { name: 'Nguyễn Yến Nhi', to: 2, groupNumber: 3, seed: 5 },
      { name: 'Vương Đình Phúc', to: 2, groupNumber: 4, seed: 2 },
      { name: 'Lê Bảo Trâm', to: 2, groupNumber: 4, seed: 3 },
      { name: 'Nguyễn Anh Tuấn', to: 3, groupNumber: 5, seed: 1 },
      { name: 'Trần Minh Uyên', to: 3, groupNumber: 5, seed: 4 },
    ],
  };

  const students: Student[] = [];
  (Object.keys(rosters) as ClassId[]).forEach((classId) => {
    const cleanCode = classId.replace('/', '');
    rosters[classId].forEach((entry, idx) => {
      students.push({
        id: `stu-${cleanCode}-${idx + 1}`,
        studentCode: `${cleanCode}-${String(idx + 1).padStart(2, '0')}`,
        name: entry.name,
        classId,
        to: entry.to,
        groupNumber: entry.groupNumber,
        seed: entry.seed,
        note: entry.note || '',
      });
    });
  });

  return students;
}

function createInitialDb(): DatabaseSchema {
  const salt = crypto.randomBytes(16).toString('hex');
  const defaultPasswordHash = hashPassword('123456', salt);
  const today = getTodayDateString();
  const yesterday = getYesterdayDateString();

  const classes: ClassId[] = ['9/23', '9/26', '9/28'];
  const assignments: DailyAssignmentRecord[] = classes.map((classId) => ({
    id: `${classId}_${today}`,
    classId,
    date: today,
    lessonTopic: `Chủ đề bài học ngày ${today} — Lớp ${classId}`,
    groups: {
      1: {
        groupNumber: 1,
        cardIds: ['c-1-1', 'c-2-1'],
        homework: 'Hoàn thiện phiếu tổng hợp số liệu và chuẩn bị 2 ví dụ thực tế.',
        teacherNote: 'Chú ý phân công 1 bạn ghi chép và 1 bạn trình bày.',
      },
      2: {
        groupNumber: 2,
        cardIds: ['c-1-2', 'c-2-2', 'c-4-1'],
        homework: 'Hoàn thành 3 bài tập vận dụng trong sách bài tập.',
        teacherNote: 'Nhóm nhận 3 thẻ, ưu tiên thẻ NV1-T02 trước.',
      },
      3: {
        groupNumber: 3,
        cardIds: ['c-1-3', 'c-3-1'],
        homework: 'Vẽ lại sơ đồ quy trình thực hành vào vở nhóm.',
        teacherNote: 'Thẻ NV1-T02 bản sao dùng song song với nhóm 2.',
      },
      4: {
        groupNumber: 4,
        cardIds: ['c-2-3', 'c-3-2', 'c-4-2'],
        homework: 'Tóm tắt 3 lỗi sai thường gặp và cách khắc phục.',
        teacherNote: '',
      },
      5: {
        groupNumber: 5,
        cardIds: ['c-4-3', 'c-5-1', 'c-5-2'],
        homework: 'Viết đoạn văn ngắn 100 chữ về ứng dụng liên môn.',
        teacherNote: 'Chuẩn bị câu hỏi phản biện cho nhóm 1 & nhóm 4.',
      },
    },
    updatedAt: new Date().toISOString(),
  }));

  const grades: DailyGradeRecord[] = [
    {
      id: `${'9/23'}_${yesterday}`,
      classId: '9/23',
      date: yesterday,
      lessonTopic: `Bài học ngày ${yesterday} — Lớp 9/23`,
      publishedToStudents: true,
      updatedAt: new Date().toISOString(),
      entries: [
        { groupNumber: 3, qualityOrder: 1, score: 7.0, completedCardsCount: 2, feedback: 'Hoàn thành cơ bản, cần cải thiện phần trình bày.' },
        { groupNumber: 5, qualityOrder: 2, score: 7.5, completedCardsCount: 2, feedback: 'Phản biện khá tốt nhưng thiếu 1 ý tổng hợp.' },
        { groupNumber: 2, qualityOrder: 3, score: 8.5, completedCardsCount: 3, feedback: 'Số liệu chính xác, làm việc nhóm nhịp nhàng.' },
        { groupNumber: 4, qualityOrder: 4, score: 9.0, completedCardsCount: 3, feedback: 'Tìm lỗi sai rất sắc bén.' },
        { groupNumber: 1, qualityOrder: 5, score: 9.5, completedCardsCount: 2, feedback: 'Xuất sắc nhất buổi học, hoàn thành vượt yêu cầu.' },
      ],
    },
  ];

  return {
    teachers: [
      {
        id: 'teacher-1',
        email: 'giaovien@truonghoc.edu.vn',
        name: 'Giáo viên Bộ môn',
        subject: 'Tổ Chuyên môn Khối 9',
        salt,
        passwordHash: defaultPasswordHash,
      },
    ],
    sessions: [],
    students: buildSeedStudents(),
    coreMissions: createInitialCoreMissions(),
    assignments,
    grades,
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
    cachedDb = JSON.parse(raw) as DatabaseSchema;
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
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
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
