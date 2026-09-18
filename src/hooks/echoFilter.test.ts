import { describe, it, expect } from 'vitest';
import { resolveEcho, ECHO_TAIL_MS } from './echoFilter';

/**
 * Proof, not a claim.
 *
 * Every phrase in the first block is one the app itself invites him to say — they are
 * the confirm questions in src/utils/commandGuess.ts. Answering one by repeating it was
 * silently discarded, forever, because the record of what the app said never expired.
 */

const CONFIRM_QUESTIONS = [
  ['skip this machine?', 'skip this machine'],
  ['start at the top?', 'start at the top'],
  ['start at the bottom?', 'start at the bottom'],
  ['how many to load?', 'how many to load'],
  ['go back one?', 'go back one'],
  ['say it again?', 'say it again'],
] as const;

const SPEAKING = null;

describe('answering the app after it has stopped talking', () => {
  it.each(CONFIRM_QUESTIONS)(
    'app asked "%s" — he answers "%s" and it is acted on',
    (asked, answered) => {
      expect(
        resolveEcho({
          heard: answered,
          lastSpoken: asked,
          msSinceSpeechStarted: 4000,
          msSinceSpeechEnded: 2500, // he took a beat to answer, as people do
          cooldownMs: 300,
        }),
      ).toBe('accept');
    },
  );

  it('still works on the second try, which is what he will actually do', () => {
    // The old filter had no expiry, so a repeat hit the identical outcome and he was
    // stuck. Time moving forward has to be enough to unstick it.
    const answerOnce = (msSinceEnded: number) =>
      resolveEcho({
        heard: 'skip this machine',
        lastSpoken: 'skip this machine?',
        msSinceSpeechStarted: 3000 + msSinceEnded,
        msSinceSpeechEnded: msSinceEnded,
        cooldownMs: 300,
      });

    expect(answerOnce(2000)).toBe('accept');
    expect(answerOnce(9000)).toBe('accept');
  });

  it('a long silence never revives the filter', () => {
    expect(
      resolveEcho({
        heard: 'go back to the skipped machine',
        lastSpoken: 'going back to the skipped machine now',
        msSinceSpeechStarted: 600_000,
        msSinceSpeechEnded: 595_000,
        cooldownMs: 300,
      }),
    ).toBe('accept');
  });
});

describe('the app still does not answer itself', () => {
  it('discards its own voice while the speaker is playing', () => {
    expect(
      resolveEcho({
        heard: 'skip this machine',
        lastSpoken: 'skip this machine?',
        msSinceSpeechStarted: 900,
        msSinceSpeechEnded: SPEAKING,
        cooldownMs: 300,
      }),
    ).toBe('echo-content');
  });

  it('discards a late echo that lands just after the speaker stops', () => {
    expect(
      resolveEcho({
        heard: 'start at the bottom',
        lastSpoken: 'start at the bottom?',
        msSinceSpeechStarted: 2000,
        msSinceSpeechEnded: ECHO_TAIL_MS - 200,
        cooldownMs: 300,
      }),
    ).toBe('echo-content');
  });

  it('discards anything landing on top of the app opening its mouth', () => {
    expect(
      resolveEcho({
        heard: 'anything at all',
        lastSpoken: 'slot twelve, coca cola, five units',
        msSinceSpeechStarted: 100,
        msSinceSpeechEnded: SPEAKING,
        cooldownMs: 300,
      }),
    ).toBe('echo-cooldown');
  });
});

/**
 * 2026-09-17, 06:22 UTC, Woodsprings Suites Snack. The app spoke; the microphone heard a
 * thinned-out version of it — a comma became a period, "catch" fell out. The old test wanted
 * an exact excerpt, so this passed as Davy talking and the app answered itself.
 */
describe('the app recognises its own voice even when it comes back garbled', () => {
  const SAID = "Sorry, didn't catch that. Say 'next' to continue, 'skip machine' to move on, or ask about slot or par level.";

  it('the exact transcript from that night is an echo', () => {
    expect(
      resolveEcho({
        heard: "Sorry. Didn't that",
        lastSpoken: SAID.toLowerCase(),
        msSinceSpeechStarted: 1500,
        msSinceSpeechEnded: SPEAKING,
        cooldownMs: 300,
      }),
    ).toBe('echo-content');
  });

  it.each([
    ['skip machine to move on', 'a middle stretch with a word dropped'],
    ['say next to continue', 'the quotes stripped by the microphone'],
    ['ask about slot par level', 'the tail with "or" dropped'],
  ])('"%s" — %s — is an echo', (heard) => {
    expect(
      resolveEcho({
        heard,
        lastSpoken: SAID.toLowerCase(),
        msSinceSpeechStarted: 1500,
        msSinceSpeechEnded: SPEAKING,
        cooldownMs: 300,
      }),
    ).toBe('echo-content');
  });

  it('the same garbled fragment is HIM once the app has been quiet a while', () => {
    expect(
      resolveEcho({
        heard: "Sorry. Didn't that",
        lastSpoken: SAID.toLowerCase(),
        msSinceSpeechStarted: 6000,
        msSinceSpeechEnded: 5000,
        cooldownMs: 300,
      }),
    ).toBe('accept');
  });

  it.each([
    ['skip this machine', 'his real command — no "machine" in what was said'],
    ['how many left', 'a real question in his own words'],
    ['that was wrong', 'right words, wrong order'],
    ['sorry what', 'his own "sorry" is not the app\'s'],
    ['continue please', 'one shared word is not a match'],
  ])('"%s" — %s — still reaches him', (heard) => {
    expect(
      resolveEcho({
        heard,
        lastSpoken: SAID.toLowerCase(),
        msSinceSpeechStarted: 1500,
        msSinceSpeechEnded: SPEAKING,
        cooldownMs: 300,
      }),
    ).toBe('accept');
  });

  it('a single long word never matches on its own', () => {
    expect(
      resolveEcho({
        heard: 'continue',
        lastSpoken: SAID.toLowerCase(),
        msSinceSpeechStarted: 1500,
        msSinceSpeechEnded: SPEAKING,
        cooldownMs: 300,
      }),
    ).toBe('accept');
  });
});

describe('short commands are never eaten by wording', () => {
  it.each(['next', 'skip', 'yes', 'repeat', 'undo', 'top', 'bottom'])(
    '"%s" survives even while the app is speaking those very words',
    (word) => {
      expect(
        resolveEcho({
          heard: word,
          lastSpoken: 'next, skip, yes, repeat, undo, top, bottom',
          msSinceSpeechStarted: 900,
          msSinceSpeechEnded: SPEAKING,
          cooldownMs: 300,
        }),
      ).toBe('accept');
    },
  );

  it('a single stray character is still discarded as noise', () => {
    expect(
      resolveEcho({
        heard: 'a',
        lastSpoken: '',
        msSinceSpeechStarted: 90_000,
        msSinceSpeechEnded: 88_000,
        cooldownMs: 300,
      }),
    ).toBe('too-short');
  });
});

describe('nothing spoken yet', () => {
  it('accepts speech before the app has ever said anything', () => {
    expect(
      resolveEcho({
        heard: 'start the north route',
        lastSpoken: '',
        msSinceSpeechStarted: Number.MAX_SAFE_INTEGER,
        msSinceSpeechEnded: null,
        cooldownMs: 300,
      }),
    ).toBe('accept');
  });
});
