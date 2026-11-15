import { useEffect, useState } from 'react';
import { BookOpen, Calendar, CheckSquare, Square, Users, Award, RefreshCw } from 'lucide-react';
import { CLASS_IDS, GROUP_NUMBERS, type ClassId, type GroupNumber, type PublicStudentMissionResponse } from '../../shared/types.ts';
import { fetchPublicStudentMission } from '../lib/api.ts';

interface StudentPortalProps {
  initialClassId: ClassId;
  initialGroup: GroupNumber;
  initialDate: string;
  onSyncUrlParams: (classId: ClassId, group: GroupNumber, date: string) => void;
}

export function StudentPortal({
  initialClassId,
  initialGroup,
  initialDate,
  onSyncUrlParams,
}: StudentPortalProps) {
  const [classId, setClassId] = useState<ClassId>(initialClassId);
  const [groupNumber, setGroupNumber] = useState<GroupNumber>(initialGroup);
  const [date, setDate] = useState<string>(initialDate);
  const [data, setData] = useState<PublicStudentMissionResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [checkedCards, setCheckedCards] = useState<Record<string, boolean>>({});

  const loadMission = async (cls: ClassId, grp: GroupNumber, dt: string) => {
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
  }, [classId, groupNumber, date]);

  const toggleCardDone = (instanceKey: string) => {
    setCheckedCards((prev) => ({ ...prev, [instanceKey]: !prev[instanceKey] }));
  };

  const completedCount = data
    ? data.cards.filter((_, idx) => checkedCards[`${data.date}-${idx}`]).length
    : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Selector Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Cổng Thông Tin Nhiệm Vụ Học Sinh
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Quét mã QR trên thẻ nhóm hoặc chọn lớp và nhóm để xem nhiệm vụ và bài tập về nhà trong ngày.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadMission(classId, groupNumber, date)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start lg:self-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Làm mới dữ liệu
          </button>
        </div>

        <div className="mt-5 pt-5 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Chọn Lớp</label>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {CLASS_IDS.map((cls) => (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setClassId(cls)}
                  className={`flex-1 py-2 px-3 text-sm font-semibold rounded-md transition-colors whitespace-nowrap ${
                    classId === cls
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Lớp {cls}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Chọn Nhóm (1–5)</label>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {GROUP_NUMBERS.map((grp) => (
                <button
                  key={grp}
                  type="button"
                  onClick={() => setGroupNumber(grp)}
                  className={`flex-1 py-2 px-2 text-sm font-semibold rounded-md transition-colors whitespace-nowrap tabular-nums ${
                    groupNumber === grp
                      ? 'bg-blue-700 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  N{grp}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="student-date-input" className="block text-xs font-medium text-slate-500 mb-1.5">
              Ngày học
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="student-date-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
          Đang tải nhiệm vụ của Nhóm {groupNumber} — Lớp {classId}...
        </div>
      ) : error ? (
        <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-700">
          {error}
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Mission Banner Summary */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1.5">
                  <span className="font-semibold text-blue-700">Lớp {data.classId}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-slate-800">Nhóm {data.groupNumber}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{data.date}</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900">{data.lessonTopic}</h2>
              </div>

              <div className="flex items-center gap-6 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                <div>
                  <div className="text-xs text-slate-500">Số thẻ hôm nay</div>
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-900">
                    {completedCount}/{data.cards.length} thẻ
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Thành viên</div>
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-900">
                    {data.students.length} HS
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 8 cols: Assigned Mission Cards + Homework */}
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-blue-700" />
                    Nhiệm vụ thẻ được giao ({data.cards.length} thẻ)
                  </h3>
                  <span className="text-xs text-slate-500">Nhấn để đánh dấu đã hoàn thành</span>
                </div>

                {data.cards.length === 0 ? (
                  <div className="py-8 text-center border border-dashed border-slate-200 rounded-lg text-sm text-slate-500">
                    Giáo viên chưa phân công thẻ nhiệm vụ nào cho Nhóm {data.groupNumber} trong ngày này.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.cards.map((card, idx) => {
                      const instanceKey = `${data.date}-${idx}`;
                      const isDone = Boolean(checkedCards[instanceKey]);
                      return (
                        <button
                          key={`${card.id}-${idx}`}
                          type="button"
                          onClick={() => toggleCardDone(instanceKey)}
                          className={`w-full text-left p-4 rounded-xl border transition-colors flex items-start gap-3.5 ${
                            isDone
                              ? 'bg-emerald-50/70 border-emerald-200'
                              : 'bg-slate-50/60 border-slate-200 hover:bg-slate-50'
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
                              <span className="font-mono font-semibold text-blue-700">
                                Thẻ #{idx + 1} · {card.code}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>Nhiệm vụ cứng {card.missionId}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">{card.durationMinutes} phút</span>
                              {card.isDuplicate && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-amber-700 font-medium">Thẻ song song</span>
                                </>
                              )}
                            </div>
                            <div
                              className={`text-base font-semibold ${
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
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  Bài tập về nhà cho Nhóm {data.groupNumber}
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {data.homework}
                </p>
                {data.teacherNote && (
                  <div className="mt-4 pt-4 border-t border-slate-100 text-sm text-slate-600">
                    <span className="font-semibold text-slate-800">Lưu ý của giáo viên: </span>
                    {data.teacherNote}
                  </div>
                )}
              </div>
            </div>

            {/* Right 4 cols: Group Roster + Daily Grade if published */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
                  <Users className="w-4 h-4 text-blue-700" />
                  Danh sách học sinh Nhóm {data.groupNumber}
                </h3>

                {data.students.length === 0 ? (
                  <p className="text-sm text-slate-500">Chưa có học sinh nào được gán vào nhóm này.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {data.students.map((stu, idx) => (
                      <div key={stu.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {idx + 1}. {stu.name}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono">{stu.studentCode}</span>
                            <span aria-hidden="true">·</span>
                            <span>Tổ {stu.to}</span>
                            {stu.note && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-blue-700 font-medium">{stu.note}</span>
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
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-3">
                    <Award className="w-4 h-4 text-emerald-700" />
                    Điểm & Xếp hạng hôm nay
                  </h3>
                  <div className="grid grid-cols-2 gap-4 py-3 border-y border-slate-100">
                    <div>
                      <div className="text-xs text-slate-500">Điểm nhóm</div>
                      <div className="text-2xl font-bold font-mono tabular-nums text-blue-700">
                        {data.publishedGrade.score.toFixed(1)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Chất lượng (1–5)</div>
                      <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                        Mức {data.publishedGrade.qualityOrder}/5
                      </div>
                    </div>
                  </div>
                  {data.publishedGrade.feedback && (
                    <p className="text-sm text-slate-600 mt-3">{data.publishedGrade.feedback}</p>
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
