/**
 * A NUMBER SAID OUT LOUD IS NOT INPUT.
 *
 * Nothing in this app takes a number from the driver. Every voice command is a word ("next",
 * "skip machine", "top"), and every backend call takes a session id, a route name, a date or a
 * direction — all strings, checked 2026-09-18. The app SAYS quantities to him; it has never had
 * anywhere to put one he says back.
 *
 * So a transcript that is nothing but a number is the man counting the shelf out loud.
 *
 * 2026-09-17, live route, Woodsprings Suites Snack: Davy said "12" on item 13 of 32. With no
 * number handling anywhere it fell through to the AI, whose prompt carried two contradictory
 * rules for a bare number — "Random number → ask him to confirm" and, for mid-machine picking,
 * "a number is Unclear". He was asked whether he meant to skip, then told "didn't catch that",
 * and he walked away. The machine was left at 12 of 32 and never finished.
 *
 * Deliberately NOT treated as "next": a number muttered mid-count would advance the item and
 * silently lose a slot, which is worse than the confusion it replaces. The honest answer to a
 * man counting is to let him count.
 */

const NUMBER_WORDS = new Set([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
  'hundred',
]);

/**
 * True only when the transcript is ENTIRELY numbers — digits, number words, or both.
 *
 * Every token must be a number, so anything carrying a real word ("next", "slot 12",
 * "skip", "one more") fails and travels its normal path untouched.
 */
export function isBareNumber(transcript: string): boolean {
  const tokens = transcript
    .toLowerCase()
    .replace(/[.!?,;:]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);

  if (tokens.length === 0) return false;

  return tokens.every(t => /^\d+$/.test(t) || NUMBER_WORDS.has(t));
}
