import { useMemo, useState } from 'react';
import { Check, Layers, Plus, Shuffle, UserPlus, Users } from 'lucide-react';
import {
  GROUP_NUMBERS,
  type ClassId,
  type GroupNumber,
  type SeedLevel,
  type Student,
} from '../../shared/types.ts';
import { bulkStudentsAction } from '../lib/api.ts';
import {
  distributeClassIntoFiveBalancedGroups,
  splitToIntoTwoBalancedGroups,
  type SplitBucketSummary,
  type TwoGroupSplitResult,
} from '../lib/balancedRandom.ts';

interface SquadSplitTabProps {
  classId: ClassId;
  students: Student[];
  onRefreshWorkspace: () => Promise<void>;
}

export function SquadSplitTab({ classId, students, onRefreshWorkspace }: SquadSplitTabProps) {
  const classStudents = useMemo(
    () => students.filter((s) => s.classId === classId),
    [students, classId]
  );

  const existingTos = useMemo(() => {
    const set = new Set<number>(classStudents.map((s) => s.to));
    if (set.size === 0) set.add(1);
    return Array.from(set).sort((a, b) => a - b);
  }, [classStudents]);

  const [extraTos, setExtraTos] = useState<number[]>([]);
  const allTos = useMemo(() => {
    return Array.from(new Set([...existingTos, ...extraTos])).sort((a, b) => a - b);
  }, [existingTos, extraTos]);

  const [selectedTo, setSelectedTo] = useState<number>(allTos[0] || 1);
  const [selectedToAssignIds, setSelectedToAssignIds] = useState<Record<string, boolean>>({});
  const [splitResults, setSplitResults] = useState<Record<number, TwoGroupSplitResult>>({});
  const [targetGroupMapping, setTargetGroupMapping] = useState<Record<string, GroupNumber>>({});
  const [fiveGroupPreview, setFiveGroupPreview] = useState<Record<GroupNumber, SplitBucketSummary> | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const studentsInSelectedTo = classStudents.filter((s) => s.to === selectedTo);
  const studentsOutsideSelectedTo = classStudents.filter((s) => s.to !== selectedTo);

  const handleAddNewTo = () => {
    const nextTo = (allTos.length > 0 ? Math.max(...allTos) : 0) + 1;
    setExtraTos((prev) => [...prev, nextTo]);
    setSelectedTo(nextTo);
  };

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

  const handleSeedQuickUpdate = async (studentId: string, seed: SeedLevel) => {
    await bulkStudentsAction({
      mode: 'patch',
      students: [{ id: studentId, seed }],
    });
    await onRefreshWorkspace();
  };

  const handleRandomSplitOneTo = (toNum: number) => {
    const members = classStudents.filter((s) => s.to === toNum);
    const res = splitToIntoTwoBalancedGroups(toNum, members);
    setSplitResults((prev) => ({ ...prev, [toNum]: res }));
    // Default mapping suggestion: A -> Nhóm ((toNum*2-2)%5)+1, B -> ((toNum*2-1)%5)+1
    const gA = ((((toNum - 1) * 2) % 5) + 1) as GroupNumber;
    const gB = ((((toNum - 1) * 2 + 1) % 5) + 1) as GroupNumber;
    setTargetGroupMapping((prev) => ({
      ...prev,
      [`${toNum}-A`]: prev[`${toNum}-A`] || gA,
      [`${toNum}-B`]: prev[`${toNum}-B`] || gB,
    }));
    setStatusMsg(`Đã chia ngẫu nhiên cân bằng Tổ ${toNum} thành 2 nhóm theo hạt giống 1–5.`);
  };

  const handleRandomSplitAllTos = () => {
    const nextResults: Record<number, TwoGroupSplitResult> = {};
    const nextMap: Record<string, GroupNumber> = { ...targetGroupMapping };
    for (const toNum of allTos) {
      const members = classStudents.filter((s) => s.to === toNum);
      if (members.length === 0) continue;
      nextResults[toNum] = splitToIntoTwoBalancedGroups(toNum, members);
      const gA = ((((toNum - 1) * 2) % 5) + 1) as GroupNumber;
      const gB = ((((toNum - 1) * 2 + 1) % 5) + 1) as GroupNumber;
      nextMap[`${toNum}-A`] = nextMap[`${toNum}-A`] || gA;
      nextMap[`${toNum}-B`] = nextMap[`${toNum}-B`] || gB;
    }
    setSplitResults(nextResults);
    setTargetGroupMapping(nextMap);
    setStatusMsg(`Đã chia tất cả các Tổ của Lớp ${classId} thành từng cặp 2 nhóm cân bằng.`);
  };

  const handleApplyTwoGroupSplitToMainGroups = async (toNum: number) => {
    const res = splitResults[toNum];
    if (!res) return;
    const groupA = targetGroupMapping[`${toNum}-A`] || 1;
    const groupB = targetGroupMapping[`${toNum}-B`] || 2;
    setSaving(true);
    try {
      const updates = [
        ...res.groupA.students.map((s) => ({ id: s.id, groupNumber: groupA })),
        ...res.groupB.students.map((s) => ({ id: s.id, groupNumber: groupB })),
      ];
      await bulkStudentsAction({ mode: 'patch', students: updates });
      setStatusMsg(
        `Đã lưu kết quả chia Tổ ${toNum}: Nhóm A → Nhóm ${groupA}, Nhóm B → Nhóm ${groupB}.`
      );
      await onRefreshWorkspace();
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateFiveBalancedGroups = () => {
    const res = distributeClassIntoFiveBalancedGroups(classStudents);
    setFiveGroupPreview(res);
    setStatusMsg(`Đã tạo phương án chia toàn bộ ${classStudents.length} HS vào 5 nhóm QR cân bằng.`);
  };

  const handleApplyFiveBalancedGroups = async () => {
    if (!fiveGroupPreview) return;
    setSaving(true);
    try {
      const updates: Array<{ id: string; groupNumber: GroupNumber }> = [];
      GROUP_NUMBERS.forEach((g) => {
        fiveGroupPreview[g].students.forEach((s) => {
          updates.push({ id: s.id, groupNumber: g });
        });
      });
      await bulkStudentsAction({ mode: 'patch', students: updates });
      setStatusMsg(`Đã lưu phân công 5 nhóm cân bằng cho Lớp ${classId}.`);
      setFiveGroupPreview(null);
      await onRefreshWorkspace();
    } finally {
      setSaving(false);
    }
  };

  const renderTierSummary = (bucket: SplitBucketSummary) => (
    <div className="text-xs font-mono tabular-nums text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
      <span>Sĩ số: <strong className="text-slate-900">{bucket.count}</strong></span>
      <span>·</span>
      <span>Hạt giống TB: <strong className="text-blue-700">{bucket.avgSeed}</strong></span>
      <span>·</span>
      <span>
        M1:{bucket.seedCounts[1]} M2:{bucket.seedCounts[2]} M3:{bucket.seedCounts[3]} M4:{bucket.seedCounts[4]} M5:{bucket.seedCounts[5]}
      </span>
    </div>
  );

  const activeSplit = splitResults[selectedTo];

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Quản lý Tổ &amp; Chia Nhóm Ngẫu Nhiên Cân Bằng — Lớp {classId}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Xếp học sinh vào cùng Tổ, đánh giá hạt giống năng lực (1 = Cao nhất → 5 = Thấp nhất) và chia 1 Tổ thành 2 nhóm cân bằng năng lực bằng thuật toán Random phân tầng.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleAddNewTo}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Thêm Tổ mới
            </button>
            <button
              type="button"
              onClick={handleRandomSplitAllTos}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap"
            >
              <Shuffle className="w-4 h-4" />
              Random cân bằng tất cả Tổ
            </button>
            <button
              type="button"
              onClick={handleGenerateFiveBalancedGroups}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <Layers className="w-4 h-4" />
              Chia 5 Nhóm QR toàn lớp
            </button>
          </div>
        </div>

        {/* Tổ Selector Tabs */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 mr-1">Chọn Tổ thao tác:</span>
          {allTos.map((toNum) => {
            const count = classStudents.filter((s) => s.to === toNum).length;
            return (
              <button
                key={toNum}
                type="button"
                onClick={() => setSelectedTo(toNum)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap tabular-nums ${
                  selectedTo === toNum
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Tổ {toNum} ({count} HS)
              </button>
            );
          })}
        </div>

        {statusMsg && <div className="mt-3 text-xs font-medium text-emerald-700">{statusMsg}</div>}
      </div>

      {/* Main Split Workspace for Selected Tổ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 5 cols: Members in Tổ + Batch Add Students into Tổ */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-700" />
                Thành viên Tổ {selectedTo} ({studentsInSelectedTo.length} HS)
              </h3>
              <button
                type="button"
                onClick={() => handleRandomSplitOneTo(selectedTo)}
                disabled={studentsInSelectedTo.length < 2}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-40 rounded-lg whitespace-nowrap"
              >
                <Shuffle className="w-3.5 h-3.5" />
                Chia Tổ {selectedTo} → 2 Nhóm
              </button>
            </div>

            {studentsInSelectedTo.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                Tổ {selectedTo} chưa có học sinh. Chọn học sinh ở khung bên dưới để thêm vào tổ này.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 mt-2">
                {studentsInSelectedTo.map((stu) => (
                  <div key={stu.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{stu.name}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {stu.studentCode} · Đang ở Nhóm {stu.groupNumber}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <label className="text-xs text-slate-500">Hạt giống:</label>
                      <select
                        value={stu.seed}
                        onChange={(e) => handleSeedQuickUpdate(stu.id, Number(e.target.value) as SeedLevel)}
                        className="px-2 py-1 text-xs font-mono font-semibold border border-slate-200 rounded-md bg-white"
                      >
                        <option value={1}>1 (Cao nhất)</option>
                        <option value={2}>2 (Khá)</option>
                        <option value={3}>3 (TB)</option>
                        <option value={4}>4 (Yếu)</option>
                        <option value={5}>5 (Thấp nhất)</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Batch Add Students into Selected Tổ */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-slate-600" />
                Thêm nhiều học sinh vào Tổ {selectedTo}
              </h4>
              <button
                type="button"
                onClick={handleBatchAddToSelectedTo}
                disabled={saving || Object.values(selectedToAssignIds).filter(Boolean).length === 0}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 rounded-lg"
              >
                Chuyển vào Tổ {selectedTo}
              </button>
            </div>

            {studentsOutsideSelectedTo.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">Tất cả học sinh lớp {classId} đã thuộc Tổ {selectedTo}.</p>
            ) : (
              <div className="mt-2 max-h-60 overflow-y-auto divide-y divide-slate-100">
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
                        className="rounded border-slate-300 text-blue-700"
                      />
                      <span className="font-medium text-slate-800">{stu.name}</span>
                    </div>
                    <span className="font-mono text-slate-500">
                      Tổ {stu.to} · Hạt giống {stu.seed}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right 7 cols: Balanced 2-Group Split Result for Selected Tổ + 5-Group Class Split */}
        <div className="lg:col-span-7 space-y-5">
          {/* Result of splitting Selected Tổ -> 2 Groups */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Kết quả Chia ngẫu nhiên cân bằng — Tổ {selectedTo} (2 Nhóm)
                </h3>
                <p className="text-xs text-slate-500">
                  Các học sinh có hạt giống 1→5 được xáo trộn ngẫu nhiên trong từng mức và phân bổ đối xứng sang 2 nhóm.
                </p>
              </div>
              {activeSplit && (
                <div className="text-xs font-mono tabular-nums text-emerald-700 font-semibold shrink-0">
                  Độ lệch TB: {activeSplit.seedDiff}
                </div>
              )}
            </div>

            {!activeSplit ? (
              <div className="py-10 text-center text-sm text-slate-500">
                Nhấn <span className="font-semibold text-slate-800">&quot;Chia Tổ {selectedTo} → 2 Nhóm&quot;</span> ở khung bên trái để hệ thống tự động tạo 2 nhóm ngẫu nhiên cân bằng năng lực.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { key: 'A', bucket: activeSplit.groupA },
                    { key: 'B', bucket: activeSplit.groupB },
                  ].map(({ key, bucket }) => (
                    <div key={key} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <h4 className="text-sm font-bold text-slate-900">{bucket.label}</h4>
                        <select
                          value={targetGroupMapping[`${selectedTo}-${key}`] || 1}
                          onChange={(e) =>
                            setTargetGroupMapping((prev) => ({
                              ...prev,
                              [`${selectedTo}-${key}`]: Number(e.target.value) as GroupNumber,
                            }))
                          }
                          className="px-2 py-1 text-xs font-semibold border border-slate-200 rounded bg-white"
                        >
                          {GROUP_NUMBERS.map((g) => (
                            <option key={g} value={g}>
                              Ánh xạ → Nhóm {g}
                            </option>
                          ))}
                        </select>
                      </div>
                      {renderTierSummary(bucket)}
                      <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5">
                        {bucket.students.map((s) => (
                          <div key={s.id} className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-800">{s.name}</span>
                            <span className="font-mono text-slate-500">Mức {s.seed}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleRandomSplitOneTo(selectedTo)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    Xáo trộn ngẫu nhiên lại
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyTwoGroupSplitToMainGroups(selectedTo)}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Lưu phân công vào Nhóm QR chính
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 5-Group Whole Class Preview */}
          {fiveGroupPreview && (
            <div className="bg-white border border-blue-200 rounded-xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Phương án Chia 5 Nhóm QR cân bằng toàn Lớp {classId}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tự động cân bằng số lượng và hạt giống năng lực (1–5) cho cả 5 thẻ nhóm.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateFiveBalancedGroups}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg"
                  >
                    Random lại
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyFiveBalancedGroups}
                    disabled={saving}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
                  >
                    Áp dụng vào Lớp {classId}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {GROUP_NUMBERS.map((g) => {
                  const bucket = fiveGroupPreview[g];
                  return (
                    <div key={g} className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="text-sm font-bold text-slate-900 mb-1">{bucket.label}</div>
                      {renderTierSummary(bucket)}
                      <div className="mt-2 pt-2 border-t border-slate-200 space-y-1">
                        {bucket.students.map((s) => (
                          <div key={s.id} className="flex items-center justify-between text-xs">
                            <span className="text-slate-800 truncate">{s.name}</span>
                            <span className="font-mono text-slate-500 shrink-0 ml-2">
                              T{s.to}·M{s.seed}
                            </span>
                          </div>
                        ))}
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
