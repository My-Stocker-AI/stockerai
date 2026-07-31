/**
 * PHONETIC CORRECTION FOR DIRECTION COMMANDS
 *
 * Problem: Deepgram transcribes "bottom" as "bam", "bomb", "batman", etc.
 * Solution: Client-side phonetic similarity matching - ZERO LATENCY
 *
 * When awaiting direction (top/bottom), only 2 choices exist.
 * Use phonetic similarity to correct common mishearings.
 */

/**
 * Calculate simple phonetic similarity (0-1)
 * Uses consonant skeleton matching (drops vowels)
 */
function phoneticSimilarity(word1: string, word2: string): number {
  // Extract consonant skeleton
  const skeleton1 = word1.toLowerCase().replace(/[aeiou\s]/g, '');
  const skeleton2 = word2.toLowerCase().replace(/[aeiou\s]/g, '');

  // Levenshtein distance on consonant skeletons
  const maxLen = Math.max(skeleton1.length, skeleton2.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(skeleton1, skeleton2);
  return 1 - (distance / maxLen);
}

function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

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
  const lower = transcript.toLowerCase().trim();

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

  // Phonetic similarity fallback.
  //
  // SURVEY FIX 2026-07-30 — this scores only the FIRST word, on the premise that the whole
  // utterance is one garbled direction word. That premise does not hold for a sentence, and
  // scoring the first word of one turned "stop the truck" and "pop is out" into "top". Anything
  // longer than a short answer is left alone; a real direction answer is one or two words.
  // Real two-word answers ("the top", "bottom up", "at bottom") are already covered by the
  // phrase lists above, so the scoring fallback only ever needs a single word. Allowing two let
  // "stop it" through as "top".
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length !== 1) {
    return null;
  }

  // Extract first word (usually the misheard direction)
  const firstWord = words[0] || '';

  const bottomScore = phoneticSimilarity(firstWord, 'bottom');
  const topScore = phoneticSimilarity(firstWord, 'top');

  // Aggressive threshold: 0.4 (40% similar) - only 2 choices, be aggressive
  const THRESHOLD = 0.4;

  // If clearly "top", return top
  if (topScore > 0.5 && topScore > bottomScore) {
    console.log('[PhoneticCorrection] Detected "top" from:', transcript, { topScore, bottomScore });
    return 'top';
  }

  // If clearly "bottom", return bottom
  if (bottomScore > THRESHOLD && bottomScore > topScore) {
    console.log('[PhoneticCorrection] Detected "bottom" from:', transcript, { bottomScore, topScore });
    return 'bottom';
  }

  // Fallback: If awaiting direction and not clearly "top", assume "bottom"
  // Rationale: "bottom" has more phonetic variations, users say it more often
  if (bottomScore > topScore && bottomScore > 0.3) {
    console.log('[PhoneticCorrection] Defaulting to "bottom" (weak match):', transcript, { bottomScore, topScore });
    return 'bottom';
  }

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
