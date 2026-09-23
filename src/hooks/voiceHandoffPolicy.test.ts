import { describe, it, expect } from 'vitest';
import {
  shouldRunDirectionDetection,
  classifyCurrentDispatch,
  resolveHandoffCommand,
  recoverStatus,
  watchdogAction,
  nextWatchdogStartedAt,
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

  it('direction command during speaking/listening also dispatches', () => {
    for (const status of ['speaking', 'listening'] as VoiceStatus[]) {
      expect(resolveHandoffCommand({ status, isDirectionCommand: true })).toBe('dispatch');
    }
  });

  it('ignores a late command after voice has stopped', () => {
    expect(resolveHandoffCommand({ status: 'idle', isDirectionCommand: true })).toBe('ignore');
  });

  it('REVISED 2026-07-30 — held only when the app broke, discarded when the driver chose to stop', () => {
    // The 2026-07-14 version held a direction command in ALL THREE states. The sweep split them
    // on the line that actually matters: did the driver choose this, or did the app fall into it?
    //
    // paused/muted are his choice. A held "bottom" would flip the pick order the moment he
    // resumes — on whatever machine is current THEN, not the one he was looking at. He gets a
    // route walked backwards with no explanation. Discarding costs him one repeated word.
    //
    // 'error' is not his choice. Discarding there means he spoke and nothing ever happened,
    // which is the failure that ended his 2026-07-12 route.
    for (const status of ['paused', 'muted'] as VoiceStatus[]) {
      expect(resolveHandoffCommand({ status, isDirectionCommand: true })).toBe('ignore');
    }
    expect(resolveHandoffCommand({ status: 'error', isDirectionCommand: true })).toBe('queue');
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

  it('never fires while listening, or while paused/muted', () => {
    expect(
      watchdogAction({ status: 'listening', hasPendingCommand: true, stuckMs: 99999, thresholdMs: WATCHDOG_STUCK_THRESHOLD_MS }),
    ).toBe('noop');
    expect(
      watchdogAction({ status: 'paused', hasPendingCommand: true, stuckMs: 99999, thresholdMs: WATCHDOG_STUCK_THRESHOLD_MS }),
    ).toBe('noop');
  });
});

/**
 * GRID-001 — the freeze rescue that could never fire. Fixed 2026-08-06.
 *
 * The survey (docs/voice-state-command-timing-matrix.md) proved the watchdog was unreachable,
 * and it is worth being exact about why, because a test in this very file used to lock it shut:
 *
 *   1. watchdogAction refused to act unless a command was waiting in the queue.
 *   2. The queue has exactly one writer (useVoice.ts line 475), reached only when
 *      resolveHandoffCommand returns 'queue'.
 *   3. After the 2026-07-30 sibling round, 'queue' is returned for ONE state — 'error'.
 *      (idle/paused/muted → ignore; listening/speaking/thinking → dispatch.)
 *   4. To queue anything in 'error', a transcript must arrive while in 'error'. But 'error'
 *      means the connection is down, so no transcript can arrive.
 *
 * So the queue could never fill, so the watchdog could never fire, so all 28 of its grid rows
 * are 'not-reachable'. The app's only rescue from a freeze was switched off by its own trigger.
 *
 * The correction: a freeze rescue that demands a queued command is not a freeze rescue. Being
 * stuck IS the emergency; whether something is waiting in the queue is incidental to it. The
 * queue still gets flushed on recovery when it happens to hold something.
 *
 * The new guard replacing it is narrower and honest: never interrupt the app WHILE IT IS
 * SPEAKING OUT LOUD, because a long announcement legitimately outlasts the threshold and
 * cutting it off mid-sentence would be a fresh defect of exactly the kind this sweep exists
 * to stop.
 */
describe('GRID-001 — the watchdog can now actually fire', () => {
  it('starts a fresh clock for every new non-listening operation', () => {
    expect(nextWatchdogStartedAt({ newStatus: 'speaking', now: 1000 })).toBe(1000);
    // A second announcement can begin before the first speak() has fully unwound.
    expect(nextWatchdogStartedAt({ newStatus: 'speaking', now: 7000 })).toBe(7000);
    expect(nextWatchdogStartedAt({ newStatus: 'thinking', now: 8000 })).toBe(8000);
    expect(nextWatchdogStartedAt({ newStatus: 'listening', now: 9000 })).toBeNull();
  });

  it('recovers a freeze with NOTHING queued — the case that was unreachable', () => {
    // This is the exact assertion that used to read 'noop' and kept the rescue switched off.
    expect(
      watchdogAction({
        status: 'thinking',
        hasPendingCommand: false,
        stuckMs: WATCHDOG_STUCK_THRESHOLD_MS + 500,
        thresholdMs: WATCHDOG_STUCK_THRESHOLD_MS,
      }),
    ).toBe('recover');
  });

  it("recovers from 'error' with nothing queued — the state the queue could never be filled in", () => {
    expect(
      watchdogAction({
        status: 'error',
        hasPendingCommand: false,
        stuckMs: WATCHDOG_STUCK_THRESHOLD_MS + 1,
        thresholdMs: WATCHDOG_STUCK_THRESHOLD_MS,
      }),
    ).toBe('recover');
  });

  it('does NOT cut the app off while it is genuinely speaking out loud', () => {
    // A long item announcement can legitimately run past the threshold. Forcing it back to
    // listening mid-sentence would chop the app off in the driver's ear.
    expect(
      watchdogAction({
        status: 'speaking',
        hasPendingCommand: false,
        stuckMs: WATCHDOG_STUCK_THRESHOLD_MS + 10000,
        thresholdMs: WATCHDOG_STUCK_THRESHOLD_MS,
        isActivelySpeaking: true,
      }),
    ).toBe('noop');
  });

  it('does not recover while a bounded TTS request is preparing playback', () => {
    expect(
      watchdogAction({
        status: 'speaking',
        hasPendingCommand: false,
        stuckMs: WATCHDOG_STUCK_THRESHOLD_MS + 500,
        thresholdMs: WATCHDOG_STUCK_THRESHOLD_MS,
        isActivelySpeaking: false,
        isSpeechPreparing: true,
      }),
    ).toBe('noop');
  });

  it('still recovers a speaking state after preparation has expired', () => {
    expect(
      watchdogAction({
        status: 'speaking',
        hasPendingCommand: false,
        stuckMs: WATCHDOG_STUCK_THRESHOLD_MS + 500,
        thresholdMs: WATCHDOG_STUCK_THRESHOLD_MS,
        isActivelySpeaking: false,
        isSpeechPreparing: false,
      }),
    ).toBe('recover');
  });

  it("DOES recover from 'speaking' once the audio has actually finished", () => {
    // Stuck at 'speaking' with no sound coming out is a real freeze — speech that failed to
    // start, or a status that was never moved on. That is precisely what to rescue.
    expect(
      watchdogAction({
        status: 'speaking',
        hasPendingCommand: false,
        stuckMs: WATCHDOG_STUCK_THRESHOLD_MS + 500,
        thresholdMs: WATCHDOG_STUCK_THRESHOLD_MS,
        isActivelySpeaking: false,
      }),
    ).toBe('recover');
  });

  it("still honours the driver's own hold, speaking or not", () => {
    for (const status of ['paused', 'muted'] as const) {
      expect(
        watchdogAction({
          status,
          hasPendingCommand: false,
          stuckMs: 99999,
          thresholdMs: WATCHDOG_STUCK_THRESHOLD_MS,
        }),
      ).toBe('noop');
    }
  });

  it('NEVER restarts a session the driver stopped on purpose', () => {
    // Regression guard for a defect this very fix nearly introduced. The stuck-clock starts the
    // moment status leaves 'listening' — and tapping Stop does exactly that. With the queue
    // condition removed and nothing in its place, a stopped app would have force-resumed itself
    // six seconds later, mic live, in a warehouse, with nobody asking it to.
    expect(
      watchdogAction({
        status: 'idle',
        hasPendingCommand: false,
        stuckMs: 99999,
        thresholdMs: WATCHDOG_STUCK_THRESHOLD_MS,
      }),
    ).toBe('noop');
    // Even with something stale left in the queue, Stop means stop.
    expect(
      watchdogAction({
        status: 'idle',
        hasPendingCommand: true,
        stuckMs: 99999,
        thresholdMs: WATCHDOG_STUCK_THRESHOLD_MS,
      }),
    ).toBe('noop');
  });

  it('still leaves a normal short processing window alone', () => {
    expect(
      watchdogAction({
        status: 'thinking',
        hasPendingCommand: false,
        stuckMs: 1200,
        thresholdMs: WATCHDOG_STUCK_THRESHOLD_MS,
      }),
    ).toBe('noop');
  });

  it('still recovers when a command IS queued (the original behaviour, unchanged)', () => {
    expect(
      watchdogAction({
        status: 'thinking',
        hasPendingCommand: true,
        stuckMs: WATCHDOG_STUCK_THRESHOLD_MS + 500,
        thresholdMs: WATCHDOG_STUCK_THRESHOLD_MS,
      }),
    ).toBe('recover');
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
    const liveish: VoiceStatus[] = ['listening', 'speaking', 'thinking'];
    for (const status of liveish) {
      expect(resolveHandoffCommand({ status, isDirectionCommand: false })).toBe('dispatch');
    }
  });

  it('DISCARDS a command spoken while the driver has deliberately paused or muted', () => {
    // Corrected 2026-07-30 after reading what pause means: pauseListening() releases the wake
    // lock and processAccumulatedTranscript listens for the wake phrase ONLY. Holding a picking
    // word here would fire a phantom pick on resume, against whatever item is current THEN —
    // wrong stock with no explanation. He repeats it when ready. Discard is correct.
    expect(resolveHandoffCommand({ status: 'paused', isDirectionCommand: false })).toBe('ignore');
    expect(resolveHandoffCommand({ status: 'muted', isDirectionCommand: false })).toBe('ignore');
  });

  it('parks rather than discards a command spoken while the app is in error', () => {
    // Today 'error' returns 'ignore' for a non-direction command — the utterance is DISCARDED.
    // A discarded command is the stranded-command family: Davy spoke, nothing happened, no record.
    expect(resolveHandoffCommand({ status: 'error', isDirectionCommand: false })).toBe('queue');
  });
});
