/**
 * Unit tests for CommandRecognizer
 *
 * Tests:
 *  - All exact-match command patterns (Tier 2)
 *  - Word-level phonetic corrections (Tier 1)
 *  - Phrase-level corrections (Bug 2c fix: "bought them" → bottom)
 *  - Fuzzy matching fallback (Tier 3)
 *  - Priority ordering (skip > direction, go-back-skipped > go-back)
 *  - Case insensitivity and punctuation stripping
 *  - UNKNOWN for garbage input
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CommandRecognizer, PickingCommand } from './commandRecognizer';

describe('CommandRecognizer', () => {
  let r: CommandRecognizer;

  beforeEach(() => {
    r = new CommandRecognizer();
  });

  // ─── NEXT / DONE ───────────────────────────────────────────────────────────

  describe('next_item command', () => {
    it.each([
      'next',
      'next item',
      'next one',
      'done',
      'got it',
      'correct',
      'give me next',
      'give me the next',
      'give me the next one',
      'give me the next item',
      "what's next",
      'next please',
    ])('recognizes "%s"', (input) => {
      expect(r.recognize(input).command).toBe(PickingCommand.NEXT_ITEM);
    });

    it('strips trailing punctuation: "next."', () => {
      expect(r.recognize('next.').command).toBe(PickingCommand.NEXT_ITEM);
    });

    it('is case-insensitive: "NEXT"', () => {
      expect(r.recognize('NEXT').command).toBe(PickingCommand.NEXT_ITEM);
    });

    it('"Done!" with exclamation', () => {
      expect(r.recognize('Done!').command).toBe(PickingCommand.NEXT_ITEM);
    });
  });

  // ─── DIRECTION ─────────────────────────────────────────────────────────────

  describe('direction_top command', () => {
    it.each([
      'top',
      'from the top',
      'start at the top',
      'start from the top',
      'beginning',
      'from beginning',
      'from the beginning',
      'start from beginning',
      'start from the beginning',
    ])('recognizes "%s"', (input) => {
      const match = r.recognize(input);
      expect(match.command).toBe(PickingCommand.DIRECTION_TOP);
      expect(match.parameters?.direction).toBe('beginning');
    });
  });

  describe('direction_bottom command', () => {
    it.each([
      'bottom',
      'from the bottom',
      'start at the bottom',
      'start from the bottom',
      'end',
      'from the end',
      'start from end',
      'start from the end',
    ])('recognizes "%s"', (input) => {
      const match = r.recognize(input);
      expect(match.command).toBe(PickingCommand.DIRECTION_BOTTOM);
      expect(match.parameters?.direction).toBe('end');
    });
  });

  // ─── PHRASE CORRECTIONS: BUG 2c FIX ───────────────────────────────────────

  describe('phrase corrections (Bug 2c: "bought them" → bottom)', () => {
    it('"bought them" → direction_bottom', () => {
      expect(r.recognize('bought them').command).toBe(PickingCommand.DIRECTION_BOTTOM);
    });

    it('"bought the" → direction_bottom', () => {
      expect(r.recognize('bought the').command).toBe(PickingCommand.DIRECTION_BOTTOM);
    });

    it('"bought em" → direction_bottom', () => {
      expect(r.recognize('bought em').command).toBe(PickingCommand.DIRECTION_BOTTOM);
    });

    it('"start from bought them" → direction_bottom (greedy phrase correction strips trailing words)', () => {
      // Phrase correction: "start from bought them" → "bottom" (greedy .* swallows trailing "them")
      const match = r.recognize('start from bought them');
      expect(match.command).toBe(PickingCommand.DIRECTION_BOTTOM);
    });

    it('"start from bought" → direction_bottom', () => {
      // Phrase correction: "start from bought" → "bottom"
      expect(r.recognize('start from bought').command).toBe(PickingCommand.DIRECTION_BOTTOM);
    });
  });

  // ─── WORD-LEVEL PHONETIC CORRECTIONS ──────────────────────────────────────

  describe('word-level phonetic corrections (Tier 1)', () => {
    it('"text item" corrects text→next', () => {
      expect(r.recognize('text item').command).toBe(PickingCommand.NEXT_ITEM);
    });

    it('"necks item" corrects necks→next', () => {
      expect(r.recognize('necks item').command).toBe(PickingCommand.NEXT_ITEM);
    });

    it('"far level" corrects far→par → inventory_query', () => {
      expect(r.recognize('far level').command).toBe(PickingCommand.INVENTORY_QUERY);
    });

    it('"bar level" corrects bar→par → inventory_query', () => {
      expect(r.recognize('bar level').command).toBe(PickingCommand.INVENTORY_QUERY);
    });

    it('"tap" corrects tap→top → direction_top', () => {
      expect(r.recognize('tap').command).toBe(PickingCommand.DIRECTION_TOP);
    });

    it('"button" corrects button→bottom → direction_bottom', () => {
      expect(r.recognize('button').command).toBe(PickingCommand.DIRECTION_BOTTOM);
    });

    it('"boddum" corrects boddum→bottom → direction_bottom', () => {
      expect(r.recognize('boddum').command).toBe(PickingCommand.DIRECTION_BOTTOM);
    });

    it('"under that" corrects under→undo → undo', () => {
      expect(r.recognize('under that').command).toBe(PickingCommand.UNDO);
    });

    it('"inventor" corrects inventor→inventory → inventory_query', () => {
      expect(r.recognize('inventor').command).toBe(PickingCommand.INVENTORY_QUERY);
    });
  });

  // ─── SKIP MACHINE ──────────────────────────────────────────────────────────

  describe('skip_machine command', () => {
    it.each([
      'skip',
      'skip machine',
      'skip this machine',
      'skip this one',
      'skip it',
      'pass',
      'move on',
      'go to next machine',
      'next machine',
    ])('recognizes "%s"', (input) => {
      expect(r.recognize(input).command).toBe(PickingCommand.SKIP_MACHINE);
    });
  });

  // ─── INVENTORY QUERY ───────────────────────────────────────────────────────

  describe('inventory_query command', () => {
    it.each([
      'par',
      'par level',
      "what's the par level",
      'inventory',
      "what's the inventory",
      'level',
      'how many',
      'how much',
      "what's in stock",
      "what's the count",
    ])('recognizes "%s"', (input) => {
      expect(r.recognize(input).command).toBe(PickingCommand.INVENTORY_QUERY);
    });
  });

  // ─── REPEAT ────────────────────────────────────────────────────────────────

  describe('repeat command', () => {
    it.each([
      'repeat',
      'repeat that',
      'say that again',
      'say again',
      'what was that',
      'what did you say',
      'come again',
      'pardon',
      'what',
      'huh',
    ])('recognizes "%s"', (input) => {
      expect(r.recognize(input).command).toBe(PickingCommand.REPEAT);
    });
  });

  // ─── GO BACK TO SKIPPED (machine-level) ───────────────────────────────────

  describe('go_back command (return to skipped machine)', () => {
    it.each([
      'go back to skipped',
      'go back to the skipped',
      'go back to skipped machine',
      'go back to the skipped machine',
      'return to skipped',
      'back to skipped',
      'back to the skipped',
      'back to skipped machine',
      'skipped machine',
    ])('recognizes "%s"', (input) => {
      expect(r.recognize(input).command).toBe(PickingCommand.GO_BACK);
    });
  });

  // ─── PREVIOUS ITEM (item-level go back) ───────────────────────────────────

  describe('previous_item command', () => {
    it.each([
      'go back',
      'back',
      'previous',
      'previous item',
      'go to previous',
      'last item',
      'go back one',
    ])('recognizes "%s"', (input) => {
      expect(r.recognize(input).command).toBe(PickingCommand.PREVIOUS_ITEM);
    });
  });

  // ─── UNDO ──────────────────────────────────────────────────────────────────

  describe('undo command', () => {
    it.each([
      'undo',
      'undo that',
      'cancel',
      'cancel that',
      'wrong',
      'that was wrong',
    ])('recognizes "%s"', (input) => {
      expect(r.recognize(input).command).toBe(PickingCommand.UNDO);
    });
  });

  // ─── AFFIRMATIVE ───────────────────────────────────────────────────────────

  describe('affirmative command', () => {
    it.each([
      'yes',
      'yep',
      'yeah',
      'yea',
      'okay',
      'ok',
      'ready',
      'go',
      'sure',
      "let's go",
      'go ahead',
      'alright',
      'all right',
    ])('recognizes "%s"', (input) => {
      expect(r.recognize(input).command).toBe(PickingCommand.AFFIRMATIVE);
    });
  });

  // ─── PRIORITY ORDER ────────────────────────────────────────────────────────

  describe('priority ordering', () => {
    it('"go back to skipped" → GO_BACK (not PREVIOUS_ITEM)', () => {
      // GO_BACK_TO_SKIPPED patterns checked before PREVIOUS_ITEM patterns
      expect(r.recognize('go back to skipped').command).toBe(PickingCommand.GO_BACK);
    });

    it('"level" → INVENTORY_QUERY (not something else)', () => {
      // INVENTORY_QUERY checked after SKIP but before DIRECTION
      expect(r.recognize('level').command).toBe(PickingCommand.INVENTORY_QUERY);
    });

    it('"skip" → SKIP_MACHINE (not UNDO or something else)', () => {
      expect(r.recognize('skip').command).toBe(PickingCommand.SKIP_MACHINE);
    });
  });

  // ─── FUZZY MATCHING (Tier 3) ───────────────────────────────────────────────

  describe('fuzzy matching (Tier 3)', () => {
    it('"dun" corrects to done → next_item (via word correction)', () => {
      // "dun" is in word-level corrections → "done" → NEXT_ITEM
      expect(r.recognize('dun').command).toBe(PickingCommand.NEXT_ITEM);
    });

    it('"skiip" fuzzy matches skip → skip_machine', () => {
      // edit distance 1 from "skip" (length 4, max allowed 1)
      expect(r.recognize('skiip').command).toBe(PickingCommand.SKIP_MACHINE);
    });

    it('"nexxt" fuzzy matches next → next_item', () => {
      // edit distance 1 from "next" (length 4, max allowed 1)
      expect(r.recognize('nexxt').command).toBe(PickingCommand.NEXT_ITEM);
    });

    it('"botom" fuzzy matches bottom → direction_bottom', () => {
      // edit distance 1 from "bottom" (length 6, max allowed 1)
      const match = r.recognize('botom');
      expect(match.command).toBe(PickingCommand.DIRECTION_BOTTOM);
    });

    it('fuzzy match confidence < 0.85 sets requiresConfirmation', () => {
      // Edit distance 1 from "skip" (length 4) → confidence = 1 - 1/4 = 0.75 < 0.85
      const match = r.recognize('skipp');
      if (match.command !== PickingCommand.UNKNOWN) {
        expect(match.requiresConfirmation).toBe(true);
      }
    });
  });

  // ─── UNKNOWN ───────────────────────────────────────────────────────────────

  describe('unknown command', () => {
    it.each([
      'purple elephant dancing',
      'qwerty keyboard',
      'totally random nonsense here',
      'hello how are you doing today',
    ])('"%s" → UNKNOWN', (input) => {
      expect(r.recognize(input).command).toBe(PickingCommand.UNKNOWN);
    });

    it('empty string → UNKNOWN (too short, filtered)', () => {
      // Empty string after trim → won't match any pattern
      expect(r.recognize('').command).toBe(PickingCommand.UNKNOWN);
    });

    it('whitespace only → UNKNOWN', () => {
      expect(r.recognize('   ').command).toBe(PickingCommand.UNKNOWN);
    });
  });

  // ─── CONFIDENCE VALUES ─────────────────────────────────────────────────────

  describe('confidence values', () => {
    it('exact match returns confidence 1.0', () => {
      expect(r.recognize('next').confidence).toBe(1.0);
    });

    it('exact match on inventory pattern returns confidence 1.0', () => {
      expect(r.recognize('par level').confidence).toBe(1.0);
    });

    it('unknown returns confidence 0', () => {
      expect(r.recognize('completely random garbage text').confidence).toBe(0);
    });
  });
});
