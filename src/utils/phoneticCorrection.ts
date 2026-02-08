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
  'top', 'tap', 'tip', 'cop', 'stop', 'pop', 'tock', 'talk', 'tot',
  'from the top', 'at the top', 'the top', 'start at the top',
  'beginning', 'start', 'first'
];

/**
 * Detect direction from potentially garbled transcript
 * Returns: 'top', 'bottom', or null
 */
export function detectDirection(transcript: string): 'top' | 'bottom' | null {
  const lower = transcript.toLowerCase().trim();

  // Direct matches (fastest path)
  if (BOTTOM_MISHEARINGS.some(m => lower.includes(m))) {
    return 'bottom';
  }
  if (TOP_MISHEARINGS.some(m => lower.includes(m))) {
    return 'top';
  }

  // Phonetic similarity fallback
  // Extract first word (usually the misheard direction)
  const firstWord = lower.split(/\s+/)[0];

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
