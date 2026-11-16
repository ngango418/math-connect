import { useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  Calendar,
  CheckSquare,
  Crown,
  RefreshCw,
  Rocket,
  Square,
  Users,
} from 'lucide-react';
import {
  GROUP_NUMBERS,
  type ClassroomInfo,
  type GroupNumber,
  type PublicStudentMissionResponse,
} from '../../shared/types.ts';
import { fetchPublicClasses, fetchPublicStudentMission } from '../lib/api.ts';

interface StudentPortalProps {
  initialClassId: string;
  initialGroup: GroupNumber;
  initialDate: string;
  onSyncUrlParams: (classId: string, group: GroupNumber, date: string) => void;
}

const MISSION_ACCENTS: Record<number, { border: string; text: string; bg: string }> = {
  1: { border: 'border-sky-200', text: 'text-sky-700', bg: 'bg-sky-50/70' },
  2: { border: 'border-violet-200', text: 'text-violet-700', bg: 'bg-violet-50/70' },
  3: { border: 'border-emerald-200', text: 'text-emerald-700', bg: 'bg-emerald-50/70' },
  4: { border: 'border-amber-200', text: 'text-amber-700', bg: 'bg-amber-50/70' },
  5: { border: 'border-rose-200', text: 'text-rose-700', bg: 'bg-rose-50/70' },
};

export function StudentPortal({
  initialClassId,
  initialGroup,
  initialDate,
  onSyncUrlParams,
}: StudentPortalProps) {
  const [classes, setClasses] = useState<ClassroomInfo[]>([]);
  const [classId, setClassId] = useState<string>(initialClassId);
  const [groupNumber, setGroupNumber] = useState<GroupNumber>(initialGroup);
  const [date, setDate] = useState<string>(initialDate);
  const [data, setData] = useState<PublicStudentMissionResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [checkedCards, setCheckedCards] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchPublicClasses().then((list) => {
      setClasses(list);
      if (list.length > 0 && !list.some((c) => c.id === initialClassId)) {
        setClassId(list[0].id);
      }
    });
  }, [initialClassId]);

  const loadMission = async (cls: string, grp: GroupNumber, dt: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchPublicStudentMission(cls, grp, dt);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải thông tin nhiệm vụ nhóm.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setClassId(initialClassId);
    setGroupNumber(initialGroup);
    setDate(initialDate);
  }, [initialClassId, initialGroup, initialDate]);

  useEffect(() => {
    onSyncUrlParams(classId, groupNumber, date);
    loadMission(classId, groupNumber, date);
    setCheckedCards({});
  }, [classId, groupNumber, date, onSyncUrlParams]);

  const toggleCardDone = (instanceKey: string) => {
    setCheckedCards((prev) => ({ ...prev, [instanceKey]: !prev[instanceKey] }));
  };

  const completedCount = data
    ? data.cards.filter((_, idx) => checkedCards[`${data.date}-${idx}`]).length
    : 0;
  const totalCards = data?.cards.length || 0;
  const progressPct = totalCards > 0 ? Math.round((completedCount / totalCards) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Friendly Welcome & Selector Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 mb-1">
              <Rocket className="w-4 h-4" />
              Sân chơi Nhiệm vụ Nhóm
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Cổng Thông Tin Học Sinh
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Quét mã QR của nhóm mình hoặc chọn lớp &amp; nhóm bên dưới để nhận thẻ thử thách hôm nay!
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadMission(classId, groupNumber, date)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 self-start lg:self-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Làm mới
          </button>
        </div>

        <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-3">
            <label htmlFor="student-class-select" className="block text-xs font-semibold text-slate-500 mb-1.5">
              Chọn Lớp học
            </label>
            <select
              id="student-class-select"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="w-full px-3 py-2 text-sm font-bold text-blue-700 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {(classes.length > 0 ? classes : [{ id: classId, name: classId }]).map((cls) => (
                <option key={cls.id} value={cls.id}>
                  Lớp {cls.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-6">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Chọn Nhóm (1–8)</label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 p-1 bg-slate-100 rounded-xl">
              {GROUP_NUMBERS.map((grp) => (
                <button
                  key={grp}
                  type="button"
                  onClick={() => setGroupNumber(grp)}
                  className={`py-1.5 px-2 text-xs sm:text-sm font-bold rounded-lg transition-colors whitespace-nowrap tabular-nums ${
                    groupNumber === grp
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  N{grp}
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-3">
            <label htmlFor="student-date-input" className="block text-xs font-semibold text-slate-500 mb-1.5">
              Ngày học
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="student-date-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
          Đang tải nhiệm vụ của Nhóm {groupNumber} — Lớp {classId}...
        </div>
      ) : error ? (
        <div className="bg-white border border-red-200 rounded-2xl p-6 text-sm text-red-700">
          {error}
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Mission Banner + Progress */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1.5">
                  <span className="font-bold text-blue-700">Lớp {data.classId}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-bold text-slate-900">Nhóm {data.groupNumber}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{data.date}</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900">{data.lessonTopic}</h2>
              </div>

              <div className="flex items-center gap-6 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                <div>
                  <div className="text-xs text-slate-500">Tiến độ thẻ</div>
                  <div className="text-xl font-extrabold font-mono tabular-nums text-emerald-700">
                    {completedCount}/{totalCards} ({progressPct}%)
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Thành viên</div>
                  <div className="text-xl font-extrabold font-mono tabular-nums text-slate-900">
                    {data.students.length} bạn
                  </div>
                </div>
              </div>
            </div>

            {totalCards > 0 && (
              <div className="mt-4 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 8 cols: Assigned Mission Cards + Homework */}
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-blue-600" />
                    Thẻ nhiệm vụ của Nhóm {data.groupNumber}
                  </h3>
                  <span className="text-xs text-slate-500">Chạm vào thẻ để đánh dấu xong</span>
                </div>

                {data.cards.length === 0 ? (
                  <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl text-sm text-slate-500">
                    Giáo viên chưa phát thẻ nhiệm vụ cho Nhóm {data.groupNumber} vào ngày này.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.cards.map((card, idx) => {
                      const instanceKey = `${data.date}-${idx}`;
                      const isDone = Boolean(checkedCards[instanceKey]);
                      const accent = MISSION_ACCENTS[card.missionId] || MISSION_ACCENTS[1];
                      return (
                        <button
                          key={`${card.id}-${idx}`}
                          type="button"
                          onClick={() => toggleCardDone(instanceKey)}
                          className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3.5 ${
                            isDone
                              ? 'bg-emerald-50 border-emerald-300'
                              : `${accent.bg} ${accent.border} hover:brightness-98`
                          }`}
                        >
                          <span className="mt-0.5 text-slate-700 shrink-0">
                            {isDone ? (
                              <CheckSquare className="w-5 h-5 text-emerald-700" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-400" />
                            )}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1">
                              <span className={`font-mono font-bold ${accent.text}`}>
                                Thẻ #{idx + 1} · {card.code}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>Nhiệm vụ {card.missionId}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">{card.durationMinutes} phút</span>
                            </div>
                            <div
                              className={`text-base font-bold ${
                                isDone ? 'line-through text-slate-500' : 'text-slate-900'
                              }`}
                            >
                              {card.title}
                            </div>
                            {card.description && (
                              <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                                {card.description}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Homework Block */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  Bài tập về nhà cho Nhóm {data.groupNumber}
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {data.homework}
                </p>
                {data.teacherNote && (
                  <div className="mt-4 pt-4 border-t border-slate-100 text-sm text-slate-600">
                    <span className="font-semibold text-slate-800">Lưu ý của thầy/cô: </span>
                    {data.teacherNote}
                  </div>
                )}
              </div>
            </div>

            {/* Right 4 cols: Group Roster + Live Score */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
                  <Users className="w-4 h-4 text-blue-600" />
                  Thành viên Nhóm {data.groupNumber}
                </h3>

                {data.students.length === 0 ? (
                  <p className="text-sm text-slate-500">Chưa có học sinh nào trong nhóm này.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {data.students.map((stu, idx) => (
                      <div key={stu.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                            <span>
                              {idx + 1}. {stu.name}
                            </span>
                            {stu.isLeader && (
                              <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-label="Nhóm trưởng" />
                            )}
                          </div>
                          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span>Tổ {stu.to}</span>
                            {stu.birthDate && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">{stu.birthDate}</span>
                              </>
                            )}
                            {stu.isLeader && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-amber-700 font-semibold">Nhóm trưởng</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {data.publishedGrade && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-3">
                    <Award className="w-4 h-4 text-emerald-600" />
                    Điểm hoạt động hôm nay
                  </h3>
                  <div className="grid grid-cols-2 gap-3 py-3 border-y border-slate-100 text-xs">
                    <div>
                      <div className="text-slate-500">Điểm nhiệm vụ</div>
                      <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                        {data.publishedGrade.baseScore.toFixed(1)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Điểm cộng / trừ</div>
                      <div className="text-lg font-bold font-mono tabular-nums">
                        <span className="text-emerald-700">+{data.publishedGrade.bonusPoints}</span>
                        {' / '}
                        <span className="text-rose-600">-{data.publishedGrade.penaltyPoints}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-slate-700">Tổng điểm nhóm:</span>
                    <span className="text-2xl font-extrabold font-mono tabular-nums text-blue-700">
                      {data.publishedGrade.finalScore.toFixed(1)} đ
                    </span>
                  </div>
                  {data.publishedGrade.feedback && (
                    <p className="text-xs text-slate-600 mt-3 pt-3 border-t border-slate-100">
                      {data.publishedGrade.feedback}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
