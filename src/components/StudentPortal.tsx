import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Award,
  BookOpen,
  Calendar,
  CheckSquare,
  Crown,
  LifeBuoy,
  Lock,
  PartyPopper,
  QrCode,
  RefreshCw,
  Rocket,
  ShieldAlert,
  Sparkles,
  Square,
  Star,
  Trophy,
  Users,
} from 'lucide-react';
import type { GroupNumber, PublicStudentMissionResponse } from '../../shared/types.ts';
import { verifyQrAccessToken } from '../../shared/qrToken.ts';
import { fetchPublicStudentMission } from '../lib/api.ts';
import {
  broadcastMissionCompletion,
  playMissionSuccessChime,
  type MissionCompletionAlert,
} from '../lib/soundAndBroadcast.ts';
import { GROUP_THEMES, MISSION_THEMES } from '../lib/themePalette.ts';
import studentQrScanImg from '../assets/images/student_qr_scan_1794836621872.jpg';

interface StudentPortalProps {
  classId: string;
  groupNumber: GroupNumber;
  date: string;
  qrToken: string;
  onNotifyClass?: (alert: MissionCompletionAlert) => void;
}

const BURST_PARTICLES = [
  { x: -34, y: -28, color: '#0ea5e9', rotate: -25 },
  { x: 36, y: -26, color: '#10b981', rotate: 35 },
  { x: -42, y: 14, color: '#f59e0b', rotate: -45 },
  { x: 40, y: 18, color: '#f43f5e', rotate: 45 },
  { x: 0, y: -40, color: '#8b5cf6', rotate: 15 },
];

export function StudentPortal({
  classId,
  groupNumber,
  date,
  qrToken,
  onNotifyClass,
}: StudentPortalProps) {
  const isAuthorizedQr = verifyQrAccessToken(classId, groupNumber, date, qrToken);
  const hasTamperedToken = Boolean(qrToken.trim()) && !isAuthorizedQr;
  const teamTheme = GROUP_THEMES[groupNumber] || GROUP_THEMES[1];

  const [data, setData] = useState<PublicStudentMissionResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(isAuthorizedQr);
  const [error, setError] = useState<string>('');
  const [checkedCards, setCheckedCards] = useState<Record<string, boolean>>({});
  const [recentBurstKey, setRecentBurstKey] = useState<string>('');
  const [imgFailed, setImgFailed] = useState(false);

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

  const toggleCardDone = (instanceKey: string, cardTitle: string) => {
    const nextVal = !checkedCards[instanceKey];
    const nextChecked = { ...checkedCards, [instanceKey]: nextVal };
    setCheckedCards(nextChecked);

    if (nextVal) {
      setRecentBurstKey(instanceKey);
      setTimeout(() => {
        setRecentBurstKey((curr) => (curr === instanceKey ? '' : curr));
      }, 700);

      const cardsCount = data?.cards.length || 0;
      const nextDoneCount = data
        ? data.cards.filter((_, idx) => Boolean(nextChecked[`${data.date}-${idx}`])).length
        : 1;
      const allDone = cardsCount > 0 && nextDoneCount === cardsCount;

      playMissionSuccessChime(allDone);
      broadcastMissionCompletion(
        {
          classId,
          groupNumber,
          cardTitle,
          allCompleted: allDone,
          completedCount: nextDoneCount,
          totalCards: Math.max(1, cardsCount),
        },
        qrToken
      ).then((sentAlert) => {
        onNotifyClass?.(sentAlert);
      });
    }
  };

  if (!isAuthorizedQr) {
    return (
      <div className="max-w-4xl mx-auto px-3.5 sm:px-6 py-6 sm:py-10">
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="bg-white border border-slate-200/90 rounded-3xl shadow-[0_14px_40px_-14px_rgba(14,165,233,0.22)] overflow-hidden grid grid-cols-1 md:grid-cols-12 items-stretch"
        >
          <div className="md:col-span-5 bg-gradient-to-br from-sky-100 via-amber-50 to-emerald-100 p-5 sm:p-6 flex items-center justify-center relative overflow-hidden">
            {!imgFailed ? (
              <div className="relative w-full max-w-[220px] sm:max-w-[260px] rounded-2xl overflow-hidden border-2 border-white shadow-md">
                <img
                  src={studentQrScanImg}
                  alt="Minh họa học sinh quét thẻ QR nhận nhiệm vụ"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="w-full h-auto object-cover block"
                />
                {!hasTamperedToken && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-4 top-5 h-1 rounded-full bg-gradient-to-r from-sky-400 via-emerald-400 to-amber-400 opacity-85 animate-scan-beam"
                  />
                )}
              </div>
            ) : (
              <div className="w-36 h-36 sm:w-40 sm:h-40 rounded-3xl bg-white/80 border border-sky-200 flex items-center justify-center text-sky-600">
                <QrCode className="w-16 h-16" />
              </div>
            )}
          </div>

          <div className="md:col-span-7 p-5 sm:p-8 flex flex-col justify-center space-y-4">
            <div
              className={`inline-flex items-center gap-2 text-xs font-bold self-start ${
                hasTamperedToken ? 'text-rose-600' : 'text-sky-700'
              }`}
            >
              {hasTamperedToken ? <ShieldAlert className="w-4 h-4" /> : <QrCode className="w-4 h-4" />}
              <span>{hasTamperedToken ? 'Cảnh báo khóa phạm vi QR' : 'Trạm Quét Nhiệm vụ'}</span>
            </div>

            <h1 className="text-xl sm:text-3xl font-extrabold text-slate-900 leading-tight text-balance">
              {hasTamperedToken
                ? 'Liên kết QR không hợp lệ'
                : 'Quét mã QR để mở khóa thử thách của nhóm mình!'}
            </h1>

            <p className="text-sm text-slate-600 leading-relaxed">
              {hasTamperedToken
                ? 'Thông tin lớp hoặc nhóm trong đường dẫn đã bị thay đổi nên hệ thống từ chối truy cập. Hãy dùng camera điện thoại quét lại đúng mã QR của nhóm bạn.'
                : 'Để đảm bảo bí mật nhiệm vụ giữa các đội, mỗi mã QR chỉ mở được đúng bảng nhiệm vụ của riêng nhóm bạn.'}
            </p>

            <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Mỗi mã QR mở khóa đúng <strong>1 lớp · 1 nhóm · 1 buổi học</strong> tương ứng.
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const completedCount = data
    ? data.cards.filter((_, idx) => checkedCards[`${data.date}-${idx}`]).length
    : 0;
  const totalCards = data?.cards.length || 0;
  const progressPct = totalCards > 0 ? Math.round((completedCount / totalCards) * 100) : 0;
  const allCompleted = totalCards > 0 && completedCount === totalCards;

  return (
    <div className="max-w-5xl mx-auto px-3.5 sm:px-6 py-5 sm:py-7 space-y-5 sm:space-y-6">
      {/* Vibrant Group Quest Banner */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className={`relative overflow-hidden rounded-3xl bg-gradient-to-r ${teamTheme.gradientHeader} p-5 sm:p-7 text-white shadow-[0_14px_34px_-12px_rgba(37,99,235,0.45)]`}
      >
        <div
          aria-hidden="true"
          className="absolute -right-8 -top-8 w-44 h-44 rounded-full bg-white/15 animate-float-slow pointer-events-none"
        />
        <div
          aria-hidden="true"
          className="absolute right-24 -bottom-10 w-28 h-28 rounded-full bg-white/10 animate-float-delayed pointer-events-none"
        />

        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-white/90 mb-1.5">
              <Rocket className="w-4 h-4 shrink-0" />
              <span>{teamTheme.teamLabel}</span>
              <span aria-hidden="true">·</span>
              <span>Lớp {classId}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                <Calendar className="w-3.5 h-3.5" />
                {date}
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-balance break-words">
              Nhiệm vụ Nhóm {groupNumber} — Lớp {classId}
            </h1>
            <p className="mt-1.5 text-sm sm:text-base text-white/90 flex items-center gap-1.5">
              <Lock className="w-4 h-4 shrink-0" />
              <span>Đã khóa riêng tư theo mã QR của nhóm mình</span>
            </p>
          </div>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={loadMission}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-bold text-slate-900 bg-white hover:bg-amber-50 rounded-2xl shadow-sm transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Cập nhật mới
          </motion.button>
        </div>
      </motion.div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-10 sm:p-12 text-center text-sm font-medium text-slate-500">
          Đang mở hộp thẻ nhiệm vụ của Nhóm {groupNumber} — Lớp {classId}...
        </div>
      ) : error ? (
        <div className="bg-white border border-rose-200 rounded-3xl p-6 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : data ? (
        <div className="space-y-5 sm:space-y-6">
          {/* Quest Progress Card */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-[0_8px_24px_-10px_rgba(15,23,42,0.08)]"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-500 mb-1">
                  Chủ đề buổi học · <span className="font-mono tabular-nums">{data.date}</span>
                </div>
                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 text-balance break-words">
                  {data.lessonTopic}
                </h2>
              </div>

              <div className="grid grid-cols-2 sm:flex sm:items-center gap-4 sm:gap-6 shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100">
                <div>
                  <div className="text-xs text-slate-500">Tiến độ thử thách</div>
                  <div className="text-lg sm:text-2xl font-extrabold font-mono tabular-nums text-emerald-600">
                    {completedCount}/{totalCards} ({progressPct}%)
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Thành viên</div>
                  <div className="text-lg sm:text-2xl font-extrabold font-mono tabular-nums text-slate-900">
                    {data.students.length} bạn
                  </div>
                </div>
              </div>
            </div>

            {totalCards > 0 && (
              <div className="mt-4 h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: Math.max(0.03, progressPct / 100) }}
                  transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                  style={{ originX: 0 }}
                  className={`h-full rounded-full bg-gradient-to-r ${teamTheme.gradientHeader}`}
                />
              </div>
            )}

            <AnimatePresence>
              {allCompleted && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 20 }}
                  className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 text-sm font-bold">
                    <PartyPopper className="w-5 h-5 shrink-0" />
                    <span>Tuyệt vời! Nhóm {data.groupNumber} đã hoàn thành 100% nhiệm vụ hôm nay!</span>
                  </div>
                  <Trophy className="w-5 h-5 shrink-0 text-amber-200" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
            {/* Left 8 cols: Interactive Mission Cards + Homework */}
            <div className="lg:col-span-8 space-y-5 sm:space-y-6">
              <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-6 shadow-[0_8px_24px_-10px_rgba(15,23,42,0.08)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-4 sm:mb-5">
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-sky-600 shrink-0" />
                    Thẻ nhiệm vụ của Nhóm {data.groupNumber}
                  </h3>
                  <span className="text-xs font-medium text-slate-500">
                    Chạm vào thẻ để đánh dấu hoàn thành
                  </span>
                </div>

                {data.cards.length === 0 ? (
                  <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-2xl text-sm text-slate-500">
                    Giáo viên chưa phát thẻ nhiệm vụ cho Nhóm {data.groupNumber} vào ngày này.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {data.cards.map((card, idx) => {
                      const instanceKey = `${data.date}-${idx}`;
                      const isDone = Boolean(checkedCards[instanceKey]);
                      const isBursting = recentBurstKey === instanceKey;
                      const mTheme = MISSION_THEMES[card.missionId] || MISSION_THEMES[1];

                      return (
                        <motion.div
                          key={`${card.id}-${idx}`}
                          initial={{ opacity: 0, y: 18, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{
                            type: 'spring',
                            stiffness: 280,
                            damping: 22,
                            delay: idx * 0.08,
                          }}
                          className="relative"
                        >
                          <motion.button
                            type="button"
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => toggleCardDone(instanceKey, card.title)}
                            className={`w-full min-h-[44px] text-left rounded-2xl border-2 overflow-hidden transition-colors ${
                              isDone
                                ? 'bg-emerald-50/90 border-emerald-400'
                                : `${mTheme.bg} ${mTheme.border}`
                            }`}
                          >
                            {/* Vibrant Top Strip */}
                            <div
                              className={`px-4 py-2 bg-gradient-to-r ${
                                isDone ? 'from-emerald-500 to-teal-500' : mTheme.headerBar
                              } text-white flex items-center justify-between gap-2 text-xs font-bold`}
                            >
                              <span className="font-mono">
                                Thẻ #{idx + 1} · {card.code} · Nhiệm vụ {card.missionId}
                              </span>
                              <span className="font-mono tabular-nums">
                                {card.durationMinutes} phút
                              </span>
                            </div>

                            <div className="p-4 flex items-start gap-3.5">
                              <span className="mt-0.5 shrink-0">
                                {isDone ? (
                                  <CheckSquare className="w-6 h-6 text-emerald-600" />
                                ) : (
                                  <Square className="w-6 h-6 text-slate-400" />
                                )}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div
                                  className={`text-lg sm:text-xl font-extrabold ${
                                    isDone ? 'line-through text-slate-500' : 'text-slate-900'
                                  }`}
                                >
                                  {card.title}
                                </div>
                                {card.description && (
                                  <p className="text-sm sm:text-base text-slate-700 mt-1.5 leading-relaxed">
                                    {card.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </motion.button>

                          {/* Celebration burst on card completion */}
                          <AnimatePresence>
                            {isBursting && (
                              <div
                                aria-hidden="true"
                                className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 z-10"
                              >
                                {BURST_PARTICLES.map((p, pIdx) => (
                                  <motion.span
                                    key={pIdx}
                                    initial={{ opacity: 1, x: 0, y: 0, scale: 0.4, rotate: 0 }}
                                    animate={{ opacity: 0, x: p.x, y: p.y, scale: 1.25, rotate: p.rotate }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.55, ease: 'easeOut' }}
                                    style={{ backgroundColor: p.color }}
                                    className="absolute w-2.5 h-2.5 rounded-sm"
                                  />
                                ))}
                              </div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Homework Block */}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.14 }}
                className="bg-gradient-to-br from-amber-50 to-orange-50/70 border border-amber-200 rounded-3xl p-4 sm:p-6"
              >
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
                  Bài tập về nhà cho Nhóm {data.groupNumber}
                </h3>
                <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line break-words">
                  {data.homework}
                </p>
                {data.teacherNote && (
                  <div className="mt-4 pt-4 border-t border-amber-200/80 text-sm text-slate-700 break-words">
                    <span className="font-bold text-amber-900">Lời nhắn của thầy/cô: </span>
                    {data.teacherNote}
                  </div>
                )}
              </motion.div>
            </div>

            {/* Right 4 cols: Privilege Card + Team Score + Members */}
            <div className="lg:col-span-4 space-y-5 sm:space-y-6">
              {data.publishedGrade?.privilegeCard === 'NO_HOMEWORK' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                  className="rounded-3xl p-5 sm:p-6 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 text-white shadow-[0_14px_30px_-10px_rgba(16,185,129,0.5)]"
                >
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-extrabold text-amber-200">
                    <Trophy className="w-5 h-5 shrink-0" />
                    <span>Thẻ Đặc Quyền của Nhóm {data.groupNumber}</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold font-display mt-1">
                    NO HOMEWORK
                  </div>
                  <p className="text-sm text-white/95 mt-1 font-medium">
                    Chúc mừng! Nhóm bạn đạt top điểm cao và được miễn Bài tập về nhà hôm nay!
                  </p>
                </motion.div>
              )}

              {data.publishedGrade?.privilegeCard === 'SOS' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                  className="rounded-3xl p-5 sm:p-6 bg-gradient-to-br from-rose-500 via-pink-500 to-orange-500 text-white shadow-[0_14px_30px_-10px_rgba(244,63,94,0.48)]"
                >
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-extrabold text-amber-200">
                    <LifeBuoy className="w-5 h-5 shrink-0" />
                    <span>Thẻ Đặc Quyền của Nhóm {data.groupNumber}</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold font-display mt-1">
                    THẺ SOS
                  </div>
                  <p className="text-sm text-white/95 mt-1 font-medium">
                    Chúc mừng! Nhóm bạn nhận quyền cứu trợ đặc biệt hoặc gợi ý trực tiếp từ Thầy/Cô!
                  </p>
                </motion.div>
              )}

              {data.publishedGrade && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
                  className="bg-white border border-slate-200/90 rounded-3xl overflow-hidden shadow-[0_8px_24px_-10px_rgba(15,23,42,0.08)]"
                >
                  <div className={`px-4 sm:px-6 py-4 bg-gradient-to-r ${teamTheme.gradientHeader} text-white flex items-center justify-between gap-2`}>
                    <h3 className="text-lg font-extrabold flex items-center gap-2">
                      <Award className="w-5 h-5 shrink-0" />
                      Bảng điểm Nhóm {data.groupNumber}
                    </h3>
                    <Star className="w-4 h-4 text-amber-200 shrink-0" />
                  </div>
                  <div className="p-4 sm:p-6">
                    <div className="grid grid-cols-2 gap-3 pb-4 border-b border-slate-100 text-xs sm:text-sm">
                      <div className="p-3 rounded-2xl bg-slate-50">
                        <div className="text-slate-500 font-semibold">Điểm nhiệm vụ</div>
                        <div className="text-xl font-extrabold font-mono tabular-nums text-slate-900 mt-0.5">
                          {data.publishedGrade.baseScore.toFixed(1)}
                        </div>
                      </div>
                      <div className="p-3 rounded-2xl bg-slate-50">
                        <div className="text-slate-500 font-semibold">Cộng / Trừ</div>
                        <div className="text-xl font-extrabold font-mono tabular-nums mt-0.5">
                          <span className="text-emerald-600">+{data.publishedGrade.bonusPoints}</span>
                          {' / '}
                          <span className="text-rose-600">-{data.publishedGrade.penaltyPoints}</span>
                        </div>
                      </div>
                    </div>

                    {data.publishedGrade.criteria && (
                      <div className="grid grid-cols-2 gap-2 py-3.5 border-b border-slate-100 text-xs">
                        <div className="p-2.5 rounded-xl bg-sky-50 text-sky-900 flex items-center justify-between gap-1">
                          <span className="font-semibold truncate">Tham gia</span>
                          <span className="font-mono font-extrabold">{data.publishedGrade.criteria.participation}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-violet-50 text-violet-900 flex items-center justify-between gap-1">
                          <span className="font-semibold truncate">Hợp tác</span>
                          <span className="font-mono font-extrabold">{data.publishedGrade.criteria.collaboration}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-900 flex items-center justify-between gap-1">
                          <span className="font-semibold truncate">Chính xác</span>
                          <span className="font-mono font-extrabold">{data.publishedGrade.criteria.accuracy}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-amber-50 text-amber-900 flex items-center justify-between gap-1">
                          <span className="font-semibold truncate">Sáng tạo</span>
                          <span className="font-mono font-extrabold">{data.publishedGrade.criteria.creativity}</span>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm sm:text-base font-bold text-slate-700">Tổng điểm (tối đa 10):</span>
                      <span className={`text-3xl sm:text-4xl font-extrabold font-mono tabular-nums ${teamTheme.textAccent}`}>
                        {Math.min(10, Math.max(0, data.publishedGrade.finalScore)).toFixed(1)} đ
                      </span>
                    </div>
                    {data.publishedGrade.feedback && (
                      <p className="text-sm text-slate-600 mt-4 pt-4 border-t border-slate-100 leading-relaxed break-words">
                        {data.publishedGrade.feedback}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}

              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.16 }}
                className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-6 shadow-[0_8px_24px_-10px_rgba(15,23,42,0.08)]"
              >
                <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2 mb-4">
                  <Users className={`w-5 h-5 ${teamTheme.textAccent}`} />
                  Thành viên {teamTheme.teamLabel}
                </h3>

                {data.students.length === 0 ? (
                  <p className="text-sm text-slate-500">Chưa có học sinh nào trong nhóm này.</p>
                ) : (
                  <div className="space-y-2">
                    {data.students.map((stu, idx) => (
                      <motion.div
                        key={stu.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.18 + idx * 0.04 }}
                        className={`p-3 rounded-2xl border ${
                          stu.isLeader
                            ? 'bg-amber-50/90 border-amber-200'
                            : 'bg-slate-50/80 border-slate-100'
                        }`}
                      >
                        <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                          <span>
                            {idx + 1}. {stu.name}
                          </span>
                          {stu.isLeader && (
                            <Crown className="w-4 h-4 text-amber-500 shrink-0" aria-label="Nhóm trưởng" />
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
                              <span className="text-amber-700 font-bold">Nhóm trưởng</span>
                            </>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
