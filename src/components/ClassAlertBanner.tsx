import { AnimatePresence, motion } from 'motion/react';
import { BellRing, PartyPopper, X } from 'lucide-react';
import type { MissionCompletionAlert } from '../lib/soundAndBroadcast.ts';
import { GROUP_THEMES } from '../lib/themePalette.ts';

interface ClassAlertBannerProps {
  alert: MissionCompletionAlert | null;
  showCardTitle: boolean;
  onDismiss: () => void;
}

export function ClassAlertBanner({ alert, showCardTitle, onDismiss }: ClassAlertBannerProps) {
  const theme = alert ? GROUP_THEMES[alert.groupNumber] || GROUP_THEMES[1] : GROUP_THEMES[1];

  return (
    <div
      aria-live="polite"
      className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-lg pointer-events-none no-print"
    >
      <AnimatePresence>
        {alert && (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, y: -18, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className={`pointer-events-auto rounded-2xl bg-gradient-to-r ${theme.gradientHeader} text-white p-4 shadow-[0_18px_40px_-10px_rgba(15,23,42,0.35)] border border-white/30 flex items-start gap-3`}
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
              {alert.allCompleted ? (
                <PartyPopper className="w-5 h-5 text-amber-200" />
              ) : (
                <BellRing className="w-5 h-5 text-amber-200" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-white/90 flex flex-wrap items-center gap-1.5">
                <span>Thông báo cả lớp</span>
                <span aria-hidden="true">·</span>
                <span>Lớp {alert.classId}</span>
                <span aria-hidden="true">·</span>
                <span>{theme.teamLabel}</span>
              </div>
              <div className="text-sm sm:text-base font-extrabold leading-snug mt-0.5 break-words">
                {alert.allCompleted
                  ? `Nhóm ${alert.groupNumber} đã hoàn thành TẤT CẢ nhiệm vụ!`
                  : `Nhóm ${alert.groupNumber} vừa hoàn thành xong 1 nhiệm vụ (${alert.completedCount}/${alert.totalCards})!`}
              </div>
              {showCardTitle && alert.cardTitle && (
                <div className="text-xs text-white/90 mt-0.5 truncate">
                  Thẻ: {alert.cardTitle}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onDismiss}
              aria-label="Đóng thông báo"
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
