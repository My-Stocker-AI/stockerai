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
