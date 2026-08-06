/**
 * SPEECH FALLBACK POLICY — when playback fails, should the app try again in the backup voice?
 *
 * Proof, not a claim. Extracted as a pure function (house style, per reconnectPolicy.ts,
 * voiceHandoffPolicy.ts, captureHoldPolicy.ts) so the decision can be unit-tested without
 * mounting the voice component.
 *
 * WHY THIS EXISTS — GRID-005, from the 2026-07-30 survey
 * (docs/voice-state-command-timing-matrix.md).
 *
 * When the driver interrupts an announcement, the app stops the audio by clearing the player.
 * On Android, clearing the player raises a playback ERROR — so a deliberate stop arrives at the
 * error handler looking exactly like a genuine failure. The handler then did the reasonable
 * thing for a real failure and re-spoke the entire line in the flat backup voice, while his
 * command was ALSO being carried out.
 *
 * What that costs the driver: he says "next" over the top of "Aisle four, six Doritos" — and
 * the app moves to the next item AND starts reading the OLD item again, in a different voice.
 * One thing said, two things happen. It reads as the app arguing with itself.
 *
 * The distinction the code was missing is not subtle once named: an interruption the app
 * performed ON PURPOSE is not a failure to recover from. It is the driver getting what he asked
 * for. The backup voice exists for the case where the app tried to speak and genuinely could
 * not — a decoding failure, a dead audio path — and in that case he still needs to hear the
 * line, so it must keep working.
 *
 * Holds no state and touches no DOM. useVoice.ts calls it and acts on the answer.
 */

export interface SpeechFallbackInput {
  /**
   * True when the app deliberately stopped its own speech — a barge-in, a Stop tap, or
   * backgrounding. This is `stoppedRef` in useVoice.ts.
   */
  stoppedOnPurpose: boolean;
}

/**
 * Should the app re-speak the line in the backup voice after playback threw?
 *
 * The rule is one line: only when nobody asked it to stop.
 */
export function shouldSpeakFallback(input: SpeechFallbackInput): boolean {
  return !input.stoppedOnPurpose;
}
