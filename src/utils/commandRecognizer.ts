/**
 * CommandRecognizer - Pattern matching for high-frequency picking commands
 *
 * Purpose: Achieve 99.9% accuracy for ~90% of commands by using exact/fuzzy
 * pattern matching instead of routing everything through AI.
 *
 * Tier 1: Phonetic correction (word-level STT error fixing)
 * Tier 2: Exact Match (99.9% accuracy) - Regex patterns
 * Tier 3: Fuzzy Match (98% accuracy) - Levenshtein distance for STT errors
 * Tier 4: UNKNOWN - handled locally ("I didn't catch that"), NOT sent to AI
 */

import { APP_NAME_TOKENS, isBareWakePhrase } from './wakePhrases';

export enum PickingCommand {
  NEXT_ITEM = 'next_item',
  SKIP_MACHINE = 'skip_machine',
  INVENTORY_QUERY = 'inventory_query',
  REPEAT = 'repeat',
  DIRECTION_TOP = 'direction_top',
  DIRECTION_BOTTOM = 'direction_bottom',
  AFFIRMATIVE = 'affirmative',  // For "yes/okay/ready" during transitions
  GO_BACK = 'go_back',          // Return to skipped machine
  PREVIOUS_ITEM = 'previous_item', // Go back to previous item on current machine
  UNDO = 'undo',
  WHICH_MACHINE = 'which_machine',   // "what machine is this" — answered locally from state
  MACHINES_LEFT = 'machines_left',   // "how many machines left" — answered locally from state
  WAKE_ONLY = 'wake_only',           // just the app's name while already awake — ask what he wants
  UNKNOWN = 'unknown'
}

export interface CommandMatch {
  command: PickingCommand;
  confidence: number;
  requiresConfirmation?: boolean;
  parameters?: Record<string, any>;
}

/**
 * Word-level phonetic corrections for common Deepgram mishearings.
 * Applied to individual words before pattern matching.
 * Only includes corrections that are unambiguous in stocking context.
 */
const PHONETIC_WORD_CORRECTIONS: Record<string, string> = {
  // p ↔ f/b (labial consonants — Deepgram's #1 confusion class)
  'far': 'par',           // "far level" → "par level"
  'bar': 'par',           // "bar level" → "par level"
  'car': 'par',           // rare but possible
  'par': 'par',           // identity (keep for consistency)

  // "next" variants (t/n dental confusion, common Deepgram errors)
  'text': 'next',
  'necks': 'next',
  'neck': 'next',
  'knext': 'next',
  'nixed': 'next',
  'nest': 'next',
  'net': 'next',

  // "done" variants
  'dun': 'done',
  'dawn': 'done',
  'ton': 'done',
  'dune': 'done',

  // "top" variants (vowel shifts)
  'tap': 'top',
  'tup': 'top',
  'tob': 'top',
  'talk': 'top',          // rare Deepgram confusion

  // "bottom" variants
  'boddum': 'bottom',
  'baton': 'bottom',
  'button': 'bottom',
  'bought': 'bottom',     // "bought 'em" → "bottom"
  'bother': 'bottom',

  // "skip" variants (sibilant confusion)
  'ski': 'skip',
  'schip': 'skip',
  'ship': 'skip',
  'skid': 'skip',
  'skit': 'skip',

  // "repeat" variants
  'repeats': 'repeat',
  'rebeat': 'repeat',
  'replete': 'repeat',

  // "undo" variants
  'under': 'undo',

  // "inventory" variants
  'inventor': 'inventory',
  'inventery': 'inventory',

  // "level" variants (already correct usually, but just in case)
  'label': 'level',
};

/**
 * Pattern definitions for exact matching.
 * Uses keyword-based matching (word boundaries) where appropriate
 * to catch natural speech variations.
 */
const NEXT_PATTERNS = [
  /^next$/,
  /^next item$/,
  /^next one$/,
  /^done$/,
  /^got it$/,
  /^correct$/,
  /^give me next$/,
  /^give me the next$/,
  /^give me the next one$/,
  /^give me the next item$/,
  /^what'?s next$/,
  /^next please$/,
  /^check$/,
  /^good$/,
  /^perfect$/,
  // Moved out of SKIP_PATTERNS 2026-07-30 — see the note there.
  /^move on$/,
];

const SKIP_PATTERNS = [
  /^skip$/,
  /^skip machine$/,
  /^skip this machine$/,
  /^skip this one$/,
  /^skip it$/,
  /^pass$/,
  // "move on" REMOVED 2026-07-30 (survey). In ordinary speech it means "next item", not
  // "abandon this machine". A picker saying it mid-machine had every remaining item in that
  // machine marked skipped, with no warning and nothing to undo it. It now reads as NEXT_ITEM.
  /^go to next machine$/,
  /^next machine$/,
];

const INVENTORY_PATTERNS = [
  // Keyword-based: any phrase containing "par" or "inventory" or "level" in stocking context
  /\bpar\s*(level)?\b/,           // "par", "par level", "what's the par level"
  /\binventory\b/,                // "inventory", "what's the inventory", "current inventory"
  /\blevel\b/,                    // "level", "what level" (in stocking = par level)
  /\bhow many\b/,                 // "how many"
  /\bhow much\b/,                 // "how much"
  /\bstock\b/,                    // "what's in stock", "stock count"
  /\bcount\b/,                    // "what's the count"
  /what'?s in (the|this) machine/, // "what's in the machine" → current item's par level
];

// Machine-level: which machine am I on right now (answered locally from state)
const WHICH_MACHINE_PATTERNS = [
  /what machine is this/,
  /which machine is this/,
  /which machine am i on/,
  /what machine am i on/,
  /what machine are we on/,
  /^which machine$/,
  /^what machine$/,
];

// Machine-level: how many machines remain (answered locally from state).
// MUST be checked before INVENTORY so "how many machines" doesn't get eaten
// by the generic "how many" item-inventory pattern.
const MACHINES_LEFT_PATTERNS = [
  /how many machines/,
  /machines left/,
  /machines to go/,
  /machines are left/,
  /machines remaining/,
  /how many more machines/,
];

const REPEAT_PATTERNS = [
  /^repeat$/,
  /^repeat that$/,
  /^say that again$/,
  /^say again$/,
  /^what was that$/,
  /^what did you say$/,
  /^come again$/,
  /^pardon$/,
  /^what$/,
  /^huh$/,
];

const DIRECTION_TOP_PATTERNS = [
  /^top$/,
  /^from the top$/,
  /^start at the top$/,
  /^start from the top$/,
  /^beginning$/,
  /^from beginning$/,
  /^from the beginning$/,
  /^start from beginning$/,
  /^start from the beginning$/,
  /^first$/,
];

const DIRECTION_BOTTOM_PATTERNS = [
  /^bottom$/,
  /^from the bottom$/,
  /^start at the bottom$/,
  /^start from the bottom$/,
  /^end$/,
  /^from the end$/,
  /^start from end$/,
  /^start from the end$/,
  /^last$/,
  /^reverse$/,
];

// Machine-level: return to a skipped machine
const GO_BACK_TO_SKIPPED_PATTERNS = [
  /^go back to skipped$/,
  /^go back to the skipped$/,
  /^go back to skipped machine$/,
  /^go back to the skipped machine$/,
  /^return to skipped$/,
  /^back to skipped$/,
  /^back to the skipped$/,
  /^back to skipped machine$/,
  /^skipped machine$/,
];

// Item-level: go back to previous item on current machine
const PREVIOUS_ITEM_PATTERNS = [
  /^go back$/,
  /^back$/,
  /^previous$/,
  /^previous item$/,
  /^go to previous$/,
  /^last item$/,
  /^go back one$/,
  /^back one$/,
];

const UNDO_PATTERNS = [
  /^undo$/,
  /^undo that$/,
  /^cancel$/,
  /^cancel that$/,
  /^wrong$/,
  /^that was wrong$/,
  /^oops$/,
  /^mistake$/,
  /^my mistake$/,
];

const AFFIRMATIVE_PATTERNS = [
  /^yes$/,
  /^yep$/,
  /^yeah$/,
  /^yea$/,
  /^okay$/,
  /^ok$/,
  /^ready$/,
  /^go$/,
  /^sure$/,
  /^let'?s go$/,
  /^go ahead$/,
  /^alright$/,
  /^all right$/,
];

/**
 * Levenshtein distance for fuzzy matching
 * Used to handle common STT errors like "text" → "next"
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Multi-word phrase corrections applied BEFORE word-level corrections.
 * Handles cases where Deepgram mishears a single word as multiple words
 * (e.g. "bottom" heard as "bought them" — two words that individually
 * don't map to the intended word).
 */
const PHONETIC_PHRASE_CORRECTIONS: [RegExp, string][] = [
  [/\bstart\s+from\s+bought\b.*/g, 'bottom'],  // "start from bought [them]" → "bottom" (before bought→bottom word correction)
  [/\bbought\s+them?\b/g, 'bottom'],            // "bought them" / "bought the" → "bottom"
  [/\bbought\s+em\b/g, 'bottom'],              // "bought em" → "bottom"
  [/\bbottom\s+of\s+the\b/g, 'bottom'],        // "bottom of the" → "bottom"
];

function applyPhraseCorrections(text: string): string {
  let result = text;
  for (const [pattern, replacement] of PHONETIC_PHRASE_CORRECTIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Apply word-level phonetic corrections to transcript.
 * Splits into words, corrects each word, rejoins.
 * This catches errors like "far level" → "par level" even in
 * longer phrases like "what's the far level".
 */
function applyPhoneticCorrections(text: string): string {
  // Phrase corrections first (multi-word → single word)
  const phraseFixed = applyPhraseCorrections(text);
  // Then word-level corrections
  return phraseFixed.split(/\s+/).map(word => {
    return PHONETIC_WORD_CORRECTIONS[word] || word;
  }).join(' ');
}

export class CommandRecognizer {
  /**
   * Recognize a command from transcript text
   */
  recognize(transcript: string): CommandMatch {
    // Strip trailing punctuation before matching (Deepgram includes periods, commas, etc.)
    const lower = transcript.toLowerCase().trim().replace(/[.!?,;:]+$/g, '');

    // Tier 1: Apply word-level phonetic corrections
    const corrected = applyPhoneticCorrections(lower);

    if (corrected !== lower) {
      console.log('[CommandRecognizer] 🔊 Phonetic correction:', lower, '→', corrected);
    }

    // Tier 1b: GRID-007 — nothing but the app's own name. This has to be caught BEFORE the
    // filler-stripping match, because that strips the name and is then left holding an empty
    // string, which is not a command — so a bare name used to land on "I didn't catch that",
    // or on a guess at something he never said. It is not an unrecognized command; it is him
    // getting the app's attention while it is already listening, and the honest answer is to
    // ask what he wants. Anything AFTER the name ("OK Stocker, next") fails this test and
    // carries on down the normal path untouched.
    if (isBareWakePhrase(corrected)) {
      return { command: PickingCommand.WAKE_ONLY, confidence: 1.0 };
    }

    // Tier 2: Exact match (99.9% accuracy)
    const exactMatch = this.exactMatch(corrected);
    if (exactMatch) {
      return exactMatch;
    }

    // Tier 2b: Filler-tolerant match — drivers speak naturally ("okay, next one"),
    // not in bare keywords. Runs only after a clean exact match fails.
    const looseMatch = this.looseMatch(corrected);
    if (looseMatch) {
      return looseMatch;
    }

    // Tier 3: Fuzzy match for STT errors (98% accuracy)
    const fuzzyMatch = this.fuzzyMatch(corrected);
    if (fuzzyMatch.confidence > 0.7) {
      return fuzzyMatch;
    }

    // Tier 4: Unknown - handled locally, NOT sent to AI
    return {
      command: PickingCommand.UNKNOWN,
      confidence: 0,
    };
  }

  /**
   * Exact pattern matching
   */
  private exactMatch(text: string): CommandMatch | null {
    if (NEXT_PATTERNS.some(p => p.test(text))) {
      return {
        command: PickingCommand.NEXT_ITEM,
        confidence: 1.0,
        requiresConfirmation: false,
      };
    }

    if (SKIP_PATTERNS.some(p => p.test(text))) {
      return {
        command: PickingCommand.SKIP_MACHINE,
        confidence: 1.0,
        requiresConfirmation: false,
      };
    }

    // Machine-count query BEFORE inventory — "how many machines left" must not
    // fall into the generic "how many" item-inventory pattern.
    if (MACHINES_LEFT_PATTERNS.some(p => p.test(text))) {
      return {
        command: PickingCommand.MACHINES_LEFT,
        confidence: 1.0,
        requiresConfirmation: false,
      };
    }

    // "What machine is this" — answered locally from state.
    if (WHICH_MACHINE_PATTERNS.some(p => p.test(text))) {
      return {
        command: PickingCommand.WHICH_MACHINE,
        confidence: 1.0,
        requiresConfirmation: false,
      };
    }

    // Check inventory AFTER skip but BEFORE direction (so "level" doesn't conflict)
    if (INVENTORY_PATTERNS.some(p => p.test(text))) {
      return {
        command: PickingCommand.INVENTORY_QUERY,
        confidence: 1.0,
        requiresConfirmation: false,
      };
    }

    if (REPEAT_PATTERNS.some(p => p.test(text))) {
      return {
        command: PickingCommand.REPEAT,
        confidence: 1.0,
        requiresConfirmation: false,
      };
    }

    if (DIRECTION_TOP_PATTERNS.some(p => p.test(text))) {
      return {
        command: PickingCommand.DIRECTION_TOP,
        confidence: 1.0,
        requiresConfirmation: false,
        parameters: { direction: 'beginning' },
      };
    }

    if (DIRECTION_BOTTOM_PATTERNS.some(p => p.test(text))) {
      return {
        command: PickingCommand.DIRECTION_BOTTOM,
        confidence: 1.0,
        requiresConfirmation: false,
        parameters: { direction: 'end' },
      };
    }

    // Check "back to skipped" BEFORE generic "go back" to prevent misrouting
    if (GO_BACK_TO_SKIPPED_PATTERNS.some(p => p.test(text))) {
      return {
        command: PickingCommand.GO_BACK,
        confidence: 1.0,
        requiresConfirmation: false,
      };
    }

    if (PREVIOUS_ITEM_PATTERNS.some(p => p.test(text))) {
      return {
        command: PickingCommand.PREVIOUS_ITEM,
        confidence: 1.0,
        requiresConfirmation: false,
      };
    }

    if (UNDO_PATTERNS.some(p => p.test(text))) {
      return {
        command: PickingCommand.UNDO,
        confidence: 1.0,
        requiresConfirmation: false,
      };
    }

    if (AFFIRMATIVE_PATTERNS.some(p => p.test(text))) {
      return {
        command: PickingCommand.AFFIRMATIVE,
        confidence: 1.0,
        requiresConfirmation: false,
      };
    }

    return null;
  }

  /**
   * Filler-tolerant match (Tier 2b).
   *
   * Drivers don't speak in clean keywords — they say "okay, next one",
   * "alright skip this machine", "let's do the next one". This strips leading
   * and trailing filler/glue words, then re-runs the EXACT matcher on what's
   * left. It runs ONLY after a clean exact match fails, so bare commands are
   * never overridden (e.g. "okay" alone stays AFFIRMATIVE). It only ever
   * STRIPS and re-matches — it never substring-scans — so random speech
   * ("completely random garbage") can't be coerced into a command.
   */
  private looseMatch(text: string): CommandMatch | null {
    // Leading filler/affirmative/glue words a driver naturally prepends.
    const LEADING = [
      // The app's own name. Added 2026-07-30: the app instructs the picker to say
      // "OK Stocker" for commands, and once it was already listening, "OK Stocker, next"
      // matched nothing — 'ok' was stripped, 'stocker' was not, and "stocker next" is not a
      // command. Every such phrase fell through to the slow AI path and died whenever the AI
      // was unreachable. Stripping is safe here: this runs ONLY after an exact match fails,
      // and a strip that leaves nothing or leaves a non-command still returns null.
      ...APP_NAME_TOKENS,
      "let's", 'lets', 'okay', 'ok', 'alright', 'all right', 'yeah', 'yep',
      'yes', 'yea', 'sure', 'got it', 'and', 'so', 'um', 'uh', 'well', 'hey',
      'now', 'just', 'please', 'go ahead and', 'go ahead', 'can you',
      'could you', 'would you', 'do the', 'do', 'the', "i'll", 'ill', 'then',
    ];
    // Trailing filler words a driver naturally appends.
    const TRAILING = ['please', 'now', 'then', 'one', 'for me', 'real quick', 'buddy', 'item'];

    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Normalize internal punctuation/whitespace.
    let t = text.replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim();
    const original = t;

    // Strip leading filler iteratively ("okay so next" → "next").
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of LEADING) {
        const re = new RegExp('^' + esc(f) + '\\b\\s*', 'i');
        if (re.test(t)) { t = t.replace(re, '').trim(); changed = true; }
      }
    }
    // Strip trailing filler iteratively ("next one please" → "next").
    changed = true;
    while (changed) {
      changed = false;
      for (const f of TRAILING) {
        const re = new RegExp('\\s+' + esc(f) + '$', 'i');
        if (re.test(t)) { t = t.replace(re, '').trim(); changed = true; }
      }
    }

    // Only re-match if stripping actually changed the text AND left something.
    if (t && t !== original) {
      return this.exactMatch(t);
    }
    return null;
  }

  /**
   * Fuzzy matching using Levenshtein distance
   */
  private fuzzyMatch(text: string): CommandMatch {
    const knownCommands = [
      { phrase: 'next', command: PickingCommand.NEXT_ITEM },
      { phrase: 'next item', command: PickingCommand.NEXT_ITEM },
      { phrase: 'done', command: PickingCommand.NEXT_ITEM },
      { phrase: 'got it', command: PickingCommand.NEXT_ITEM },
      { phrase: 'skip', command: PickingCommand.SKIP_MACHINE },
      { phrase: 'skip machine', command: PickingCommand.SKIP_MACHINE },
      { phrase: 'next machine', command: PickingCommand.SKIP_MACHINE },
      { phrase: 'inventory', command: PickingCommand.INVENTORY_QUERY },
      { phrase: 'par level', command: PickingCommand.INVENTORY_QUERY },
      { phrase: 'par', command: PickingCommand.INVENTORY_QUERY },
      { phrase: 'repeat', command: PickingCommand.REPEAT },
      { phrase: 'say again', command: PickingCommand.REPEAT },
      { phrase: 'top', command: PickingCommand.DIRECTION_TOP },
      { phrase: 'beginning', command: PickingCommand.DIRECTION_TOP },
      { phrase: 'bottom', command: PickingCommand.DIRECTION_BOTTOM },
      { phrase: 'back to skipped', command: PickingCommand.GO_BACK },
      { phrase: 'skipped machine', command: PickingCommand.GO_BACK },
      { phrase: 'previous', command: PickingCommand.PREVIOUS_ITEM },
      { phrase: 'go back', command: PickingCommand.PREVIOUS_ITEM },
      { phrase: 'undo', command: PickingCommand.UNDO },
      { phrase: 'cancel', command: PickingCommand.UNDO },
      { phrase: 'yes', command: PickingCommand.AFFIRMATIVE },
      { phrase: 'ready', command: PickingCommand.AFFIRMATIVE },
    ];

    let bestMatch: { command: PickingCommand; distance: number; phrase: string } | null = null;

    for (const { phrase, command } of knownCommands) {
      const distance = levenshteinDistance(text, phrase);
      const maxAllowedDistance = Math.floor(phrase.length * 0.3); // Allow 30% error rate

      if (distance <= maxAllowedDistance) {
        if (!bestMatch || distance < bestMatch.distance) {
          bestMatch = { command, distance, phrase };
        }
      }
    }

    if (bestMatch) {
      // Calculate confidence based on edit distance
      const confidence = 1 - (bestMatch.distance / bestMatch.phrase.length);

      // Add parameters if needed
      const parameters: Record<string, any> = {};
      if (bestMatch.command === PickingCommand.DIRECTION_TOP) {
        parameters.direction = 'beginning';
      } else if (bestMatch.command === PickingCommand.DIRECTION_BOTTOM) {
        parameters.direction = 'end';
      }

      return {
        command: bestMatch.command,
        confidence,
        requiresConfirmation: confidence < 0.85, // Request confirmation if <85% confidence
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      };
    }

    return {
      command: PickingCommand.UNKNOWN,
      confidence: 0,
    };
  }
}
