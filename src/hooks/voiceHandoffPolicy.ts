/**
 * VOICE HAND-OFF POLICY — pure decision logic for the machine-transition window.
 *
 * Proof, not a claim. Extracted as pure functions (house style, per reconnectPolicy.ts) so the
 * decisions that Davy's real 2026-07-10 (first-machine "repeat bottom") and 2026-07-12 (barge-in
 * freeze) VOICEDIAG logs exposed can be unit-tested without mounting the voice component.
 *
 * These functions hold NO state and touch NO DOM — useVoice.ts / StockerApp.tsx call them and
 * act on the returned decision. Every change here is additive: the existing machine-2+ direction
 * path and normal picking are preserved.
 */

export type VoiceStatus =
  | 'idle'
  | 'listening'
  | 'speaking'
  | 'thinking'
  | 'paused'
  | 'muted'
  | 'error';

/**
 * BRANCH 1 — first-machine direction detection.
 *
 * The forgiving direction matcher (phoneticCorrection.detectDirection) accepts "at the bottom",
 * "start with the bottom", garble, etc. via substring. Today StockerApp only runs it when a
 * machine-to-machine transition is pending — so on the FIRST machine of a route (no pending
 * transition yet) it never runs, and only bare exact patterns work. That is the first-machine
 * "repeat bottom" gap.
 *
 * Returns true when the app is awaiting a direction answer: a pending machine transition (the
 * existing machine-2+ case, unchanged) OR the first machine still waiting to start (status
 * 'pending' with no current item yet).
 */
export function shouldRunDirectionDetection(ctx: {
  pendingMachineTransition: boolean;
  currentMachineStatus: string | null | undefined;
  hasCurrentItem: boolean;
}): boolean {
  if (ctx.pendingMachineTransition) return true; // machine 2+ — existing behavior, untouched
  // First machine: awaiting the initial top/bottom before any item is served.
  return ctx.currentMachineStatus === 'pending' && !ctx.hasCurrentItem;
}

/**
 * BRANCH 2 — model of the CURRENT dispatch behavior (the drop, as-shipped).
 *
 * Mirrors useVoice.ts processAccumulatedTranscript exactly as it ships today:
 *   - paused/muted        → only wake-phrase listened for; a plain command is ignored
 *   - listening/idle/speaking → dispatched (speaking dispatches via barge-in)
 *   - thinking            → queued to pendingCommandRef (fires ONLY if resumeListening runs later)
 *   - error (or other)    → ignored
 *
 * This is the diagnosis surface: feeding Davy's 2026-07-10 status sequence through it shows the
 * first direction utterance lands while status is 'thinking' → 'queue', and if the transition
 * then goes straight to 'speaking' (announce) without a resumeListening flush, that queued
 * command is never delivered — the drop.
 */
export function classifyCurrentDispatch(status: VoiceStatus): 'dispatch' | 'queue' | 'ignore' {
  if (status === 'paused' || status === 'muted') return 'ignore';
  if (status === 'listening' || status === 'idle' || status === 'speaking') return 'dispatch';
  if (status === 'thinking') return 'queue';
  return 'ignore';
}

/**
 * BRANCH 3 — the FIX: hand-off dispatch that never loses a direction command.
 *
 * A direction command (top/bottom) spoken during a machine hand-off must reach the handler even
 * when transient status is 'thinking' or 'speaking'. Non-direction commands keep the existing
 * queue/ignore behavior so nothing else changes.
 *   - direction command + any live-ish state (listening/idle/speaking/thinking) → dispatch
 *   - direction command while paused/muted/error → queue (recovered by the watchdog / resume)
 *   - non-direction command → the existing classification, unchanged
 */
export function resolveHandoffCommand(args: {
  status: VoiceStatus;
  isDirectionCommand: boolean;
}): 'dispatch' | 'queue' | 'ignore' {
  const { status } = args;

  // SIBLING SWEEP 2026-07-30 — the 2026-07-14 round gave this treatment only to a DIRECTION
  // command at a hand-off. The same failure family was still live for an ordinary picking
  // command: spoken mid-'thinking' it was parked in pendingCommandRef and only rescued ~6s
  // later by the watchdog, and spoken during 'error' it was DISCARDED outright — the driver
  // speaks, nothing happens, no record it existed. isDirectionCommand no longer gates the
  // behavior: a lost picking word costs the driver exactly as much as a lost direction word.
  // Spec: .xf/specs/2026-07-30-voice-sibling-fixes-xffi.md
  if (
    status === 'listening' ||
    status === 'idle' ||
    status === 'speaking' ||
    status === 'thinking'
  ) {
    return 'dispatch';
  }

  // The line that matters is DELIBERATE vs NOT.
  //
  // paused/muted are the driver's own choice — he stopped it, and processAccumulatedTranscript
  // deliberately listens for nothing but the wake phrase in those states. A picking word said
  // out of habit while paused must be DISCARDED: holding it would fire a phantom pick the
  // moment he resumes, against whatever item is current then. Wrong stock, no explanation.
  // He repeats the word when he's ready — small friction, no bad data.
  //
  // 'error' is not his choice — the app fell into it. His word is HELD and flushed by the
  // watchdog on recovery, because dropping it means he spoke and nothing happened, ever.
  if (status === 'paused' || status === 'muted') return 'ignore';
  return 'queue';
}

/**
 * BRANCH 4 — repair the stuck transition.
 *
 * After a TTS barge-in or a mic pause the status can be left non-listening with no event to move
 * it back, which strands every later command in the queue (the full freeze). Given the status
 * the app is stuck in, return the status it should recover to. Legitimate holding states
 * (paused/muted by the user) are preserved — only the "should be live but isn't" states recover.
 */
export function recoverStatus(status: VoiceStatus): VoiceStatus {
  if (status === 'paused' || status === 'muted') return status; // user-intended hold, keep it
  if (status === 'listening') return 'listening';
  // speaking/thinking/idle/error left dangling at a hand-off → return to listening
  return 'listening';
}

/**
 * BRANCH 5 — the watchdog decision (strictly additive safety net).
 *
 * Fires ONLY when the app has been stuck non-listening with a command waiting for at least the
 * threshold — long enough that a legitimate in-flight 'thinking' API call would already have
 * resolved. Returns 'recover' to force status back to listening and flush the queued backlog,
 * else 'noop'. A short 'thinking' window (real API call under threshold) returns 'noop' so the
 * watchdog never interrupts legitimate processing.
 */
export function watchdogAction(args: {
  status: VoiceStatus;
  hasPendingCommand: boolean;
  stuckMs: number;
  thresholdMs: number;
  /**
   * True while the app's own voice is actually coming out of the speaker. Optional: callers that
   * cannot observe playback omit it, and a status of 'speaking' with no sound is then treated as
   * the freeze it is.
   */
  isActivelySpeaking?: boolean;
}): 'recover' | 'noop' {
  const { status, stuckMs, thresholdMs, isActivelySpeaking } = args;
  if (status === 'listening') return 'noop';
  if (status === 'paused' || status === 'muted') return 'noop'; // user hold — never override

  // 'idle' means STOPPED — either the driver tapped Stop, or voice has not started yet. There is
  // no freeze to rescue, and rescuing it would restart a session he deliberately ended.
  //
  // This guard is load-bearing BECAUSE of the fix below. The stuck-clock starts the moment status
  // leaves 'listening', and tapping Stop does exactly that — so with the queue condition removed
  // and nothing in its place, a stopped app would have force-resumed itself six seconds later.
  // The old `!hasPendingCommand` line was accidentally covering this (Stop clears the queue);
  // taking it out without this would have traded an unreachable rescue for a live defect.
  if (status === 'idle') return 'noop';

  // GRID-001 FIX (2026-08-06) — the `if (!hasPendingCommand) return 'noop'` that stood here is
  // gone, and removing it is the whole fix. It made the rescue depend on a queue that could
  // never fill: the queue's only writer needs a transcript to arrive during 'error', and 'error'
  // means the connection is down, so no transcript can arrive. All 28 watchdog rows in the
  // survey are 'not-reachable' for that reason — the app's only escape from a freeze was held
  // shut by its own trigger condition.
  //
  // Being stuck IS the emergency. Whether a command happens to be waiting is incidental, and
  // resumeListening still flushes the queue when it does hold something.
  //
  // What replaces it is narrower and true: never interrupt the app while it is genuinely
  // speaking. A long announcement outlasts the threshold honestly, and chopping it off in the
  // driver's ear would be a new defect of exactly the kind this sweep exists to prevent.
  if (status === 'speaking' && isActivelySpeaking) return 'noop';

  if (stuckMs < thresholdMs) return 'noop'; // still within a legitimate processing window
  return 'recover';
}

/** Default stuck-threshold for the watchdog — comfortably longer than a normal API round-trip. */
export const WATCHDOG_STUCK_THRESHOLD_MS = 6000;
