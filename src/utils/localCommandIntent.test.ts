import { describe, it, expect } from 'vitest';
import { resolveLocalIntent } from './localCommandIntent';
import { CommandRecognizer, PickingCommand } from './commandRecognizer';

/**
 * Proof, not a claim.
 *
 * Two quick checks ran before the precise matcher and asked "does this phrase CONTAIN any of
 * these words?" anywhere in the sentence. Running first and matching anywhere, they ate commands
 * the matcher was built to handle. The old behavior is replayed below so the fix cannot regress.
 */

const r = new CommandRecognizer();

// The shipped checks, verbatim from StockerApp.tsx before 2026-07-30.
const OLD_UNDO_WORDS = ['go back', 'undo', 'oops', 'wait no', 'previous', 'back one', 'wrong', 'mistake'];
const OLD_REPEAT_WORDS = ['repeat', 'again', 'what was that', 'say that again', 'say again', "what's next", 'current'];
const oldSaidUndo = (s: string) => OLD_UNDO_WORDS.some((w) => s.toLowerCase().indexOf(w) !== -1);
const oldSaidRepeat = (s: string) => OLD_REPEAT_WORDS.some((w) => s.toLowerCase().indexOf(w) !== -1);

describe('commands that were being eaten before they reached the matcher', () => {
  it.each([
    ['go back to skipped machine', PickingCommand.GO_BACK],
    ['go back to the skipped machine', PickingCommand.GO_BACK],
    ['back to skipped', PickingCommand.GO_BACK],
  ])('"%s" reaches the matcher and returns to the skipped machine', (phrase, expected) => {
    expect(resolveLocalIntent(phrase)).toBeNull();
    expect(r.recognize(phrase).command).toBe(expected);
  });

  it('SHIPPED BEHAVIOR — "go back to skipped machine" reversed his last pick instead', () => {
    // He asked to return to a machine he skipped. The app undid a pick and left him where he was.
    expect(oldSaidUndo('go back to skipped machine')).toBe(true);
  });

  it.each([
    ['previous', PickingCommand.PREVIOUS_ITEM],
    ['previous item', PickingCommand.PREVIOUS_ITEM],
    ['go to previous', PickingCommand.PREVIOUS_ITEM],
  ])('"%s" steps back one item rather than undoing a pick', (phrase, expected) => {
    expect(resolveLocalIntent(phrase)).toBeNull();
    expect(r.recognize(phrase).command).toBe(expected);
  });

  it('SHIPPED BEHAVIOR — "previous item" reversed his last pick', () => {
    expect(oldSaidUndo('previous item')).toBe(true);
  });

  it.each(["what's next", 'whats next'])(
    '"%s" advances to the next item',
    (phrase) => {
      expect(resolveLocalIntent(phrase)).toBeNull();
      expect(r.recognize(phrase).command).toBe(PickingCommand.NEXT_ITEM);
    },
  );

  it('SHIPPED BEHAVIOR — the apostrophe decided what "what\'s next" did', () => {
    // With the apostrophe it repeated the last announcement; without it, it advanced.
    // Same words, two outcomes, decided by how the phone happened to transcribe it.
    expect(oldSaidRepeat("what's next")).toBe(true);
    expect(oldSaidRepeat('whats next')).toBe(false);
  });

  it.each([
    "what's the current par level",
    'current inventory',
    'what is the current count',
  ])('"%s" is answered as an inventory question', (phrase) => {
    expect(resolveLocalIntent(phrase)).toBeNull();
    expect(r.recognize(phrase).command).toBe(PickingCommand.INVENTORY_QUERY);
  });

  it('SHIPPED BEHAVIOR — an inventory question containing "current" repeated the announcement', () => {
    expect(oldSaidRepeat("what's the current par level")).toBe(true);
  });
});

describe('real undo still works', () => {
  it.each([
    'undo',
    'undo that',
    'oops',
    'wait no',
    'back one',
    'go back one',
    'wrong',
    'that was wrong',
    'my mistake',
    'cancel that',
    'i grabbed the wrong one',
    'i picked the wrong item',
    'my bad',
  ])('"%s" undoes', (phrase) => {
    expect(resolveLocalIntent(phrase)).toBe('undo');
  });
});

describe('real repeat still works', () => {
  it.each([
    'repeat',
    'repeat that',
    'say that again',
    'say again',
    'again',
    'one more time',
    'come again',
    'what was that',
    'current',
  ])('"%s" repeats', (phrase) => {
    expect(resolveLocalIntent(phrase)).toBe('repeat');
  });
});

describe('ordinary speech is not hijacked', () => {
  it.each([
    'next',
    'skip this machine',
    'top',
    'bottom',
    'how many',
    'the truck is out front',
    'this machine is done',
    '',
  ])('"%s" is left for the matcher', (phrase) => {
    expect(resolveLocalIntent(phrase)).toBeNull();
  });

  it('a sentence merely containing "wrong" as description does not undo', () => {
    // The old check fired on any sentence with the word in it.
    expect(oldSaidUndo('nothing wrong with this machine')).toBe(true);
    expect(resolveLocalIntent('nothing wrong with this machine')).toBeNull();
  });
});
