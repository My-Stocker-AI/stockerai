/**
 * PHONETIC CORRECTION FOR DIRECTION COMMANDS
 *
 * Problem: Deepgram transcribes "bottom" as "bam", "bomb", "batman", etc.
 * Solution: match only curated speech-service alternatives - ZERO LATENCY
 *
 * When awaiting direction (top/bottom), only 2 choices exist.
 * Unknown or weak matches stay unclear so the picker can clarify.
 */

/**
 * Known mishearings for "bottom" (from production data)
 */
const BOTTOM_MISHEARINGS = [
  'bottom', 'bam', 'bomb', 'batman', 'bom', 'bum', 'bim', 'bahn',
  'badam', 'bohm', 'balm', 'barn', 'bahm', 'botham', 'bottom up',
  'from the bottom', 'at the bottom', 'the bottom', 'start at the bottom',
  // Additional variations from production (2026-02-08)
  'baram', 'barum', 'boddum', 'boddam', 'botam', 'bodam', 'botum', 'badam',
  'baddam', 'baddum', 'batam', 'battam', 'batom', 'batoom'
];

/**
 * Known mishearings for "top" (from production data)
 */
const TOP_MISHEARINGS = [
  'top', 'tap', 'tip', 'cop', 'pop', 'tock', 'talk', 'tot',
  'from the top', 'at the top', 'the top', 'start at the top',
  'beginning', 'start', 'first'
];

// 'stop' REMOVED 2026-07-30 (survey). It was here as a real observed mishearing of "top", but
// it is also the word a person says when they want everything to halt — and this runs at the
// exact moment a machine is about to start. The two costs are not equal:
//
//   keep it   → he says "stop", the machine starts anyway, and the WHOLE machine is then picked
//               in the wrong order with nothing explaining why
//   drop it   → his misheard "top" gets no response and he says it once more
//
// One repeat is cheap. A silently wrong pick order is not. Flagged to Russ as a judgment call,
// not a silent change — if the logs show "stop" is far more often a misheard "top" than a real
// request to halt, put it back.

/**
 * Detect direction from potentially garbled transcript
 * Returns: 'top', 'bottom', or null
 */
/**
 * Does the utterance actually contain this mishearing — as words, not as letters?
 *
 * SURVEY FIX 2026-07-30. This used to be a plain `lower.includes(m)`, which matched the
 * mishearing ANYWHERE, including inside other words. Because this runs at the exact moment a
 * machine is about to start, that meant a machine got started from the top on any of:
 *
 *   "grab the pop"      "diet pop"        "two pops"      ← a vending driver says pop all day
 *   "stop the truck"    "don't stop"      "bus stop"
 *   "talk to you later" "let me talk"     "tap the screen"
 *   "laptop"            "rooftop"         "stopped"       ← matched INSIDE a word
 *
 * Getting the direction wrong is not a small miss: the whole machine is then picked in the wrong
 * order, and nothing tells him why.
 *
 * The single-word entries exist because the speech service returns them INSTEAD of "top" — the
 * whole utterance is that one word. So a single-word mishearing must BE the whole utterance.
 * Multi-word entries ("at the bottom") are unambiguous and may appear inside a longer sentence,
 * on word boundaries.
 */
function containsMishearing(lower: string, mishearings: string[]): boolean {
  return mishearings.some((m) => {
    if (m.includes(' ')) {
      // Multi-word phrase: allowed inside a sentence, but only on whole-word boundaries so
      // "the top" never matches inside "the topic".
      return new RegExp(`(^|\\s)${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`).test(lower);
    }
    // Single word: must be the entire utterance.
    return lower === m;
  });
}

/**
 * Words that are real requests in their own right and must never be auto-read as a direction,
 * however close they sound. See the note beside TOP_MISHEARINGS for why 'stop' is here: sound
 * alone cannot tell a misheard "top" from someone asking the app to halt, and the two mistakes
 * do not cost the same.
 */
const NEVER_A_DIRECTION = ['stop'];

export function detectDirection(transcript: string): 'top' | 'bottom' | null {
  const lower = transcript.toLowerCase().replace(/[.,!?;:]/g, ' ').trim().replace(/\s+/g, ' ');
  const directionWords = lower.split(' ');
  const topWords = new Set(['top', 'beginning', 'first']);
  const bottomWords = new Set(['bottom', 'end', 'last', 'reverse']);
  // Conflicting explicit directions need clarification, even when a known
  // multiword phrase is present. Repetition alone is one direction, not actions.
  if (directionWords.some(word => topWords.has(word)) && directionWords.some(word => bottomWords.has(word))) return null;
  if (directionWords.length > 1 && directionWords.every(word => topWords.has(word))) return 'top';
  if (directionWords.length > 1 && directionWords.every(word => bottomWords.has(word))) return 'bottom';

  if (NEVER_A_DIRECTION.includes(lower)) {
    return null;
  }

  // Direct matches (fastest path)
  if (containsMishearing(lower, BOTTOM_MISHEARINGS)) {
    return 'bottom';
  }
  if (containsMishearing(lower, TOP_MISHEARINGS)) {
    return 'top';
  }

  // Only explicitly curated, observed speech-service alternatives are automatic.
  // A weak phonetic score cannot establish a direction safely: leave it unknown so
  // the route asks the picker to repeat or clarify instead of silently choosing.
  return null;
}

/**
 * Correct transcript when awaiting direction
 * Replaces garbled words with correct direction
 */
export function correctDirectionTranscript(transcript: string): string {
  const direction = detectDirection(transcript);
  if (!direction) return transcript;

  // Replace with canonical form
  return direction;
}
