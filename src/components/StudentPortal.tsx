import { useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  Calendar,
  CheckSquare,
  Crown,
  Lock,
  QrCode,
  RefreshCw,
  Rocket,
  ShieldAlert,
  Square,
  Users,
} from 'lucide-react';
import type { GroupNumber, PublicStudentMissionResponse } from '../../shared/types.ts';
import { verifyQrAccessToken } from '../../shared/qrToken.ts';
import { fetchPublicStudentMission } from '../lib/api.ts';

interface StudentPortalProps {
  classId: string;
  groupNumber: GroupNumber;
  date: string;
  qrToken: string;
}

const MISSION_ACCENTS: Record<number, { border: string; text: string; bg: string }> = {
  1: { border: 'border-sky-200', text: 'text-sky-700', bg: 'bg-sky-50/70' },
  2: { border: 'border-violet-200', text: 'text-violet-700', bg: 'bg-violet-50/70' },
  3: { border: 'border-emerald-200', text: 'text-emerald-700', bg: 'bg-emerald-50/70' },
  4: { border: 'border-amber-200', text: 'text-amber-700', bg: 'bg-amber-50/70' },
  5: { border: 'border-rose-200', text: 'text-rose-700', bg: 'bg-rose-50/70' },
};

export function StudentPortal({
  classId,
  groupNumber,
  date,
  qrToken,
}: StudentPortalProps) {
  const isAuthorizedQr = verifyQrAccessToken(classId, groupNumber, date, qrToken);
  const hasTamperedToken = Boolean(qrToken.trim()) && !isAuthorizedQr;

  const [data, setData] = useState<PublicStudentMissionResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(isAuthorizedQr);
  const [error, setError] = useState<string>('');
  const [checkedCards, setCheckedCards] = useState<Record<string, boolean>>({});

  const loadMission = async () => {
    if (!isAuthorizedQr) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetchPublicStudentMission(classId, groupNumber, date, qrToken);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải thông tin nhiệm vụ nhóm.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCheckedCards({});
    loadMission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, groupNumber, date, qrToken]);

  const toggleCardDone = (instanceKey: string) => {
    setCheckedCards((prev) => ({ ...prev, [instanceKey]: !prev[instanceKey] }));
  };

  if (!isAuthorizedQr) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
          <div
            className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center ${
              hasTamperedToken ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
            }`}
          >
            {hasTamperedToken ? <ShieldAlert className="w-7 h-7" /> : <QrCode className="w-7 h-7" />}
          </div>

          <h1 className="text-xl font-extrabold text-slate-900">
            {hasTamperedToken
              ? 'Liên kết QR không hợp lệ'
              : 'Vui lòng quét mã QR của nhóm mình'}
          </h1>

          <p className="text-sm text-slate-600 leading-relaxed">
            {hasTamperedToken
              ? 'Thông tin lớp hoặc nhóm trong đường dẫn đã bị thay đổi nên hệ thống từ chối truy cập. Hãy dùng camera điện thoại quét lại đúng mã QR của nhóm bạn.'
              : 'Để bảo mật thông tin lớp học và tránh xem nhầm nhiệm vụ của nhóm khác, bạn chỉ có thể truy cập đúng nhóm mình bằng cách quét mã QR do giáo viên phát.'}
          </p>

          <div className="pt-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            Mỗi mã QR chỉ mở được đúng <strong>1 lớp · 1 nhóm · 1 buổi học</strong> tương ứng.
          </div>
        </div>
      </div>
    );
  }

  const completedCount = data
    ? data.cards.filter((_, idx) => checkedCards[`${data.date}-${idx}`]).length
    : 0;
  const totalCards = data?.cards.length || 0;
  const progressPct = totalCards > 0 ? Math.round((completedCount / totalCards) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Locked Group Header Card (No class/group switchers) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 mb-1">
              <Rocket className="w-4 h-4" />
              Sân chơi Nhiệm vụ Nhóm
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Nhiệm vụ Lớp {classId} — Nhóm {groupNumber}
            </h1>
            <div className="mt-2 inline-flex flex-wrap items-center gap-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>Đã khóa theo mã QR: Chỉ xem được Nhóm {groupNumber} · Lớp {classId}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                <Calendar className="w-3 h-3" />
                {date}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={loadMission}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Làm mới
          </button>
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
