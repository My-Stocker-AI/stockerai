import { describe, it, expect } from 'vitest';
import { shouldMicSend } from './captureHoldPolicy';

/**
 * GRID-003 / GRID-004 — the pause-vs-mute split.
 *
 * Survey rows (docs/voice-state-command-timing-matrix.md): 8 rows under GRID-003 and 4 under
 * GRID-004. Before this policy existed, BOTH 'paused' and 'muted' ran the same pauseCapture()
 * (useVoice.ts line 646), so no audio was ever sent in either state — which made the wake-phrase
 * branch in processAccumulatedTranscript (lines 453-459) unreachable. The driver said the app's
 * name to wake it and nothing happened, however many times he repeated it.
 *
 * Russ's call, 2026-08-06: SPLIT them, so each word means what a driver expects.
 *   paused → the mic keeps sending, and only the wake phrase acts on it (hands-free resume)
 *   muted  → the mic genuinely stops (the driver asked for it off; that must be true)
 */
describe('shouldMicSend — pause keeps listening, mute really stops', () => {
  it('keeps the mic sending while paused, so "OK Stocker" can be heard', () => {
    // THE GRID-003 FIX. Without this the wake-phrase branch is dead code and the only
    // way back into the route is to look at the phone and tap it.
    expect(shouldMicSend('paused')).toBe(true);
  });

  it('stops the mic while muted, because mute must mean the mic is off', () => {
    expect(shouldMicSend('muted')).toBe(false);
  });

  it('stops the mic when idle — idle is reached by tapping Stop', () => {
    expect(shouldMicSend('idle')).toBe(false);
  });

  it.each(['listening', 'speaking', 'thinking', 'error'] as const)(
    'keeps the mic sending while %s',
    (status) => {
      // 'error' included deliberately: the app fell into it, the driver did not choose it,
      // so his words must still reach the app to be held and flushed on recovery.
      expect(shouldMicSend(status)).toBe(true);
    },
  );

  it('never lets a reconnect re-arm the mic while muted (GRID-004)', () => {
    // A dropped socket reopening calls startPcmCapture, whose idempotent path used to set
    // micSendingRef = true unconditionally (useVoice.ts line 610) — silently switching the
    // microphone back on while the screen still read paused/muted. Routing that re-arm
    // through this policy is what closes it.
    expect(shouldMicSend('muted')).toBe(false);
    expect(shouldMicSend('paused')).toBe(true);
  });
});
