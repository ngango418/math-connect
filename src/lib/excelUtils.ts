import * as XLSX from 'xlsx';
import type { DailyGradeRecord, GroupNumber, Student } from '../../shared/types.ts';

export interface ParsedExcelStudentRow {
  studentCode: string;
  name: string;
  birthDate: string;
  classId: string;
  to: number;
  groupNumber: GroupNumber;
  isLeader: boolean;
  score: number;
  note: string;
  warnings: string[];
}

function normalizeHeaderKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseScore(val: unknown): { score: number; valid: boolean } {
  if (val === '' || val === null || val === undefined) {
    return { score: 7, valid: false };
  }
  const n = Number(String(val).replace(',', '.'));
  if (!Number.isNaN(n) && n >= 1 && n <= 10) {
    return { score: Number(n.toFixed(1)), valid: true };
  }
  return { score: 7, valid: false };
}

function parseLeader(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  const s = normalizeHeaderKey(String(val || ''));
  return ['x', '1', 'true', 'co', 'yes', 'nhomtruong', 'totruong', 'nt', 'truongnhom', 'v'].includes(s);
}

function formatBirthDate(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'number' && val > 20000 && val < 80000) {
    // Excel serial date
    const utcDays = Math.floor(val - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-');
    return `${d}/${m}/${y}`;
  }
  return str;
}

function parseGroup(val: unknown, to: number, fallbackIndex: number): GroupNumber {
  const n = Number(val);
  if (!Number.isNaN(n) && n >= 1 && n <= 8) {
    return Math.round(n) as GroupNumber;
  }
  const base = (to - 1) * 2 + 1 + (fallbackIndex % 2);
  return Math.min(8, Math.max(1, base)) as GroupNumber;
}

export async function extractRawExcelSheet(
  file: File
): Promise<{ sheetName: string; rawRows: Record<string, unknown>[] }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('File Excel không có trang tính (sheet) nào.');
  }
  const sheet = wb.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (rawRows.length === 0) {
    throw new Error('Trang tính đầu tiên không có dữ liệu.');
  }
  return { sheetName: firstSheetName, rawRows };
}

export function downloadExcelTemplate(classId: string): void {
  const cleanCode = classId.replace(/[^a-zA-Z0-9]/g, '');
  const sampleRows = [
    {
      MaHS: `${cleanCode}-01`,
      HoTen: 'Nguyễn Minh Anh',
      NgaySinh: '12/03/2012',
      Lop: classId,
      To: 1,
      Nhom: 1,
      NhomTruong: 'x',
      Diem: 9,
      GhiChu: '',
    },
    {
      MaHS: `${cleanCode}-02`,
      HoTen: 'Trần Hoàng Bảo',
      NgaySinh: '25/07/2012',
      Lop: classId,
      To: 1,
      Nhom: 2,
      NhomTruong: '',
      Diem: 6.5,
      GhiChu: '',
    },
    {
      MaHS: `${cleanCode}-03`,
      HoTen: 'Lê Thảo Chi',
      NgaySinh: '08/11/2012',
      Lop: classId,
      To: 2,
      Nhom: 3,
      NhomTruong: 'x',
      Diem: 8,
      GhiChu: '',
    },
  ];

  const guideRows = [
    { Cot: 'HoTen', YNghia: 'Họ và tên học sinh (Bắt buộc)', ViDu: 'Nguyễn Minh Anh' },
    { Cot: 'NgaySinh', YNghia: 'Ngày tháng năm sinh (DD/MM/YYYY)', ViDu: '12/03/2012' },
    { Cot: 'Lop', YNghia: 'Tên lớp học (ví dụ 9/23, 9/26...)', ViDu: classId },
    { Cot: 'To', YNghia: 'Số Tổ (từ 1 đến 4)', ViDu: 1 },
    { Cot: 'Nhom', YNghia: 'Số Nhóm (từ 1 đến 8)', ViDu: 1 },
    { Cot: 'NhomTruong', YNghia: 'Đánh dấu x hoặc Có nếu là Nhóm trưởng', ViDu: 'x' },
    { Cot: 'Diem', YNghia: 'Điểm đánh giá năng lực thang 1 - 10 để chia tổ cân bằng', ViDu: 8.5 },
    { Cot: 'GhiChu', YNghia: 'Ghi chú thêm (tùy chọn)', ViDu: '' },
  ];

  const wb = XLSX.utils.book_new();
  const wsData = XLSX.utils.json_to_sheet(sampleRows);
  const wsGuide = XLSX.utils.json_to_sheet(guideRows);
  XLSX.utils.book_append_sheet(wb, wsData, 'DanhSachHocSinh');
  XLSX.utils.book_append_sheet(wb, wsGuide, 'HuongDan');
  XLSX.writeFile(wb, `Mau_DanhSach_Lop_${cleanCode}.xlsx`);
}

export function exportRosterToExcel(classId: string, students: Student[]): void {
  const cleanCode = classId.replace(/[^a-zA-Z0-9]/g, '');
  const rows = students.map((s, index) => ({
    STT: index + 1,
    MaHS: s.studentCode,
    HoTen: s.name,
    NgaySinh: s.birthDate || '',
    Lop: s.classId,
    To: s.to,
    Nhom: s.groupNumber,
    NhomTruong: s.isLeader ? 'x' : '',
    DiemDanhGia_1_10: s.score,
    GhiChu: s.note || '',
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, `Lop_${cleanCode}`);
  XLSX.writeFile(wb, `DanhSach_Lop_${cleanCode}.xlsx`);
}

function clampSessionScore(base: number, penalty: number, bonus: number): number {
  return Math.min(10, Math.max(0, Number((base - penalty + bonus).toFixed(2))));
}

/**
 * Xuất Bảng tính Điểm buổi học: Danh sách TẤT CẢ học sinh phân theo từng Nhóm (1 -> 8),
 * điểm của từng học sinh hiển thị trực tiếp trên hàng của em đó (tối đa 10 điểm).
 */
export function exportSessionGradebookToExcel(
  classId: string,
  record: DailyGradeRecord,
  classStudents: Student[]
): void {
  const cleanCode = classId.replace(/[^a-zA-Z0-9]/g, '');

  const studentRows = [...classStudents]
    .sort(
      (a, b) =>
        a.groupNumber - b.groupNumber ||
        Number(b.isLeader) - Number(a.isLeader) ||
        a.name.localeCompare(b.name, 'vi')
    )
    .map((stu, idx) => {
      const groupEntry = record.entries.find((e) => e.groupNumber === stu.groupNumber);
      const base = groupEntry?.baseScore ?? 0;
      const bonus = groupEntry?.bonusPoints ?? 0;
      const penalty = groupEntry?.penaltyPoints ?? 0;
      const total = clampSessionScore(base, penalty, bonus);
      return {
        STT: idx + 1,
        MaHS: stu.studentCode,
        HoTen: stu.name,
        NgaySinh: stu.birthDate || '',
        Lop: stu.classId,
        To: `Tổ ${stu.to}`,
        Nhom: `Nhóm ${stu.groupNumber}`,
        VaiTro: stu.isLeader ? 'Nhóm trưởng' : 'Thành viên',
        DiemCho: base,
        DiemCong: bonus,
        DiemTru: penalty,
        DiemTong_ToiDa10: total,
        NhanXet: groupEntry?.feedback || '',
        NgayHoc: record.date,
      };
    });

  const wb = XLSX.utils.book_new();
  const wsStudents = XLSX.utils.json_to_sheet(studentRows);
  wsStudents['!cols'] = [
    { wch: 5 },
    { wch: 10 },
    { wch: 24 },
    { wch: 12 },
    { wch: 8 },
    { wch: 8 },
    { wch: 10 },
    { wch: 14 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 16 },
    { wch: 24 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, wsStudents, `BangDiem_Lop_${cleanCode}`);
  XLSX.writeFile(wb, `BangDiem_${cleanCode}_${record.date}.xlsx`);
}

export function exportAllGradesToExcel(
  classId: string,
  grades: DailyGradeRecord[],
  classStudents: Student[] = []
): void {
  const cleanCode = classId.replace(/[^a-zA-Z0-9]/g, '');
  const rows: Array<Record<string, string | number>> = [];
  const sortedGrades = [...grades].sort((a, b) => b.date.localeCompare(a.date));
  const sortedStudents = [...classStudents].sort(
    (a, b) =>
      a.groupNumber - b.groupNumber ||
      Number(b.isLeader) - Number(a.isLeader) ||
      a.name.localeCompare(b.name, 'vi')
  );

  for (const record of sortedGrades) {
    if (sortedStudents.length > 0) {
      sortedStudents.forEach((stu, idx) => {
        const entry = record.entries.find((e) => e.groupNumber === stu.groupNumber);
        const base = entry?.baseScore ?? 0;
        const bonus = entry?.bonusPoints ?? 0;
        const penalty = entry?.penaltyPoints ?? 0;
        rows.push({
          NgayHoc: record.date,
          Lop: record.classId,
          ChuDe: record.lessonTopic,
          STT: idx + 1,
          MaHS: stu.studentCode,
          HoTen: stu.name,
          NgaySinh: stu.birthDate || '',
          To: `Tổ ${stu.to}`,
          Nhom: `Nhóm ${stu.groupNumber}`,
          VaiTro: stu.isLeader ? 'Nhóm trưởng' : 'Thành viên',
          DiemCho: base,
          DiemCong: bonus,
          DiemTru: penalty,
          DiemTong_ToiDa10: clampSessionScore(base, penalty, bonus),
          NhanXet: entry?.feedback || '',
        });
      });
    } else {
      const ordered = [...record.entries].sort((a, b) => a.groupNumber - b.groupNumber);
      for (const entry of ordered) {
        rows.push({
          NgayHoc: record.date,
          Lop: record.classId,
          ChuDe: record.lessonTopic,
          Nhom: `Nhóm ${entry.groupNumber}`,
          DiemCho: entry.baseScore,
          DiemCong: entry.bonusPoints,
          DiemTru: entry.penaltyPoints,
          DiemTong_ToiDa10: clampSessionScore(
            entry.baseScore,
            entry.penaltyPoints,
            entry.bonusPoints
          ),
          NhanXet: entry.feedback,
        });
      }
    }
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, `LichSuDiem_${cleanCode}`);
  XLSX.writeFile(wb, `LichSu_BangDiem_${cleanCode}.xlsx`);
}

export async function parseExcelStudentsStandard(
  file: File,
  fallbackClassId: string
): Promise<ParsedExcelStudentRow[]> {
  const { rawRows } = await extractRawExcelSheet(file);
  const cleanCode = fallbackClassId.replace(/[^a-zA-Z0-9]/g, '');
  const parsed: ParsedExcelStudentRow[] = [];

  rawRows.forEach((rawRow, idx) => {
    const normalizedMap: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawRow)) {
      normalizedMap[normalizeHeaderKey(k)] = v;
    }

    const firstLastCombined = `${String(normalizedMap.holot || normalizedMap.ho || '').trim()} ${String(
      normalizedMap.tenrieng || ''
    ).trim()}`.trim();

    const nameRaw =
      normalizedMap.hoten ||
      normalizedMap.hovaten ||
      normalizedMap.tenhocsinh ||
      normalizedMap.name ||
      normalizedMap.fullname ||
      (firstLastCombined || normalizedMap.ten) ||
      '';

    const name = String(nameRaw).trim();
    if (!name) return;

    const codeRaw = normalizedMap.mahs || normalizedMap.mahocsinh || normalizedMap.code || normalizedMap.id || '';
    const studentCode = String(codeRaw).trim() || `${cleanCode}-${String(idx + 1).padStart(2, '0')}`;
    const classRaw = String(normalizedMap.lop || normalizedMap.class || '').trim();
    const classId = classRaw || fallbackClassId;
    const birthDate = formatBirthDate(
      normalizedMap.ngaysinh || normalizedMap.ngaythangnamsinh || normalizedMap.dob || normalizedMap.birthday || ''
    );

    const toRaw = Number(normalizedMap.to || normalizedMap.squad || 1);
    const to = !Number.isNaN(toRaw) && toRaw >= 1 ? Math.min(4, Math.round(toRaw)) : 1;
    const groupNumber = parseGroup(normalizedMap.nhom || normalizedMap.group, to, idx);
    const isLeader = parseLeader(
      normalizedMap.nhomtruong ?? normalizedMap.totruong ?? normalizedMap.leader ?? normalizedMap.vaitro ?? ''
    );
    const scoreCheck = parseScore(
      normalizedMap.diem ?? normalizedMap.diemdanhgia ?? normalizedMap.nangluc ?? normalizedMap.score ?? 7
    );
    const note = String(normalizedMap.ghichu || normalizedMap.note || '').trim();

    const warnings: string[] = [];
    if (!scoreCheck.valid) {
      warnings.push('Chưa có điểm 1-10, mặc định 7');
    }

    parsed.push({
      studentCode,
      name,
      birthDate,
      classId,
      to,
      groupNumber,
      isLeader,
      score: scoreCheck.score,
      note,
      warnings,
    });
  });

  if (parsed.length === 0) {
    throw new Error('Không tìm thấy cột Họ tên hợp lệ trong file Excel. Hãy thử bật chế độ AI Đọc hiểu Excel!');
  }

  return parsed;
}
