import { describe, expect, it } from 'vitest';
import { CONFIRM_PROMPT } from './commandGuess';
import { CommandRecognizer, PickingCommand } from './commandRecognizer';
import { resolveEcho, ECHO_TAIL_MS } from '@/hooks/echoFilter';

const recognizer = new CommandRecognizer();
const verdict = (heard: string, prompt: string, ended: number | null) => resolveEcho({
  heard, lastSpoken: prompt, msSinceSpeechStarted: 2000,
  msSinceSpeechEnded: ended, cooldownMs: 300,
});

describe('confirmation prompt / echo / recognition boundary', () => {
  it.each([null, 0, 200, ECHO_TAIL_MS, ECHO_TAIL_MS + 1])(
    'preserves affirmative replies across speech-tail timing %s', ended => {
      for (const prompt of Object.values(CONFIRM_PROMPT)) {
        expect(verdict('yes', prompt!, ended)).toBe('accept');
        expect(recognizer.recognize('yes').command).toBe(PickingCommand.AFFIRMATIVE);
      }
    },
  );

  it.each([
    ['from the top', PickingCommand.DIRECTION_TOP],
    ['from the bottom', PickingCommand.DIRECTION_BOTTOM],
  ])('allows the driver to answer the direction question with "%s"', (reply, command) => {
    const prompt = CONFIRM_PROMPT[command as PickingCommand]!;
    expect(prompt).toBeTruthy();
    for (const ended of [null, 0, 200, ECHO_TAIL_MS]) {
      expect(verdict(reply, prompt, ended)).toBe('accept');
    }
    expect(recognizer.recognize(reply).command).toBe(command);
  });

  it.each([PickingCommand.DIRECTION_TOP, PickingCommand.DIRECTION_BOTTOM])(
    'still rejects the direction question itself as echo: %s', command => {
      const prompt = CONFIRM_PROMPT[command]!;
      for (const ended of [null, 0, 200, ECHO_TAIL_MS]) {
        expect(verdict(prompt, prompt, ended)).toBe('echo-content');
      }
    },
  );

  it.each([
    ['begin upper end', PickingCommand.DIRECTION_TOP],
    ['begin lower end', PickingCommand.DIRECTION_BOTTOM],
  ])('still rejects a dropped-word echo of the new question: %s', (echo, command) => {
    expect(verdict(echo, CONFIRM_PROMPT[command as PickingCommand]!, 200)).toBe('echo-content');
  });

  it.each([
    ['from the top', PickingCommand.DIRECTION_TOP],
    ['from the bottom', PickingCommand.DIRECTION_BOTTOM],
  ])('allows the same reply after the echo tail: %s', (reply, command) => {
    expect(verdict(reply, CONFIRM_PROMPT[command as PickingCommand]!, ECHO_TAIL_MS + 1)).toBe('accept');
  });
});
