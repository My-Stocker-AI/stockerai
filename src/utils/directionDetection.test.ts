import { describe, it, expect } from 'vitest';
import { detectDirection } from './phoneticCorrection';

/**
 * Proof, not a claim.
 *
 * This runs at the exact moment a machine is about to start, and whatever it returns REPLACES
 * what the picker said. Before 2026-07-30 it matched a mishearing anywhere in the sentence —
 * including inside other words — so any of the phrases in the first block below started the
 * machine from the top.
 *
 * Getting the direction wrong is not a small miss. The whole machine is then picked in the wrong
 * order, and nothing tells him why.
 *
 * Every phrase in the first block was run against the shipped code on 2026-07-30 and returned
 * 'top'.
 */

describe('everyday speech no longer starts a machine', () => {
  it.each([
    // A vending driver says "pop" all day — it is the product.
    'grab the pop',
    'the pop is out',
    'two pops',
    'diet pop',
    // The opposite of what he wants
    'stop the truck',
    'dont stop',
    'stop it',
    'bus stop',
    // Ordinary conversation
    'let me talk to him',
    'talk to you later',
    'i need to talk',
    'tap the screen',
    'the tap is broken',
    'cop is outside',
    'a cop just pulled in',
    'tip it over',
    'the tip fell off',
    // Matched INSIDE a word before
    'laptop',
    'rooftop',
    'stopped',
  ])('"%s" is not read as a direction', (phrase) => {
    expect(detectDirection(phrase)).toBeNull();
  });

  it('"stop" on its own halts nothing but never starts a machine either', () => {
    // Judgment call, 2026-07-30. 'stop' was a genuinely observed mishearing of "top", but it is
    // also the word for "everything halt". Sound cannot separate them, and the costs are not
    // equal: accepting it wrongly picks an entire machine in the wrong order, silently; refusing
    // it costs one repeated word.
    expect(detectDirection('stop')).toBeNull();
  });
});

describe('real answers still work — nothing the fix was protecting was lost', () => {
  it.each([
    ['top', 'top'],
    ['bottom', 'bottom'],
    ['the top', 'top'],
    ['the bottom', 'bottom'],
    ['at the top', 'top'],
    ['at the bottom', 'bottom'],
    ['from the top', 'top'],
    ['from the bottom', 'bottom'],
    ['start at the top', 'top'],
    ['start at the bottom', 'bottom'],
    ['start with the bottom', 'bottom'],
    ['bottom up', 'bottom'],
  ])('"%s" is understood as %s', (phrase, expected) => {
    expect(detectDirection(phrase)).toBe(expected);
  });

  it.each([
    ['tap', 'top'],
    ['tip', 'top'],
    ['cop', 'top'],
    ['pop', 'top'],
    ['talk', 'top'],
    ['tot', 'top'],
    ['bam', 'bottom'],
    ['bomb', 'bottom'],
    ['batman', 'bottom'],
    ['boddum', 'bottom'],
    ['batoom', 'bottom'],
  ])('a one-word mishearing "%s" still resolves to %s', (phrase, expected) => {
    // These exist because the speech service returns them INSTEAD of the direction word — the
    // whole utterance is that one word. Requiring exactly that is what kills the false matches
    // above while keeping every case the list was built from.
    expect(detectDirection(phrase)).toBe(expected);
  });
});

describe('a sentence is never guessed from its first word', () => {
  it('leaves a long sentence alone even when it opens with a similar sound', () => {
    // The scoring fallback assumes the whole utterance is one garbled direction word. Applied to
    // a sentence, it turned "stop the truck" and "pop is out" into "top".
    expect(detectDirection('pop is out on machine three')).toBeNull();
    expect(detectDirection('tap that one for me')).toBeNull();
    expect(detectDirection('bomb went off down the street')).toBeNull();
  });

  it('handles empty and whitespace input without guessing', () => {
    expect(detectDirection('')).toBeNull();
    expect(detectDirection('   ')).toBeNull();
  });
});
