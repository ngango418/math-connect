import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Crown,
  Download,
  FileSpreadsheet,
  History,
  Minus,
  Plus,
  Save,
  Table2,
} from 'lucide-react';
import {
  GROUP_NUMBERS,
  type ClassId,
  type DailyAssignmentRecord,
  type DailyGradeRecord,
  type GroupGradeEntry,
  type GroupNumber,
  type Student,
} from '../../shared/types.ts';
import { saveDailyGrade } from '../lib/api.ts';
import { exportAllGradesToExcel, exportSessionGradebookToExcel } from '../lib/excelUtils.ts';

interface DailyGradingTabProps {
  classId: ClassId;
  selectedDate: string;
  onDateChange: (date: string) => void;
  students: Student[];
  assignments: DailyAssignmentRecord[];
  grades: DailyGradeRecord[];
  onRefreshWorkspace: () => Promise<void>;
}

function calcFinalScore(baseScore: number, penaltyPoints: number, bonusPoints: number): number {
  return Number((baseScore - penaltyPoints + bonusPoints).toFixed(2));
}

function normalizeEightGradeEntries(existing?: GroupGradeEntry[]): GroupGradeEntry[] {
  return GROUP_NUMBERS.map((groupNumber) => {
    const found = existing?.find((e) => e.groupNumber === groupNumber);
    if (found) {
      const baseScore = Number(found.baseScore ?? 8);
      const bonusPoints = Number(found.bonusPoints ?? 0);
      const penaltyPoints = Number(found.penaltyPoints ?? 0);
      return {
        groupNumber,
        baseScore,
        bonusPoints,
        penaltyPoints,
        finalScore: calcFinalScore(baseScore, penaltyPoints, bonusPoints),
        feedback: found.feedback || '',
      };
    }
    return {
      groupNumber,
      baseScore: 8,
      bonusPoints: 0,
      penaltyPoints: 0,
      finalScore: 8,
      feedback: '',
    };
  });
}

export function DailyGradingTab({
  classId,
  selectedDate,
  onDateChange,
  students,
  assignments,
  grades,
  onRefreshWorkspace,
}: DailyGradingTabProps) {
  const classStudents = useMemo(
    () => students.filter((s) => s.classId === classId),
    [students, classId]
  );

  const activeAssignment = assignments.find((a) => a.classId === classId && a.date === selectedDate);
  const existingGrade = grades.find((g) => g.classId === classId && g.date === selectedDate);

  const [lessonTopic, setLessonTopic] = useState(
    existingGrade?.lessonTopic ||
      activeAssignment?.lessonTopic ||
      `Buổi học ngày ${selectedDate} — Lớp ${classId}`
  );
  const [entries, setEntries] = useState<GroupGradeEntry[]>(() =>
    normalizeEightGradeEntries(existingGrade?.entries)
  );
  const [published, setPublished] = useState<boolean>(existingGrade?.publishedToStudents ?? true);
  const [viewMode, setViewMode] = useState<'live' | 'spreadsheet'>('live');
  const [sheetScope, setSheetScope] = useState<'groups' | 'students'>('students');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const foundGrade = grades.find((g) => g.classId === classId && g.date === selectedDate);
    const foundAssignment = assignments.find((a) => a.classId === classId && a.date === selectedDate);
    if (foundGrade) {
      setLessonTopic(foundGrade.lessonTopic);
      setEntries(normalizeEightGradeEntries(foundGrade.entries));
      setPublished(foundGrade.publishedToStudents);
    } else {
      setLessonTopic(
        foundAssignment?.lessonTopic || `Buổi học ngày ${selectedDate} — Lớp ${classId}`
      );
      setEntries(normalizeEightGradeEntries());
      setPublished(true);
    }
    setMessage('');
  }, [classId, selectedDate, grades, assignments]);

  const updateEntry = (groupNumber: GroupNumber, patch: Partial<GroupGradeEntry>) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.groupNumber !== groupNumber) return e;
        const base = patch.baseScore !== undefined ? patch.baseScore : e.baseScore;
        const bonus = patch.bonusPoints !== undefined ? patch.bonusPoints : e.bonusPoints;
        const penalty = patch.penaltyPoints !== undefined ? patch.penaltyPoints : e.penaltyPoints;
        return {
          ...e,
          ...patch,
          finalScore: calcFinalScore(base, penalty, bonus),
        };
      })
    );
  };

  const adjustPoints = (
    groupNumber: GroupNumber,
    field: 'bonusPoints' | 'penaltyPoints',
    delta: number
  ) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.groupNumber !== groupNumber) return e;
        const nextVal = Math.max(0, Number((e[field] + delta).toFixed(1)));
        const nextEntry = { ...e, [field]: nextVal };
        nextEntry.finalScore = calcFinalScore(
          nextEntry.baseScore,
          nextEntry.penaltyPoints,
          nextEntry.bonusPoints
        );
        return nextEntry;
      })
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      await saveDailyGrade({
        classId,
        date: selectedDate,
        lessonTopic,
        entries,
        publishedToStudents: published,
      });
      await onRefreshWorkspace();
      setMessage(
        `Đã lưu bảng điểm ngày ${selectedDate} cho cả 8 Nhóm & toàn bộ ${classStudents.length} học sinh Lớp ${classId}.`
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Lỗi khi lưu bảng điểm.');
    } finally {
      setSaving(false);
    }
  };

  const buildCurrentGradeRecord = (): DailyGradeRecord => ({
    id: `${classId}_${selectedDate}`,
    classId,
    date: selectedDate,
    lessonTopic,
    entries,
    publishedToStudents: published,
    updatedAt: new Date().toISOString(),
  });

  const classHistory = grades
    .filter((g) => g.classId === classId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const averageClassScore = useMemo(() => {
    if (entries.length === 0) return 0;
    const sum = entries.reduce((acc, e) => acc + e.finalScore, 0);
    return Number((sum / entries.length).toFixed(2));
  }, [entries]);

  return (
    <div className="space-y-6">
      {/* Control Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Chấm điểm Trực tiếp &amp; Bảng tính Điểm Cuối buổi — Lớp {classId}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Công thức: <strong>Tổng điểm = Điểm cho − Điểm trừ + Điểm cộng</strong> · Điểm của nhóm được tính chung cho tất cả thành viên trong nhóm.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setViewMode('live')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  viewMode === 'live' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'
                }`}
              >
                Chấm điểm Cộng/Trừ (8 Nhóm)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('spreadsheet')}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  viewMode === 'spreadsheet' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                Bảng tính &amp; Xuất Excel
              </button>
            </div>

            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => onDateChange(e.target.value)}
                className="pl-9 pr-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <button
              type="button"
              onClick={() =>
                exportSessionGradebookToExcel(classId, buildCurrentGradeRecord(), classStudents)
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Xuất Excel buổi học
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Đang lưu...' : 'Lưu bảng điểm'}
            </button>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-600 shrink-0">Nội dung tiết học:</label>
            <input
              type="text"
              value={lessonTopic}
              onChange={(e) => setLessonTopic(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Công khai điểm trên trang quét QR của học sinh
          </label>
        </div>

        {message && (
          <div className="mt-3 p-2.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl">
            {message}
          </div>
        )}
      </div>

      {/* MODE 1: Live Activity Grading for 8 Groups */}
      {viewMode === 'live' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {entries.map((entry) => {
            const groupMembers = classStudents.filter((s) => s.groupNumber === entry.groupNumber);
            const leader = groupMembers.find((m) => m.isLeader);
            const assignedCardsCount =
              activeAssignment?.groups[entry.groupNumber]?.cardIds.length ?? 0;

            return (
              <div
                key={entry.groupNumber}
                className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono tabular-nums">{groupMembers.length} thành viên</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{assignedCardsCount} thẻ nhiệm vụ</span>
                      {leader && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-amber-700 font-semibold inline-flex items-center gap-1">
                            <Crown className="w-3 h-3 text-amber-500" /> {leader.name}
                          </span>
                        </>
                      )}
                    </div>
                    <h3 className="text-lg font-extrabold text-slate-900 mt-0.5">
                      Nhóm {entry.groupNumber}
                    </h3>
                  </div>

                  {/* Live Final Score Display */}
                  <div className="text-right shrink-0">
                    <div className="text-[11px] font-medium text-slate-500">
                      Tổng điểm ({entry.baseScore} − {entry.penaltyPoints} + {entry.bonusPoints})
                    </div>
                    <div className="text-2xl font-extrabold font-mono tabular-nums text-blue-700">
                      {entry.finalScore.toFixed(1)} đ
                    </div>
                  </div>
                </div>

                {/* Base Score + Quick Bonus + Quick Penalty */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Điểm cho */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Điểm cho (0–10)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step="0.5"
                      value={entry.baseScore}
                      onChange={(e) =>
                        updateEntry(entry.groupNumber, {
                          baseScore: Math.min(10, Math.max(0, Number(e.target.value) || 0)),
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-sm font-mono font-bold tabular-nums bg-white border border-slate-200 rounded-lg"
                    />
                    <div className="flex items-center gap-1 mt-1.5">
                      {[7, 8, 9, 10].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => updateEntry(entry.groupNumber, { baseScore: v })}
                          className={`flex-1 py-0.5 text-[11px] font-mono font-semibold rounded border ${
                            entry.baseScore === v
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Điểm cộng (+) */}
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-emerald-800">Điểm cộng (+)</span>
                      <span className="text-sm font-mono font-extrabold tabular-nums text-emerald-700">
                        +{entry.bonusPoints}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        onClick={() => adjustPoints(entry.groupNumber, 'bonusPoints', 0.5)}
                        className="py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center justify-center gap-0.5"
                      >
                        <Plus className="w-3 h-3" />0.5
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustPoints(entry.groupNumber, 'bonusPoints', 1)}
                        className="py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center justify-center gap-0.5"
                      >
                        <Plus className="w-3 h-3" />1
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustPoints(entry.groupNumber, 'bonusPoints', -0.5)}
                        className="py-1.5 text-xs font-semibold text-emerald-800 bg-white border border-emerald-200 hover:bg-emerald-100 rounded-lg"
                      >
                        -0.5
                      </button>
                    </div>
                  </div>

                  {/* Điểm trừ (-) */}
                  <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-rose-800">Điểm trừ (−)</span>
                      <span className="text-sm font-mono font-extrabold tabular-nums text-rose-700">
                        −{entry.penaltyPoints}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        onClick={() => adjustPoints(entry.groupNumber, 'penaltyPoints', 0.5)}
                        className="py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg flex items-center justify-center gap-0.5"
                      >
                        <Minus className="w-3 h-3" />0.5
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustPoints(entry.groupNumber, 'penaltyPoints', 1)}
                        className="py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg flex items-center justify-center gap-0.5"
                      >
                        <Minus className="w-3 h-3" />1
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustPoints(entry.groupNumber, 'penaltyPoints', -0.5)}
                        className="py-1.5 text-xs font-semibold text-rose-800 bg-white border border-rose-200 hover:bg-rose-100 rounded-lg"
                      >
                        Hoàn
                      </button>
                    </div>
                  </div>
                </div>

                {/* Members preview & Feedback */}
                <div className="space-y-2">
                  <div className="text-xs text-slate-500 truncate">
                    <span className="font-semibold text-slate-700">Học sinh nhận {entry.finalScore.toFixed(1)}đ: </span>
                    {groupMembers.length > 0
                      ? groupMembers.map((m) => m.name).join(', ')
                      : 'Chưa có thành viên'}
                  </div>
                  <input
                    type="text"
                    value={entry.feedback}
                    onChange={(e) => updateEntry(entry.groupNumber, { feedback: e.target.value })}
                    placeholder="Nhận xét hoạt động của nhóm..."
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODE 2: Spreadsheet-Style Gradebook Table + Excel Export */}
      {viewMode === 'spreadsheet' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-4 sm:px-5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl self-start">
              <button
                type="button"
                onClick={() => setSheetScope('students')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  sheetScope === 'students' ? 'bg-blue-600 text-white' : 'text-slate-600'
                }`}
              >
                Bảng tính từng Học sinh ({classStudents.length} HS)
              </button>
              <button
                type="button"
                onClick={() => setSheetScope('groups')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  sheetScope === 'groups' ? 'bg-blue-600 text-white' : 'text-slate-600'
                }`}
              >
                Bảng tính 8 Nhóm (TB: {averageClassScore}đ)
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                exportSessionGradebookToExcel(classId, buildCurrentGradeRecord(), classStudents)
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Tải file Excel 2 Sheet (.xlsx)
            </button>
          </div>

          {sheetScope === 'groups' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold">
                    <th className="py-2.5 px-3 border-r border-slate-200">Nhóm</th>
                    <th className="py-2.5 px-3 border-r border-slate-200">Nhóm trưởng</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 text-center">Sĩ số</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 text-right">Điểm cho</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 text-right text-rose-700">Điểm trừ (−)</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 text-right text-emerald-700">Điểm cộng (+)</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 text-right text-blue-700">Tổng điểm</th>
                    <th className="py-2.5 px-3">Nhận xét</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {entries.map((e) => {
                    const members = classStudents.filter((s) => s.groupNumber === e.groupNumber);
                    const leader = members.find((m) => m.isLeader);
                    return (
                      <tr key={e.groupNumber} className="hover:bg-blue-50/40">
                        <td className="py-2.5 px-3 border-r border-slate-200 font-bold text-slate-900">
                          Nhóm {e.groupNumber}
                        </td>
                        <td className="py-2.5 px-3 border-r border-slate-200 text-slate-700">
                          {leader ? leader.name : '—'}
                        </td>
                        <td className="py-2.5 px-3 border-r border-slate-200 text-center font-mono tabular-nums">
                          {members.length}
                        </td>
                        <td className="py-2.5 px-3 border-r border-slate-200 text-right font-mono tabular-nums">
                          {e.baseScore.toFixed(1)}
                        </td>
                        <td className="py-2.5 px-3 border-r border-slate-200 text-right font-mono tabular-nums text-rose-700">
                          −{e.penaltyPoints.toFixed(1)}
                        </td>
                        <td className="py-2.5 px-3 border-r border-slate-200 text-right font-mono tabular-nums text-emerald-700">
                          +{e.bonusPoints.toFixed(1)}
                        </td>
                        <td className="py-2.5 px-3 border-r border-slate-200 text-right font-mono font-extrabold tabular-nums text-blue-700">
                          {e.finalScore.toFixed(1)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{e.feedback || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold">
                    <th className="py-2.5 px-3 border-r border-slate-200 text-center">STT</th>
                    <th className="py-2.5 px-3 border-r border-slate-200">Họ và tên</th>
                    <th className="py-2.5 px-3 border-r border-slate-200">Ngày sinh</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 text-center">Tổ</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 text-center">Nhóm</th>
                    <th className="py-2.5 px-3 border-r border-slate-200">Vai trò</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 text-right">Điểm cho</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 text-right text-rose-700">Trừ</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 text-right text-emerald-700">Cộng</th>
                    <th className="py-2.5 px-3 text-right text-blue-700">Điểm buổi học</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {[...classStudents]
                    .sort((a, b) => a.groupNumber - b.groupNumber || a.name.localeCompare(b.name))
                    .map((stu, idx) => {
                      const ge = entries.find((e) => e.groupNumber === stu.groupNumber);
                      const base = ge?.baseScore ?? 0;
                      const penalty = ge?.penaltyPoints ?? 0;
                      const bonus = ge?.bonusPoints ?? 0;
                      const finalScore = ge?.finalScore ?? 0;
                      return (
                        <tr key={stu.id} className="hover:bg-blue-50/40">
                          <td className="py-2 px-3 border-r border-slate-200 text-center font-mono tabular-nums text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 font-semibold text-slate-900">
                            {stu.name}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 font-mono tabular-nums text-slate-600">
                            {stu.birthDate || '—'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-center font-mono">
                            {stu.to}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-center font-mono font-bold text-blue-700">
                            {stu.groupNumber}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-slate-600">
                            {stu.isLeader ? 'Nhóm trưởng' : 'Thành viên'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-right font-mono tabular-nums">
                            {base.toFixed(1)}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-right font-mono tabular-nums text-rose-700">
                            −{penalty.toFixed(1)}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-right font-mono tabular-nums text-emerald-700">
                            +{bonus.toFixed(1)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-extrabold tabular-nums text-blue-700">
                            {finalScore.toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Saved Daily Grade History */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <History className="w-4 h-4 text-blue-600" />
            Lịch sử bảng điểm đã lưu theo ngày — Lớp {classId} ({classHistory.length} buổi)
          </h3>

          {classHistory.length > 0 && (
            <button
              type="button"
              onClick={() => exportAllGradesToExcel(classId, classHistory)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap self-start"
            >
              <Download className="w-3.5 h-3.5" />
              Xuất tất cả lịch sử Excel
            </button>
          )}
        </div>

        {classHistory.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl">
            Chưa có lịch sử chấm điểm nào cho Lớp {classId}. Hãy chấm và nhấn &quot;Lưu bảng điểm&quot; ở trên.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2.5 pr-4 font-semibold">Ngày học</th>
                  <th className="py-2.5 px-3 font-semibold">Chủ đề</th>
                  <th className="py-2.5 px-3 font-semibold">Điểm tổng 8 Nhóm</th>
                  <th className="py-2.5 pl-3 font-semibold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classHistory.map((rec) => {
                  const ordered = [...rec.entries].sort((a, b) => a.groupNumber - b.groupNumber);
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50">
                      <td className="py-3 pr-4 font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {rec.date}
                      </td>
                      <td className="py-3 px-3 text-slate-700">{rec.lessonTopic}</td>
                      <td className="py-3 px-3 text-xs font-mono tabular-nums text-slate-700">
                        {ordered.map((e, idx) => (
                          <span key={e.groupNumber}>
                            {idx > 0 && ' · '}
                            <span>
                              N{e.groupNumber}:{' '}
                              <strong className="text-blue-700">{(e.finalScore ?? 0).toFixed(1)}</strong>
                            </span>
                          </span>
                        ))}
                      </td>
                      <td className="py-3 pl-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onDateChange(rec.date)}
                          className="text-xs font-semibold text-blue-700 hover:underline"
                        >
                          Mở / Sửa
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
