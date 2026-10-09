import { describe, expect, it } from 'vitest';
import { isLikelyPickingQuestion } from './pickingInput';

describe('unknown picking input routing', () => {
  it.each([
    'What product is next?',
    'how many are left',
    'Do I need both items',
    'Is that the right slot',
  ])('keeps genuine questions on the informational path: %s', phrase => {
    expect(isLikelyPickingQuestion(phrase)).toBe(true);
  });

  it.each([
    'Matt',
    'Max',
    'Next autumn goddamn it',
    'random warehouse noise',
  ])('does not turn unclear command-like speech into a generic AI conversation: %s', phrase => {
    expect(isLikelyPickingQuestion(phrase)).toBe(false);
  });
});
