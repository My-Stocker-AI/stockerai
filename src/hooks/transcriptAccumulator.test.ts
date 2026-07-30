import { describe, it, expect } from 'vitest';
import {
  accumulateTranscript,
  shippedAccumulateTranscript_BUGGY,
} from './transcriptAccumulator';

/**
 * Proof, not a claim.
 *
 * Deepgram splits one spoken sentence across several finalized segments and separately signals
 * that the speaker stopped. The shipped code appended segments — until the stop signal arrived,
 * where it ASSIGNED instead (useVoice.ts:547), discarding everything banked.
 *
 * Nothing logged it. The app acted on the tail of the sentence and no one could tell.
 */

describe('the shipped behavior — showing what was being lost', () => {
  it('threw away the front of a two-part sentence', () => {
    // "go to the next machine" arriving as two finalized segments.
    const first = shippedAccumulateTranscript_BUGGY({
      accumulated: '',
      incoming: 'go to the',
      isUtteranceEnd: false,
    });
    expect(first.text).toBe('go to the'); // banked correctly

    const second = shippedAccumulateTranscript_BUGGY({
      accumulated: first.text,
      incoming: 'next machine',
      isUtteranceEnd: true, // Deepgram says he stopped
    });

    // The picker said five words. The app acted on two.
    expect(second.text).toBe('next machine');
    expect(second.text).not.toContain('go to the');
  });
});

describe('the fix — the whole breath is acted on', () => {
  it('joins every segment of one sentence, including the last', () => {
    const first = accumulateTranscript({
      accumulated: '',
      incoming: 'go to the',
      isUtteranceEnd: false,
    });
    expect(first).toEqual({ text: 'go to the', process: false });

    const second = accumulateTranscript({
      accumulated: first.text,
      incoming: 'next machine',
      isUtteranceEnd: true,
    });
    expect(second).toEqual({ text: 'go to the next machine', process: true });
  });

  it('handles a sentence that arrives in one piece — the common case, unchanged', () => {
    expect(
      accumulateTranscript({ accumulated: '', incoming: 'next', isUtteranceEnd: true }),
    ).toEqual({ text: 'next', process: true });
  });

  it('handles three or more segments', () => {
    let text = '';
    for (const seg of ['set', 'the count', 'to twelve']) {
      text = accumulateTranscript({ accumulated: text, incoming: seg, isUtteranceEnd: false }).text;
    }
    const done = accumulateTranscript({ accumulated: text, incoming: 'please', isUtteranceEnd: true });
    expect(done.text).toBe('set the count to twelve please');
  });

  it('never fires a command off silence — an empty segment with nothing banked does nothing', () => {
    expect(
      accumulateTranscript({ accumulated: '', incoming: '', isUtteranceEnd: true }),
    ).toEqual({ text: '', process: false });
    expect(
      accumulateTranscript({ accumulated: '', incoming: '   ', isUtteranceEnd: false }),
    ).toEqual({ text: '', process: false });
  });

  it('still acts on what was banked when the final segment comes back empty', () => {
    // Deepgram tail-end emits a blank final. The sentence before it must not be lost.
    expect(
      accumulateTranscript({ accumulated: 'next item', incoming: '', isUtteranceEnd: true }),
    ).toEqual({ text: 'next item', process: true });
  });

  it('trims ragged whitespace instead of building double spaces', () => {
    const r = accumulateTranscript({
      accumulated: 'go to the  ',
      incoming: '  next machine ',
      isUtteranceEnd: true,
    });
    expect(r.text).toBe('go to the next machine');
    expect(r.text).not.toMatch(/\s{2,}/);
  });
});

describe('the difference the fix makes, stated as the picker experiences it', () => {
  it.each([
    ['go to the', 'next machine', 'go to the next machine'],
    ['skip this', 'machine', 'skip this machine'],
    ['set count', 'to eight', 'set count to eight'],
  ])('"%s" + "%s" → the app now hears the whole thing', (a, b, whole) => {
    const banked = accumulateTranscript({ accumulated: '', incoming: a, isUtteranceEnd: false }).text;
    const final = accumulateTranscript({ accumulated: banked, incoming: b, isUtteranceEnd: true });

    expect(final.text).toBe(whole);
    // and the shipped code would have heard only the tail
    const shipped = shippedAccumulateTranscript_BUGGY({
      accumulated: banked,
      incoming: b,
      isUtteranceEnd: true,
    });
    expect(shipped.text).toBe(b);
    expect(shipped.text).not.toBe(final.text);
  });
});
