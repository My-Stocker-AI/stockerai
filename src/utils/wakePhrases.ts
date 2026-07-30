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
