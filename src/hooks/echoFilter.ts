/**
 * ECHO FILTER — is this the app hearing itself, or the driver talking?
 *
 * The microphone stays open while the app speaks, so it hears its own voice. Without a
 * filter the app answers its own questions. The original filter compared what was heard
 * against what was last said: if the heard text sat inside the spoken text, it was
 * discarded.
 *
 * That test has no expiry, and the record of what was said was never cleared. So the
 * check kept firing minutes later, long after the speaker had gone quiet:
 *
 *   app  : "Skip this machine?"
 *   driver: "skip this machine"        <- inside what the app said -> discarded
 *   driver: "skip this machine"        <- discarded again, same reason
 *
 * Nothing tells him. He is stuck on that phrase until the app happens to say something
 * else. It bites hardest on the confirm questions, because those invite him to answer
 * with the exact words the app just used.
 *
 * The fix is to use TIME as the discriminator instead of wording alone. A real echo
 * arrives while the speaker is playing or a moment after; the driver's answer arrives
 * seconds later. So the wording test only applies inside that window.
 *
 * Deliberately NOT changed: while the app is still speaking, a phrase matching what it
 * is saying is still treated as an echo. Sound alone cannot separate the two there, and
 * the costs are lopsided — a false echo costs him one repeat, which now works, while a
 * false command silently skips a machine.
 */

export type EchoVerdict =
  | 'too-short'      // a stray syllable, not speech
  | 'echo-cooldown'  // arrived on top of the app's own voice
  | 'echo-content'   // matches what the app is saying, inside the echo window
  | 'accept';        // the driver is talking — act on it

/** How long after the speaker goes quiet a late echo can still arrive. */
export const ECHO_TAIL_MS = 1200;

/**
 * Below this length the wording test is skipped entirely. Short commands ("next",
 * "skip", "yes") appear inside almost any sentence the app speaks, so matching on them
 * would eat the most common things he says.
 */
export const MIN_CONTENT_ECHO_LEN = 10;

export interface EchoInput {
  /** What the speech service heard. */
  heard: string;
  /** The last thing the app said out loud, lowercased. Empty if it has said nothing. */
  lastSpoken: string;
  /** Milliseconds since the app STARTED speaking that line. */
  msSinceSpeechStarted: number;
  /** Milliseconds since the app FINISHED speaking, or null if it is still speaking. */
  msSinceSpeechEnded: number | null;
  /** Grace period after speech starts where everything heard is assumed to be echo. */
  cooldownMs: number;
  /** Override for the post-speech window. Defaults to ECHO_TAIL_MS. */
  tailMs?: number;
}

export function resolveEcho(input: EchoInput): EchoVerdict {
  const heard = input.heard.toLowerCase().trim();

  if (heard.length < 2) {
    return 'too-short';
  }

  if (input.msSinceSpeechStarted < input.cooldownMs) {
    return 'echo-cooldown';
  }

  const stillSpeaking = input.msSinceSpeechEnded === null;
  const tail = input.tailMs ?? ECHO_TAIL_MS;
  const echoWindowOpen = stillSpeaking || input.msSinceSpeechEnded! <= tail;

  if (
    echoWindowOpen &&
    input.lastSpoken.length > 0 &&
    heard.length > MIN_CONTENT_ECHO_LEN &&
    input.lastSpoken.toLowerCase().includes(heard)
  ) {
    return 'echo-content';
  }

  return 'accept';
}
