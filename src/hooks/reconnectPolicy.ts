/**
 * Voice reconnect policy — pure functions so the recovery behavior is directly testable
 * (replay a real drop pattern, assert the timing) instead of being buried in the WebSocket
 * close handler where it can only be proven on a device.
 *
 * PHILOSOPHY (2026-07-06): raw 16 kHz PCM capture is HEADERLESS, so a reconnect can never
 * hand Deepgram undecodable header-less container fragments. That removes the failure that
 * turned a transient drop into a dead-voice storm — which means we no longer need the old
 * "never give up, retry forever" loop (that loop WAS the storm). The right rule now is a
 * few quick tries, then stop and surface a clear "tap to reconnect" instead of hammering
 * Deepgram indefinitely.
 */

export const MAX_RECONNECT_DELAY_MS = 2500;

/** After this many failed attempts, stop retrying and surface "tap to reconnect". */
export const GENTLE_MAX_ATTEMPTS = 4;

/**
 * Bounded, gentle recovery. Quick early retries (0.5s, 1s, 2s, 2.5s), then give up.
 * A real transient drop recovers on the first try or two; a persistent drop stops
 * storming and hands control back to the driver.
 */
export function gentleReconnect(attempt: number): { delayMs: number; giveUp: boolean } {
  const a = Math.max(0, attempt);
  if (a >= GENTLE_MAX_ATTEMPTS) {
    return { delayMs: 0, giveUp: true };
  }
  return { delayMs: Math.min(500 * Math.pow(2, a), MAX_RECONNECT_DELAY_MS), giveUp: false };
}

/**
 * The OLD legacy behavior, kept ONLY so tests can prove the regression is gone: exponential
 * 1→16s, and after 5 tries it gave up and went dead for 30s. This is what stranded Davy
 * mid-route on 2026-07-01.
 */
export function legacyReconnect(attempt: number): { delayMs: number; giveUp: boolean } {
  const LEGACY_MAX_ATTEMPTS = 5;
  if (attempt >= LEGACY_MAX_ATTEMPTS) {
    return { delayMs: 30000, giveUp: true }; // 30s of dead voice
  }
  return { delayMs: Math.min(1000 * Math.pow(2, attempt), 16000), giveUp: false };
}

import type { VoiceStatus } from './voiceHandoffPolicy';

/**
 * Should a dropped socket be reconnected from THIS status?
 *
 * THE SHIPPED GAP (found 2026-07-30 by the state x command x timing survey):
 * the close handler only reconnected from listening / paused / muted / thinking.
 * 'speaking' was not on that list — and during a pick the app is speaking a large share of the
 * time, because it announces every item. A drop inside any announcement was therefore never
 * retried: no reconnect, no error, no spoken warning.
 *
 * Nothing else rescued it either. The watchdog only fires when a command is QUEUED, and with a
 * dead socket no transcripts arrive, so nothing is ever queued — the watchdog never runs. Voice
 * stayed dead for the rest of the route while the phone looked completely normal.
 *
 * That is Davy's 2026-07-01 "went deaf": ~29 utterances, zero transcripts. The raw-PCM rebuild
 * fixed a DIFFERENT cause of the same symptom (encoding), which is why this survived it.
 *
 * 'error' is deliberately excluded: gentleReconnect gave up and told the driver to tap. Retrying
 * from there re-creates the storm the bounded policy exists to stop.
 */
export function shouldReconnectFromStatus(status: VoiceStatus): boolean {
  if (status === 'error') return false; // gave up on purpose — waiting on a tap
  return (
    status === 'listening' ||
    status === 'paused' ||
    status === 'muted' ||
    status === 'thinking' ||
    status === 'speaking' || // ← the gap: announcements are most of a picking session
    status === 'idle'
  );
}
