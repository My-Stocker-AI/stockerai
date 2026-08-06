/**
 * WHAT THE APP IS CALLED — one list, shared by everything that needs it.
 *
 * Two places care about the app's name and they used to disagree:
 *
 *   useVoice.ts kept WAKE_PHRASES to decide "is the picker waking me up?"
 *   commandRecognizer.ts kept a list of filler words to strip before matching a command —
 *   and the app's own name was not on it.
 *
 * So while the app was already listening, "OK Stocker, next" was not recognized as "next".
 * It fell through to the slower AI path, and died outright whenever the AI was unreachable.
 * Which matters, because the app itself tells the picker to talk that way:
 * StockerApp.tsx — 'Resumed. Say "OK Stocker" for commands.'
 *
 * Found 2026-07-30 by the state × command × timing survey and proved against the real matcher:
 * "next" resolved; "ok stocker next", "hey stocker next" and nine other variants all came back
 * unrecognized.
 */

/** The bare names Deepgram returns for "Stocker" — the real one and the reliable mishearings. */
export const APP_NAME_TOKENS = [
  'stocker',
  'stalker',
  'stoker',
  'docker',
  'soccer',
] as const;

/**
 * Full phrases that mean "wake up and listen". Longest first so a prefix match consumes the
 * whole phrase rather than stopping at the bare name.
 */
export const WAKE_PHRASES: string[] = [
  'ok stocker', 'okay stocker', 'hey stocker', 'stocker',
  'ok stalker', 'okay stalker', 'hey stalker', 'stalker',
  'ok stoker', 'okay stoker', 'hey stoker', 'stoker',
  'ok docker', 'okay docker', 'hey docker',
  'ok soccer', 'okay soccer',
  'ok stock', 'okay stock', 'hey stock',
];

/**
 * GRID-007 — did he say ONLY the app's name, with no command after it?
 *
 * Saying a name is how you get someone's attention, and what that means depends entirely on
 * whether they were already paying it. Russ's rule, 2026-08-06:
 *
 *   asleep, name alone → wake up and say where we are
 *   awake,  name alone → ask him what he wants to do
 *
 * The asleep half already worked. The awake half did not: the command matcher strips the app's
 * own name as filler, and on a bare name that leaves an empty string. Empty is not a command, so
 * it fell through to "I didn't catch that" — or worse, to a guess at some command he never said.
 * The same two words therefore meant two different things depending on a state he cannot see.
 *
 * Why ask rather than re-announce the item: he often says the name, pauses half a second to
 * think, then speaks the command. Announcing over that pause talks straight over him. A short
 * question fits the pause instead of fighting it.
 */
const BARE_WAKE_RE = new RegExp(
  `^(?:(?:ok|okay|hey)\\s+)?(?:${[...APP_NAME_TOKENS, 'stock'].join('|')})$`,
  'i',
);

/** True when the whole utterance is nothing but the app's name (or a known mishearing of it). */
export function isBareWakePhrase(text: string): boolean {
  const t = (text || '')
    .toLowerCase()
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return false;
  return BARE_WAKE_RE.test(t);
}
