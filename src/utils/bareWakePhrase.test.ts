import { describe, it, expect } from 'vitest';
import { isBareWakePhrase } from './wakePhrases';
import { CommandRecognizer, PickingCommand } from './commandRecognizer';

/**
 * GRID-007 — the app's name, said on its own, while it is already listening.
 *
 * Russ's rule, 2026-08-06: the name has ONE job — getting attention — and what that means
 * depends on whether the app was already paying it.
 *
 *   asleep, name alone → wake up and say where we are   (useVoice's wake branch; unchanged)
 *   awake,  name alone → ask him what he wants to do    (this)
 *
 * Before, the awake case was left holding an empty string after the matcher stripped the app's
 * own name as filler — so it answered "I didn't catch that", or guessed at a command he never
 * said. The same two words meant two different things depending on a state he cannot see.
 */
describe('isBareWakePhrase — only the name, nothing after it', () => {
  it.each([
    'stocker',
    'ok stocker',
    'okay stocker',
    'hey stocker',
    'OK Stocker',
    'ok stocker.',
    'Okay, Stocker!',
    '  hey   stocker  ',
  ])('treats %j as the bare name', (text) => {
    expect(isBareWakePhrase(text)).toBe(true);
  });

  it.each(['ok stalker', 'hey stoker', 'okay docker', 'ok soccer', 'hey stock'])(
    'treats the known mishearing %j as the bare name too',
    (text) => {
      // Deepgram returns these reliably for "Stocker". Missing them would send him back to
      // "I didn't catch that" for saying the app's name correctly.
      expect(isBareWakePhrase(text)).toBe(true);
    },
  );

  it.each([
    'ok stocker next',
    'hey stocker skip this machine',
    'stocker top',
    'next',
    'skip machine',
    'what machine is this',
    '',
    '   ',
  ])('does NOT treat %j as the bare name', (text) => {
    expect(isBareWakePhrase(text)).toBe(false);
  });
});

describe('the recognizer routes a bare name to WAKE_ONLY, and nothing else', () => {
  const r = new CommandRecognizer();

  it('answers a bare name with WAKE_ONLY instead of not-understood', () => {
    expect(r.recognize('ok stocker').command).toBe(PickingCommand.WAKE_ONLY);
    expect(r.recognize('stocker').command).toBe(PickingCommand.WAKE_ONLY);
  });

  it('leaves a name WITH a command completely alone', () => {
    // The 2026-07-30 fix that made "OK Stocker, next" work must not regress. The bare-name
    // test runs first, so this is the guard that it never swallows a real command.
    expect(r.recognize('ok stocker next').command).toBe(PickingCommand.NEXT_ITEM);
    expect(r.recognize('hey stocker skip this machine').command).toBe(PickingCommand.SKIP_MACHINE);
  });

  it('leaves ordinary commands completely alone', () => {
    expect(r.recognize('next').command).toBe(PickingCommand.NEXT_ITEM);
    expect(r.recognize('top').command).toBe(PickingCommand.DIRECTION_TOP);
  });
});
