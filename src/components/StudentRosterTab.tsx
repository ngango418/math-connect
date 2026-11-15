import { useRef, useState, type FormEvent } from 'react';
import { Download, Edit3, FileSpreadsheet, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import {
  GROUP_NUMBERS,
  type ClassId,
  type GroupNumber,
  type SeedLevel,
  type Student,
} from '../../shared/types.ts';
import { bulkStudentsAction, createStudent, deleteStudent, updateStudent } from '../lib/api.ts';
import {
  downloadExcelTemplate,
  exportRosterToExcel,
  parseExcelStudents,
  type ParsedExcelStudentRow,
} from '../lib/excelUtils.ts';

interface StudentRosterTabProps {
  classId: ClassId;
  students: Student[];
  onRefreshWorkspace: () => Promise<void>;
}

const SEED_LABELS: Record<SeedLevel, string> = {
  1: 'Mức 1 · Cao nhất',
  2: 'Mức 2 · Khá tốt',
  3: 'Mức 3 · Trung bình',
  4: 'Mức 4 · Cần kèm',
  5: 'Mức 5 · Thấp nhất',
};

export function StudentRosterTab({ classId, students, onRefreshWorkspace }: StudentRosterTabProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState('');
  const [filterTo, setFilterTo] = useState<string>('all');
  const [filterSeed, setFilterSeed] = useState<string>('all');

  // Add/Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formTo, setFormTo] = useState(1);
  const [formGroup, setFormGroup] = useState<GroupNumber>(1);
  const [formSeed, setFormSeed] = useState<SeedLevel>(3);
  const [formNote, setFormNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Excel import preview state
  const [importPreview, setImportPreview] = useState<ParsedExcelStudentRow[] | null>(null);
  const [importMode, setImportMode] = useState<'import-merge' | 'import-replace'>('import-merge');
  const [importError, setImportError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const classStudents = students.filter((s) => s.classId === classId);
  const distinctTos = Array.from(new Set(classStudents.map((s) => s.to))).sort((a, b) => a - b);

  const filtered = classStudents.filter((s) => {
    const matchSearch =
      !search.trim() ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.studentCode.toLowerCase().includes(search.toLowerCase());
    const matchTo = filterTo === 'all' || String(s.to) === filterTo;
    const matchSeed = filterSeed === 'all' || String(s.seed) === filterSeed;
    return matchSearch && matchTo && matchSeed;
  });

  const openAddModal = () => {
    setEditingStudent(null);
    const cleanCode = classId.replace('/', '');
    setFormCode(`${cleanCode}-${String(classStudents.length + 1).padStart(2, '0')}`);
    setFormName('');
    setFormTo(1);
    setFormGroup(1);
    setFormSeed(3);
    setFormNote('');
    setModalOpen(true);
  };

  const openEditModal = (stu: Student) => {
    setEditingStudent(stu);
    setFormCode(stu.studentCode);
    setFormName(stu.name);
    setFormTo(stu.to);
    setFormGroup(stu.groupNumber);
    setFormSeed(stu.seed);
    setFormNote(stu.note || '');
    setModalOpen(true);
  };

  const handleSaveStudent = async (e: FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSubmitting(true);
    try {
      if (editingStudent) {
        await updateStudent(editingStudent.id, {
          studentCode: formCode.trim(),
          name: formName.trim(),
          to: formTo,
          groupNumber: formGroup,
          seed: formSeed,
          note: formNote.trim(),
        });
      } else {
        await createStudent({
          studentCode: formCode.trim(),
          name: formName.trim(),
          classId,
          to: formTo,
          groupNumber: formGroup,
          seed: formSeed,
          note: formNote.trim(),
        });
      }
      setModalOpen(false);
      await onRefreshWorkspace();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    await deleteStudent(id);
    await onRefreshWorkspace();
  };

  const handleQuickSeedChange = async (stu: Student, seed: SeedLevel) => {
    await updateStudent(stu.id, { seed });
    await onRefreshWorkspace();
  };

  const handleExcelFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setImportError('');
    setStatusMsg('');
    try {
      const rows = await parseExcelStudents(file, classId);
      setImportPreview(rows);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Không thể đọc file Excel.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;
    setSubmitting(true);
    try {
      await bulkStudentsAction({
        mode: importMode,
        classId,
        students: importPreview.map((r) => ({
          studentCode: r.studentCode,
          name: r.name,
          classId: r.classId,
          to: r.to,
          seed: r.seed,
          groupNumber: r.groupNumber,
          note: r.note,
        })),
      });
      setStatusMsg(`Đã nhập thành công ${importPreview.length} học sinh từ file Excel.`);
      setImportPreview(null);
      await onRefreshWorkspace();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Lỗi khi nhập dữ liệu Excel.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Danh sách Học sinh &amp; Nhập Excel — Lớp {classId}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tổng số <span className="font-mono font-semibold text-slate-800">{classStudents.length}</span> học sinh · Trường Hạt giống năng lực từ 1 (Cao nhất) đến 5 (Thấp nhất).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => downloadExcelTemplate(classId)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Tải file Excel mẫu
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => handleExcelFileSelected(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              Nhập từ Excel
            </button>

            <button
              type="button"
              onClick={() => exportRosterToExcel(classId, classStudents)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Xuất Excel
            </button>

            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Thêm học sinh
            </button>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên hoặc mã HS..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <select
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">Tất cả Tổ</option>
            {distinctTos.map((t) => (
              <option key={t} value={String(t)}>
                Tổ {t}
              </option>
            ))}
          </select>

          <select
            value={filterSeed}
            onChange={(e) => setFilterSeed(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">Tất cả mức Hạt giống (1–5)</option>
            {([1, 2, 3, 4, 5] as SeedLevel[]).map((seed) => (
              <option key={seed} value={String(seed)}>
                {SEED_LABELS[seed]}
              </option>
            ))}
          </select>
        </div>

        {importError && (
          <div className="mt-3 p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg">
            {importError}
          </div>
        )}
        {statusMsg && (
          <div className="mt-3 p-3 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
            {statusMsg}
          </div>
        )}
      </div>

      {/* Excel Preview Drawer/Card */}
      {importPreview && (
        <div className="bg-white border border-blue-200 rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Xem trước dữ liệu Excel ({importPreview.length} học sinh)
              </h3>
              <p className="text-xs text-slate-500">
                Kiểm tra lại thông tin trước khi lưu vào hệ thống.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as 'import-merge' | 'import-replace')}
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg"
              >
                <option value="import-merge">Cập nhật &amp; thêm mới vào lớp {classId}</option>
                <option value="import-replace">Thay thế toàn bộ danh sách lớp {classId}</option>
              </select>
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={submitting}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
              >
                {submitting ? 'Đang nhập...' : 'Xác nhận nhập dữ liệu'}
              </button>
            </div>
          </div>

          <div className="mt-3 max-h-64 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3">Mã HS</th>
                  <th className="py-2 px-3">Họ và tên</th>
                  <th className="py-2 px-3">Lớp</th>
                  <th className="py-2 px-3">Tổ</th>
                  <th className="py-2 px-3">Hạt giống (1–5)</th>
                  <th className="py-2 px-3">Nhóm</th>
                  <th className="py-2 pl-3">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {importPreview.map((row, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3 font-mono">{row.studentCode}</td>
                    <td className="py-2 px-3 font-medium text-slate-900">{row.name}</td>
                    <td className="py-2 px-3">{row.classId}</td>
                    <td className="py-2 px-3 font-mono">Tổ {row.to}</td>
                    <td className="py-2 px-3 font-mono">Mức {row.seed}</td>
                    <td className="py-2 px-3 font-mono">Nhóm {row.groupNumber}</td>
                    <td className="py-2 pl-3 text-slate-500">
                      {row.warnings.length > 0 ? row.warnings.join(', ') : row.note || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Students Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Mã HS</th>
                <th className="py-3 px-4">Họ và tên</th>
                <th className="py-3 px-4">Tổ</th>
                <th className="py-3 px-4">Nhóm QR</th>
                <th className="py-3 px-4">Hạt giống (1 Cao → 5 Thấp)</th>
                <th className="py-3 px-4">Ghi chú</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    Không tìm thấy học sinh phù hợp.
                  </td>
                </tr>
              ) : (
                filtered.map((stu) => (
                  <tr key={stu.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {stu.studentCode}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">{stu.name}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      Tổ {stu.to}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-blue-700 font-semibold whitespace-nowrap">
                      Nhóm {stu.groupNumber}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <select
                        value={stu.seed}
                        onChange={(e) => handleQuickSeedChange(stu, Number(e.target.value) as SeedLevel)}
                        className="px-2.5 py-1 text-xs font-mono border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        {([1, 2, 3, 4, 5] as SeedLevel[]).map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {SEED_LABELS[lvl]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 max-w-xs truncate">
                      {stu.note || '—'}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(stu)}
                          title="Chỉnh sửa"
                          className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-md"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteStudent(stu.id)}
                          title="Xóa"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Student Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 shadow-lg">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingStudent ? 'Chỉnh sửa thông tin học sinh' : `Thêm học sinh vào Lớp ${classId}`}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mã học sinh</label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tổ</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={formTo}
                    onChange={(e) => setFormTo(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Họ và tên *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nhập họ tên học sinh..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nhóm QR (1–5)</label>
                  <select
                    value={formGroup}
                    onChange={(e) => setFormGroup(Number(e.target.value) as GroupNumber)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  >
                    {GROUP_NUMBERS.map((g) => (
                      <option key={g} value={g}>
                        Nhóm {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Hạt giống (1–5)</label>
                  <select
                    value={formSeed}
                    onChange={(e) => setFormSeed(Number(e.target.value) as SeedLevel)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  >
                    {([1, 2, 3, 4, 5] as SeedLevel[]).map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {SEED_LABELS[lvl]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Vai trò / Ghi chú</label>
                <input
                  type="text"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="Ví dụ: Nhóm trưởng, Thư ký..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
                >
                  {submitting ? 'Đang lưu...' : editingStudent ? 'Lưu thay đổi' : 'Thêm học sinh'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
