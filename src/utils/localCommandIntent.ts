/**
 * LOCAL COMMANDS — undo and repeat, decided without swallowing more specific commands.
 *
 * THE BUG (found 2026-07-30 by the state × command × timing survey)
 *
 * Two quick checks ran before the precise command matcher, and both asked "does this phrase
 * CONTAIN any of these words?" anywhere:
 *
 *   undo:   'go back', 'undo', 'oops', 'wait no', 'previous', 'back one', 'wrong', 'mistake'
 *   repeat: 'repeat', 'again', 'what was that', 'say that again', 'say again', "what's next",
 *           'current'
 *
 * Because they ran first and matched anywhere in the sentence, they quietly ate commands the
 * precise matcher was built to handle:
 *
 *   "go back to skipped machine"  → contains 'go back' → reversed his last pick instead of
 *                                   returning to the machine he skipped
 *   "previous item"               → contains 'previous' → reversed his last pick instead of
 *                                   showing the previous item
 *   "go to previous"              → same
 *   "what's next"                 → contains "what's next" → repeated the last announcement
 *                                   instead of advancing, even though the matcher maps it to
 *                                   NEXT ITEM. And only when the transcript kept the
 *                                   apostrophe — "whats next" slipped through and DID advance.
 *                                   Same words, two different outcomes, decided by punctuation.
 *   "what's the current par level" → contains 'current' → repeated the announcement instead of
 *                                   answering the question
 *
 * THE FIX: decide most-specific-first. Anything the precise matcher owns is handed to it. Only
 * a phrase that is genuinely an undo or a repeat is handled here.
 */

export type LocalIntent = 'undo' | 'repeat' | null;

/**
 * Phrases that belong to the precise matcher and must never be intercepted here.
 * Anchored to the whole phrase so they cannot over-reach the way the old checks did.
 */
const BELONGS_TO_MATCHER: RegExp[] = [
  // returning to a machine that was skipped earlier
  /^(go |come )?back to (the )?skipped( machine)?$/,
  /^return to (the )?skipped( machine)?$/,
  /^skipped machine$/,
  // stepping back one item — NOT the same as undoing a pick
  /^(go (back |to )?)?previous( item)?$/,
  /^last item$/,
  // asking for the next item
  /^what'?s next$/,
  /^what is next$/,
  // inventory questions that merely contain the word "current"
  /\bcurrent\b.*\b(par|level|inventory|count|stock)\b/,
  /\b(par|level|inventory|count|stock)\b.*\bcurrent\b/,
];

/**
 * Genuine undo. Whole-phrase forms, plus the handful of natural sentences where the picker is
 * unmistakably correcting himself.
 */
const UNDO_PATTERNS: RegExp[] = [
  /^undo( that)?$/,
  /^oops$/,
  /^wait,? no$/,
  /^back one$/,
  /^go back one$/,
  /^(that('s| was)? )?wrong$/,
  /^(my )?mistake$/,
  /^cancel( that)?$/,
  /^scratch that$/,
  /^take that back$/,
  /^not that one$/,
  // natural self-corrections — safe to match inside a sentence because nothing else means this
  /\bi (grabbed|picked|took|got) the wrong\b/,
  /\bwrong (one|item|thing|product)\b/,
  /\bmy (bad|mistake)\b/,
];

/** Genuine repeat. */
const REPEAT_PATTERNS: RegExp[] = [
  /^repeat( that)?$/,
  /^say (that )?again$/,
  /^again$/,
  /^one more time$/,
  /^come again$/,
  /^what was that$/,
  /^what did you say$/,
  /^(say )?that one more time$/,
  /^current( item)?$/,
  /\bsay that again\b/,
  /\brepeat that\b/,
];

/** Normalize the way the rest of the app does: lowercase, trimmed, punctuation flattened. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.!?;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What to do with a phrase before the precise matcher sees it.
 * Returns null when the phrase is not an undo or a repeat — including every phrase the precise
 * matcher owns.
 */
export function resolveLocalIntent(transcript: string): LocalIntent {
  const t = normalize(transcript);
  if (!t) return null;

  // Most specific wins. This ordering is the fix.
  if (BELONGS_TO_MATCHER.some((re) => re.test(t))) return null;

  if (UNDO_PATTERNS.some((re) => re.test(t))) return 'undo';
  if (REPEAT_PATTERNS.some((re) => re.test(t))) return 'repeat';

  return null;
}
