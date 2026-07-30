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

  // paused/muted are deliberate holds by the driver; 'error' is a state the app fell into.
  // All three HOLD the utterance rather than discarding it — the watchdog flushes the backlog
  // on recovery. Nothing the driver says is ever thrown away.
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
}): 'recover' | 'noop' {
  const { status, hasPendingCommand, stuckMs, thresholdMs } = args;
  if (status === 'listening') return 'noop';
  if (status === 'paused' || status === 'muted') return 'noop'; // user hold — never override
  if (!hasPendingCommand) return 'noop'; // nothing stranded → nothing to rescue
  if (stuckMs < thresholdMs) return 'noop'; // still within a legitimate processing window
  return 'recover';
}

/** Default stuck-threshold for the watchdog — comfortably longer than a normal API round-trip. */
export const WATCHDOG_STUCK_THRESHOLD_MS = 6000;
