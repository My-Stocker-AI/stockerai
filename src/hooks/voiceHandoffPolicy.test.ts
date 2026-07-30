import { describe, it, expect } from 'vitest';
import {
  shouldRunDirectionDetection,
  classifyCurrentDispatch,
  resolveHandoffCommand,
  recoverStatus,
  watchdogAction,
  WATCHDOG_STUCK_THRESHOLD_MS,
  type VoiceStatus,
} from './voiceHandoffPolicy';

/**
 * Proof, not a claim. Davy's iPhone VOICEDIAG logs (Render) exposed two machine-hand-off defects:
 *
 *   2026-07-10 03:07 (North route, FIRST machine): "Start with the bottom" spoken 5x, never
 *   recognized — the app then went silent. First machine = no pendingMachineTransition, so the
 *   forgiving direction matcher never ran and the command kept getting queued/dropped.
 *
 *   2026-07-12 05:06 (South route, machine A6 item 10): after a TTS barge-in the app kept
 *   transcribing ("Next", "Repeat") but never acted — a full freeze that killed the route with
 *   3 machines unfinished.
 *
 * These tests replay those real states against the pure decision functions.
 */

describe('BRANCH 1 — direction detection must run on the FIRST machine, not just machine 2+', () => {
  it('the SHIPPED gap: first machine (no pending transition) left the forgiving matcher OFF', () => {
    // Before the fix the only trigger was pendingMachineTransition. On the first machine that is
    // false, so detection did not run — this is the gap the fix closes.
    const firstMachineAwaitingDirection = {
      pendingMachineTransition: false,
      currentMachineStatus: 'pending',
      hasCurrentItem: false,
    };
    // The FIX: detection now runs here.
    expect(shouldRunDirectionDetection(firstMachineAwaitingDirection)).toBe(true);
  });

  it('machine 2+ (pending transition) still runs detection — existing behavior untouched', () => {
    expect(
      shouldRunDirectionDetection({
        pendingMachineTransition: true,
        currentMachineStatus: 'completed',
        hasCurrentItem: false,
      }),
    ).toBe(true);
  });

  it('mid-pick (machine in_progress, an item on screen) does NOT run direction detection', () => {
    // A stray "bottom" while picking must never be treated as a direction flip.
    expect(
      shouldRunDirectionDetection({
        pendingMachineTransition: false,
        currentMachineStatus: 'in_progress',
        hasCurrentItem: true,
      }),
    ).toBe(false);
  });
});

describe('BRANCH 2 — pin the command-drop: where does the first "bottom" go?', () => {
  it("Davy's first utterance lands during 'thinking' (transition) → today it is QUEUED, not dispatched", () => {
    // At the hand-off the app is loading the next machine (status 'thinking'). The direction
    // command spoken then is queued to pendingCommandRef and only fires if resumeListening runs.
    expect(classifyCurrentDispatch('thinking')).toBe('queue');
  });

  it("if the app is mid-announcement ('speaking'), a command dispatches via barge-in", () => {
    expect(classifyCurrentDispatch('speaking')).toBe('dispatch');
  });

  it("a queued command stranded while status never returns to listening is the drop", () => {
    // Models the freeze tail: status stuck non-listening, command sits queued, nothing fires.
    const stuck: VoiceStatus = 'thinking';
    expect(classifyCurrentDispatch(stuck)).toBe('queue'); // queued…
    // …and with no resumeListening flush it is lost. The fix (BRANCH 3) dispatches instead.
  });
});

describe('BRANCH 3 — the fix: a direction command at the hand-off is never lost', () => {
  it("direction command during 'thinking' now DISPATCHES instead of being queued/dropped", () => {
    expect(resolveHandoffCommand({ status: 'thinking', isDirectionCommand: true })).toBe('dispatch');
  });

  it('direction command during speaking/listening/idle also dispatches', () => {
    for (const status of ['speaking', 'listening', 'idle'] as VoiceStatus[]) {
      expect(resolveHandoffCommand({ status, isDirectionCommand: true })).toBe('dispatch');
    }
  });

  it('a direction command while paused/muted/error is HELD (queued), never silently discarded', () => {
    for (const status of ['paused', 'muted', 'error'] as VoiceStatus[]) {
      expect(resolveHandoffCommand({ status, isDirectionCommand: true })).toBe('queue');
    }
  });

  it('SUPERSEDED 2026-07-30 — non-direction commands no longer keep the old parked behavior', () => {
    // This test originally asserted "no scope creep": the 2026-07-14 fix deliberately left an
    // ordinary picking command parked during 'thinking' and DISCARDED during 'paused'. The
    // sibling sweep reversed that decision on purpose — parking costs the driver ~6s of silence
    // and discarding loses the utterance outright, and neither is acceptable for a picking word
    // any more than for a direction word. Kept (not deleted) so the reversal is visible in
    // history rather than looking like the old guard silently vanished.
    // Reversal recorded in .xf/specs/2026-07-30-voice-sibling-fixes-xffi.md.
    expect(resolveHandoffCommand({ status: 'thinking', isDirectionCommand: false })).toBe('dispatch');
    expect(resolveHandoffCommand({ status: 'paused', isDirectionCommand: false })).toBe('queue');
    expect(resolveHandoffCommand({ status: 'listening', isDirectionCommand: false })).toBe('dispatch');
  });
});

describe('BRANCH 4 — repair the stuck transition after barge-in / mic pause', () => {
  it('a dangling speaking/thinking/error state recovers to listening', () => {
    for (const status of ['speaking', 'thinking', 'error', 'idle'] as VoiceStatus[]) {
      expect(recoverStatus(status)).toBe('listening');
    }
  });

  it('a user-intended hold (paused/muted) is preserved, never force-resumed', () => {
    expect(recoverStatus('paused')).toBe('paused');
    expect(recoverStatus('muted')).toBe('muted');
  });
});

describe('BRANCH 5 — watchdog: recover a real freeze, never interrupt legit processing', () => {
  it("Davy's 2026-07-12 freeze: stuck non-listening with a pending command past threshold → RECOVER", () => {
    expect(
      watchdogAction({
        status: 'thinking',
        hasPendingCommand: true,
        stuckMs: WATCHDOG_STUCK_THRESHOLD_MS + 500,
        thresholdMs: WATCHDOG_STUCK_THRESHOLD_MS,
      }),
    ).toBe('recover');
  });

  it('a normal in-flight API call (short thinking, under threshold) is left alone → NOOP', () => {
    expect(
      watchdogAction({
        status: 'thinking',
        hasPendingCommand: true,
        stuckMs: 1200,
        thresholdMs: WATCHDOG_STUCK_THRESHOLD_MS,
      }),
    ).toBe('noop');
  });

  it('never fires while listening, while paused/muted, or with nothing queued', () => {
    expect(
      watchdogAction({ status: 'listening', hasPendingCommand: true, stuckMs: 99999, thresholdMs: WATCHDOG_STUCK_THRESHOLD_MS }),
    ).toBe('noop');
    expect(
      watchdogAction({ status: 'paused', hasPendingCommand: true, stuckMs: 99999, thresholdMs: WATCHDOG_STUCK_THRESHOLD_MS }),
    ).toBe('noop');
    expect(
      watchdogAction({ status: 'thinking', hasPendingCommand: false, stuckMs: 99999, thresholdMs: WATCHDOG_STUCK_THRESHOLD_MS }),
    ).toBe('noop');
  });
});

/**
 * SIBLING SWEEP — 2026-07-30
 *
 * Spec: .xf/specs/2026-07-30-voice-sibling-fixes-xffi.md
 *
 * The 2026-07-14 round fixed the DIRECTION command at a hand-off. It did not fix the same
 * family for an ordinary PICKING command. useVoice.ts calls resolveHandoffCommand with
 * `isDirectionCommand: awaitingDirectionRef.current` — that ref answers "is the app awaiting a
 * direction?", NOT "is this utterance a direction?". So a picking word spoken while the app is
 * thinking, outside a hand-off, is still parked in pendingCommandRef and only rescued by the
 * 6s watchdog. That is 6 seconds of a driver having spoken and nothing happening, silently.
 *
 * These tests assert the intended post-fix behavior. They FAIL on the current commit.
 */
describe('SIBLING — a picking command spoken mid-think must not be silently parked', () => {
  it('dispatches a picking command spoken during thinking, outside a hand-off', () => {
    // Davy says "next" while the app is mid-API-call and is NOT awaiting a direction.
    // Today: 'queue' — parked, invisible, rescued only after WATCHDOG_STUCK_THRESHOLD_MS.
    // Required: dispatched, like every other live-ish state.
    expect(
      resolveHandoffCommand({ status: 'thinking', isDirectionCommand: false }),
    ).toBe('dispatch');
  });

  it('never leaves a picking command parked longer than the driver would tolerate', () => {
    // The parked path is only acceptable when the app is deliberately held (paused/muted).
    // Any live-ish state must resolve the utterance now, not on a later resumeListening.
    const liveish: VoiceStatus[] = ['listening', 'idle', 'speaking', 'thinking'];
    for (const status of liveish) {
      expect(resolveHandoffCommand({ status, isDirectionCommand: false })).toBe('dispatch');
    }
  });

  it('still parks (never discards) a command spoken while the driver has paused or muted', () => {
    // Deliberate holds are preserved — this must NOT regress into dispatch.
    expect(resolveHandoffCommand({ status: 'paused', isDirectionCommand: false })).toBe('queue');
    expect(resolveHandoffCommand({ status: 'muted', isDirectionCommand: false })).toBe('queue');
  });

  it('parks rather than discards a command spoken while the app is in error', () => {
    // Today 'error' returns 'ignore' for a non-direction command — the utterance is DISCARDED.
    // A discarded command is the stranded-command family: Davy spoke, nothing happened, no record.
    expect(resolveHandoffCommand({ status: 'error', isDirectionCommand: false })).toBe('queue');
  });
});
