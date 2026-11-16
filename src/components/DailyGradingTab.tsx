import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeftRight,
  Calendar,
  CheckCircle2,
  Crown,
  Download,
  FileSpreadsheet,
  History,
  LayoutGrid,
  LifeBuoy,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Table2,
  Trophy,
} from 'lucide-react';
import {
  GROUP_NUMBERS,
  type ClassId,
  type DailyAssignmentRecord,
  type DailyGradeRecord,
  type GroupGradeEntry,
  type GroupNumber,
  type PrivilegeCardType,
  type RubricCriteriaScores,
  type Student,
} from '../../shared/types.ts';
import { saveDailyGrade } from '../lib/api.ts';
import { exportAllGradesToExcel, exportSessionGradebookToExcel } from '../lib/excelUtils.ts';
import { GROUP_THEMES } from '../lib/themePalette.ts';

interface DailyGradingTabProps {
  classId: ClassId;
  selectedDate: string;
  onDateChange: (date: string) => void;
  students: Student[];
  assignments: DailyAssignmentRecord[];
  grades: DailyGradeRecord[];
  onRefreshWorkspace: () => Promise<void>;
}

const RUBRIC_SCORE_STEPS = [1, 1.5, 2, 2.5] as const;

interface RubricCriterionMeta {
  key: keyof RubricCriteriaScores;
  label: string;
  shortDesc: string;
  headerBg: string;
  headerText: string;
  activeBtn: string;
  inactiveBtn: string;
}

const RUBRIC_CRITERIA: RubricCriterionMeta[] = [
  {
    key: 'participation',
    label: 'Tham gia tích cực',
    shortDesc: 'Chủ động đóng góp ý kiến',
    headerBg: 'bg-sky-100/90',
    headerText: 'text-sky-900',
    activeBtn: 'bg-gradient-to-br from-sky-500 to-blue-600 text-white border-sky-600 shadow-sm',
    inactiveBtn: 'bg-white text-sky-900 border-sky-200 hover:bg-sky-50',
  },
  {
    key: 'collaboration',
    label: 'Hợp tác, phân công',
    shortDesc: 'Phối hợp đều giữa các bạn',
    headerBg: 'bg-violet-100/90',
    headerText: 'text-violet-900',
    activeBtn: 'bg-gradient-to-br from-violet-500 to-purple-600 text-white border-violet-600 shadow-sm',
    inactiveBtn: 'bg-white text-violet-900 border-violet-200 hover:bg-violet-50',
  },
  {
    key: 'accuracy',
    label: 'Kết quả chính xác',
    shortDesc: 'Đúng trọng tâm kiến thức',
    headerBg: 'bg-emerald-100/90',
    headerText: 'text-emerald-900',
    activeBtn: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-emerald-600 shadow-sm',
    inactiveBtn: 'bg-white text-emerald-900 border-emerald-200 hover:bg-emerald-50',
  },
  {
    key: 'creativity',
    label: 'Trình bày sáng tạo',
    shortDesc: 'Rõ ràng, mạch lạc, ấn tượng',
    headerBg: 'bg-amber-100/90',
    headerText: 'text-amber-900',
    activeBtn: 'bg-gradient-to-br from-amber-500 to-orange-500 text-white border-amber-600 shadow-sm',
    inactiveBtn: 'bg-white text-amber-900 border-amber-200 hover:bg-amber-50',
  },
];

function emptyCriteria(): RubricCriteriaScores {
  return {
    participation: 0,
    collaboration: 0,
    accuracy: 0,
    creativity: 0,
  };
}

function sumCriteria(c: RubricCriteriaScores): number {
  return Number((c.participation + c.collaboration + c.accuracy + c.creativity).toFixed(2));
}

function calcFinalScore(baseScore: number, penaltyPoints: number, bonusPoints: number): number {
  return Math.min(10, Math.max(0, Number((baseScore - penaltyPoints + bonusPoints).toFixed(2))));
}

function rankTopTwoEntries(entries: GroupGradeEntry[]): GroupGradeEntry[] {
  return [...entries]
    .filter((e) => e.finalScore > 0)
    .sort(
      (a, b) =>
        b.finalScore - a.finalScore ||
        b.baseScore - a.baseScore ||
        b.bonusPoints - a.bonusPoints ||
        a.groupNumber - b.groupNumber
    )
    .slice(0, 2);
}

function applyTopTwoPrivileges(entries: GroupGradeEntry[], swapped: boolean): GroupGradeEntry[] {
  const topTwo = rankTopTwoEntries(entries);
  const firstGroup = topTwo[0]?.groupNumber;
  const secondGroup = topTwo[1]?.groupNumber;

  const firstCard: PrivilegeCardType = swapped ? 'SOS' : 'NO_HOMEWORK';
  const secondCard: PrivilegeCardType = swapped ? 'NO_HOMEWORK' : 'SOS';

  return entries.map((e) => {
    if (firstGroup !== undefined && e.groupNumber === firstGroup) {
      return { ...e, privilegeCard: firstCard };
    }
    if (secondGroup !== undefined && e.groupNumber === secondGroup) {
      return { ...e, privilegeCard: secondCard };
    }
    return { ...e, privilegeCard: null };
  });
}

function detectSwappedFromEntries(entries?: GroupGradeEntry[]): boolean {
  if (!entries || entries.length === 0) return false;
  const topTwo = rankTopTwoEntries(entries);
  if (topTwo.length < 2) return false;
  return topTwo[0].privilegeCard === 'SOS' && topTwo[1].privilegeCard === 'NO_HOMEWORK';
}

function normalizeEightGradeEntries(existing?: GroupGradeEntry[]): GroupGradeEntry[] {
  const initialSwapped = detectSwappedFromEntries(existing);
  const baseEntries = GROUP_NUMBERS.map((groupNumber) => {
    const found = existing?.find((e) => e.groupNumber === groupNumber);
    if (found) {
      const baseScore = Number(found.baseScore ?? 0);
      const bonusPoints = Number(found.bonusPoints ?? 0);
      const penaltyPoints = Number(found.penaltyPoints ?? 0);
      return {
        groupNumber,
        baseScore,
        bonusPoints,
        penaltyPoints,
        finalScore: calcFinalScore(baseScore, penaltyPoints, bonusPoints),
        feedback: found.feedback || '',
        criteria: found.criteria ? { ...found.criteria } : undefined,
        privilegeCard: found.privilegeCard ?? null,
      };
    }
    return {
      groupNumber,
      baseScore: 0,
      bonusPoints: 0,
      penaltyPoints: 0,
      finalScore: 0,
      feedback: '',
      criteria: emptyCriteria(),
      privilegeCard: null,
    };
  });

  return applyTopTwoPrivileges(baseEntries, initialSwapped);
}

function formatStepLabel(val: number): string {
  return String(val).replace('.', ',');
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
  const [privilegeSwapped, setPrivilegeSwapped] = useState<boolean>(() =>
    detectSwappedFromEntries(existingGrade?.entries)
  );
  const [entries, setEntries] = useState<GroupGradeEntry[]>(() =>
    normalizeEightGradeEntries(existingGrade?.entries)
  );
  const [published, setPublished] = useState<boolean>(existingGrade?.publishedToStudents ?? true);
  const [viewMode, setViewMode] = useState<'rubric' | 'live' | 'spreadsheet'>('rubric');
  const [sheetScope, setSheetScope] = useState<'groups' | 'students'>('students');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const foundGrade = grades.find((g) => g.classId === classId && g.date === selectedDate);
    const foundAssignment = assignments.find((a) => a.classId === classId && a.date === selectedDate);
    if (foundGrade) {
      setLessonTopic(foundGrade.lessonTopic);
      setPrivilegeSwapped(detectSwappedFromEntries(foundGrade.entries));
      setEntries(normalizeEightGradeEntries(foundGrade.entries));
      setPublished(foundGrade.publishedToStudents);
    } else {
      setLessonTopic(
        foundAssignment?.lessonTopic || `Buổi học ngày ${selectedDate} — Lớp ${classId}`
      );
      setPrivilegeSwapped(false);
      setEntries(normalizeEightGradeEntries());
      setPublished(true);
    }
    setMessage('');
  }, [classId, selectedDate, grades, assignments]);

  const updateEntry = (groupNumber: GroupNumber, patch: Partial<GroupGradeEntry>) => {
    setEntries((prev) => {
      const updated = prev.map((e) => {
        if (e.groupNumber !== groupNumber) return e;
        const base = patch.baseScore !== undefined ? patch.baseScore : e.baseScore;
        const bonus = patch.bonusPoints !== undefined ? patch.bonusPoints : e.bonusPoints;
        const penalty = patch.penaltyPoints !== undefined ? patch.penaltyPoints : e.penaltyPoints;
        return {
          ...e,
          ...patch,
          finalScore: calcFinalScore(base, penalty, bonus),
        };
      });
      return applyTopTwoPrivileges(updated, privilegeSwapped);
    });
  };

  const handleCriterionSelect = (
    groupNumber: GroupNumber,
    key: keyof RubricCriteriaScores,
    val: number
  ) => {
    setEntries((prev) => {
      const updated = prev.map((e) => {
        if (e.groupNumber !== groupNumber) return e;
        const currentCriteria = e.criteria ? { ...e.criteria } : emptyCriteria();
        // Toggle off if clicking the same score again, otherwise set new score
        const nextVal = currentCriteria[key] === val ? 0 : val;
        const nextCriteria: RubricCriteriaScores = {
          ...currentCriteria,
          [key]: nextVal,
        };
        const nextBase = sumCriteria(nextCriteria);
        return {
          ...e,
          criteria: nextCriteria,
          baseScore: nextBase,
          finalScore: calcFinalScore(nextBase, e.penaltyPoints, e.bonusPoints),
        };
      });
      return applyTopTwoPrivileges(updated, privilegeSwapped);
    });
  };

  const adjustPoints = (
    groupNumber: GroupNumber,
    field: 'bonusPoints' | 'penaltyPoints',
    delta: number
  ) => {
    setEntries((prev) => {
      const updated = prev.map((e) => {
        if (e.groupNumber !== groupNumber) return e;
        const nextVal = Math.max(0, Number((e[field] + delta).toFixed(1)));
        const nextEntry = { ...e, [field]: nextVal };
        nextEntry.finalScore = calcFinalScore(
          nextEntry.baseScore,
          nextEntry.penaltyPoints,
          nextEntry.bonusPoints
        );
        return nextEntry;
      });
      return applyTopTwoPrivileges(updated, privilegeSwapped);
    });
  };

  const handleSwapPrivileges = () => {
    const nextSwapped = !privilegeSwapped;
    setPrivilegeSwapped(nextSwapped);
    setEntries((prev) => applyTopTwoPrivileges(prev, nextSwapped));
  };

  const handleResetAllScores = () => {
    setPrivilegeSwapped(false);
    setEntries(normalizeEightGradeEntries());
    setMessage('Đã đặt lại bảng điểm về 0 để bắt đầu chấm phiên mới.');
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
        `Đã lưu bảng điểm ngày ${selectedDate} (kèm 4 tiêu chí & Thẻ đặc quyền) cho cả 8 Nhóm và ${classStudents.length} học sinh Lớp ${classId}.`
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

  const noHomeworkEntry = entries.find((e) => e.privilegeCard === 'NO_HOMEWORK') || null;
  const sosEntry = entries.find((e) => e.privilegeCard === 'SOS') || null;
  const hasAnyScore = entries.some((e) => e.finalScore > 0);

  return (
    <div className="space-y-6">
      {/* Control Header */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-[0_10px_30px_-14px_rgba(15,23,42,0.1)]">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 text-balance">
              Bảng Tiêu chí Chấm điểm &amp; Đặc quyền Top 2 — Lớp {classId}
            </h2>
            <p className="text-sm sm:text-base text-slate-600 mt-1">
              Chọn điểm cho <strong>4 tiêu chí (1 · 1,5 · 2 · 2,5 đ)</strong> trên từng hàng nhóm, kết hợp{' '}
              <strong>Cộng / Trừ (tối đa 10 đ)</strong>. Hai nhóm điểm cao nhất tự động nhận thẻ{' '}
              <strong className="text-emerald-700">No Homework</strong> và{' '}
              <strong className="text-rose-600">SOS</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex flex-wrap items-center gap-1 p-1.5 bg-slate-100 rounded-2xl w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setViewMode('rubric')}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm font-bold rounded-xl transition-colors whitespace-nowrap ${
                  viewMode === 'rubric'
                    ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-sm'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                Bảng 4 Tiêu chí
              </button>
              <button
                type="button"
                onClick={() => setViewMode('live')}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm font-bold rounded-xl transition-colors whitespace-nowrap ${
                  viewMode === 'live'
                    ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-sm'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                Thẻ Cộng/Trừ
              </button>
              <button
                type="button"
                onClick={() => setViewMode('spreadsheet')}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm font-bold rounded-xl transition-colors whitespace-nowrap ${
                  viewMode === 'spreadsheet'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <Table2 className="w-4 h-4" />
                Bảng tính &amp; Excel
              </button>
            </div>

            <div className="relative w-full sm:w-auto">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => onDateChange(e.target.value)}
                className="w-full sm:w-auto pl-9 pr-3 py-2 text-sm font-mono font-semibold tabular-nums border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <button
              type="button"
              onClick={() =>
                exportSessionGradebookToExcel(classId, buildCurrentGradeRecord(), classStudents)
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Xuất Excel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-extrabold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60 rounded-xl shadow-sm transition-colors whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Đang lưu...' : 'Lưu bảng điểm'}
            </button>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
            <label className="text-sm font-bold text-slate-700 shrink-0">Nội dung tiết học:</label>
            <input
              type="text"
              value={lessonTopic}
              onChange={(e) => setLessonTopic(e.target.value)}
              className="w-full sm:flex-1 px-3.5 py-2 text-sm sm:text-base font-medium border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Công khai điểm &amp; Thẻ đặc quyền khi quét QR
            </label>

            <button
              type="button"
              onClick={handleResetAllScores}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-rose-700 bg-slate-100 hover:bg-rose-50 rounded-xl transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Đặt lại 0đ
            </button>
          </div>
        </div>

        {message && (
          <div className="mt-3 p-3 text-sm font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-2xl">
            {message}
          </div>
        )}
      </div>

      {/* Automatic Top-2 Privilege Cards Spotlight (No Homework & SOS) with Swap Button */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-[0_10px_28px_-12px_rgba(15,23,42,0.1)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
              2 Thẻ Đặc Quyền Tự Động (Top 2 Nhóm Điểm Cao Nhất)
            </h3>
            <p className="text-sm text-slate-600">
              Hệ thống tự động chọn 2 nhóm có tổng điểm cao nhất để trao thẻ <strong>No Homework</strong> và <strong>SOS</strong>. Bấm nút giữa để hoán đổi 2 thẻ cho nhau.
            </p>
          </div>
        </div>

        {!hasAnyScore ? (
          <div className="p-6 rounded-2xl border-2 border-dashed border-sky-200 bg-sky-50/60 text-center text-sm sm:text-base font-semibold text-sky-900">
            Chưa có điểm số trong buổi học. Hãy chấm các tiêu chí ở bảng bên dưới để hệ thống tự động hiện 2 thẻ đặc quyền <strong>No Homework</strong> và <strong>SOS</strong>!
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-11 gap-4 items-center">
            {/* Card 1: NO HOMEWORK */}
            <motion.div
              layout
              key={`nohw-${noHomeworkEntry?.groupNumber ?? 'none'}`}
              initial={{ opacity: 0.85, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              className="lg:col-span-5 rounded-3xl p-5 sm:p-6 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 text-white shadow-[0_14px_30px_-10px_rgba(16,185,129,0.5)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-emerald-50 flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-amber-200 shrink-0" />
                    <span>Thẻ Đặc Quyền #1</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 font-display">
                    NO HOMEWORK
                  </div>
                  <p className="text-xs sm:text-sm text-white/90 mt-1">
                    Đặc quyền miễn Bài tập về nhà buổi học hôm nay!
                  </p>
                </div>

                {noHomeworkEntry && (
                  <div className="text-right shrink-0 bg-white/20 backdrop-blur-xs px-3.5 py-2 rounded-2xl border border-white/25">
                    <div className="text-xs font-bold text-white/90">
                      {GROUP_THEMES[noHomeworkEntry.groupNumber].teamLabel}
                    </div>
                    <div className="text-xl sm:text-2xl font-extrabold font-display">
                      Nhóm {noHomeworkEntry.groupNumber}
                    </div>
                    <div className="text-sm font-mono font-extrabold tabular-nums text-amber-200">
                      {noHomeworkEntry.finalScore.toFixed(1)} đ
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Center Swap Button */}
            <div className="lg:col-span-1 flex items-center justify-center">
              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.93 }}
                type="button"
                disabled={!noHomeworkEntry || !sosEntry}
                onClick={handleSwapPrivileges}
                title="Đổi thẻ No Homework và SOS giữa 2 nhóm"
                className="w-full lg:w-auto inline-flex lg:flex-col items-center justify-center gap-1.5 px-4 py-3 min-h-[48px] text-sm font-extrabold text-slate-900 bg-amber-300 hover:bg-amber-400 disabled:opacity-45 rounded-2xl shadow-sm border border-amber-400 transition-colors cursor-pointer"
              >
                <ArrowLeftRight className="w-5 h-5 shrink-0" />
                <span className="text-xs font-extrabold whitespace-nowrap">Đổi thẻ</span>
              </motion.button>
            </div>

            {/* Card 2: SOS */}
            <motion.div
              layout
              key={`sos-${sosEntry?.groupNumber ?? 'none'}`}
              initial={{ opacity: 0.85, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              className="lg:col-span-5 rounded-3xl p-5 sm:p-6 bg-gradient-to-br from-rose-500 via-pink-500 to-orange-500 text-white shadow-[0_14px_30px_-10px_rgba(244,63,94,0.48)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-rose-50 flex items-center gap-1.5">
                    <LifeBuoy className="w-4 h-4 text-amber-200 shrink-0" />
                    <span>Thẻ Đặc Quyền #2</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 font-display">
                    THẺ SOS
                  </div>
                  <p className="text-xs sm:text-sm text-white/90 mt-1">
                    Quyền cứu trợ đặc biệt hoặc gợi ý trực tiếp từ Thầy/Cô!
                  </p>
                </div>

                {sosEntry ? (
                  <div className="text-right shrink-0 bg-white/20 backdrop-blur-xs px-3.5 py-2 rounded-2xl border border-white/25">
                    <div className="text-xs font-bold text-white/90">
                      {GROUP_THEMES[sosEntry.groupNumber].teamLabel}
                    </div>
                    <div className="text-xl sm:text-2xl font-extrabold font-display">
                      Nhóm {sosEntry.groupNumber}
                    </div>
                    <div className="text-sm font-mono font-extrabold tabular-nums text-amber-200">
                      {sosEntry.finalScore.toFixed(1)} đ
                    </div>
                  </div>
                ) : (
                  <div className="text-xs font-semibold text-white/85 bg-white/15 px-3 py-2 rounded-2xl shrink-0">
                    Chờ nhóm thứ 2 có điểm
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </div>

      {/* MODE 1 (DEFAULT): 4-Criteria Grading Matrix (Rows = 8 Groups, Columns = 4 Criteria [1 | 1.5 | 2 | 2.5]) */}
      {viewMode === 'rubric' && (
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-[0_12px_32px_-14px_rgba(15,23,42,0.12)]">
          <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-sky-50 via-violet-50 to-amber-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-lg sm:text-xl font-extrabold text-slate-900">
                Ma trận Chấm điểm 4 Tiêu chí Hoạt động Nhóm (Tối đa 10 điểm)
              </h3>
              <p className="text-xs sm:text-sm text-slate-600">
                Mỗi tiêu chí gồm 4 mức: <strong>1 · 1,5 · 2 · 2,5 điểm</strong>. Chạm trực tiếp vào mức điểm để cộng tự động cho cả nhóm.
              </p>
            </div>
            <div className="text-sm font-mono font-extrabold tabular-nums text-blue-700 whitespace-nowrap">
              TB cả lớp: {averageClassScore.toFixed(1)} / 10 đ
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1060px]">
              <thead>
                <tr className="border-b-2 border-slate-200 text-sm">
                  <th className="py-3.5 px-4 bg-slate-100 text-slate-900 font-extrabold w-48">
                    Nhóm (Hàng)
                  </th>
                  {RUBRIC_CRITERIA.map((col, cIdx) => (
                    <th
                      key={col.key}
                      className={`py-3.5 px-3 border-l border-slate-200 ${col.headerBg} ${col.headerText}`}
                    >
                      <div className="font-extrabold text-sm sm:text-base">
                        {cIdx + 1}. {col.label}
                      </div>
                      <div className="text-xs font-medium opacity-85 mt-0.5">
                        {col.shortDesc} (1–2,5đ)
                      </div>
                    </th>
                  ))}
                  <th className="py-3.5 px-3 border-l border-slate-200 bg-slate-100 text-slate-900 font-extrabold text-center w-36">
                    Cộng / Trừ
                  </th>
                  <th className="py-3.5 px-3 border-l border-slate-200 bg-blue-50 text-blue-900 font-extrabold text-center w-28">
                    Tổng điểm
                  </th>
                  <th className="py-3.5 px-4 border-l border-slate-200 bg-slate-100 text-slate-900 font-extrabold text-center w-40">
                    Đặc quyền
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {entries.map((entry) => {
                  const teamTheme = GROUP_THEMES[entry.groupNumber];
                  const members = classStudents.filter((s) => s.groupNumber === entry.groupNumber);
                  const leader = members.find((m) => m.isLeader);

                  return (
                    <tr
                      key={entry.groupNumber}
                      className="hover:bg-sky-50/35 transition-colors align-middle"
                    >
                      {/* Group Row Label */}
                      <td className="py-3.5 px-4">
                        <div className={`rounded-2xl px-3.5 py-2.5 bg-gradient-to-r ${teamTheme.gradientHeader} text-white shadow-xs`}>
                          <div className="text-base sm:text-lg font-extrabold font-display leading-tight">
                            Nhóm {entry.groupNumber}
                          </div>
                          <div className="text-xs font-bold text-white/90">
                            {teamTheme.teamLabel} · {members.length} HS
                          </div>
                          {leader && (
                            <div className="text-[11px] font-bold text-amber-200 flex items-center gap-1 mt-0.5 truncate">
                              <Crown className="w-3 h-3 shrink-0" />
                              <span className="truncate">{leader.name}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 4 Criteria Columns (each with 1 | 1.5 | 2 | 2.5 buttons) */}
                      {RUBRIC_CRITERIA.map((col) => {
                        const selectedVal = entry.criteria?.[col.key] ?? 0;
                        return (
                          <td key={col.key} className="py-3 px-2.5 border-l border-slate-200">
                            <div className="grid grid-cols-4 gap-1.5">
                              {RUBRIC_SCORE_STEPS.map((stepVal) => {
                                const isActive = selectedVal === stepVal;
                                return (
                                  <motion.button
                                    key={stepVal}
                                    whileTap={{ scale: 0.92 }}
                                    type="button"
                                    onClick={() =>
                                      handleCriterionSelect(entry.groupNumber, col.key, stepVal)
                                    }
                                    className={`min-h-[42px] px-1.5 py-2 text-sm font-mono font-extrabold tabular-nums rounded-xl border transition-all cursor-pointer ${
                                      isActive ? col.activeBtn : col.inactiveBtn
                                    }`}
                                  >
                                    {formatStepLabel(stepVal)}
                                  </motion.button>
                                );
                              })}
                            </div>
                          </td>
                        );
                      })}

                      {/* Quick Bonus / Penalty */}
                      <td className="py-3 px-2.5 border-l border-slate-200 text-center">
                        <div className="flex flex-col gap-1.5 items-center">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => adjustPoints(entry.groupNumber, 'bonusPoints', 0.5)}
                              className="px-2.5 py-1 text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
                            >
                              +0,5
                            </button>
                            <button
                              type="button"
                              onClick={() => adjustPoints(entry.groupNumber, 'penaltyPoints', 0.5)}
                              className="px-2.5 py-1 text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
                            >
                              −0,5
                            </button>
                          </div>
                          <div className="text-xs font-mono font-bold tabular-nums text-slate-600">
                            <span className="text-emerald-700">+{entry.bonusPoints}</span>
                            {' / '}
                            <span className="text-rose-700">−{entry.penaltyPoints}</span>
                          </div>
                        </div>
                      </td>

                      {/* Total Score (Max 10) */}
                      <td className="py-3 px-3 border-l border-slate-200 text-center bg-blue-50/40">
                        <motion.div
                          key={entry.finalScore}
                          initial={{ scale: 1.22 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                          className="text-2xl font-extrabold font-mono tabular-nums text-blue-700"
                        >
                          {entry.finalScore.toFixed(1)}
                        </motion.div>
                        <div className="text-[11px] font-semibold text-slate-500 font-mono">
                          Gốc: {entry.baseScore.toFixed(1)}đ
                        </div>
                      </td>

                      {/* Privilege Card Slot */}
                      <td className="py-3 px-3 border-l border-slate-200 text-center">
                        <AnimatePresence mode="wait">
                          {entry.privilegeCard === 'NO_HOMEWORK' ? (
                            <motion.div
                              key="NO_HOMEWORK"
                              initial={{ opacity: 0, scale: 0.85 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.85 }}
                              className="inline-flex flex-col items-center px-3 py-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-sm w-full"
                            >
                              <span className="text-xs font-extrabold flex items-center gap-1">
                                <Trophy className="w-3.5 h-3.5 text-amber-200 shrink-0" />
                                NO HOMEWORK
                              </span>
                              <span className="text-[10px] font-medium text-emerald-50">
                                Miễn BTVN
                              </span>
                            </motion.div>
                          ) : entry.privilegeCard === 'SOS' ? (
                            <motion.div
                              key="SOS"
                              initial={{ opacity: 0, scale: 0.85 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.85 }}
                              className="inline-flex flex-col items-center px-3 py-2 rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-sm w-full"
                            >
                              <span className="text-xs font-extrabold flex items-center gap-1">
                                <LifeBuoy className="w-3.5 h-3.5 text-amber-200 shrink-0" />
                                THẺ SOS
                              </span>
                              <span className="text-[10px] font-medium text-rose-50">
                                Cứu trợ đặc biệt
                              </span>
                            </motion.div>
                          ) : (
                            <span className="text-xs font-medium text-slate-400">—</span>
                          )}
                        </AnimatePresence>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODE 2: Live Activity Grading Cards for 8 Groups */}
      {viewMode === 'live' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {entries.map((entry, idx) => {
            const groupMembers = classStudents.filter((s) => s.groupNumber === entry.groupNumber);
            const leader = groupMembers.find((m) => m.isLeader);
            const assignedCardsCount =
              activeAssignment?.groups[entry.groupNumber]?.cardIds.length ?? 0;
            const teamTheme = GROUP_THEMES[entry.groupNumber];

            return (
              <motion.div
                key={entry.groupNumber}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 280, damping: 24, delay: idx * 0.04 }}
                className="bg-white border border-slate-200/90 rounded-3xl overflow-hidden flex flex-col justify-between shadow-[0_10px_26px_-12px_rgba(15,23,42,0.1)]"
              >
                {/* Color-coded Card Header */}
                <div className={`px-5 py-4 bg-gradient-to-r ${teamTheme.gradientHeader} text-white flex items-start justify-between gap-3`}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-white/90">
                      <span className="font-bold">{teamTheme.teamLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{groupMembers.length} TV</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{assignedCardsCount} thẻ</span>
                      {leader && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-bold inline-flex items-center gap-1 text-amber-200">
                            <Crown className="w-3.5 h-3.5" /> {leader.name}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 mt-1">
                      <h3 className="text-xl sm:text-2xl font-extrabold">Nhóm {entry.groupNumber}</h3>
                      {entry.privilegeCard === 'NO_HOMEWORK' && (
                        <span className="px-2.5 py-0.5 rounded-xl bg-emerald-950/35 border border-white/30 text-xs font-extrabold text-amber-200">
                          NO HOMEWORK
                        </span>
                      )}
                      {entry.privilegeCard === 'SOS' && (
                        <span className="px-2.5 py-0.5 rounded-xl bg-rose-950/35 border border-white/30 text-xs font-extrabold text-amber-200">
                          THẺ SOS
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Animated Final Score Display */}
                  <div className="text-right shrink-0">
                    <div className="text-xs font-semibold text-white/85">
                      {entry.baseScore} − {entry.penaltyPoints} + {entry.bonusPoints}
                    </div>
                    <motion.div
                      key={entry.finalScore}
                      initial={{ scale: 1.24, y: -2 }}
                      animate={{ scale: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                      className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-white"
                    >
                      {entry.finalScore.toFixed(1)} đ
                    </motion.div>
                  </div>
                </div>

                <div className="p-4 sm:p-5 space-y-4">
                  {/* Base Score + Quick Bonus + Quick Penalty */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Điểm cho */}
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                      <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1.5">
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
                        className="w-full px-2.5 py-1.5 text-base font-mono font-extrabold tabular-nums bg-white border border-slate-200 rounded-xl"
                      />
                      <div className="flex items-center gap-1 mt-1.5">
                        {[7, 8, 9, 10].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => updateEntry(entry.groupNumber, { baseScore: v })}
                            className={`flex-1 py-1 text-xs font-mono font-bold rounded-lg border transition-colors ${
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
                    <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs sm:text-sm font-bold text-emerald-800">Điểm cộng (+)</span>
                        <motion.span
                          key={entry.bonusPoints}
                          initial={{ scale: 1.25 }}
                          animate={{ scale: 1 }}
                          className="text-base font-mono font-extrabold tabular-nums text-emerald-700"
                        >
                          +{entry.bonusPoints}
                        </motion.span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          type="button"
                          onClick={() => adjustPoints(entry.groupNumber, 'bonusPoints', 0.5)}
                          className="py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center justify-center gap-0.5"
                        >
                          <Plus className="w-3 h-3" />0.5
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          type="button"
                          onClick={() => adjustPoints(entry.groupNumber, 'bonusPoints', 1)}
                          className="py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center justify-center gap-0.5"
                        >
                          <Plus className="w-3 h-3" />1
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          type="button"
                          onClick={() => adjustPoints(entry.groupNumber, 'bonusPoints', -0.5)}
                          className="py-2 text-xs font-semibold text-emerald-800 bg-white border border-emerald-200 hover:bg-emerald-100 rounded-xl"
                        >
                          -0.5
                        </motion.button>
                      </div>
                    </div>

                    {/* Điểm trừ (-) */}
                    <div className="p-3.5 bg-rose-50/80 border border-rose-200 rounded-2xl">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs sm:text-sm font-bold text-rose-800">Điểm trừ (−)</span>
                        <motion.span
                          key={entry.penaltyPoints}
                          initial={{ scale: 1.25 }}
                          animate={{ scale: 1 }}
                          className="text-base font-mono font-extrabold tabular-nums text-rose-700"
                        >
                          −{entry.penaltyPoints}
                        </motion.span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          type="button"
                          onClick={() => adjustPoints(entry.groupNumber, 'penaltyPoints', 0.5)}
                          className="py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl flex items-center justify-center gap-0.5"
                        >
                          <Minus className="w-3 h-3" />0.5
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          type="button"
                          onClick={() => adjustPoints(entry.groupNumber, 'penaltyPoints', 1)}
                          className="py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl flex items-center justify-center gap-0.5"
                        >
                          <Minus className="w-3 h-3" />1
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          type="button"
                          onClick={() => adjustPoints(entry.groupNumber, 'penaltyPoints', -0.5)}
                          className="py-2 text-xs font-semibold text-rose-800 bg-white border border-rose-200 hover:bg-rose-100 rounded-xl"
                        >
                          Hoàn
                        </motion.button>
                      </div>
                    </div>
                  </div>

                  {/* Members preview & Feedback */}
                  <div className="space-y-2">
                    <div className="text-xs sm:text-sm text-slate-600">
                      <span className="font-bold text-slate-800">Học sinh nhận {entry.finalScore.toFixed(1)}đ: </span>
                      {groupMembers.length > 0
                        ? groupMembers.map((m) => m.name).join(', ')
                        : 'Chưa có thành viên'}
                    </div>
                    <input
                      type="text"
                      value={entry.feedback}
                      onChange={(e) => updateEntry(entry.groupNumber, { feedback: e.target.value })}
                      placeholder="Nhận xét hoạt động của nhóm..."
                      className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* MODE 3: Spreadsheet-Style Gradebook Table + Excel Export */}
      {viewMode === 'spreadsheet' && (
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-[0_10px_28px_-12px_rgba(15,23,42,0.1)]">
          <div className="p-4 sm:px-6 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setSheetScope('students')}
                className={`flex-1 sm:flex-none px-3.5 py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${
                  sheetScope === 'students' ? 'bg-blue-600 text-white' : 'text-slate-600'
                }`}
              >
                Từng Học sinh ({classStudents.length} HS)
              </button>
              <button
                type="button"
                onClick={() => setSheetScope('groups')}
                className={`flex-1 sm:flex-none px-3.5 py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${
                  sheetScope === 'groups' ? 'bg-blue-600 text-white' : 'text-slate-600'
                }`}
              >
                Tổng hợp 8 Nhóm (TB: {averageClassScore}đ)
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                exportSessionGradebookToExcel(classId, buildCurrentGradeRecord(), classStudents)
              }
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Xuất Excel Danh sách Học sinh (.xlsx)
            </button>
          </div>

          {sheetScope === 'groups' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-extrabold">
                    <th className="py-3 px-3 border-r border-slate-200">Nhóm</th>
                    <th className="py-3 px-3 border-r border-slate-200">Nhóm trưởng</th>
                    <th className="py-3 px-3 border-r border-slate-200 text-right">Tham gia</th>
                    <th className="py-3 px-3 border-r border-slate-200 text-right">Hợp tác</th>
                    <th className="py-3 px-3 border-r border-slate-200 text-right">Chính xác</th>
                    <th className="py-3 px-3 border-r border-slate-200 text-right">Sáng tạo</th>
                    <th className="py-3 px-3 border-r border-slate-200 text-right">Cộng/Trừ</th>
                    <th className="py-3 px-3 border-r border-slate-200 text-right text-blue-700">Tổng</th>
                    <th className="py-3 px-3 border-r border-slate-200 text-center">Đặc quyền</th>
                    <th className="py-3 px-3">Nhận xét</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {entries.map((e) => {
                    const members = classStudents.filter((s) => s.groupNumber === e.groupNumber);
                    const leader = members.find((m) => m.isLeader);
                    return (
                      <tr key={e.groupNumber} className="hover:bg-blue-50/40">
                        <td className="py-3 px-3 border-r border-slate-200 font-extrabold text-slate-900">
                          Nhóm {e.groupNumber}
                        </td>
                        <td className="py-3 px-3 border-r border-slate-200 text-slate-700">
                          {leader ? leader.name : '—'}
                        </td>
                        <td className="py-3 px-3 border-r border-slate-200 text-right font-mono tabular-nums">
                          {e.criteria?.participation ? e.criteria.participation : '—'}
                        </td>
                        <td className="py-3 px-3 border-r border-slate-200 text-right font-mono tabular-nums">
                          {e.criteria?.collaboration ? e.criteria.collaboration : '—'}
                        </td>
                        <td className="py-3 px-3 border-r border-slate-200 text-right font-mono tabular-nums">
                          {e.criteria?.accuracy ? e.criteria.accuracy : '—'}
                        </td>
                        <td className="py-3 px-3 border-r border-slate-200 text-right font-mono tabular-nums">
                          {e.criteria?.creativity ? e.criteria.creativity : '—'}
                        </td>
                        <td className="py-3 px-3 border-r border-slate-200 text-right font-mono tabular-nums">
                          <span className="text-emerald-700">+{e.bonusPoints}</span> /{' '}
                          <span className="text-rose-700">−{e.penaltyPoints}</span>
                        </td>
                        <td className="py-3 px-3 border-r border-slate-200 text-right font-mono font-extrabold tabular-nums text-blue-700 text-base">
                          {e.finalScore.toFixed(1)}
                        </td>
                        <td className="py-3 px-3 border-r border-slate-200 text-center font-bold">
                          {e.privilegeCard === 'NO_HOMEWORK' ? (
                            <span className="text-emerald-700">No Homework</span>
                          ) : e.privilegeCard === 'SOS' ? (
                            <span className="text-rose-600">SOS</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600">{e.feedback || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse min-w-[920px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-extrabold">
                    <th className="py-3 px-3 border-r border-slate-200 text-center">STT</th>
                    <th className="py-3 px-3 border-r border-slate-200">Họ và tên</th>
                    <th className="py-3 px-3 border-r border-slate-200">Ngày sinh</th>
                    <th className="py-3 px-3 border-r border-slate-200 text-center">Tổ</th>
                    <th className="py-3 px-3 border-r border-slate-200 text-center">Nhóm</th>
                    <th className="py-3 px-3 border-r border-slate-200">Vai trò</th>
                    <th className="py-3 px-3 border-r border-slate-200 text-right">Điểm cho</th>
                    <th className="py-3 px-3 border-r border-slate-200 text-right text-rose-700">Trừ</th>
                    <th className="py-3 px-3 border-r border-slate-200 text-right text-emerald-700">Cộng</th>
                    <th className="py-3 px-3 border-r border-slate-200 text-right text-blue-700">Điểm (tối đa 10)</th>
                    <th className="py-3 px-3 text-center">Thẻ đặc quyền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {[...classStudents]
                    .sort(
                      (a, b) =>
                        a.groupNumber - b.groupNumber ||
                        Number(b.isLeader) - Number(a.isLeader) ||
                        a.name.localeCompare(b.name, 'vi')
                    )
                    .map((stu, idx) => {
                      const ge = entries.find((e) => e.groupNumber === stu.groupNumber);
                      const base = ge?.baseScore ?? 0;
                      const penalty = ge?.penaltyPoints ?? 0;
                      const bonus = ge?.bonusPoints ?? 0;
                      const finalScore = ge?.finalScore ?? 0;
                      return (
                        <tr key={stu.id} className="hover:bg-blue-50/40">
                          <td className="py-2.5 px-3 border-r border-slate-200 text-center font-mono tabular-nums text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 border-r border-slate-200 font-bold text-slate-900">
                            {stu.name}
                          </td>
                          <td className="py-2.5 px-3 border-r border-slate-200 font-mono tabular-nums text-slate-600">
                            {stu.birthDate || '—'}
                          </td>
                          <td className="py-2.5 px-3 border-r border-slate-200 text-center font-mono">
                            {stu.to}
                          </td>
                          <td className="py-2.5 px-3 border-r border-slate-200 text-center font-mono font-extrabold text-blue-700">
                            {stu.groupNumber}
                          </td>
                          <td className="py-2.5 px-3 border-r border-slate-200 text-slate-600">
                            {stu.isLeader ? 'Nhóm trưởng' : 'Thành viên'}
                          </td>
                          <td className="py-2.5 px-3 border-r border-slate-200 text-right font-mono tabular-nums">
                            {base.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-3 border-r border-slate-200 text-right font-mono tabular-nums text-rose-700">
                            −{penalty.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-3 border-r border-slate-200 text-right font-mono tabular-nums text-emerald-700">
                            +{bonus.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-3 border-r border-slate-200 text-right font-mono font-extrabold tabular-nums text-blue-700 text-base">
                            {finalScore.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-3 text-center text-xs font-extrabold">
                            {ge?.privilegeCard === 'NO_HOMEWORK' ? (
                              <span className="text-emerald-700">No Homework</span>
                            ) : ge?.privilegeCard === 'SOS' ? (
                              <span className="text-rose-600">SOS</span>
                            ) : (
                              '—'
                            )}
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
      <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            Lịch sử bảng điểm đã lưu theo ngày — Lớp {classId} ({classHistory.length} buổi)
          </h3>

          {classHistory.length > 0 && (
            <button
              type="button"
              onClick={() => exportAllGradesToExcel(classId, classHistory, classStudents)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap self-start"
            >
              <Download className="w-4 h-4" />
              Xuất tất cả lịch sử Excel
            </button>
          )}
        </div>

        {classHistory.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-2xl">
            Chưa có lịch sử chấm điểm nào cho Lớp {classId}. Hãy chấm và nhấn &quot;Lưu bảng điểm&quot; ở trên.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs sm:text-sm text-slate-600">
                  <th className="py-2.5 pr-4 font-bold">Ngày học</th>
                  <th className="py-2.5 px-3 font-bold">Chủ đề</th>
                  <th className="py-2.5 px-3 font-bold">Điểm tổng 8 Nhóm</th>
                  <th className="py-2.5 pl-3 font-bold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classHistory.map((rec) => {
                  const ordered = [...rec.entries].sort((a, b) => a.groupNumber - b.groupNumber);
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50">
                      <td className="py-3 pr-4 font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                        {rec.date}
                      </td>
                      <td className="py-3 px-3 text-slate-700 font-medium">{rec.lessonTopic}</td>
                      <td className="py-3 px-3 text-xs sm:text-sm font-mono tabular-nums text-slate-700">
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
                          className="text-sm font-bold text-blue-700 hover:underline"
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
