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

  // Known residual in finding 29. Expected failures keep the desired contract visible
  // without pretending it is fixed. Remove .fails when the production path satisfies it.
  it.fails.each([
    ['from the top', PickingCommand.DIRECTION_TOP],
    ['from the bottom', PickingCommand.DIRECTION_BOTTOM],
  ])('allows the driver to answer the direction question with "%s"', (reply, command) => {
    const prompt = CONFIRM_PROMPT[command as PickingCommand]!;
    expect(prompt).toBeTruthy();
    expect(verdict(reply, prompt, 200)).toBe('accept');
  });

  it.each([
    ['from the top', PickingCommand.DIRECTION_TOP],
    ['from the bottom', PickingCommand.DIRECTION_BOTTOM],
  ])('allows the same reply after the echo tail: %s', (reply, command) => {
    expect(verdict(reply, CONFIRM_PROMPT[command as PickingCommand]!, ECHO_TAIL_MS + 1)).toBe('accept');
  });
});
