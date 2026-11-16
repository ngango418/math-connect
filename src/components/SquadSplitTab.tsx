import { useMemo, useState } from 'react';
import { Check, Crown, Scale, Shuffle, Sparkles, UserPlus, Users } from 'lucide-react';
import {
  GROUP_NUMBERS,
  type ClassId,
  type GroupNumber,
  type Student,
} from '../../shared/types.ts';
import { bulkStudentsAction } from '../lib/api.ts';
import {
  splitToIntoTwoEqualSumGroups,
  type ScoreGroupBucket,
  type TwoGroupScoreSplitResult,
} from '../lib/balancedRandom.ts';

interface SquadSplitTabProps {
  classId: ClassId;
  students: Student[];
  onRefreshWorkspace: () => Promise<void>;
}

const FIXED_TOS = [1, 2, 3, 4];

export function SquadSplitTab({ classId, students, onRefreshWorkspace }: SquadSplitTabProps) {
  const classStudents = useMemo(
    () => students.filter((s) => s.classId === classId),
    [students, classId]
  );

  const allTos = useMemo(() => {
    const set = new Set<number>([...FIXED_TOS, ...classStudents.map((s) => s.to)]);
    return Array.from(set).sort((a, b) => a - b);
  }, [classStudents]);

  const [selectedTo, setSelectedTo] = useState<number>(1);
  const [selectedToAssignIds, setSelectedToAssignIds] = useState<Record<string, boolean>>({});
  const [splitResults, setSplitResults] = useState<Record<number, TwoGroupScoreSplitResult>>({});
  const [targetGroupMapping, setTargetGroupMapping] = useState<Record<string, GroupNumber>>({});
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const studentsInSelectedTo = classStudents.filter((s) => s.to === selectedTo);
  const studentsOutsideSelectedTo = classStudents.filter((s) => s.to !== selectedTo);

  const handleBatchAddToSelectedTo = async () => {
    const ids = Object.keys(selectedToAssignIds).filter((id) => selectedToAssignIds[id]);
    if (ids.length === 0) return;
    setSaving(true);
    try {
      await bulkStudentsAction({
        mode: 'patch',
        students: ids.map((id) => ({ id, to: selectedTo })),
      });
      setSelectedToAssignIds({});
      setStatusMsg(`Đã chuyển ${ids.length} học sinh vào Tổ ${selectedTo}.`);
      await onRefreshWorkspace();
    } finally {
      setSaving(false);
    }
  };

  const handleScoreQuickUpdate = async (studentId: string, rawVal: string) => {
    const parsed = Math.min(10, Math.max(1, Number(rawVal) || 1));
    await bulkStudentsAction({
      mode: 'patch',
      students: [{ id: studentId, score: Number(parsed.toFixed(1)) }],
    });
    await onRefreshWorkspace();
  };

  const handleLeaderQuickToggle = async (studentId: string, currentLeader: boolean) => {
    await bulkStudentsAction({
      mode: 'patch',
      students: [{ id: studentId, isLeader: !currentLeader }],
    });
    await onRefreshWorkspace();
  };

  const handleRandomSplitOneTo = (toNum: number) => {
    const members = classStudents.filter((s) => s.to === toNum);
    const res = splitToIntoTwoEqualSumGroups(toNum, members);
    setSplitResults((prev) => ({ ...prev, [toNum]: res }));
    setTargetGroupMapping((prev) => ({
      ...prev,
      [`${toNum}-A`]: res.groupA.targetGroupNumber,
      [`${toNum}-B`]: res.groupB.targetGroupNumber,
    }));
    setStatusMsg(
      `Đã chia ngẫu nhiên Tổ ${toNum} thành Nhóm ${res.groupA.targetGroupNumber} (${res.groupA.totalScore}đ) và Nhóm ${res.groupB.targetGroupNumber} (${res.groupB.totalScore}đ) · Chênh lệch: ${res.scoreDiff}đ.`
    );
  };

  const handleRandomSplitAllFourTos = () => {
    const nextResults: Record<number, TwoGroupScoreSplitResult> = {};
    const nextMap: Record<string, GroupNumber> = { ...targetGroupMapping };
    for (const toNum of FIXED_TOS) {
      const members = classStudents.filter((s) => s.to === toNum);
      if (members.length === 0) continue;
      const res = splitToIntoTwoEqualSumGroups(toNum, members);
      nextResults[toNum] = res;
      nextMap[`${toNum}-A`] = res.groupA.targetGroupNumber;
      nextMap[`${toNum}-B`] = res.groupB.targetGroupNumber;
    }
    setSplitResults(nextResults);
    setTargetGroupMapping(nextMap);
    setStatusMsg(
      `Đã chia ngẫu nhiên cả 4 Tổ của Lớp ${classId} thành 8 nhóm có tổng điểm đánh giá cân bằng!`
    );
  };

  const handleApplyOneToSplit = async (toNum: number) => {
    const res = splitResults[toNum];
    if (!res) return;
    const groupA = targetGroupMapping[`${toNum}-A`] || res.groupA.targetGroupNumber;
    const groupB = targetGroupMapping[`${toNum}-B`] || res.groupB.targetGroupNumber;
    setSaving(true);
    try {
      const updates = [
        ...res.groupA.students.map((s) => ({ id: s.id, groupNumber: groupA })),
        ...res.groupB.students.map((s) => ({ id: s.id, groupNumber: groupB })),
      ];
      await bulkStudentsAction({ mode: 'patch', students: updates });
      setStatusMsg(`Đã lưu kết quả chia Tổ ${toNum} vào Nhóm ${groupA} & Nhóm ${groupB}.`);
      await onRefreshWorkspace();
    } finally {
      setSaving(false);
    }
  };

  const handleApplyAllSplitResults = async () => {
    const updates: Array<{ id: string; groupNumber: GroupNumber }> = [];
    Object.values(splitResults).forEach((res) => {
      const groupA = targetGroupMapping[`${res.to}-A`] || res.groupA.targetGroupNumber;
      const groupB = targetGroupMapping[`${res.to}-B`] || res.groupB.targetGroupNumber;
      res.groupA.students.forEach((s) => updates.push({ id: s.id, groupNumber: groupA }));
      res.groupB.students.forEach((s) => updates.push({ id: s.id, groupNumber: groupB }));
    });
    if (updates.length === 0) return;
    setSaving(true);
    try {
      await bulkStudentsAction({ mode: 'patch', students: updates });
      setStatusMsg(`Đã lưu phân công ${updates.length} học sinh vào 8 Nhóm QR của Lớp ${classId}.`);
      await onRefreshWorkspace();
    } finally {
      setSaving(false);
    }
  };

  const renderBucketCard = (toNum: number, sideKey: 'A' | 'B', bucket: ScoreGroupBucket) => {
    const mappedGroup = targetGroupMapping[`${toNum}-${sideKey}`] || bucket.targetGroupNumber;
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              Nhóm {mappedGroup}
            </h4>
            <div className="text-xs font-mono tabular-nums text-slate-600 flex items-center gap-2 mt-0.5">
              <span>{bucket.count} HS</span>
              <span aria-hidden="true">·</span>
              <span>
                Tổng điểm: <strong className="text-blue-700 text-sm">{bucket.totalScore}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>TB: {bucket.avgScore}</span>
            </div>
          </div>

          <select
            value={mappedGroup}
            onChange={(e) =>
              setTargetGroupMapping((prev) => ({
                ...prev,
                [`${toNum}-${sideKey}`]: Number(e.target.value) as GroupNumber,
              }))
            }
            className="px-2 py-1 text-xs font-semibold border border-slate-200 rounded-lg bg-white"
          >
            {GROUP_NUMBERS.map((g) => (
              <option key={g} value={g}>
                Lưu → Nhóm {g}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5">
          {bucket.students.length === 0 ? (
            <div className="text-xs text-slate-400">Chưa có thành viên</div>
          ) : (
            bucket.students.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-800 flex items-center gap-1 truncate">
                  {s.name}
                  {s.isLeader && <Crown className="w-3 h-3 text-amber-500 shrink-0" />}
                </span>
                <span className="font-mono font-bold tabular-nums text-blue-700 shrink-0 ml-2">
                  {s.score} đ
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const activeSplit = splitResults[selectedTo];
  const splitKeysCount = Object.keys(splitResults).length;

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Chia 4 Tổ → 8 Nhóm Ngẫu Nhiên Cân Bằng Tổng Điểm — Lớp {classId}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Mỗi học sinh có điểm đánh giá (1–10). Khi bấm Chia nhóm ngẫu nhiên, hệ thống sẽ tính toán chia mỗi Tổ thành 2 nhóm sao cho tổng điểm cộng lại của 2 nhóm gần bằng nhau nhất.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleRandomSplitAllFourTos}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap"
            >
              <Shuffle className="w-4 h-4" />
              Chia nhóm ngẫu nhiên cả 4 Tổ (8 Nhóm)
            </button>

            {splitKeysCount > 0 && (
              <button
                type="button"
                onClick={handleApplyAllSplitResults}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition-colors whitespace-nowrap"
              >
                <Check className="w-4 h-4" />
                Lưu tất cả kết quả ({splitKeysCount} Tổ)
              </button>
            )}
          </div>
        </div>

        {/* Tổ Selector Tabs */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 mr-1">Chọn Tổ:</span>
          {allTos.map((toNum) => {
            const members = classStudents.filter((s) => s.to === toNum);
            const sumScore = Number(members.reduce((acc, s) => acc + (s.score || 0), 0).toFixed(1));
            return (
              <button
                key={toNum}
                type="button"
                onClick={() => setSelectedTo(toNum)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap tabular-nums ${
                  selectedTo === toNum
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Tổ {toNum} ({members.length} HS · {sumScore}đ)
              </button>
            );
          })}
        </div>

        {statusMsg && (
          <div className="mt-3 p-2.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl">
            {statusMsg}
          </div>
        )}
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 5 cols: Members in Tổ + Batch Assign */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                Thành viên Tổ {selectedTo} ({studentsInSelectedTo.length} HS)
              </h3>
              <button
                type="button"
                onClick={() => handleRandomSplitOneTo(selectedTo)}
                disabled={studentsInSelectedTo.length < 2}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-xl whitespace-nowrap"
              >
                <Shuffle className="w-3.5 h-3.5" />
                Chia ngẫu nhiên Tổ {selectedTo}
              </button>
            </div>

            {studentsInSelectedTo.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                Tổ {selectedTo} chưa có học sinh. Chọn học sinh bên dưới để thêm vào tổ này.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 mt-2">
                {studentsInSelectedTo.map((stu) => (
                  <div key={stu.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5 truncate">
                        <span>{stu.name}</span>
                        {stu.isLeader && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        Đang ở Nhóm {stu.groupNumber}
                        {stu.birthDate ? ` · ${stu.birthDate}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <label
                        title="Tick chọn Nhóm trưởng"
                        className="inline-flex items-center gap-1 text-xs text-slate-600 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(stu.isLeader)}
                          onChange={() => handleLeaderQuickToggle(stu.id, Boolean(stu.isLeader))}
                          className="rounded border-slate-300 text-amber-600"
                        />
                        <span>NT</span>
                      </label>

                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-500">Điểm:</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          step="0.5"
                          value={stu.score ?? 7}
                          onChange={(e) => handleScoreQuickUpdate(stu.id, e.target.value)}
                          className="w-16 px-2 py-1 text-xs font-mono font-bold tabular-nums border border-slate-200 rounded-lg bg-white text-center"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Batch Assign Students into Selected Tổ */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-slate-600" />
                Chuyển học sinh khác vào Tổ {selectedTo}
              </h4>
              <button
                type="button"
                onClick={handleBatchAddToSelectedTo}
                disabled={saving || Object.values(selectedToAssignIds).filter(Boolean).length === 0}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 rounded-lg whitespace-nowrap"
              >
                Chuyển vào Tổ {selectedTo}
              </button>
            </div>

            {studentsOutsideSelectedTo.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                Tất cả học sinh lớp {classId} đã thuộc Tổ {selectedTo}.
              </p>
            ) : (
              <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-slate-100">
                {studentsOutsideSelectedTo.map((stu) => (
                  <label
                    key={stu.id}
                    className="py-2 flex items-center justify-between gap-2 text-xs cursor-pointer hover:bg-slate-50 px-1 rounded"
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedToAssignIds[stu.id])}
                        onChange={(e) =>
                          setSelectedToAssignIds((prev) => ({ ...prev, [stu.id]: e.target.checked }))
                        }
                        className="rounded border-slate-300 text-blue-600"
                      />
                      <span className="font-medium text-slate-800">{stu.name}</span>
                    </div>
                    <span className="font-mono text-slate-500">
                      Tổ {stu.to} · {stu.score}đ
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right 7 cols: Equal-Sum Split Preview */}
        <div className="lg:col-span-7 space-y-5">
          {/* Selected Tổ Split Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Scale className="w-4 h-4 text-emerald-600" />
                  Kết quả chia Tổ {selectedTo} thành 2 Nhóm cân bằng điểm
                </h3>
                <p className="text-xs text-slate-500">
                  Mặc định Tổ {selectedTo} chia thành Nhóm {(selectedTo - 1) * 2 + 1} &amp; Nhóm{' '}
                  {(selectedTo - 1) * 2 + 2}.
                </p>
              </div>
              {activeSplit && (
                <div className="text-xs font-mono tabular-nums font-bold text-emerald-700 shrink-0">
                  Chênh lệch tổng điểm: {activeSplit.scoreDiff} đ
                </div>
              )}
            </div>

            {!activeSplit ? (
              <div className="py-10 text-center text-sm text-slate-500">
                Nhấn <strong className="text-slate-800">&quot;Chia ngẫu nhiên Tổ {selectedTo}&quot;</strong> hoặc{' '}
                <strong className="text-slate-800">&quot;Chia nhóm ngẫu nhiên cả 4 Tổ&quot;</strong> để xem kết quả chia cân bằng tổng điểm.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renderBucketCard(selectedTo, 'A', activeSplit.groupA)}
                  {renderBucketCard(selectedTo, 'B', activeSplit.groupB)}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleRandomSplitOneTo(selectedTo)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl whitespace-nowrap"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    Xáo trộn ngẫu nhiên lại
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyOneToSplit(selectedTo)}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl whitespace-nowrap"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Lưu 2 nhóm Tổ {selectedTo}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* All 4 Tổ Summary Grid when split all is triggered */}
          {splitKeysCount > 1 && (
            <div className="bg-white border border-blue-200 rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 mb-4">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  Tổng quan 8 Nhóm sau khi chia cả 4 Tổ
                </h3>
                <button
                  type="button"
                  onClick={handleApplyAllSplitResults}
                  disabled={saving}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl whitespace-nowrap"
                >
                  Lưu cả 8 Nhóm ngay
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FIXED_TOS.map((toNum) => {
                  const res = splitResults[toNum];
                  if (!res) return null;
                  return (
                    <div key={toNum} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                        <span>Tổ {toNum}</span>
                        <span className="font-mono text-emerald-700">Lệch {res.scoreDiff}đ</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 bg-white border border-slate-200 rounded-lg">
                          <div className="font-bold text-blue-700">
                            Nhóm {res.groupA.targetGroupNumber} ({res.groupA.totalScore}đ)
                          </div>
                          <div className="text-slate-600 mt-1 space-y-0.5">
                            {res.groupA.students.map((s) => (
                              <div key={s.id} className="truncate">
                                {s.name} ({s.score})
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="p-2 bg-white border border-slate-200 rounded-lg">
                          <div className="font-bold text-blue-700">
                            Nhóm {res.groupB.targetGroupNumber} ({res.groupB.totalScore}đ)
                          </div>
                          <div className="text-slate-600 mt-1 space-y-0.5">
                            {res.groupB.students.map((s) => (
                              <div key={s.id} className="truncate">
                                {s.name} ({s.score})
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
