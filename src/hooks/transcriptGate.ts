/**
 * TRANSCRIPT GATE — the single decision about whether a heard phrase gets acted on.
 *
 * THE BUG THIS EXISTS TO FIX (found 2026-07-30 by the state × command × timing survey)
 *
 * Two files each had their own opinion about interrupting, and they disagreed.
 *
 * useVoice.ts (processAccumulatedTranscript, ~line 497) treats speech during an announcement as
 * a deliberate interruption: it stops the audio, plays the acknowledgment chime, flips the state
 * to 'listening', and hands the phrase up.
 *
 * StockerApp.tsx then threw the phrase away, because it checked the voice status through a value
 * that only refreshes on the next render — so it still read 'speaking' even though the voice
 * layer had just set 'listening' one line earlier. A React state update is never visible inside
 * the same synchronous call that made it.
 *
 * What the picker got: the announcement cut off mid-sentence, the chime that means "heard you",
 * and no action. That is the 2026-07-12 barge-in freeze from Davy's logs — "kept transcribing,
 * never acted". The chime is the worst part; it confirms he was heard when he wasn't.
 *
 * THE DECISION MADE HERE: interruption is honored. The audio has already been stopped by the
 * time this runs, so refusing to act cannot un-cut the announcement — it only loses the command
 * on top. Acting is strictly better than the behavior that shipped.
 *
 * The original guard is kept, not deleted: a phrase that arrives while the app is genuinely
 * still speaking (a direct call that bypassed the interruption handler — a tap, an injected
 * test transcript) is still dropped. The difference is that this now reads the LIVE status.
 */

import type { VoiceStatus } from './useVoice';

export type GateDecision =
  | 'handle'
  | 'drop-busy'
  | 'drop-speaking'
  | 'drop-invalidated';

export interface GateInput {
  /**
   * The status as of RIGHT NOW, not as of the last render. Must come from the live ref
   * (useVoice's getStatus()), never from the `status` value the hook returns — that one lags
   * by a render and is what caused the bug above.
   */
  liveStatus: VoiceStatus;
  /** A command is already being handled; a second one would interleave badly. */
  isProcessing: boolean;
  /** The route finished or was replaced — stale commands must not execute against it. */
  sessionInvalidated: boolean;
}

/**
 * Order matters and matches the original code:
 *   busy → still-speaking → invalidated → handle.
 */
export function resolveTranscriptGate(input: GateInput): GateDecision {
  const { liveStatus, isProcessing, sessionInvalidated } = input;

  if (isProcessing) return 'drop-busy';

  // Genuinely mid-announcement. A real interruption never reaches here as 'speaking', because
  // the voice layer flips to 'listening' before handing the phrase up.
  if (liveStatus === 'speaking') return 'drop-speaking';

  if (sessionInvalidated) return 'drop-invalidated';

  return 'handle';
}

/** Plain-English reason for the log line, so a dropped phrase is never silent in diagnostics. */
export function gateReason(decision: GateDecision): string {
  switch (decision) {
    case 'drop-busy':
      return 'still finishing the previous command';
    case 'drop-speaking':
      return 'app is mid-announcement and this did not come through the interrupt path';
    case 'drop-invalidated':
      return 'route already finished or was replaced';
    case 'handle':
      return 'acted on';
  }
}
