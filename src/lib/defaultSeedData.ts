import {
  DEFAULT_CLASS_NAMES,
  type ClassroomInfo,
  type CoreMission,
  type DailyAssignmentRecord,
  type DailyGradeRecord,
  type GroupDailyPlan,
  type GroupNumber,
  type MissionAllocationConfig,
  type Student,
  type WorkspaceSnapshot,
} from '../../shared/types.ts';

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

export function createDefaultAllocationConfig(): MissionAllocationConfig {
  return {
    cardsPerGroup: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 },
    missionCounts: { 1: 2, 2: 2, 3: 2, 4: 1, 5: 1 }, // Tổng 8 thẻ cho 8 nhóm (NV1, NV2, NV3 mỗi cái 2 nhóm trùng)
    allowRepeatSameGroup: false,
  };
}

export function createEmptyEightGroups(): Record<GroupNumber, GroupDailyPlan> {
  return {
    1: { groupNumber: 1, cardIds: [], homework: '', teacherNote: '' },
    2: { groupNumber: 2, cardIds: [], homework: '', teacherNote: '' },
    3: { groupNumber: 3, cardIds: [], homework: '', teacherNote: '' },
    4: { groupNumber: 4, cardIds: [], homework: '', teacherNote: '' },
    5: { groupNumber: 5, cardIds: [], homework: '', teacherNote: '' },
    6: { groupNumber: 6, cardIds: [], homework: '', teacherNote: '' },
    7: { groupNumber: 7, cardIds: [], homework: '', teacherNote: '' },
    8: { groupNumber: 8, cardIds: [], homework: '', teacherNote: '' },
  };
}

const LAST_NAMES = [
  'Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng',
  'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng',
  'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương',
  'Lý', 'Đinh', 'Mai', 'Tạ', 'Vương',
];

const MIDDLE_NAMES = [
  'Minh', 'Hoàng', 'Thảo', 'Quốc', 'Gia',
  'Đức', 'Khánh', 'Nhật', 'Phương', 'Tuấn',
  'Ngọc', 'Thanh', 'Hải', 'Bảo', 'Anh',
  'Tiến', 'Thùy', 'Văn', 'Yến', 'Đình',
];

const FIRST_NAMES = [
  'An', 'Anh', 'Bình', 'Chi', 'Dũng',
  'Dương', 'Đăng', 'Đạt', 'Hà', 'Hân',
  'Hiếu', 'Huy', 'Hưng', 'Khang', 'Khánh',
  'Khôi', 'Linh', 'Long', 'Minh', 'My',
  'Nam', 'Nghi', 'Ngọc', 'Nhi', 'Phong',
  'Phúc', 'Quân', 'Quỳnh', 'Sơn', 'Tâm',
  'Thư', 'Trang', 'Trâm', 'Trúc', 'Tuấn',
  'Tùng', 'Uyên', 'Vinh', 'Vy', 'Yến',
];

const SCORE_PATTERN = [9.5, 8.0, 7.5, 6.0, 5.5, 9.0, 8.5, 7.0, 6.5, 5.0];

function generateSeedStudentsForTenClasses(): Student[] {
  const students: Student[] = [];
  const usedFullNames = new Set<string>();
  let globalIndex = 0;

  DEFAULT_CLASS_NAMES.forEach((classId, classIdx) => {
    const cleanCode = classId.replace('/', '');

    // 40 học sinh mỗi lớp: chia đều vào 4 Tổ (10 HS/Tổ) -> 8 Nhóm (5 HS/Nhóm)
    for (let i = 0; i < 40; i++) {
      // Sinh họ tên không trùng lặp cho toàn bộ 400 học sinh
      let fullName = '';
      let attempt = 0;
      do {
        const seedVal = globalIndex * 17 + attempt * 7 + classIdx * 13;
        const ln = LAST_NAMES[seedVal % LAST_NAMES.length];
        const mn = MIDDLE_NAMES[(Math.floor(seedVal / 3) + i) % MIDDLE_NAMES.length];
        const fn = FIRST_NAMES[(seedVal + i * 3 + classIdx * 5) % FIRST_NAMES.length];
        fullName = `${ln} ${mn} ${fn}`;
        attempt++;
      } while (usedFullNames.has(fullName));
      usedFullNames.add(fullName);

      // Ngày sinh khác nhau trong năm 2012 (Khối 9)
      const day = ((globalIndex * 5 + i * 3 + classIdx) % 28) + 1;
      const month = ((globalIndex + i * 7 + classIdx * 2) % 12) + 1;
      const birthDate = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/2012`;

      // Tổ 1..4 (mỗi tổ 10 HS), Nhóm 1..8 (mỗi nhóm 5 HS)
      const to = Math.floor(i / 10) + 1;
      const groupNumber = (Math.floor(i / 5) + 1) as GroupNumber;
      const isLeader = i % 5 === 0; // Mỗi nhóm có 1 Nhóm trưởng

      // Điểm đánh giá năng lực 1-10 đa dạng
      const baseScore = SCORE_PATTERN[(i + classIdx * 3) % SCORE_PATTERN.length];
      const score = isLeader
        ? Math.min(10, Math.max(8, Number((baseScore + 0.5).toFixed(1))))
        : Math.max(4, Math.min(9.5, baseScore));

      students.push({
        id: `stu-${cleanCode}-${i + 1}`,
        studentCode: `${cleanCode}-${String(i + 1).padStart(2, '0')}`,
        name: fullName,
        birthDate,
        classId,
        to,
        groupNumber,
        isLeader,
        score,
        note: isLeader ? 'Nhóm trưởng phụ trách điều phối' : '',
      });

      globalIndex++;
    }
  });

  return students;
}

export function createClientSeedSnapshot(): WorkspaceSnapshot {
  const today = getTodayDateString();
  const yesterday = getYesterdayDateString();

  const classes: ClassroomInfo[] = DEFAULT_CLASS_NAMES.map((cls) => ({
    id: cls,
    name: cls,
    createdAt: today,
  }));

  const coreMissions: CoreMission[] = [
    {
      id: 1,
      title: 'Nhiệm vụ 1: Khởi động & Khám phá',
      summary: 'Quan sát tình huống thực tế, thu thập dữ liệu ban đầu và ghi nhận hiện tượng.',
      cards: [
        {
          id: 'c-1-1',
          missionId: 1,
          code: 'NV1-T01',
          title: 'Quan sát mẫu & ghi nhận 4 chi tiết nổi bật',
          description: 'Thảo luận nhanh và ghi ra giấy A4 ít nhất 4 phát hiện của nhóm.',
          durationMinutes: 10,
        },
        {
          id: 'c-1-2',
          missionId: 1,
          code: 'NV1-T02 (Trùng)',
          title: 'Quan sát mẫu & thu thập số liệu thực tế',
          description: 'Đo đạc/thống kê 3 lần liên tiếp và tính giá trị trung bình của nhóm.',
          durationMinutes: 10,
          isDuplicate: true,
        },
      ],
    },
    {
      id: 2,
      title: 'Nhiệm vụ 2: Phân tích & Giải mã',
      summary: 'Tìm ra quy luật, nguyên nhân – hệ quả và giải bài toán trọng tâm.',
      cards: [
        {
          id: 'c-2-1',
          missionId: 2,
          code: 'NV2-T01',
          title: 'Vẽ sơ đồ tư duy giải quyết vấn đề',
          description: 'Phân tích nguyên nhân cốt lõi và trình bày dưới dạng sơ đồ nhánh rõ ràng.',
          durationMinutes: 12,
        },
        {
          id: 'c-2-2',
          missionId: 2,
          code: 'NV2-T02 (Trùng)',
          title: 'Giải bài tập tình huống trọng tâm',
          description: 'Hoàn thành 2 câu hỏi phân tích và kiểm tra chéo đáp án trong nhóm.',
          durationMinutes: 12,
          isDuplicate: true,
        },
      ],
    },
    {
      id: 3,
      title: 'Nhiệm vụ 3: Thực hành Tăng tốc',
      summary: 'Áp dụng kiến thức vừa tìm hiểu vào bài tập thực hành nhóm.',
      cards: [
        {
          id: 'c-3-1',
          missionId: 3,
          code: 'NV3-T01',
          title: 'Hoàn thành bộ 3 thử thách thực hành',
          description: 'Chia việc cho từng thành viên giải nhanh 3 bài tập trong phiếu.',
          durationMinutes: 15,
        },
        {
          id: 'c-3-2',
          missionId: 3,
          code: 'NV3-T02 (Trùng)',
          title: 'Truy tìm lỗi sai & hiệu chỉnh lời giải',
          description: 'Phát hiện lỗi sai trong lời giải mẫu và viết lại phương án chính xác.',
          durationMinutes: 12,
          isDuplicate: true,
        },
      ],
    },
    {
      id: 4,
      title: 'Nhiệm vụ 4: Thuyết trình & Phản biện',
      summary: 'Trình bày ý tưởng trước lớp và đặt câu hỏi phản biện cho nhóm bạn.',
      cards: [
        {
          id: 'c-4-1',
          missionId: 4,
          code: 'NV4-T01',
          title: 'Báo cáo nhanh 3 phút & đặt 2 câu hỏi',
          description: 'Nhóm trưởng phân công bạn trình bày và chuẩn bị 2 câu hỏi phản biện.',
          durationMinutes: 10,
        },
      ],
    },
    {
      id: 5,
      title: 'Nhiệm vụ 5: Tổng kết & Sáng tạo',
      summary: 'Chốt từ khóa bài học và liên hệ ứng dụng thực tế sinh động.',
      cards: [
        {
          id: 'c-5-1',
          missionId: 5,
          code: 'NV5-T01',
          title: 'Thông điệp 60 giây & ứng dụng đời sống',
          description: 'Tóm tắt 3 từ khóa vàng của bài học và nêu 1 ví dụ thực tiễn.',
          durationMinutes: 10,
        },
      ],
    },
  ];

  const students = generateSeedStudentsForTenClasses();

  const assignments: DailyAssignmentRecord[] = classes.map((cls) => ({
    id: `${cls.id}_${today}`,
    classId: cls.id,
    date: today,
    lessonTopic: `Buổi học ngày ${today} — Lớp ${cls.name}`,
    groups: {
      1: { groupNumber: 1, cardIds: ['c-1-1'], homework: 'Hoàn thiện phiếu khám phá và chuẩn bị 2 ví dụ.', teacherNote: '' },
      2: { groupNumber: 2, cardIds: ['c-1-2'], homework: 'Tổng hợp số liệu đo đạc của nhóm.', teacherNote: 'Trùng chủ đề Nhiệm vụ 1 với Nhóm 1' },
      3: { groupNumber: 3, cardIds: ['c-2-1'], homework: 'Hoàn thiện sơ đồ nhánh vào vở.', teacherNote: '' },
      4: { groupNumber: 4, cardIds: ['c-2-2'], homework: 'Giải 2 bài tập tình huống mở rộng.', teacherNote: 'Trùng chủ đề Nhiệm vụ 2 với Nhóm 3' },
      5: { groupNumber: 5, cardIds: ['c-3-1'], homework: 'Chụp ảnh kết quả 3 thử thách nộp lại.', teacherNote: '' },
      6: { groupNumber: 6, cardIds: ['c-3-2'], homework: 'Ghi chú 2 lỗi sai thường gặp.', teacherNote: 'Trùng chủ đề Nhiệm vụ 3 với Nhóm 5' },
      7: { groupNumber: 7, cardIds: ['c-4-1'], homework: 'Chuẩn bị câu hỏi phản biện cho tiết sau.', teacherNote: '' },
      8: { groupNumber: 8, cardIds: ['c-5-1'], homework: 'Viết thông điệp tổng kết 5 dòng.', teacherNote: '' },
    },
    updatedAt: new Date().toISOString(),
  }));

  const grades: DailyGradeRecord[] = [
    {
      id: `9/1_${yesterday}`,
      classId: '9/1',
      date: yesterday,
      lessonTopic: `Buổi học ngày ${yesterday} — Lớp 9/1`,
      publishedToStudents: true,
      updatedAt: new Date().toISOString(),
      entries: [
        { groupNumber: 1, baseScore: 9.0, bonusPoints: 1.0, penaltyPoints: 0, finalScore: 10.0, feedback: 'Hoàn thành nhanh, trình bày rõ ràng.' },
        { groupNumber: 2, baseScore: 8.5, bonusPoints: 0.5, penaltyPoints: 0, finalScore: 9.0, feedback: 'Tích cực thảo luận.' },
        { groupNumber: 3, baseScore: 8.0, bonusPoints: 1.0, penaltyPoints: 0.5, finalScore: 8.5, feedback: 'Giải tốt nhưng đầu giờ hơi ồn.' },
        { groupNumber: 4, baseScore: 8.5, bonusPoints: 0, penaltyPoints: 0, finalScore: 8.5, feedback: 'Hoàn thành đúng tiến độ.' },
        { groupNumber: 5, baseScore: 9.0, bonusPoints: 0.5, penaltyPoints: 0, finalScore: 9.5, feedback: 'Nhóm trưởng điều phối xuất sắc.' },
        { groupNumber: 6, baseScore: 7.5, bonusPoints: 0, penaltyPoints: 0.5, finalScore: 7.0, feedback: 'Cần tập trung hơn khi làm bài.' },
        { groupNumber: 7, baseScore: 8.0, bonusPoints: 1.0, penaltyPoints: 0, finalScore: 9.0, feedback: 'Đặt câu hỏi phản biện hay.' },
        { groupNumber: 8, baseScore: 8.5, bonusPoints: 0.5, penaltyPoints: 0, finalScore: 9.0, feedback: 'Tổng kết sáng tạo.' },
      ],
    },
  ];

  return {
    classes,
    students,
    coreMissions,
    allocationConfig: createDefaultAllocationConfig(),
    assignments,
    grades,
  };
}
