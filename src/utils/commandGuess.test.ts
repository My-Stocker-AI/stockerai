import { describe, it, expect } from 'vitest';
import { guessCommand, resolveUnknownReply, GUESS_ASK_THRESHOLD, CONFIRM_PROMPT } from './commandGuess';
import { CommandRecognizer, PickingCommand } from './commandRecognizer';
import { resolveEcho } from '@/hooks/echoFilter';

/**
 * Proof, not a claim.
 *
 * Every phrase in the first block was run through the real matcher on 2026-07-30 and came back
 * with nothing — the app answered "I didn't catch that. Can you say that again?" and waited.
 * Repeating the phrase word-for-word gets the same answer, so the picker loops and gives up.
 *
 * These tests pin two things: the phrases that used to dead-end now produce a question, and
 * the phrases that genuinely mean nothing still get the honest fallback.
 */

const r = new CommandRecognizer();

describe('the phrases that dead-ended before', () => {
  it.each([
    ['keep going', PickingCommand.NEXT_ITEM],
    ['go on', PickingCommand.NEXT_ITEM],
    ['onward', PickingCommand.NEXT_ITEM],
    ['lets keep moving', PickingCommand.NEXT_ITEM],
    ['whats after this', PickingCommand.NEXT_ITEM],
    ['forget this machine', PickingCommand.SKIP_MACHINE],
    ['this machine is done', PickingCommand.SKIP_MACHINE],
    ['move to the next machine', PickingCommand.SKIP_MACHINE],
    ['say that one more time', PickingCommand.REPEAT],
    ['i missed that', PickingCommand.REPEAT],
    ['i grabbed the wrong one', PickingCommand.UNDO],
    ['bottom up', PickingCommand.DIRECTION_BOTTOM],
  ])('"%s" now gets a question instead of a dead end', (phrase, expected) => {
    // Still unknown to the exact matcher — this layer sits underneath it, it does not replace it.
    expect(r.recognize(phrase).command).toBe(PickingCommand.UNKNOWN);

    const reply = resolveUnknownReply(phrase);
    expect(reply.ask).toBe(true);
    expect(reply.guess?.command).toBe(expected);
    expect(reply.phrase).toMatch(/\?$/);
  });
});

describe('the honest fallback is still there', () => {
  it.each([
    'the truck is out front',
    'my back hurts',
    'hello',
    'is it raining outside',
    '',
    '   ',
  ])('"%s" gets no guess', (phrase) => {
    const reply = resolveUnknownReply(phrase);
    expect(reply.ask).toBe(false);
    expect(reply.phrase).toBe("I didn't catch that. Can you say that again?");
  });

  it('says nothing rather than flip a coin when two commands fit equally', () => {
    // "top" and "bottom" both present — acting on either could walk the machine backwards.
    expect(guessCommand('top or bottom')).toBeNull();
  });
});

describe('the question is short, and in his words', () => {
  it.each([
    ['keep going', 'Next item?'],
    ['forget this machine', 'Skip this one?'],
    ['i missed that', 'Repeat it?'],
    ['i grabbed the wrong one', 'Back one?'],
  ])('"%s" is asked as "%s"', (phrase, question) => {
    expect(resolveUnknownReply(phrase).phrase).toBe(question);
  });

  // 2026-09-17. The microphone stays open while the app talks, so anything heard within a
  // breath of it speaking is checked against the sentence it just said and discarded if it
  // sits inside it. A question that quotes his own command back at him therefore makes the
  // app deaf to the very answer it asked for: it said "Skip this machine?", he said "skip
  // this machine", and his words were thrown away as the app's own echo. The question must
  // not contain anything he might say in reply.
  it('never puts his own words in his mouth', () => {
    const hisWords = [
      'skip this machine', 'skip machine', 'next item', 'go back one',
      'start at the top', 'start at the bottom', 'say it again',
    ];
    for (const question of Object.values(CONFIRM_PROMPT)) {
      for (const phrase of hisWords) {
        const verdict = resolveEcho({
          heard: phrase,
          lastSpoken: question!.toLowerCase(),
          msSinceSpeechStarted: 2000,
          msSinceSpeechEnded: 200,
          cooldownMs: 300,
        });
        expect(verdict, `"${question}" swallows "${phrase}"`).toBe('accept');
      }
    }
  });

  it('never asks a question longer than a breath', () => {
    for (const phrase of ['keep going', 'forget this machine', 'bottom up', 'i missed that']) {
      const reply = resolveUnknownReply(phrase);
      expect(reply.phrase.split(/\s+/).length).toBeLessThanOrEqual(5);
    }
  });

  it('never leaks internal words into anything spoken aloud', () => {
    for (const phrase of ['keep going', 'forget this machine', 'nonsense words here']) {
      expect(resolveUnknownReply(phrase).phrase).not.toMatch(
        /command|unknown|confidence|match|parse|null|undefined|error/i,
      );
    }
  });
});

describe('a long sentence with one meaning-word does not get acted on', () => {
  it('dilutes as more unrelated words are said', () => {
    const short = guessCommand('keep going');
    const buried = guessCommand('i was just talking to the guy about the weather keep going');

    expect(short!.score).toBeGreaterThan(buried!.score);
    expect(short!.score).toBeGreaterThanOrEqual(GUESS_ASK_THRESHOLD);
    expect(resolveUnknownReply('i was just talking to the guy about the weather keep going').ask).toBe(
      false,
    );
  });
});

describe('a multi-word phrase needs all of its words', () => {
  it('"machine" alone does not trigger skip', () => {
    const g = guessCommand('machine');
    expect(g?.command).not.toBe(PickingCommand.SKIP_MACHINE);
  });
});

describe('"move on" — the misfire this shipped with', () => {
  it('now means next item, not abandon the machine', () => {
    // Before 2026-07-30 the exact matcher read "move on" as SKIP_MACHINE with full confidence,
    // so a picker saying it mid-machine had every remaining item marked skipped with no warning.
    expect(r.recognize('move on').command).toBe(PickingCommand.NEXT_ITEM);
  });
});
