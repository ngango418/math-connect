import type {
  ClassroomInfo,
  CoreMission,
  DailyAssignmentRecord,
  DailyGradeRecord,
  GroupDailyPlan,
  GroupNumber,
  MissionAllocationConfig,
  Student,
  WorkspaceSnapshot,
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

export function createClientSeedSnapshot(): WorkspaceSnapshot {
  const today = getTodayDateString();
  const yesterday = getYesterdayDateString();

  const classes: ClassroomInfo[] = [
    { id: '9/23', name: '9/23', createdAt: today },
    { id: '9/26', name: '9/26', createdAt: today },
    { id: '9/28', name: '9/28', createdAt: today },
  ];

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

  // 4 Tổ x 2 Nhóm = 8 Nhóm cho lớp 9/23 (mỗi tổ 4 HS ví dụ)
  const rosters: Record<
    string,
    Array<{ name: string; birthDate: string; to: number; groupNumber: GroupNumber; isLeader: boolean; score: number }>
  > = {
    '9/23': [
      { name: 'Nguyễn Minh Anh', birthDate: '12/03/2012', to: 1, groupNumber: 1, isLeader: true, score: 9 },
      { name: 'Trần Hoàng Bảo', birthDate: '25/07/2012', to: 1, groupNumber: 1, isLeader: false, score: 6 },
      { name: 'Lê Thảo Chi', birthDate: '08/11/2012', to: 1, groupNumber: 2, isLeader: true, score: 8 },
      { name: 'Phạm Quốc Dũng', birthDate: '19/01/2012', to: 1, groupNumber: 2, isLeader: false, score: 7 },
      { name: 'Hoàng Gia Hân', birthDate: '04/05/2012', to: 2, groupNumber: 3, isLeader: true, score: 9 },
      { name: 'Vũ Đức Khang', birthDate: '14/09/2012', to: 2, groupNumber: 3, isLeader: false, score: 5 },
      { name: 'Đặng Khánh Linh', birthDate: '22/06/2012', to: 2, groupNumber: 4, isLeader: true, score: 8 },
      { name: 'Bùi Nhật Minh', birthDate: '30/10/2012', to: 2, groupNumber: 4, isLeader: false, score: 6 },
      { name: 'Ngô Phương Nghi', birthDate: '17/02/2012', to: 3, groupNumber: 5, isLeader: true, score: 10 },
      { name: 'Đỗ Tuấn Phong', birthDate: '09/08/2012', to: 3, groupNumber: 5, isLeader: false, score: 5 },
      { name: 'Dương Ngọc Quỳnh', birthDate: '27/12/2012', to: 3, groupNumber: 6, isLeader: true, score: 8 },
      { name: 'Phan Thanh Sơn', birthDate: '11/04/2012', to: 3, groupNumber: 6, isLeader: false, score: 7 },
      { name: 'Võ Hải Đăng', birthDate: '03/09/2012', to: 4, groupNumber: 7, isLeader: true, score: 9 },
      { name: 'Nguyễn Ngọc Hà', birthDate: '15/11/2012', to: 4, groupNumber: 7, isLeader: false, score: 6 },
      { name: 'Trịnh Gia Huy', birthDate: '21/05/2012', to: 4, groupNumber: 8, isLeader: true, score: 8 },
      { name: 'Lý Bảo Ngọc', birthDate: '06/07/2012', to: 4, groupNumber: 8, isLeader: false, score: 7 },
    ],
    '9/26': [
      { name: 'Mai Anh Quân', birthDate: '18/03/2012', to: 1, groupNumber: 1, isLeader: true, score: 9 },
      { name: 'Tạ Minh Tâm', birthDate: '02/10/2012', to: 1, groupNumber: 1, isLeader: false, score: 6 },
      { name: 'Hồ Thảo Vy', birthDate: '14/06/2012', to: 1, groupNumber: 2, isLeader: true, score: 8 },
      { name: 'Chu Quang Vinh', birthDate: '29/01/2012', to: 1, groupNumber: 2, isLeader: false, score: 7 },
      { name: 'Đinh Lan Anh', birthDate: '07/08/2012', to: 2, groupNumber: 3, isLeader: true, score: 9 },
      { name: 'Kiều Tiến Đạt', birthDate: '20/12/2012', to: 2, groupNumber: 4, isLeader: true, score: 8 },
      { name: 'Lương Khánh An', birthDate: '10/04/2012', to: 3, groupNumber: 5, isLeader: true, score: 8 },
      { name: 'Nguyễn Hữu Bình', birthDate: '23/09/2012', to: 3, groupNumber: 6, isLeader: true, score: 7 },
      { name: 'Phạm Thùy Dương', birthDate: '16/05/2012', to: 4, groupNumber: 7, isLeader: true, score: 9 },
      { name: 'Trần Văn Hiếu', birthDate: '05/11/2012', to: 4, groupNumber: 8, isLeader: true, score: 7 },
    ],
    '9/28': [
      { name: 'Đoàn Bảo Khánh', birthDate: '13/02/2012', to: 1, groupNumber: 1, isLeader: true, score: 9 },
      { name: 'Nguyễn Yến Nhi', birthDate: '28/07/2012', to: 1, groupNumber: 2, isLeader: true, score: 8 },
      { name: 'Vương Đình Phúc', birthDate: '09/09/2012', to: 2, groupNumber: 3, isLeader: true, score: 8 },
      { name: 'Lê Bảo Trâm', birthDate: '19/04/2012', to: 2, groupNumber: 4, isLeader: true, score: 7 },
      { name: 'Nguyễn Anh Tuấn', birthDate: '01/12/2012', to: 3, groupNumber: 5, isLeader: true, score: 9 },
      { name: 'Trần Minh Uyên', birthDate: '24/08/2012', to: 3, groupNumber: 6, isLeader: true, score: 8 },
      { name: 'Hà Minh Khôi', birthDate: '17/05/2012', to: 4, groupNumber: 7, isLeader: true, score: 8 },
      { name: 'Bùi Thanh Trúc', birthDate: '06/03/2012', to: 4, groupNumber: 8, isLeader: true, score: 7 },
    ],
  };

  const students: Student[] = [];
  Object.keys(rosters).forEach((classId) => {
    const cleanCode = classId.replace('/', '');
    rosters[classId].forEach((entry, idx) => {
      students.push({
        id: `stu-${cleanCode}-${idx + 1}`,
        studentCode: `${cleanCode}-${String(idx + 1).padStart(2, '0')}`,
        name: entry.name,
        birthDate: entry.birthDate,
        classId,
        to: entry.to,
        groupNumber: entry.groupNumber,
        isLeader: entry.isLeader,
        score: entry.score,
        note: '',
      });
    });
  });

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
      id: `9/23_${yesterday}`,
      classId: '9/23',
      date: yesterday,
      lessonTopic: `Buổi học ngày ${yesterday} — Lớp 9/23`,
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
