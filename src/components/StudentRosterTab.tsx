import { useRef, useState, type FormEvent } from 'react';
import {
  Crown,
  Download,
  Edit3,
  FileSpreadsheet,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { GROUP_NUMBERS, type GroupNumber, type Student } from '../../shared/types.ts';
import {
  aiParseExcelRoster,
  bulkStudentsAction,
  createStudent,
  deleteStudent,
  updateStudent,
} from '../lib/api.ts';
import {
  downloadExcelTemplate,
  exportRosterToExcel,
  extractRawExcelSheet,
  parseExcelStudentsStandard,
  type ParsedExcelStudentRow,
} from '../lib/excelUtils.ts';

interface StudentRosterTabProps {
  classId: string;
  students: Student[];
  onRefreshWorkspace: () => Promise<void>;
}

export function StudentRosterTab({ classId, students, onRefreshWorkspace }: StudentRosterTabProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState('');
  const [filterTo, setFilterTo] = useState<string>('all');
  const [useAiParser, setUseAiParser] = useState<boolean>(true);
  const [parsingExcel, setParsingExcel] = useState<boolean>(false);

  // Add/Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formBirthDate, setFormBirthDate] = useState('');
  const [formTo, setFormTo] = useState(1);
  const [formGroup, setFormGroup] = useState<GroupNumber>(1);
  const [formIsLeader, setFormIsLeader] = useState(false);
  const [formScore, setFormScore] = useState(7);
  const [formNote, setFormNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Excel import preview state
  const [importPreview, setImportPreview] = useState<ParsedExcelStudentRow[] | null>(null);
  const [importMode, setImportMode] = useState<'import-merge' | 'import-replace'>('import-merge');
  const [importError, setImportError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const classStudents = students.filter((s) => s.classId === classId);
  const distinctTos = Array.from(new Set([1, 2, 3, 4, ...classStudents.map((s) => s.to)])).sort((a, b) => a - b);

  const filtered = classStudents.filter((s) => {
    const matchSearch =
      !search.trim() ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.studentCode.toLowerCase().includes(search.toLowerCase());
    const matchTo = filterTo === 'all' || String(s.to) === filterTo;
    return matchSearch && matchTo;
  });

  const openAddModal = () => {
    setEditingStudent(null);
    const cleanCode = classId.replace(/[^a-zA-Z0-9]/g, '');
    setFormCode(`${cleanCode}-${String(classStudents.length + 1).padStart(2, '0')}`);
    setFormName('');
    setFormBirthDate('');
    setFormTo(1);
    setFormGroup(1);
    setFormIsLeader(false);
    setFormScore(7);
    setFormNote('');
    setModalOpen(true);
  };

  const openEditModal = (stu: Student) => {
    setEditingStudent(stu);
    setFormCode(stu.studentCode);
    setFormName(stu.name);
    setFormBirthDate(stu.birthDate || '');
    setFormTo(stu.to);
    setFormGroup(stu.groupNumber);
    setFormIsLeader(Boolean(stu.isLeader));
    setFormScore(stu.score ?? 7);
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
          birthDate: formBirthDate.trim(),
          to: formTo,
          groupNumber: formGroup,
          isLeader: formIsLeader,
          score: Math.min(10, Math.max(1, Number(formScore) || 7)),
          note: formNote.trim(),
        });
      } else {
        await createStudent({
          studentCode: formCode.trim(),
          name: formName.trim(),
          birthDate: formBirthDate.trim(),
          classId,
          to: formTo,
          groupNumber: formGroup,
          isLeader: formIsLeader,
          score: Math.min(10, Math.max(1, Number(formScore) || 7)),
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

  const handleToggleLeader = async (stu: Student) => {
    await updateStudent(stu.id, { isLeader: !stu.isLeader });
    await onRefreshWorkspace();
  };

  const handleQuickScoreChange = async (stu: Student, rawScore: string) => {
    const val = Math.min(10, Math.max(1, Number(rawScore) || 1));
    await updateStudent(stu.id, { score: Number(val.toFixed(1)) });
    await onRefreshWorkspace();
  };

  const handleExcelFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setImportError('');
    setStatusMsg('');
    setParsingExcel(true);
    try {
      if (useAiParser) {
        try {
          const { sheetName, rawRows } = await extractRawExcelSheet(file);
          const aiStudents = await aiParseExcelRoster(rawRows, classId, sheetName);
          const formatted: ParsedExcelStudentRow[] = aiStudents
            .filter((s) => s.name && s.name.trim())
            .map((s, idx) => ({
              studentCode:
                s.studentCode?.trim() ||
                `${classId.replace(/[^a-zA-Z0-9]/g, '')}-${String(idx + 1).padStart(2, '0')}`,
              name: s.name!.trim(),
              birthDate: (s.birthDate || '').trim(),
              classId: (s.classId || classId).trim(),
              to: Math.min(4, Math.max(1, Number(s.to) || 1)),
              groupNumber: Math.min(8, Math.max(1, Number(s.groupNumber) || 1)) as GroupNumber,
              isLeader: Boolean(s.isLeader),
              score: Math.min(10, Math.max(1, Number(s.score) || 7)),
              note: (s.note || '').trim(),
              warnings: ['AI Gemini đã chuẩn hóa'],
            }));
          if (formatted.length > 0) {
            setImportPreview(formatted);
            return;
          }
        } catch (aiErr) {
          // Fall back smoothly to deterministic Excel parser if AI endpoint is unavailable on static host
          const fallbackMsg = aiErr instanceof Error ? aiErr.message : '';
          if (fallbackMsg && !fallbackMsg.includes('STATIC_HOST_FALLBACK')) {
            setStatusMsg(`AI đang tạm bận (${fallbackMsg}) — đã tự động chuyển sang bộ đọc Excel chuẩn.`);
          }
        }
      }

      const rows = await parseExcelStudentsStandard(file, classId);
      setImportPreview(rows);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Không thể đọc file Excel.');
    } finally {
      setParsingExcel(false);
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
          birthDate: r.birthDate,
          classId: r.classId,
          to: r.to,
          groupNumber: r.groupNumber,
          isLeader: r.isLeader,
          score: r.score,
          note: r.note,
        })),
      });
      setStatusMsg(`Đã nhập thành công ${importPreview.length} học sinh từ file Excel vào Database/Hệ thống.`);
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
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Danh sách Học sinh &amp; Nhập Excel — Lớp {classId}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tổng số <span className="font-mono font-bold text-slate-800">{classStudents.length}</span> học sinh · Có thể tick chọn <strong>Nhóm trưởng</strong> trực tiếp hoặc dùng <strong>AI đọc file Excel</strong> bất kỳ định dạng nào.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => downloadExcelTemplate(classId)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Tải mẫu Excel
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
              disabled={parsingExcel}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-colors whitespace-nowrap"
            >
              {useAiParser ? <Sparkles className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
              {parsingExcel ? 'AI đang đọc Excel...' : 'Tải Excel lên (AI đọc)'}
            </button>

            <button
              type="button"
              onClick={() => exportRosterToExcel(classId, classStudents)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Xuất Excel
            </button>

            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Thêm học sinh
            </button>
          </div>
        </div>

        {/* Search, Filter & AI Mode Toggle */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo họ tên hoặc mã học sinh..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <select
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">Tất cả 4 Tổ</option>
            {distinctTos.map((t) => (
              <option key={t} value={String(t)}>
                Tổ {t}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer shrink-0 px-2">
            <input
              type="checkbox"
              checked={useAiParser}
              onChange={(e) => setUseAiParser(e.target.checked)}
              className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            />
            Dùng AI Gemini đọc hiểu file Excel lộn xộn
          </label>
        </div>

        {importError && (
          <div className="mt-3 p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl">
            {importError}
          </div>
        )}
        {statusMsg && (
          <div className="mt-3 p-3 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl">
            {statusMsg}
          </div>
        )}
      </div>

      {/* Excel Preview Card */}
      {importPreview && (
        <div className="bg-white border border-violet-200 rounded-2xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Xem trước dữ liệu chuyển đổi ({importPreview.length} học sinh)
              </h3>
              <p className="text-xs text-slate-500">
                Kiểm tra lại ngày sinh, tổ, nhóm, nhóm trưởng và điểm đánh giá trước khi lưu.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as 'import-merge' | 'import-replace')}
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg"
              >
                <option value="import-merge">Cập nhật &amp; thêm mới</option>
                <option value="import-replace">Thay thế danh sách lớp {classId}</option>
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
                className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                {submitting ? 'Đang lưu...' : 'Xác nhận lưu danh sách'}
              </button>
            </div>
          </div>

          <div className="mt-3 max-h-64 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3">Họ và tên</th>
                  <th className="py-2 px-3">Ngày sinh</th>
                  <th className="py-2 px-3">Lớp</th>
                  <th className="py-2 px-3">Tổ</th>
                  <th className="py-2 px-3">Nhóm</th>
                  <th className="py-2 px-3">Nhóm trưởng</th>
                  <th className="py-2 pl-3">Điểm (1–10)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {importPreview.map((row, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3 font-semibold text-slate-900">{row.name}</td>
                    <td className="py-2 px-3 font-mono tabular-nums">{row.birthDate || '—'}</td>
                    <td className="py-2 px-3">{row.classId}</td>
                    <td className="py-2 px-3 font-mono">Tổ {row.to}</td>
                    <td className="py-2 px-3 font-mono">Nhóm {row.groupNumber}</td>
                    <td className="py-2 px-3">
                      <input
                        type="checkbox"
                        checked={row.isLeader}
                        onChange={(e) =>
                          setImportPreview((prev) =>
                            prev
                              ? prev.map((item, idx) =>
                                  idx === i ? { ...item, isLeader: e.target.checked } : item
                                )
                              : prev
                          )
                        }
                        className="rounded border-slate-300 text-amber-600"
                      />
                    </td>
                    <td className="py-2 pl-3 font-mono tabular-nums">{row.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Students Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Họ và tên</th>
                <th className="py-3 px-4">Ngày sinh</th>
                <th className="py-3 px-4">Tổ</th>
                <th className="py-3 px-4">Nhóm (1–8)</th>
                <th className="py-3 px-4 text-center">Nhóm trưởng</th>
                <th className="py-3 px-4">Điểm đánh giá (1–10)</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    Chưa có học sinh nào trong danh sách phù hợp.
                  </td>
                </tr>
              ) : (
                filtered.map((stu) => (
                  <tr key={stu.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        {stu.name}
                        {stu.isLeader && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      </div>
                      <div className="text-xs font-mono text-slate-400">{stu.studentCode}</div>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                      {stu.birthDate || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      Tổ {stu.to}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-blue-700 font-bold whitespace-nowrap">
                      Nhóm {stu.groupNumber}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(stu.isLeader)}
                          onChange={() => handleToggleLeader(stu)}
                          className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                        <span className="text-xs text-slate-500">{stu.isLeader ? 'Có' : ''}</span>
                      </label>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <input
                        type="number"
                        min={1}
                        max={10}
                        step="0.5"
                        value={stu.score ?? 7}
                        onChange={(e) => handleQuickScoreChange(stu, e.target.value)}
                        className="w-20 px-2.5 py-1 text-xs font-mono font-bold tabular-nums border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(stu)}
                          title="Chỉnh sửa"
                          className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteStudent(stu.id)}
                          title="Xóa"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
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
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-lg">
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
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Họ và tên *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nhập họ và tên học sinh..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Ngày tháng năm sinh</label>
                  <input
                    type="text"
                    value={formBirthDate}
                    onChange={(e) => setFormBirthDate(e.target.value)}
                    placeholder="DD/MM/YYYY"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mã học sinh</label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tổ (1–4)</label>
                  <select
                    value={formTo}
                    onChange={(e) => setFormTo(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
                  >
                    {[1, 2, 3, 4].map((t) => (
                      <option key={t} value={t}>
                        Tổ {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nhóm (1–8)</label>
                  <select
                    value={formGroup}
                    onChange={(e) => setFormGroup(Number(e.target.value) as GroupNumber)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
                  >
                    {GROUP_NUMBERS.map((g) => (
                      <option key={g} value={g}>
                        Nhóm {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Điểm (1–10)</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    step="0.5"
                    value={formScore}
                    onChange={(e) => setFormScore(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 pt-1 text-sm font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formIsLeader}
                  onChange={(e) => setFormIsLeader(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                Tick chọn học sinh này làm Nhóm trưởng
              </label>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Ghi chú</label>
                <input
                  type="text"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="Ghi chú thêm nếu có..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl"
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
