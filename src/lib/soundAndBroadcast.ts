import type { GroupNumber } from '../../shared/types.ts';
import { getSupabaseClient } from './supabaseClient.ts';

export interface MissionCompletionAlert {
  id: string;
  classId: string;
  groupNumber: GroupNumber;
  cardTitle: string;
  allCompleted: boolean;
  completedCount: number;
  totalCards: number;
  timestamp: number;
}

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function playMissionSuccessChime(allCompleted = false): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Cheerful ascending bell notes: C5 - E5 - G5 (plus C6 when all tasks completed)
    const notes = allCompleted ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];

    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + index * 0.095;
      const duration = index === notes.length - 1 ? 0.42 : 0.22;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration + 0.02);
    });
  } catch {
    // Audio playback may be blocked if no user gesture yet
  }
}

const LOCAL_CHANNEL_NAME = 'classqr_classroom_events_v1';

export async function broadcastMissionCompletion(
  alert: Omit<MissionCompletionAlert, 'id' | 'timestamp'>,
  qrToken?: string
): Promise<MissionCompletionAlert> {
  const payload: MissionCompletionAlert = {
    ...alert,
    id: `evt-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: Date.now(),
  };

  // 1. Cross-tab sync on same device
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      const bc = new BroadcastChannel(LOCAL_CHANNEL_NAME);
      bc.postMessage(payload);
      bc.close();
    } catch {
      // ignore
    }
  }

  // 2. Supabase Realtime Broadcast across devices
  const sb = getSupabaseClient();
  if (sb) {
    try {
      const channelName = `classqr-live-${encodeURIComponent(payload.classId)}`;
      const channel = sb.channel(channelName);
      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        const timer = setTimeout(done, 1200);
        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timer);
            try {
              await channel.send({
                type: 'broadcast',
                event: 'mission_completed',
                payload,
              });
            } finally {
              sb.removeChannel(channel);
              done();
            }
          }
        });
      });
    } catch {
      // ignore realtime send failure
    }
  } else if (qrToken) {
    // 3. Express server event relay (local network / dev mode)
    try {
      await fetch('/api/public/mission-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          k: qrToken,
        }),
      });
    } catch {
      // static host fallback
    }
  }

  return payload;
}

export function subscribeClassCompletions(
  classId: string,
  onAlert: (alert: MissionCompletionAlert) => void
): () => void {
  const seenIds = new Set<string>();
  const emitOnce = (alert: MissionCompletionAlert) => {
    if (!alert || !alert.id || seenIds.has(alert.id)) return;
    if (alert.classId !== classId) return;
    seenIds.add(alert.id);
    if (seenIds.size > 100) {
      const first = seenIds.values().next().value;
      if (first) seenIds.delete(first);
    }
    onAlert(alert);
  };

  // 1. Same-browser BroadcastChannel
  let bc: BroadcastChannel | null = null;
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      bc = new BroadcastChannel(LOCAL_CHANNEL_NAME);
      bc.onmessage = (event) => {
        emitOnce(event.data as MissionCompletionAlert);
      };
    } catch {
      // ignore
    }
  }

  // 2. Supabase Realtime Broadcast listener
  const sb = getSupabaseClient();
  let sbChannel: ReturnType<NonNullable<typeof sb>['channel']> | null = null;
  if (sb) {
    const channelName = `classqr-live-${encodeURIComponent(classId)}`;
    sbChannel = sb
      .channel(channelName)
      .on('broadcast', { event: 'mission_completed' }, (msg) => {
        emitOnce(msg.payload as MissionCompletionAlert);
      })
      .subscribe();
  }

  // 3. Express Server short-poll fallback (when Supabase is not active)
  let pollTimer: number | null = null;
  if (!sb && typeof window !== 'undefined') {
    let since = Date.now() - 2000;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/public/completions?class=${encodeURIComponent(classId)}&since=${since}`
        );
        if (!res.ok) return;
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) return;
        const data = (await res.json()) as { events?: MissionCompletionAlert[] };
        if (Array.isArray(data.events)) {
          data.events.forEach((evt) => {
            if (evt.timestamp > since) since = evt.timestamp;
            emitOnce(evt);
          });
        }
      } catch {
        // ignore offline/static host
      }
    };
    pollTimer = window.setInterval(poll, 2200);
  }

  return () => {
    if (bc) bc.close();
    if (sb && sbChannel) sb.removeChannel(sbChannel);
    if (pollTimer !== null) window.clearInterval(pollTimer);
  };
}
