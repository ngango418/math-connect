import * as XLSX from 'xlsx';
import type { ClassId, DailyGradeRecord, GroupNumber, SeedLevel, Student } from '../../shared/types.ts';

export interface ParsedExcelStudentRow {
  studentCode: string;
  name: string;
  classId: ClassId;
  to: number;
  seed: SeedLevel;
  groupNumber: GroupNumber;
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

function parseClassId(val: unknown, fallback: ClassId): ClassId {
  const s = String(val || '').trim().replace('-', '/');
  if (s === '9/23' || s === '9/26' || s === '9/28') return s;
  return fallback;
}

function parseSeed(val: unknown): { seed: SeedLevel; valid: boolean } {
  const n = Number(val);
  if (!Number.isNaN(n) && n >= 1 && n <= 5) {
    return { seed: Math.round(n) as SeedLevel, valid: true };
  }
  return { seed: 3, valid: false };
}

function parseGroup(val: unknown, fallbackIndex: number): GroupNumber {
  const n = Number(val);
  if (!Number.isNaN(n) && n >= 1 && n <= 5) {
    return Math.round(n) as GroupNumber;
  }
  return ((fallbackIndex % 5) + 1) as GroupNumber;
}

export function downloadExcelTemplate(classId: ClassId): void {
  const cleanCode = classId.replace('/', '');
  const sampleRows = [
    {
      MaHS: `${cleanCode}-01`,
      HoTen: 'Nguyễn Minh Anh',
      Lop: classId,
      To: 1,
      HatGiong: 1,
      Nhom: 1,
      GhiChu: 'Nhóm trưởng',
    },
    {
      MaHS: `${cleanCode}-02`,
      HoTen: 'Trần Hoàng Bảo',
      Lop: classId,
      To: 1,
      HatGiong: 3,
      Nhom: 1,
      GhiChu: '',
    },
    {
      MaHS: `${cleanCode}-03`,
      HoTen: 'Lê Thảo Chi',
      Lop: classId,
      To: 1,
      HatGiong: 2,
      Nhom: 2,
      GhiChu: 'Thư ký',
    },
    {
      MaHS: `${cleanCode}-04`,
      HoTen: 'Phạm Quốc Dũng',
      Lop: classId,
      To: 2,
      HatGiong: 5,
      Nhom: 3,
      GhiChu: '',
    },
  ];

  const guideRows = [
    { Cot: 'MaHS', YNghia: 'Mã học sinh (tùy chọn, nếu trống hệ thống tự tạo)', ViDu: `${cleanCode}-01` },
    { Cot: 'HoTen', YNghia: 'Họ và tên học sinh (Bắt buộc)', ViDu: 'Nguyễn Minh Anh' },
    { Cot: 'Lop', YNghia: 'Lớp học: 9/23, 9/26 hoặc 9/28', ViDu: classId },
    { Cot: 'To', YNghia: 'Số thứ tự Tổ (1, 2, 3, 4...)', ViDu: 1 },
    { Cot: 'HatGiong', YNghia: 'Hạt giống năng lực: 1 (Cao nhất) đến 5 (Thấp nhất)', ViDu: 1 },
    { Cot: 'Nhom', YNghia: 'Nhóm chính trên lớp (từ 1 đến 5)', ViDu: 1 },
    { Cot: 'GhiChu', YNghia: 'Vai trò hoặc ghi chú thêm (tùy chọn)', ViDu: 'Nhóm trưởng' },
  ];

  const wb = XLSX.utils.book_new();
  const wsData = XLSX.utils.json_to_sheet(sampleRows);
  const wsGuide = XLSX.utils.json_to_sheet(guideRows);
  XLSX.utils.book_append_sheet(wb, wsData, 'DanhSachHocSinh');
  XLSX.utils.book_append_sheet(wb, wsGuide, 'HuongDanDinhDang');
  XLSX.writeFile(wb, `Mau_DanhSach_Lop_${cleanCode}.xlsx`);
}

export function exportRosterToExcel(classId: ClassId, students: Student[]): void {
  const cleanCode = classId.replace('/', '');
  const rows = students.map((s, index) => ({
    STT: index + 1,
    MaHS: s.studentCode,
    HoTen: s.name,
    Lop: s.classId,
    To: s.to,
    HatGiong: s.seed,
    Nhom: s.groupNumber,
    GhiChu: s.note || '',
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, `Lop_${cleanCode}`);
  XLSX.writeFile(wb, `DanhSach_Lop_${cleanCode}.xlsx`);
}

export function exportGradesToExcel(classId: ClassId, grades: DailyGradeRecord[]): void {
  const cleanCode = classId.replace('/', '');
  const rows: Array<Record<string, string | number>> = [];
  const sorted = [...grades].sort((a, b) => b.date.localeCompare(a.date));
  for (const record of sorted) {
    const ordered = [...record.entries].sort((a, b) => a.qualityOrder - b.qualityOrder);
    for (const entry of ordered) {
      rows.push({
        NgayHoc: record.date,
        Lop: record.classId,
        ChuDe: record.lessonTopic,
        Nhom: `Nhóm ${entry.groupNumber}`,
        ThuTuChatLuong_ThapDenCao: entry.qualityOrder,
        Diem: entry.score,
        SoTheHoanThanh: entry.completedCardsCount,
        NhanXet: entry.feedback,
      });
    }
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, `BangDiem_${cleanCode}`);
  XLSX.writeFile(wb, `BangDiem_TheoNgay_Lop_${cleanCode}.xlsx`);
}

export async function parseExcelStudents(
  file: File,
  fallbackClassId: ClassId
): Promise<ParsedExcelStudentRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('File Excel không có trang tính (sheet) nào.');
  }
  const sheet = wb.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (rawRows.length === 0) {
    throw new Error('Trang tính đầu tiên không có dữ liệu học sinh.');
  }

  const cleanCode = fallbackClassId.replace('/', '');
  const parsed: ParsedExcelStudentRow[] = [];

  rawRows.forEach((rawRow, idx) => {
    const normalizedMap: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawRow)) {
      normalizedMap[normalizeHeaderKey(k)] = v;
    }

    const nameRaw =
      normalizedMap.hoten ||
      normalizedMap.hovaten ||
      normalizedMap.ten ||
      normalizedMap.tenhocsinh ||
      normalizedMap.name ||
      normalizedMap.fullname ||
      '';

    const name = String(nameRaw).trim();
    if (!name) return;

    const codeRaw = normalizedMap.mahs || normalizedMap.mahocsinh || normalizedMap.code || normalizedMap.id || '';
    const studentCode = String(codeRaw).trim() || `${cleanCode}-${String(idx + 1).padStart(2, '0')}`;
    const classId = parseClassId(normalizedMap.lop || normalizedMap.class, fallbackClassId);

    const toRaw = Number(normalizedMap.to || normalizedMap.squad || 1);
    const to = !Number.isNaN(toRaw) && toRaw >= 1 ? Math.round(toRaw) : 1;

    const seedCheck = parseSeed(normalizedMap.hatgiong ?? normalizedMap.nangluc ?? normalizedMap.seed ?? 3);
    const groupNumber = parseGroup(normalizedMap.nhom ?? normalizedMap.group, idx);
    const note = String(normalizedMap.ghichu || normalizedMap.vaitro || normalizedMap.note || '').trim();

    const warnings: string[] = [];
    if (!seedCheck.valid) {
      warnings.push('Hạt giống thiếu/lệch chuẩn, mặc định mức 3');
    }

    parsed.push({
      studentCode,
      name,
      classId,
      to,
      seed: seedCheck.seed,
      groupNumber,
      note,
      warnings,
    });
  });

  if (parsed.length === 0) {
    throw new Error('Không tìm thấy cột Họ tên (HoTen / Họ và tên) hợp lệ trong file.');
  }

  return parsed;
}
