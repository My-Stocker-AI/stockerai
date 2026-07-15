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

  it('NON-direction commands keep the existing behavior — no scope creep', () => {
    expect(resolveHandoffCommand({ status: 'thinking', isDirectionCommand: false })).toBe('queue');
    expect(resolveHandoffCommand({ status: 'paused', isDirectionCommand: false })).toBe('ignore');
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
