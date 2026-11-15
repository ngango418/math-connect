import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Calendar, Download, History, Save, Sparkles } from 'lucide-react';
import {
  GROUP_NUMBERS,
  type ClassId,
  type DailyAssignmentRecord,
  type DailyGradeRecord,
  type GroupGradeEntry,
  type GroupNumber,
} from '../../shared/types.ts';
import { saveDailyGrade } from '../lib/api.ts';
import { exportGradesToExcel } from '../lib/excelUtils.ts';

interface DailyGradingTabProps {
  classId: ClassId;
  selectedDate: string;
  onDateChange: (date: string) => void;
  assignments: DailyAssignmentRecord[];
  grades: DailyGradeRecord[];
  onRefreshWorkspace: () => Promise<void>;
}

function buildDefaultEntries(
  assignment: DailyAssignmentRecord | undefined
): GroupGradeEntry[] {
  return GROUP_NUMBERS.map((groupNumber, idx) => ({
    groupNumber,
    qualityOrder: idx + 1, // 1 = Thấp nhất -> 5 = Cao nhất
    score: 6 + idx, // 6, 7, 8, 9, 10 default ladder
    completedCardsCount: assignment?.groups[groupNumber]?.cardIds.length || 0,
    feedback: '',
  }));
}

export function DailyGradingTab({
  classId,
  selectedDate,
  onDateChange,
  assignments,
  grades,
  onRefreshWorkspace,
}: DailyGradingTabProps) {
  const activeAssignment = assignments.find((a) => a.classId === classId && a.date === selectedDate);
  const existingGrade = grades.find((g) => g.classId === classId && g.date === selectedDate);

  const [lessonTopic, setLessonTopic] = useState(
    existingGrade?.lessonTopic || activeAssignment?.lessonTopic || `Buổi học ngày ${selectedDate} — Lớp ${classId}`
  );
  const [entries, setEntries] = useState<GroupGradeEntry[]>(() =>
    existingGrade ? [...existingGrade.entries].sort((a, b) => a.qualityOrder - b.qualityOrder) : buildDefaultEntries(activeAssignment)
  );
  const [published, setPublished] = useState<boolean>(existingGrade?.publishedToStudents ?? true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const foundGrade = grades.find((g) => g.classId === classId && g.date === selectedDate);
    const foundAssignment = assignments.find((a) => a.classId === classId && a.date === selectedDate);
    if (foundGrade) {
      setLessonTopic(foundGrade.lessonTopic);
      setEntries([...foundGrade.entries].sort((a, b) => a.qualityOrder - b.qualityOrder));
      setPublished(foundGrade.publishedToStudents);
    } else {
      setLessonTopic(foundAssignment?.lessonTopic || `Buổi học ngày ${selectedDate} — Lớp ${classId}`);
      setEntries(buildDefaultEntries(foundAssignment));
      setPublished(true);
    }
    setMessage('');
  }, [classId, selectedDate, grades, assignments]);

  const moveRow = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= entries.length) return;
    const next = [...entries];
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    // Recompute qualityOrder 1 (Thấp nhất) -> 5 (Cao nhất)
    const reordered = next.map((item, i) => ({
      ...item,
      qualityOrder: i + 1,
    }));
    setEntries(reordered);
  };

  const applyScoreLadderByOrder = () => {
    const ladderScores = [6.0, 7.0, 8.0, 9.0, 10.0];
    setEntries((prev) =>
      prev.map((item, i) => ({
        ...item,
        qualityOrder: i + 1,
        score: ladderScores[i] ?? item.score,
      }))
    );
    setMessage('Đã tự động điền thang điểm tăng dần (6.0 → 10.0) theo thứ tự chất lượng.');
  };

  const updateEntry = (
    groupNumber: GroupNumber,
    patch: Partial<GroupGradeEntry>
  ) => {
    setEntries((prev) =>
      prev.map((e) => (e.groupNumber === groupNumber ? { ...e, ...patch } : e))
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
        entries: entries.map((e, i) => ({ ...e, qualityOrder: i + 1 })),
        publishedToStudents: published,
      });
      await onRefreshWorkspace();
      setMessage(`Đã lưu bảng điểm ngày ${selectedDate} cho Lớp ${classId}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Lỗi khi lưu bảng điểm.');
    } finally {
      setSaving(false);
    }
  };

  const classHistory = grades
    .filter((g) => g.classId === classId)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      {/* Control Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Chấm điểm &amp; Xếp hạng chất lượng từ Thấp đến Cao — Lớp {classId}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Sắp xếp 5 nhóm theo thứ tự chất lượng hoàn thành nhiệm vụ từ mức 1 (Thấp nhất) đến mức 5 (Cao nhất) và lưu theo ngày.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => onDateChange(e.target.value)}
                className="pl-9 pr-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <button
              type="button"
              onClick={applyScoreLadderByOrder}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4" />
              Điền điểm bậc thang
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Đang lưu...' : 'Lưu điểm ngày'}
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
              className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            Hiển thị điểm trên trang quét QR của học sinh
          </label>
        </div>

        {message && <div className="mt-3 text-xs font-medium text-emerald-700">{message}</div>}
      </div>

      {/* Ranking Table (Lowest to Highest) */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-600">
          <span>Thứ tự từ Thấp nhất (1) → Cao nhất (5)</span>
          <span>Dùng mũi tên ↑ ↓ để điều chỉnh thứ hạng chất lượng của từng nhóm</span>
        </div>

        <div className="divide-y divide-slate-200">
          {entries.map((entry, idx) => {
            const assignedCount = activeAssignment?.groups[entry.groupNumber]?.cardIds.length ?? 0;
            const rankLabel =
              idx === 0
                ? 'Thứ tự 1 · Thấp nhất'
                : idx === 4
                ? 'Thứ tự 5 · Cao nhất'
                : `Thứ tự ${idx + 1} / 5`;

            return (
              <div
                key={entry.groupNumber}
                className="p-4 sm:px-5 flex flex-col lg:flex-row lg:items-center gap-4 hover:bg-slate-50/70 transition-colors"
              >
                {/* Rank & Reorder Controls */}
                <div className="flex items-center gap-3 lg:w-56 shrink-0">
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveRow(idx, -1)}
                      title="Đẩy lên (thấp hơn)"
                      className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 bg-slate-100 rounded"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === entries.length - 1}
                      onClick={() => moveRow(idx, 1)}
                      title="Đẩy xuống (cao hơn)"
                      className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 bg-slate-100 rounded"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div>
                    <div
                      className={`text-xs font-semibold ${
                        idx === 4 ? 'text-emerald-700' : idx === 0 ? 'text-amber-700' : 'text-slate-500'
                      }`}
                    >
                      {rankLabel}
                    </div>
                    <div className="text-base font-bold text-slate-900">Nhóm {entry.groupNumber}</div>
                  </div>
                </div>

                {/* Cards Completed & Score */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 lg:w-80 shrink-0">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      Thẻ xong / {assignedCount}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={entry.completedCardsCount}
                      onChange={(e) =>
                        updateEntry(entry.groupNumber, {
                          completedCardsCount: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-full px-3 py-1.5 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="col-span-1 sm:col-span-2">
                    <label className="block text-xs text-slate-500 mb-1">Điểm chất lượng (0–10)</label>
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      max={10}
                      value={entry.score}
                      onChange={(e) =>
                        updateEntry(entry.groupNumber, {
                          score: Math.min(10, Math.max(0, Number(e.target.value) || 0)),
                        })
                      }
                      className="w-full px-3 py-1.5 text-sm font-mono font-bold tabular-nums text-blue-700 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                {/* Teacher Feedback */}
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">Nhận xét buổi học</label>
                  <input
                    type="text"
                    value={entry.feedback}
                    onChange={(e) => updateEntry(entry.groupNumber, { feedback: e.target.value })}
                    placeholder="Ghi nhận ưu điểm hoặc điểm cần khắc phục của nhóm..."
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Saved Daily Grade History */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <History className="w-4 h-4 text-blue-700" />
            Lịch sử bảng điểm đã lưu theo ngày — Lớp {classId} ({classHistory.length} ngày)
          </h3>

          {classHistory.length > 0 && (
            <button
              type="button"
              onClick={() => exportGradesToExcel(classId, classHistory)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap self-start"
            >
              <Download className="w-3.5 h-3.5" />
              Xuất bảng điểm Excel
            </button>
          )}
        </div>

        {classHistory.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
            Chưa có lịch sử chấm điểm nào cho Lớp {classId}. Hãy chấm và nhấn &quot;Lưu điểm ngày&quot; ở trên.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2.5 pr-4 font-semibold">Ngày học</th>
                  <th className="py-2.5 px-3 font-semibold">Chủ đề</th>
                  <th className="py-2.5 px-3 font-semibold">Thứ tự thấp → cao (Điểm)</th>
                  <th className="py-2.5 pl-3 font-semibold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classHistory.map((rec) => {
                  const ordered = [...rec.entries].sort((a, b) => a.qualityOrder - b.qualityOrder);
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50">
                      <td className="py-3 pr-4 font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {rec.date}
                      </td>
                      <td className="py-3 px-3 text-slate-700">{rec.lessonTopic}</td>
                      <td className="py-3 px-3 text-xs font-mono tabular-nums text-slate-700">
                        {ordered.map((e, idx) => (
                          <span key={e.groupNumber}>
                            {idx > 0 && ' → '}
                            <span className={idx === ordered.length - 1 ? 'font-bold text-emerald-700' : ''}>
                              N{e.groupNumber} ({e.score.toFixed(1)})
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
                          Mở / Chỉnh sửa
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
