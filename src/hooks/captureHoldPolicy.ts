/**
 * CAPTURE HOLD POLICY — one place that decides whether the microphone is sending.
 *
 * Proof, not a claim. Extracted as a pure function (house style, per reconnectPolicy.ts and
 * voiceHandoffPolicy.ts) so the decision can be unit-tested without mounting the voice component.
 *
 * WHY THIS EXISTS — the 2026-07-30 state × command × timing survey
 * (docs/voice-state-command-timing-matrix.md) found two defects that share one root cause:
 *
 *   GRID-003 (8 rows) — 'paused' and 'muted' both ran the same pauseCapture(), so no audio was
 *   sent in either state. That made the wake-phrase branch in processAccumulatedTranscript
 *   (useVoice.ts lines 453-459) unreachable: the app is written to listen for its own name while
 *   held, and could not hear it. The driver says "OK Stocker" and nothing happens, however many
 *   times he repeats it — the only way back into the route is to look at the phone and tap.
 *
 *   GRID-004 (4 rows) — a socket that dropped and reopened called startPcmCapture, whose
 *   idempotent path set the send-flag to true unconditionally. The microphone came back on while
 *   the screen still read paused or muted. The driver believes he silenced it; he has not.
 *
 * Both are the same shape: the send-flag was set by whichever code path happened to run, with no
 * single place asking what the app's state actually requires. This is that place.
 *
 * THE RULE (Russ's call, 2026-08-06) — pause and mute are split, so each word means what a driver
 * expects it to mean:
 *
 *   paused → the mic KEEPS sending. Only the wake phrase acts on it, so he can resume hands-free
 *            with both hands still on a case of product.
 *   muted  → the mic genuinely STOPS. He asked for it off, and that has to be true.
 *
 * Holds no state and touches no DOM. useVoice.ts calls it and acts on the answer.
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
 * Should the microphone be sending audio right now, given the app's state?
 *
 * - `muted` — no. The driver asked for the microphone off. A "mute" that still listens is a lie,
 *   and it is the one state where silence is the whole point.
 * - `idle` — no. Idle is reached by tapping Stop (or before the first connection), and Stop
 *   closes the socket and stops the microphone tracks outright.
 * - `paused` — YES. This is the GRID-003 fix. The app already listens for nothing but its own
 *   name while paused; it just never received the audio to hear it in.
 * - `listening` / `speaking` / `thinking` — yes, the ordinary live states.
 * - `error` — yes. The app fell into this; the driver did not choose it. His words must still
 *   arrive so they can be held and flushed on recovery, rather than vanishing unrecorded.
 */
export function shouldMicSend(status: VoiceStatus): boolean {
  if (status === 'muted') return false;
  if (status === 'idle') return false;
  return true;
}
