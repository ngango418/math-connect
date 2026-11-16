import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Calendar,
  Check,
  Copy,
  Crown,
  Edit3,
  ExternalLink,
  Plus,
  Printer,
  QrCode,
  Save,
  Settings2,
  Shuffle,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  GROUP_NUMBERS,
  type ClassId,
  type CoreMission,
  type DailyAssignmentRecord,
  type GroupDailyPlan,
  type GroupNumber,
  type MissionAllocationConfig,
  type MissionCard,
  type Student,
} from '../../shared/types.ts';
import {
  addMissionCard,
  deleteMissionCard,
  saveAllocationConfig,
  saveDailyAssignment,
  updateCoreMission,
} from '../lib/api.ts';
import { autoDealMissionCards } from '../lib/balancedRandom.ts';
import { createEmptyEightGroups } from '../lib/defaultSeedData.ts';
import { GROUP_THEMES, MISSION_THEMES } from '../lib/themePalette.ts';
import { buildStudentQrUrl } from '../../shared/qrToken.ts';
import { QrCodeBox } from './QrCodeBox.tsx';

interface MissionQrTabProps {
  classId: ClassId;
  selectedDate: string;
  onDateChange: (date: string) => void;
  students: Student[];
  coreMissions: CoreMission[];
  allocationConfig: MissionAllocationConfig;
  assignments: DailyAssignmentRecord[];
  onRefreshWorkspace: () => Promise<void>;
  onPreviewStudentQr: (classId: ClassId, group: GroupNumber, date: string) => void;
}

const MISSION_ACCENTS: Record<number, { border: string; text: string; bg: string }> = {
  1: { border: 'border-sky-200', text: 'text-sky-700', bg: 'bg-sky-50' },
  2: { border: 'border-violet-200', text: 'text-violet-700', bg: 'bg-violet-50' },
  3: { border: 'border-emerald-200', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  4: { border: 'border-amber-200', text: 'text-amber-700', bg: 'bg-amber-50' },
  5: { border: 'border-rose-200', text: 'text-rose-700', bg: 'bg-rose-50' },
};

function mergeWithEightGroups(
  rawGroups?: Partial<Record<GroupNumber, GroupDailyPlan>>
): Record<GroupNumber, GroupDailyPlan> {
  const base = createEmptyEightGroups();
  if (!rawGroups) return base;
  GROUP_NUMBERS.forEach((g) => {
    if (rawGroups[g]) {
      base[g] = {
        groupNumber: g,
        cardIds: Array.isArray(rawGroups[g]!.cardIds) ? [...rawGroups[g]!.cardIds] : [],
        homework: rawGroups[g]!.homework || '',
        teacherNote: rawGroups[g]!.teacherNote || '',
      };
    }
  });
  return base;
}

export function MissionQrTab({
  classId,
  selectedDate,
  onDateChange,
  students,
  coreMissions,
  allocationConfig,
  assignments,
  onRefreshWorkspace,
  onPreviewStudentQr,
}: MissionQrTabProps) {
  const existingRecord = assignments.find((a) => a.classId === classId && a.date === selectedDate);
  const [lessonTopic, setLessonTopic] = useState<string>(
    existingRecord?.lessonTopic || `Bài học ngày ${selectedDate} — Lớp ${classId}`
  );
  const [groups, setGroups] = useState<Record<GroupNumber, GroupDailyPlan>>(() =>
    mergeWithEightGroups(existingRecord?.groups)
  );
  const [localConfig, setLocalConfig] = useState<MissionAllocationConfig>(allocationConfig);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [activeSubPanel, setActiveSubPanel] = useState<'assign' | 'config' | 'deck' | 'print'>('assign');
  const [dealWave, setDealWave] = useState(0);
  const [copiedGroup, setCopiedGroup] = useState<number | null>(null);

  // New card form state
  const [newCardMissionId, setNewCardMissionId] = useState<number>(1);
  const [newCardCode, setNewCardCode] = useState('');
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardDesc, setNewCardDesc] = useState('');
  const [newCardDuration, setNewCardDuration] = useState(10);

  // Edit core mission
  const [editingMissionId, setEditingMissionId] = useState<number | null>(null);
  const [editMissionTitle, setEditMissionTitle] = useState('');
  const [editMissionSummary, setEditMissionSummary] = useState('');

  useEffect(() => {
    setLocalConfig(allocationConfig);
  }, [allocationConfig]);

  useEffect(() => {
    const found = assignments.find((a) => a.classId === classId && a.date === selectedDate);
    if (found) {
      setLessonTopic(found.lessonTopic);
      setGroups(mergeWithEightGroups(found.groups));
    } else {
      setLessonTopic(`Bài học ngày ${selectedDate} — Lớp ${classId}`);
      setGroups(createEmptyEightGroups());
    }
    setSaveMessage('');
  }, [classId, selectedDate, assignments]);

  const allCards = coreMissions.flatMap((m) => m.cards);

  const handleAddCardToGroup = (groupNum: GroupNumber, cardId: string) => {
    if (!cardId) return;
    setGroups((prev) => ({
      ...prev,
      [groupNum]: {
        ...prev[groupNum],
        cardIds: [...prev[groupNum].cardIds, cardId],
      },
    }));
  };

  const handleRemoveCardFromGroup = (groupNum: GroupNumber, index: number) => {
    setGroups((prev) => ({
      ...prev,
      [groupNum]: {
        ...prev[groupNum],
        cardIds: prev[groupNum].cardIds.filter((_, i) => i !== index),
      },
    }));
  };

  const handleUpdateGroupField = (
    groupNum: GroupNumber,
    field: 'homework' | 'teacherNote',
    value: string
  ) => {
    setGroups((prev) => ({
      ...prev,
      [groupNum]: {
        ...prev[groupNum],
        [field]: value,
      },
    }));
  };

  const handleAutoDealCards = async (configToUse: MissionAllocationConfig = localConfig) => {
    if (allCards.length === 0) return;
    const dealt = autoDealMissionCards(coreMissions, configToUse);
    const next = createEmptyEightGroups();
    GROUP_NUMBERS.forEach((g) => {
      next[g] = {
        groupNumber: g,
        cardIds: dealt[g] || [],
        homework: groups[g]?.homework || '',
        teacherNote: groups[g]?.teacherNote || '',
      };
    });
    setGroups(next);
    setDealWave((k) => k + 1);
    setSaving(true);
    try {
      await saveDailyAssignment({
        classId,
        date: selectedDate,
        lessonTopic,
        groups: next,
      });
      await onRefreshWorkspace();
      setSaveMessage(
        'Đã phát thẻ tự động cho cả 8 Nhóm theo cấu hình và lưu lên hệ thống — mã QR sẵn sàng cho học sinh quét!'
      );
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Lỗi khi phát thẻ tự động.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyLatestDay = () => {
    const otherDates = assignments
      .filter((a) => a.classId === classId && a.date !== selectedDate)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (otherDates.length === 0) {
      setSaveMessage('Chưa có ngày học nào trước đó của lớp này để sao chép.');
      return;
    }
    const latest = otherDates[0];
    setGroups(mergeWithEightGroups(latest.groups));
    setLessonTopic(latest.lessonTopic);
    setSaveMessage(`Đã sao chép cấu hình thẻ từ ngày ${latest.date} (nhấn Lưu để áp dụng).`);
  };

  const handleSaveDay = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      await saveDailyAssignment({
        classId,
        date: selectedDate,
        lessonTopic,
        groups,
      });
      await onRefreshWorkspace();
      setSaveMessage('Đã lưu phân công thẻ nhiệm vụ & bài tập về nhà cho 8 Nhóm.');
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Lỗi khi lưu phân công.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConfigOnly = async (andAutoDeal = false) => {
    setSaving(true);
    setSaveMessage('');
    try {
      await saveAllocationConfig(localConfig);
      if (andAutoDeal) {
        await handleAutoDealCards(localConfig);
        setActiveSubPanel('assign');
      } else {
        await onRefreshWorkspace();
        setSaveMessage('Đã lưu cấu hình số thẻ cho 8 Nhóm & 5 Nhiệm vụ.');
      }
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Lỗi khi lưu cấu hình.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCard = async (missionId: number) => {
    if (!newCardTitle.trim()) return;
    await addMissionCard(missionId, {
      code:
        newCardCode.trim() ||
        `NV${missionId}-T${String((coreMissions.find((m) => m.id === missionId)?.cards.length || 0) + 1).padStart(2, '0')}`,
      title: newCardTitle.trim(),
      description: newCardDesc.trim(),
      durationMinutes: newCardDuration,
      isDuplicate: false,
    });
    setNewCardCode('');
    setNewCardTitle('');
    setNewCardDesc('');
    await onRefreshWorkspace();
  };

  const handleDuplicateCard = async (card: MissionCard) => {
    await addMissionCard(card.missionId, {
      code: `${card.code} (Bản sao)`,
      title: `${card.title} (Thẻ trùng)`,
      description: card.description,
      durationMinutes: card.durationMinutes,
      isDuplicate: true,
    });
    await onRefreshWorkspace();
  };

  const handleDeleteCard = async (cardId: string) => {
    await deleteMissionCard(cardId);
    await onRefreshWorkspace();
  };

  const handleSaveCoreMission = async (missionId: number) => {
    await updateCoreMission(missionId, {
      title: editMissionTitle,
      summary: editMissionSummary,
    });
    setEditingMissionId(null);
    await onRefreshWorkspace();
  };

  const getQrUrlForGroup = (groupNum: GroupNumber) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return buildStudentQrUrl(origin, classId, groupNum, selectedDate);
  };

  const totalCardsNeeded = GROUP_NUMBERS.reduce(
    (sum, g) => sum + (Number(localConfig.cardsPerGroup[g]) || 0),
    0
  );
  const totalMissionSlots = coreMissions.reduce(
    (sum, m) => sum + (Number(localConfig.missionCounts[m.id]) || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Sub-navigation & Date Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 no-print">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl w-full xl:w-auto">
            <button
              type="button"
              onClick={() => setActiveSubPanel('assign')}
              className={`px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeSubPanel === 'assign'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1. Phát thẻ &amp; 8 Mã QR
            </button>
            <button
              type="button"
              onClick={() => setActiveSubPanel('config')}
              className={`px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeSubPanel === 'config'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              2. Cấu hình 8 Nhóm &amp; 5 Nhiệm vụ
            </button>
            <button
              type="button"
              onClick={() => setActiveSubPanel('deck')}
              className={`px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeSubPanel === 'deck'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              3. Kho 5 Nhiệm vụ ({allCards.length} thẻ)
            </button>
            <button
              type="button"
              onClick={() => setActiveSubPanel('print')}
              className={`px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeSubPanel === 'print'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              4. In 8 Thẻ QR (A4)
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-full sm:w-auto">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => onDateChange(e.target.value)}
                className="w-full sm:w-auto pl-9 pr-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {activeSubPanel === 'assign' && (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleAutoDealCards(localConfig)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4" />
                  Phát thẻ tự động
                </button>
                <button
                  type="button"
                  onClick={handleCopyLatestDay}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap"
                >
                  <Copy className="w-4 h-4" />
                  Chép ngày trước
                </button>
                <button
                  type="button"
                  onClick={handleSaveDay}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Đang lưu...' : 'Lưu phân công'}
                </button>
              </>
            )}

            {activeSubPanel === 'print' && (
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap"
              >
                <Printer className="w-4 h-4" />
                In 8 Thẻ QR (A4)
              </button>
            )}
          </div>
        </div>

        {(activeSubPanel === 'assign' || activeSubPanel === 'config') && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
            <label htmlFor="lesson-topic-input" className="text-xs font-semibold text-slate-600 shrink-0">
              Chủ đề buổi học:
            </label>
            <input
              id="lesson-topic-input"
              type="text"
              value={lessonTopic}
              onChange={(e) => setLessonTopic(e.target.value)}
              placeholder="Nhập tên bài học hoặc chủ đề trong ngày..."
              className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {saveMessage && <span className="text-xs font-medium text-emerald-700">{saveMessage}</span>}
          </div>
        )}
      </div>

      {/* PANEL 1: Auto-Deal + 8 Color-Coded Group Cards WITH Live QR Codes */}
      {activeSubPanel === 'assign' && (
        <div key={dealWave} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {GROUP_NUMBERS.map((groupNum, idx) => {
            const plan = groups[groupNum] || {
              groupNumber: groupNum,
              cardIds: [],
              homework: '',
              teacherNote: '',
            };
            const groupStudents = students.filter(
              (s) => s.classId === classId && s.groupNumber === groupNum
            );
            const leader = groupStudents.find((s) => s.isLeader);
            const qrUrl = getQrUrlForGroup(groupNum);
            const teamTheme = GROUP_THEMES[groupNum];

            return (
              <motion.div
                key={groupNum}
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  type: 'spring',
                  stiffness: 280,
                  damping: 22,
                  delay: idx * 0.045,
                }}
                whileHover={{ y: -3 }}
                className="bg-white border border-slate-200/90 rounded-3xl overflow-hidden flex flex-col justify-between shadow-[0_10px_26px_-12px_rgba(15,23,42,0.12)]"
              >
                <div>
                  {/* Vibrant Team Color Top Header */}
                  <div className={`px-5 py-4 bg-gradient-to-r ${teamTheme.gradientHeader} text-white flex items-start justify-between gap-2.5`}>
                    <div>
                      <div className="text-xs sm:text-sm font-bold text-white/95 flex items-center gap-1.5">
                        <span>{teamTheme.teamLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{groupStudents.length} HS</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{plan.cardIds.length} thẻ</span>
                      </div>
                      <h3 className="text-xl sm:text-2xl font-extrabold mt-0.5">Nhóm {groupNum}</h3>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.95 }}
                      type="button"
                      onClick={() => onPreviewStudentQr(classId, groupNum, selectedDate)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-bold text-slate-900 bg-white/95 hover:bg-white rounded-xl transition-colors whitespace-nowrap shadow-xs"
                    >
                      <QrCode className="w-4 h-4" />
                      Trang HS
                    </motion.button>
                  </div>

                  <div className="p-5">
                    {/* Live QR Code directly on each group card right after dealing */}
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                      className={`mb-4 py-3.5 px-3 ${teamTheme.softBg} border ${teamTheme.border} rounded-2xl flex flex-col items-center`}
                    >
                      <QrCodeBox value={qrUrl} size={132} label={`QR Lớp ${classId} Nhóm ${groupNum}`} />
                      <div className="mt-2.5 flex items-center gap-3 text-xs sm:text-sm">
                        <span className="text-slate-700 font-semibold">Quét riêng Nhóm {groupNum}</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(qrUrl);
                            setCopiedGroup(groupNum);
                            setTimeout(() => setCopiedGroup((c) => (c === groupNum ? null : c)), 1500);
                          }}
                          className={`font-bold ${teamTheme.textAccent} hover:underline`}
                        >
                          {copiedGroup === groupNum ? 'Đã chép!' : 'Chép link'}
                        </button>
                      </div>
                    </motion.div>

                    {/* Leader & Members Quick List */}
                    <div className="text-sm text-slate-700 mb-3.5 space-y-1">
                      {leader && (
                        <div className="font-bold text-amber-700 flex items-center gap-1.5">
                          <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                          <span>Nhóm trưởng: {leader.name}</span>
                        </div>
                      )}
                      <div className="line-clamp-2 leading-snug" title={groupStudents.map((s) => s.name).join(', ')}>
                        <span className="font-bold text-slate-800">TV: </span>
                        {groupStudents.length === 0
                          ? 'Chưa có học sinh'
                          : groupStudents.map((s) => s.name).join(', ')}
                      </div>
                    </div>

                    {/* Assigned Cards */}
                    <div>
                      <div className="text-sm font-extrabold text-slate-800 mb-2">
                        Thẻ nhiệm vụ ({plan.cardIds.length})
                      </div>
                      {plan.cardIds.length === 0 ? (
                        <div className="p-3 text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl text-center">
                          Chưa phát thẻ
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {plan.cardIds.map((cid, cIdx) => {
                            const card = allCards.find((c) => c.id === cid);
                            const mTheme = card ? MISSION_THEMES[card.missionId] || MISSION_THEMES[1] : MISSION_THEMES[1];
                            return (
                              <motion.div
                                key={`${cid}-${cIdx}`}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.04 * cIdx }}
                                className={`flex items-center justify-between gap-2 px-3 py-2.5 border rounded-xl ${mTheme.bg} ${mTheme.border}`}
                              >
                                <div className="min-w-0">
                                  <div className={`text-xs sm:text-sm font-mono font-extrabold ${mTheme.text}`}>
                                    {card ? `NV${card.missionId} · ${card.code}` : cid}
                                  </div>
                                  <div className="text-sm sm:text-base text-slate-900 font-bold leading-snug line-clamp-2 mt-0.5">
                                    {card ? card.title : 'Thẻ không tồn tại'}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCardFromGroup(groupNum, cIdx)}
                                  title="Gỡ thẻ này"
                                  className="text-slate-400 hover:text-rose-600 p-1.5 shrink-0"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </motion.div>
                            );
                          })}
                        </div>
                      )}

                      <div className="mt-2.5">
                        <select
                          value=""
                          onChange={(e) => handleAddCardToGroup(groupNum, e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-700"
                        >
                          <option value="">+ Thêm thẻ thủ công...</option>
                          {coreMissions.map((m) => (
                            <optgroup key={m.id} label={m.title}>
                              {m.cards.map((c) => (
                                <option key={c.id} value={c.id}>
                                  [{c.code}] {c.title}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Homework & Note */}
                <div className="px-5 pb-5 pt-3.5 border-t border-slate-100 space-y-2.5">
                  <div>
                    <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1">
                      Bài tập về nhà Nhóm {groupNum}
                    </label>
                    <textarea
                      rows={2}
                      value={plan.homework}
                      onChange={(e) => handleUpdateGroupField(groupNum, 'homework', e.target.value)}
                      placeholder="Nhập BTVN cho nhóm..."
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <input
                    type="text"
                    value={plan.teacherNote || ''}
                    onChange={(e) => handleUpdateGroupField(groupNum, 'teacherNote', e.target.value)}
                    placeholder="Ghi chú thêm khi quét QR..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* PANEL 2: Configure 8 Groups + 5 Missions (allowing 2 or 3 duplicate groups) */}
      {activeSubPanel === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 6 cols: Cards per 8 Groups */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-blue-600 shrink-0" />
                  Số thẻ phát cho 8 Nhóm trong buổi học
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tổng số thẻ cần phát: <strong className="font-mono text-blue-700">{totalCardsNeeded} thẻ</strong>
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setLocalConfig((prev) => ({
                      ...prev,
                      cardsPerGroup: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 },
                    }))
                  }
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Đặt 1 thẻ/nhóm
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setLocalConfig((prev) => ({
                      ...prev,
                      cardsPerGroup: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2 },
                    }))
                  }
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  2 thẻ/nhóm
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {GROUP_NUMBERS.map((g) => (
                <div key={g} className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">Nhóm {g}</label>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={localConfig.cardsPerGroup[g] ?? 1}
                    onChange={(e) =>
                      setLocalConfig((prev) => ({
                        ...prev,
                        cardsPerGroup: {
                          ...prev.cardsPerGroup,
                          [g]: Math.max(0, Math.min(5, Number(e.target.value) || 0)),
                        },
                      }))
                    }
                    className="w-full px-3 py-1.5 text-sm font-mono font-bold tabular-nums bg-white border border-slate-200 rounded-lg"
                  />
                </div>
              ))}
            </div>

            <label className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={localConfig.allowRepeatSameGroup}
                onChange={(e) =>
                  setLocalConfig((prev) => ({ ...prev, allowRepeatSameGroup: e.target.checked }))
                }
                className="rounded border-slate-300 text-blue-600"
              />
              Cho phép 1 nhóm nhận nhiều thẻ thuộc cùng 1 nhiệm vụ (nếu số thẻ &gt; 1)
            </label>
          </div>

          {/* Right 6 cols: Duplicate distribution across the 5 Core Missions */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Shuffle className="w-4 h-4 text-emerald-600" />
                  Phân bổ 5 Nhiệm vụ (Cho phép trùng 2–3 nhóm)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tổng suất nhiệm vụ đang đặt:{' '}
                  <strong
                    className={`font-mono ${
                      totalMissionSlots === totalCardsNeeded ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {totalMissionSlots} / {totalCardsNeeded} thẻ cần phát
                  </strong>
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              {coreMissions.map((m) => {
                const count = localConfig.missionCounts[m.id] ?? 0;
                const accent = MISSION_ACCENTS[m.id] || MISSION_ACCENTS[1];
                return (
                  <div
                    key={m.id}
                    className={`p-3 border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 ${accent.bg} ${accent.border}`}
                  >
                    <div className="min-w-0">
                      <div className={`text-xs font-bold ${accent.text}`}>
                        Nhiệm vụ {m.id} · {count > 1 ? `${count} nhóm làm trùng` : count === 1 ? '1 nhóm làm' : 'Tạm nghỉ'}
                      </div>
                      <div className="text-sm font-semibold text-slate-900 break-words">
                        {m.title.replace(/^Nhiệm vụ \d+:\s*/, '')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-600">Số thẻ:</span>
                      <input
                        type="number"
                        min={0}
                        max={16}
                        value={count}
                        onChange={(e) =>
                          setLocalConfig((prev) => ({
                            ...prev,
                            missionCounts: {
                              ...prev.missionCounts,
                              [m.id]: Math.max(0, Math.min(16, Number(e.target.value) || 0)),
                            },
                          }))
                        }
                        className="w-16 px-2.5 py-1.5 text-sm font-mono font-bold tabular-nums bg-white border border-slate-200 rounded-lg text-center"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveConfigOnly(false)}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl whitespace-nowrap"
              >
                Lưu cấu hình
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveConfigOnly(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4" />
                Lưu &amp; Phát thẻ tự động cho 8 Nhóm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PANEL 3: 5 Core Missions & Card Deck */}
      {activeSubPanel === 'deck' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5">
            <h3 className="text-base font-bold text-slate-900 mb-1">Thêm thẻ vào 5 Nhiệm vụ</h3>
            <p className="text-xs text-slate-500 mb-4">
              Tạo thẻ nhiệm vụ mới hoặc nhân bản thẻ để nhiều nhóm cùng thực hiện song song.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Thuộc Nhiệm vụ</label>
                <select
                  value={newCardMissionId}
                  onChange={(e) => setNewCardMissionId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
                >
                  {coreMissions.map((m) => (
                    <option key={m.id} value={m.id}>
                      NV {m.id}: {m.title.replace(/^Nhiệm vụ \d+:\s*/, '')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mã thẻ</label>
                  <input
                    type="text"
                    value={newCardCode}
                    onChange={(e) => setNewCardCode(e.target.value)}
                    placeholder={`NV${newCardMissionId}-T03`}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Thời lượng (phút)</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={newCardDuration}
                    onChange={(e) => setNewCardDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tên thẻ nhiệm vụ</label>
                <input
                  type="text"
                  value={newCardTitle}
                  onChange={(e) => setNewCardTitle(e.target.value)}
                  placeholder="Ví dụ: Giải bài tập thực hành số 2"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Hướng dẫn chi tiết</label>
                <textarea
                  rows={3}
                  value={newCardDesc}
                  onChange={(e) => setNewCardDesc(e.target.value)}
                  placeholder="Mô tả yêu cầu cụ thể để học sinh xem khi quét QR..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
                />
              </div>
              <button
                type="button"
                onClick={() => handleCreateCard(newCardMissionId)}
                disabled={!newCardTitle.trim()}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-4 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
              >
                <Plus className="w-4 h-4" />
                Thêm thẻ vào kho
              </button>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-4">
            {coreMissions.map((mission) => (
              <div key={mission.id} className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100">
                  {editingMissionId === mission.id ? (
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={editMissionTitle}
                        onChange={(e) => setEditMissionTitle(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm font-bold border border-slate-300 rounded-lg"
                      />
                      <input
                        type="text"
                        value={editMissionSummary}
                        onChange={(e) => setEditMissionSummary(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveCoreMission(mission.id)}
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-blue-600 rounded-md"
                        >
                          <Check className="w-3.5 h-3.5" /> Lưu
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingMissionId(null)}
                          className="px-3 py-1 text-xs text-slate-600 bg-slate-100 rounded-md"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-xs font-mono text-slate-500">
                        Nhiệm vụ #{mission.id} · {mission.cards.length} thẻ
                      </div>
                      <h4 className="text-base font-bold text-slate-900 mt-0.5">{mission.title}</h4>
                      <p className="text-xs text-slate-600 mt-0.5">{mission.summary}</p>
                    </div>
                  )}

                  {editingMissionId !== mission.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMissionId(mission.id);
                        setEditMissionTitle(mission.title);
                        setEditMissionSummary(mission.summary);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 rounded-lg shrink-0"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Sửa tên
                    </button>
                  )}
                </div>

                <div className="mt-3.5 space-y-2.5">
                  {mission.cards.map((card) => (
                    <div
                      key={card.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500">
                          <span className="font-mono font-bold text-blue-700">{card.code}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{card.durationMinutes} phút</span>
                          {card.isDuplicate && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-amber-700 font-semibold">Thẻ trùng</span>
                            </>
                          )}
                        </div>
                        <div className="text-base sm:text-lg font-extrabold text-slate-900 mt-1">{card.title}</div>
                        {card.description && (
                          <div className="text-sm text-slate-600 mt-1 leading-relaxed">{card.description}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDuplicateCard(card)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl whitespace-nowrap"
                        >
                          <Copy className="w-4 h-4" />
                          Nhân bản thẻ
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCard(card.id)}
                          title="Xóa thẻ"
                          className="p-2 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded-xl"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PANEL 4: Printable 8 QR Group Cards (A4) */}
      {activeSubPanel === 'print' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 print-grid">
          {GROUP_NUMBERS.map((groupNum) => {
            const qrUrl = getQrUrlForGroup(groupNum);
            const plan = groups[groupNum] || {
              groupNumber: groupNum,
              cardIds: [],
              homework: '',
              teacherNote: '',
            };
            const groupStudents = students.filter(
              (s) => s.classId === classId && s.groupNumber === groupNum
            );

            return (
              <div
                key={groupNum}
                className="bg-white border border-slate-200 rounded-2xl p-5 print-card flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                    <div>
                      <div className="text-xs sm:text-sm text-slate-500 font-semibold">
                        Lớp {classId} · <span className="font-mono tabular-nums">{selectedDate}</span>
                      </div>
                      <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900">THẺ NHÓM {groupNum}</h3>
                    </div>
                    <div className="text-right">
                      <div className="text-xs sm:text-sm text-slate-500 font-semibold">Số thẻ</div>
                      <div className="text-xl font-extrabold font-mono tabular-nums text-blue-700">
                        {plan.cardIds.length}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center py-2">
                    <QrCodeBox value={qrUrl} size={168} label={`QR Lớp ${classId} Nhóm ${groupNum}`} />
                  </div>

                  <p className="text-sm text-center text-slate-600 font-medium mt-2.5">
                    Quét mã QR để xem nhiệm vụ nhóm hôm nay
                  </p>

                  <div className="mt-4 pt-3.5 border-t border-slate-100 text-sm text-slate-700">
                    <div className="font-bold text-slate-900 mb-1">
                      Thành viên ({groupStudents.length} HS):
                    </div>
                    <div className="leading-relaxed">
                      {groupStudents.length > 0
                        ? groupStudents.map((s) => (s.isLeader ? `${s.name} (NT)` : s.name)).join(', ')
                        : 'Chưa gán học sinh'}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 no-print">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(qrUrl)}
                    className="text-sm font-semibold text-slate-600 hover:text-slate-900 hover:underline"
                  >
                    Sao chép link
                  </button>
                  <button
                    type="button"
                    onClick={() => onPreviewStudentQr(classId, groupNum, selectedDate)}
                    className="inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:text-blue-800"
                  >
                    Mở trang HS <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
