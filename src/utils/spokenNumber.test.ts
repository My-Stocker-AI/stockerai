import { describe, it, expect } from 'vitest';
import { isBareNumber } from './spokenNumber';
import { CommandRecognizer, PickingCommand } from './commandRecognizer';

/**
 * Davy, 2026-09-17, item 13 of 32: "12". He was reading his count back. The app had nowhere to
 * put a number, asked him if he meant to skip, then said it didn't catch that, and he left the
 * machine unfinished.
 *
 * The rule: a transcript made only of numbers is counting out loud. Say nothing, do nothing,
 * stay on the same item. Anything with a real word in it is untouched by this.
 */
describe('isBareNumber — the driver counting out loud', () => {
  it.each([
    '12',
    '12.',
    'twelve',
    'Twelve.',
    '7',
    'twenty',
    'twenty-two',
    'twenty two',
    'one hundred',
    '0',
    '  12  ',
  ])('treats %j as a spoken count', (transcript) => {
    expect(isBareNumber(transcript)).toBe(true);
  });

  it.each([
    'next',
    'skip machine',
    'slot 12',
    '12 more',
    'one more',
    'next 12',
    'top',
    'bottom',
    'okay',
    'yes',
    'how many left',
    'par level',
    'what slot am I on',
    '',
    '   ',
  ])('leaves %j alone', (transcript) => {
    expect(isBareNumber(transcript)).toBe(false);
  });
});

/**
 * The guard only runs on transcripts the matcher could make nothing of. If a number ever DID
 * mean a command, this test would catch the collision before the guard could swallow it.
 */
describe('a bare number is not already a command', () => {
  const recognizer = new CommandRecognizer();

  it.each(['12', 'twelve', '7', 'twenty-two'])(
    'matcher returns UNKNOWN for %j, so the guard is reached',
    (transcript) => {
      expect(recognizer.recognize(transcript).command).toBe(PickingCommand.UNKNOWN);
    }
  );
});
