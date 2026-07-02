/**
 * Voice reconnect policy — extracted as pure functions so the recovery behavior is
 * directly testable (replay a real drop pattern, assert the timing), instead of being
 * buried inside the WebSocket close handler where it can only be proven on a device.
 *
 * The rule for a warehouse picker: recover FAST and NEVER go silent mid-route while the
 * session is active and the app is foreground. (The screen-lock / background case is
 * handled separately by the hidden-guard, which halts reconnects until the screen wakes.)
 */

export const MAX_RECONNECT_DELAY_MS = 2500;

/** Wait before the next reconnect attempt: 0.5s, 1s, 2s, then capped at 2.5s. */
export function reconnectDelayMs(attempt: number): number {
  const a = Math.max(0, attempt);
  return Math.min(500 * Math.pow(2, a), MAX_RECONNECT_DELAY_MS);
}

/**
 * Advance the attempt counter, capped so the delay plateaus at the ceiling and the
 * loop NEVER reaches a "give up" state. Foreground drops keep retrying indefinitely.
 */
export function nextAttempt(attempt: number): number {
  return Math.min(attempt + 1, 3);
}

/**
 * The OLD behavior, kept only so tests can prove the regression is gone: exponential
 * 1→16s, and after 5 tries it gave up and went dead for 30s. This is what stranded
 * Davy mid-route on 2026-07-01.
 */
export function legacyReconnect(attempt: number): { delayMs: number; giveUp: boolean } {
  const LEGACY_MAX_ATTEMPTS = 5;
  if (attempt >= LEGACY_MAX_ATTEMPTS) {
    return { delayMs: 30000, giveUp: true }; // 30s of dead voice
  }
  return { delayMs: Math.min(1000 * Math.pow(2, attempt), 16000), giveUp: false };
}
