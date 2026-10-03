import { describe, expect, it } from 'vitest';
import { ensureDirectionChoice, expandSpokenMeasurements } from './spokenText';

describe('expandSpokenMeasurements', () => {
  it.each([
    ['Miss Vickie\'s Spicy Dill 40g .... 1 count', "Miss Vickie's Spicy Dill 40 grams .... 1 count"],
    ['Snack 40 g .... 1 count', 'Snack 40 grams .... 1 count'],
    ['Sample 1g', 'Sample 1 gram'],
  ])('keeps package size separate from pick quantity: %s', (input, expected) => {
    expect(expandSpokenMeasurements(input)).toBe(expected);
  });
});

describe('ensureDirectionChoice', () => {
  it('adds the choices to the production skip-machine wording', () => {
    expect(ensureDirectionChoice(
      'next_machine',
      'Skipped Snack. Next is Drink at School. Where would you like to begin?',
    )).toBe('Skipped Snack. Next is Drink at School. Where would you like to begin. Say top or bottom.');
  });

  it('does not duplicate choices that are already explicit', () => {
    expect(ensureDirectionChoice('machine_ready', 'Welcome back. Top or bottom?'))
      .toBe('Welcome back. Top or bottom?');
  });

  it('does not change ordinary item speech', () => {
    expect(ensureDirectionChoice('item_ready', 'Chips. 2 count.')).toBe('Chips. 2 count.');
  });
});
