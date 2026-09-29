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

/**
 * The words of a phrase with punctuation dropped, so "Sorry. Didn't that" and "sorry, didn't"
 * compare. An apostrophe inside a word stays ("didn't"); one wrapped around a word goes
 * ('skip machine' → skip machine), because the app quotes and the microphone does not.
 */
function wordsOf(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, ' ')
    .split(' ')
    .map(w => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

/**
 * The app's own voice comes back through the microphone degraded — words dropped, punctuation
 * changed. So an echo is rarely a clean excerpt of what was said; it is a thinned-out one.
 *
 * 2026-09-17: the app said "Sorry, didn't catch that. Say 'next' to continue…" and heard
 * "Sorry. Didn't that". Not a substring (comma became a period, "catch" fell out), so the
 * wording test passed it through as the driver talking, and the app answered itself.
 *
 * This asks a looser question: does every word he was heard to say appear, in that order,
 * somewhere in the sentence the app just spoke? Gaps are allowed; reordering and new words
 * are not. Two words minimum, so a lone long word cannot match by accident.
 */
function isThinnedEchoOf(heard: string, spoken: string): boolean {
  const target = wordsOf(heard);
  if (target.length < 2) return false;

  let matched = 0;
  for (const word of wordsOf(spoken)) {
    if (word === target[matched]) matched++;
    if (matched === target.length) return true;
  }
  return false;
}

// Only the name in a standalone greeting can use approximate matching. Never
// apply it to products, quantities, instructions or a greeting plus a command.
function nearbyGreetingName(heard: string, spoken: string): boolean {
  if (heard === spoken) return true;
  if (Math.min(heard.length, spoken.length) < 4 || heard.slice(0, 2) !== spoken.slice(0, 2)) return false;
  if (Math.abs(heard.length - spoken.length) > 2) return false;
  let row = Array.from({ length: spoken.length + 1 }, (_, i) => i);
  for (let i = 1; i <= heard.length; i++) {
    const next = [i];
    for (let j = 1; j <= spoken.length; j++) {
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (heard[i - 1] === spoken[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[spoken.length] <= 2;
}

function isGreetingEcho(heard: string, spoken: string): boolean {
  const fragment = wordsOf(heard.replace(/’/g, "'")).join(' ');
  const firstClause = wordsOf(spoken.split(/[.!?;:]/)[0]).join(' ');
  const greeting = /^(hi|hello|welcome back) ([a-z]+)$/;
  const target = greeting.exec(fragment);
  const source = greeting.exec(firstClause);
  if (target && source && target[1] === source[1] && nearbyGreetingName(target[2], source[2])) return true;
  // A known self-introduction has no picking meaning. Restrict this to the app
  // actually identifying itself, not any sentence containing its name.
  const identity = /^(?:i'm|i am) ([a-z]+)$/.exec(fragment);
  return !!identity && /\b(?:i'm|i am) stocker\b/i.test(spoken.replace(/’/g, "'")) && nearbyGreetingName(identity[1], 'stocker');
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

  if (echoWindowOpen && isGreetingEcho(heard, input.lastSpoken)) return 'echo-content';

  if (echoWindowOpen && input.lastSpoken.length > 0 && heard.length > MIN_CONTENT_ECHO_LEN) {
    const spoken = input.lastSpoken.toLowerCase();
    if (spoken.includes(heard) || isThinnedEchoOf(heard, spoken)) {
      return 'echo-content';
    }
  }

  return 'accept';
}
