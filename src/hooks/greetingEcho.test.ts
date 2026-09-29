import { expect, it } from 'vitest';
import { resolveEcho } from './echoFilter';

const check = (heard: string, lastSpoken: string, ended: number | null = null) => resolveEcho({
  heard, lastSpoken, msSinceSpeechStarted: 2000, msSinceSpeechEnded: ended, cooldownMs: 300,
});

it.each([
  ['Hi Tester', 'Hi Tester! Starting Fixture route.'],
  ['Hi Testar', 'Hi Tester! Starting Fixture route.'],
  ['Welcome back Rosie', 'Welcome back Rosy! Resuming Fixture route.'],
  ["I'm stalker", "Hi Tester! I'm Stocker. Ready to help."],
])('rejects a greeting fragment during its own matching greeting: %s', (heard, spoken) => {
  expect(check(heard, spoken)).toBe('echo-content');
  expect(check(heard, spoken, 300)).toBe('echo-content');
  expect(check(heard, spoken, 1500)).toBe('accept');
});

it.each(['next', 'okay', 'repeat', 'top', 'bottom', 'skip', 'pause', 'Hi Tester next',
  'Hi different', 'Welcome back bottom', 'four mango', 'Hi Testar'])('preserves commands and unrelated speech: %s', heard => {
  expect(check(heard, 'Four mango juices, slot A1.')).toBe('accept');
});

it.each(['next', 'okay', 'repeat', 'top', 'bottom', 'skip', 'pause', 'Hi Tester next', 'Hi different'])('preserves %s during a greeting', heard => {
  expect(check(heard, 'Hi Tester! Starting Fixture route.')).toBe('accept');
});
