/**
 * TRANSCRIPT ACCUMULATION — stitching one spoken sentence back together.
 *
 * Deepgram does not hand back a whole utterance in one piece. A sentence arrives as a run of
 * finalized segments (is_final), and separately Deepgram signals that the speaker has stopped
 * (speech_final / UtteranceEnd). A long phrase routinely arrives as two or more segments before
 * that stop signal lands.
 *
 * THE SHIPPED BUG (found 2026-07-30 by the state x command x timing survey,
 * .xf/specs/2026-07-30-voice-grid-survey-xffi.md):
 *
 *   handleDeepgramMessage accumulated with `+=` on the ordinary path, but on the
 *   utterance-end path it ASSIGNED:  accumulatedTranscriptRef.current = transcript
 *
 *   So every segment banked before the stop signal was thrown away and only the last one was
 *   acted on. "go to the next machine" arriving as "go to the" + "next machine" became
 *   "next machine". Silently — no error, no diagnostic, nothing in any log. The app acts on a
 *   fragment of what the picker said and neither he nor anyone reading the logs can tell.
 *
 * This module holds no state and touches no DOM (house style, per voiceHandoffPolicy.ts) so the
 * stitching can be unit-tested without a socket.
 */

/**
 * The text to act on when a segment arrives.
 *
 * @param accumulated   what has been banked so far this utterance ('' at the start)
 * @param incoming      the newly finalized segment
 * @param isUtteranceEnd  did Deepgram signal the speaker has stopped
 */
export function accumulateTranscript(args: {
  accumulated: string;
  incoming: string;
  isUtteranceEnd: boolean;
}): { text: string; process: boolean } {
  const { accumulated, incoming, isUtteranceEnd } = args;

  const clean = (incoming || '').trim();
  const banked = (accumulated || '').trim();

  // An empty segment adds nothing. Deepgram emits these on noise and on the tail of a stream;
  // treating one as a real utterance would fire a command off silence.
  if (!clean) {
    return { text: banked, process: isUtteranceEnd && banked.length > 0 };
  }

  // Join, never replace. This is the fix: the stop signal ENDS the sentence, it does not
  // redefine it. Everything the picker said in this breath is acted on together.
  const text = banked ? `${banked} ${clean}` : clean;

  return { text, process: isUtteranceEnd };
}

/**
 * What the shipped code did, kept only so a test can demonstrate the data loss.
 * Do not call this outside tests.
 */
export function shippedAccumulateTranscript_BUGGY(args: {
  accumulated: string;
  incoming: string;
  isUtteranceEnd: boolean;
}): { text: string; process: boolean } {
  const { accumulated, incoming, isUtteranceEnd } = args;
  if (isUtteranceEnd) {
    // useVoice.ts:547 — assignment, not append. The banked prefix is discarded here.
    return { text: incoming, process: true };
  }
  return {
    text: accumulated ? `${accumulated} ${incoming}` : incoming,
    process: false,
  };
}
