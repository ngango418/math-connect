import { useEffect, useState } from 'react';
import {
  Calendar,
  Copy,
  ExternalLink,
  Plus,
  Printer,
  Save,
  Shuffle,
  Trash2,
  QrCode,
  Edit3,
  Check,
} from 'lucide-react';
import {
  GROUP_NUMBERS,
  type ClassId,
  type CoreMission,
  type DailyAssignmentRecord,
  type GroupDailyPlan,
  type GroupNumber,
  type MissionCard,
  type Student,
} from '../../shared/types.ts';
import { addMissionCard, deleteMissionCard, saveDailyAssignment, updateCoreMission } from '../lib/api.ts';
import { QrCodeBox } from './QrCodeBox.tsx';

interface MissionQrTabProps {
  classId: ClassId;
  selectedDate: string;
  onDateChange: (date: string) => void;
  students: Student[];
  coreMissions: CoreMission[];
  assignments: DailyAssignmentRecord[];
  onRefreshWorkspace: () => Promise<void>;
  onPreviewStudentQr: (classId: ClassId, group: GroupNumber, date: string) => void;
}

function createEmptyGroups(): Record<GroupNumber, GroupDailyPlan> {
  return {
    1: { groupNumber: 1, cardIds: [], homework: '', teacherNote: '' },
    2: { groupNumber: 2, cardIds: [], homework: '', teacherNote: '' },
    3: { groupNumber: 3, cardIds: [], homework: '', teacherNote: '' },
    4: { groupNumber: 4, cardIds: [], homework: '', teacherNote: '' },
    5: { groupNumber: 5, cardIds: [], homework: '', teacherNote: '' },
  };
}

export function MissionQrTab({
  classId,
  selectedDate,
  onDateChange,
  students,
  coreMissions,
  assignments,
  onRefreshWorkspace,
  onPreviewStudentQr,
}: MissionQrTabProps) {
  const existingRecord = assignments.find((a) => a.classId === classId && a.date === selectedDate);
  const [lessonTopic, setLessonTopic] = useState<string>(
    existingRecord?.lessonTopic || `Bài học ngày ${selectedDate} — Lớp ${classId}`
  );
  const [groups, setGroups] = useState<Record<GroupNumber, GroupDailyPlan>>(
    existingRecord?.groups || createEmptyGroups()
  );
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [activeSubPanel, setActiveSubPanel] = useState<'assign' | 'deck' | 'print'>('assign');

  // New card form state
  const [newCardMissionId, setNewCardMissionId] = useState<number>(1);
  const [newCardCode, setNewCardCode] = useState('');
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardDesc, setNewCardDesc] = useState('');
  const [newCardDuration, setNewCardDuration] = useState(10);

  // Edit core mission title
  const [editingMissionId, setEditingMissionId] = useState<number | null>(null);
  const [editMissionTitle, setEditMissionTitle] = useState('');
  const [editMissionSummary, setEditMissionSummary] = useState('');

  useEffect(() => {
    const found = assignments.find((a) => a.classId === classId && a.date === selectedDate);
    if (found) {
      setLessonTopic(found.lessonTopic);
      setGroups(JSON.parse(JSON.stringify(found.groups)) as Record<GroupNumber, GroupDailyPlan>);
    } else {
      setLessonTopic(`Bài học ngày ${selectedDate} — Lớp ${classId}`);
      setGroups(createEmptyGroups());
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

  const handleRandomDistributeCards = () => {
    if (allCards.length === 0) return;
    const next = createEmptyGroups();
    // Copy existing homework/notes
    GROUP_NUMBERS.forEach((g) => {
      next[g].homework = groups[g]?.homework || '';
      next[g].teacherNote = groups[g]?.teacherNote || '';
    });

    // Variable number of cards per group (2 to 4 cards randomly)
    GROUP_NUMBERS.forEach((g) => {
      const targetCount = 2 + Math.floor(Math.random() * 3); // 2, 3 or 4 cards per group
      const shuffled = [...allCards].sort(() => Math.random() - 0.5);
      next[g].cardIds = shuffled.slice(0, Math.min(targetCount, shuffled.length)).map((c) => c.id);
    });
    setGroups(next);
    setSaveMessage('Đã chia ngẫu nhiên số lượng thẻ khác nhau cho 5 nhóm (nhấn Lưu để áp dụng).');
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
    setGroups(JSON.parse(JSON.stringify(latest.groups)) as Record<GroupNumber, GroupDailyPlan>);
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
      setSaveMessage('Đã lưu phân công thẻ nhiệm vụ & bài tập về nhà.');
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Lỗi khi lưu phân công.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCard = async (missionId: number) => {
    if (!newCardTitle.trim()) return;
    await addMissionCard(missionId, {
      code: newCardCode.trim() || `NV${missionId}-T${String((coreMissions.find((m) => m.id === missionId)?.cards.length || 0) + 1).padStart(2, '0')}`,
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
    const params = new URLSearchParams({
      view: 'student',
      class: classId,
      group: String(groupNum),
      date: selectedDate,
    });
    return `${origin}/?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation & Date Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 no-print">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            <button
              type="button"
              onClick={() => setActiveSubPanel('assign')}
              className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeSubPanel === 'assign' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1. Phân thẻ & BTVN theo ngày
            </button>
            <button
              type="button"
              onClick={() => setActiveSubPanel('deck')}
              className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeSubPanel === 'deck' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              2. Kho 5 Nhiệm vụ cứng ({allCards.length} thẻ)
            </button>
            <button
              type="button"
              onClick={() => setActiveSubPanel('print')}
              className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeSubPanel === 'print' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              3. Phát & In 5 Thẻ QR
            </button>
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

            {activeSubPanel === 'assign' && (
              <>
                <button
                  type="button"
                  onClick={handleRandomDistributeCards}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Shuffle className="w-4 h-4" />
                  Chia thẻ ngẫu nhiên
                </button>
                <button
                  type="button"
                  onClick={handleCopyLatestDay}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Copy className="w-4 h-4" />
                  Chép ngày trước
                </button>
                <button
                  type="button"
                  onClick={handleSaveDay}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Đang lưu...' : 'Lưu phân công ngày'}
                </button>
              </>
            )}

            {activeSubPanel === 'print' && (
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
              >
                <Printer className="w-4 h-4" />
                In 5 Thẻ QR (A4)
              </button>
            )}
          </div>
        </div>

        {activeSubPanel === 'assign' && (
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
              className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {saveMessage && <span className="text-xs font-medium text-emerald-700">{saveMessage}</span>}
          </div>
        )}
      </div>

      {/* PANEL 1: Assign Variable Cards & Homework per Group (1..5) */}
      {activeSubPanel === 'assign' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {GROUP_NUMBERS.map((groupNum) => {
            const plan = groups[groupNum] || { groupNumber: groupNum, cardIds: [], homework: '', teacherNote: '' };
            const groupStudents = students.filter((s) => s.classId === classId && s.groupNumber === groupNum);

            return (
              <div
                key={groupNum}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <div className="text-xs text-slate-500 flex items-center gap-1.5">
                        <span>Lớp {classId}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{groupStudents.length} HS</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-blue-700 font-semibold">
                          {plan.cardIds.length} thẻ
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 mt-0.5">Nhóm {groupNum}</h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => onPreviewStudentQr(classId, groupNum, selectedDate)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors whitespace-nowrap"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      Xem như HS
                    </button>
                  </div>

                  {/* Assigned Members Quick List */}
                  <div className="mt-3 text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">Thành viên: </span>
                    {groupStudents.length === 0
                      ? 'Chưa có học sinh'
                      : groupStudents.map((s) => s.name).join(', ')}
                  </div>

                  {/* Assigned Cards */}
                  <div className="mt-4">
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      Thẻ nhiệm vụ hôm nay ({plan.cardIds.length} thẻ)
                    </div>
                    {plan.cardIds.length === 0 ? (
                      <div className="p-3 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg text-center">
                        Chưa chọn thẻ nào cho Nhóm {groupNum}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {plan.cardIds.map((cid, idx) => {
                          const card = allCards.find((c) => c.id === cid);
                          return (
                            <div
                              key={`${cid}-${idx}`}
                              className="flex items-center justify-between gap-2 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                            >
                              <div className="min-w-0">
                                <span className="font-mono font-semibold text-blue-700 mr-1.5">
                                  {card ? card.code : cid}
                                </span>
                                <span className="text-slate-800 truncate">
                                  {card ? card.title : 'Thẻ không tồn tại'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveCardFromGroup(groupNum, idx)}
                                title="Gỡ thẻ này"
                                className="text-slate-400 hover:text-red-600 p-1 shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Dropdown to add a card from any of the 5 core missions */}
                    <div className="mt-2.5">
                      <select
                        value=""
                        onChange={(e) => {
                          handleAddCardToGroup(groupNum, e.target.value);
                        }}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-700"
                      >
                        <option value="">+ Thêm thẻ từ 5 Nhiệm vụ cứng...</option>
                        {coreMissions.map((m) => (
                          <optgroup key={m.id} label={m.title}>
                            {m.cards.map((c) => (
                              <option key={c.id} value={c.id}>
                                [{c.code}] {c.title} ({c.durationMinutes}p)
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Homework & Note for this group */}
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Bài tập về nhà cho Nhóm {groupNum}
                    </label>
                    <textarea
                      rows={2}
                      value={plan.homework}
                      onChange={(e) => handleUpdateGroupField(groupNum, 'homework', e.target.value)}
                      placeholder="Nhập bài tập về nhà giao riêng cho nhóm..."
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Ghi chú thêm (hiện khi quét QR)</label>
                    <input
                      type="text"
                      value={plan.teacherNote || ''}
                      onChange={(e) => handleUpdateGroupField(groupNum, 'teacherNote', e.target.value)}
                      placeholder="Ví dụ: Chuẩn bị bảng phụ A3..."
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PANEL 2: 5 Core Missions & Card Deck (with Duplicate support) */}
      {activeSubPanel === 'deck' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Add New Card Form */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-base font-bold text-slate-900 mb-1">Thêm thẻ vào 5 Nhiệm vụ cứng</h3>
            <p className="text-xs text-slate-500 mb-4">
              Theo Cách 2, mỗi nhiệm vụ cứng chứa nhiều thẻ (có thể tạo thẻ trùng lặp để phát song song cho nhiều nhóm).
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Thuộc Nhiệm vụ cứng</label>
                <select
                  value={newCardMissionId}
                  onChange={(e) => setNewCardMissionId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Hướng dẫn chi tiết</label>
                <textarea
                  rows={3}
                  value={newCardDesc}
                  onChange={(e) => setNewCardDesc(e.target.value)}
                  placeholder="Mô tả yêu cầu cụ thể để học sinh xem khi quét QR..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <button
                type="button"
                onClick={() => handleCreateCard(newCardMissionId)}
                disabled={!newCardTitle.trim()}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-4 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Thêm thẻ vào kho
              </button>
            </div>
          </div>

          {/* 5 Fixed Core Missions List */}
          <div className="lg:col-span-8 space-y-4">
            {coreMissions.map((mission) => (
              <div key={mission.id} className="bg-white border border-slate-200 rounded-xl p-5">
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
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-blue-700 rounded-md"
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
                        Nhiệm vụ cứng #{mission.id} · {mission.cards.length} thẻ
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
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 rounded-md shrink-0"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Sửa tên
                    </button>
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  {mission.cards.map((card) => (
                    <div
                      key={card.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono font-semibold text-blue-700">{card.code}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{card.durationMinutes} phút</span>
                          {card.isDuplicate && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-amber-700 font-medium">Thẻ trùng lặp</span>
                            </>
                          )}
                        </div>
                        <div className="text-sm font-semibold text-slate-900 mt-0.5">{card.title}</div>
                        {card.description && (
                          <div className="text-xs text-slate-600 mt-0.5">{card.description}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDuplicateCard(card)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-md whitespace-nowrap"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Nhân bản thẻ
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCard(card.id)}
                          title="Xóa thẻ"
                          className="p-1.5 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded-md"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* PANEL 3: 5 Printable QR Group Cards */}
      {activeSubPanel === 'print' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 print-grid">
          {GROUP_NUMBERS.map((groupNum) => {
            const qrUrl = getQrUrlForGroup(groupNum);
            const plan = groups[groupNum] || { groupNumber: groupNum, cardIds: [], homework: '', teacherNote: '' };
            const groupStudents = students.filter((s) => s.classId === classId && s.groupNumber === groupNum);

            return (
              <div
                key={groupNum}
                className="bg-white border border-slate-200 rounded-xl p-5 print-card flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                    <div>
                      <div className="text-xs text-slate-500">
                        Lớp {classId} · Ngày <span className="font-mono tabular-nums">{selectedDate}</span>
                      </div>
                      <h3 className="text-xl font-bold text-slate-900">THẺ NHÓM {groupNum}</h3>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500">Số thẻ</div>
                      <div className="text-lg font-bold font-mono tabular-nums text-blue-700">
                        {plan.cardIds.length}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center py-2">
                    <QrCodeBox value={qrUrl} size={160} label={`QR Lớp ${classId} Nhóm ${groupNum}`} />
                  </div>

                  <p className="text-xs text-center text-slate-500 mt-2">
                    Quét mã QR để xem nhiệm vụ ngày {selectedDate} &amp; bài tập về nhà
                  </p>

                  <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600">
                    <div className="font-semibold text-slate-800 mb-1">
                      Thành viên ({groupStudents.length} HS):
                    </div>
                    <div>
                      {groupStudents.length > 0
                        ? groupStudents.map((s) => s.name).join(', ')
                        : 'Chưa gán học sinh'}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 no-print">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(qrUrl)}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline"
                  >
                    Sao chép link QR
                  </button>
                  <button
                    type="button"
                    onClick={() => onPreviewStudentQr(classId, groupNum, selectedDate)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800"
                  >
                    Mở trang HS <ExternalLink className="w-3.5 h-3.5" />
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
