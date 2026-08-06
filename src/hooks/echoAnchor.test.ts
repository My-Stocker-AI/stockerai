import { describe, it, expect } from 'vitest';
import { resolveEcho, ECHO_TAIL_MS } from './echoFilter';

/**
 * GRID-002 — the echo window must be anchored to SOUND, not to intent.
 *
 * The filter itself was always correct. What was wrong was WHEN the app told it speech had
 * started: useVoice.ts set the markers immediately before fetching the audio, so "started
 * speaking" actually meant "decided to speak". On a line that was not already cached the fetch
 * takes a few hundred milliseconds, and that mistake cost twice over:
 *
 *   during the fetch  — nothing is playing, yet anything the driver says is discarded as the
 *                       app's own echo. He speaks into silence and gets no response at all.
 *   at playback start — the grace period has already been spent on that silence, so the app's
 *                       real voice arrives unprotected and a short fragment of it can be taken
 *                       for a command.
 *
 * And which one he got depended on whether the line happened to be cached, so the dead spot
 * moved around and never reproduced the same way twice.
 *
 * The fix is in the wiring: markSpeechStarted() is now called at actual playback start on all
 * three paths (Android audio element, iOS/desktop Web Audio, and the flat fallback voice).
 * These tests pin the contract that wiring has to honour — the numbers below are what the app
 * feeds the filter once the anchor is in the right place.
 */
const COOLDOWN_MS = 300;

describe('GRID-002 — what the filter must be told, once the anchor is correct', () => {
  it('accepts the driver while the app is fetching and SILENT', () => {
    // Anchored correctly, the clock still refers to the PREVIOUS line, which ended long ago.
    // Before the fix this same moment reported ~50ms and was thrown away as an echo of a
    // voice that was not playing.
    expect(
      resolveEcho({
        heard: 'next',
        lastSpoken: 'aisle four, six doritos',
        msSinceSpeechStarted: 30000,
        msSinceSpeechEnded: 25000,
        cooldownMs: COOLDOWN_MS,
      }),
    ).toBe('accept');
  });

  it('guards the moment the real voice actually starts', () => {
    // The grace period now lands ON the app's own speech, which is the only thing it was ever
    // for. Before the fix it had already expired by the time sound came out.
    expect(
      resolveEcho({
        heard: 'aisle four',
        lastSpoken: 'aisle four, six doritos',
        msSinceSpeechStarted: 50,
        msSinceSpeechEnded: null,
        cooldownMs: COOLDOWN_MS,
      }),
    ).toBe('echo-cooldown');
  });

  it('catches a SHORT fragment of the app hearing itself at speech onset', () => {
    // This is the leak the mis-anchoring opened. A fragment under the wording-test floor
    // ("aisle four" is short enough to be waved through) is only ever caught by the grace
    // period — and the grace period was being spent on silence.
    expect(
      resolveEcho({
        heard: 'aisle four',
        lastSpoken: 'aisle four, six doritos',
        msSinceSpeechStarted: 120,
        msSinceSpeechEnded: null,
        cooldownMs: COOLDOWN_MS,
      }),
    ).toBe('echo-cooldown');
  });

  it('still lets him answer with the app’s own words once it has gone quiet', () => {
    // The 2026-07-30 behaviour, unchanged — confirm-question answers must survive.
    expect(
      resolveEcho({
        heard: 'skip this machine',
        lastSpoken: 'skip this machine?',
        msSinceSpeechStarted: 8000,
        msSinceSpeechEnded: ECHO_TAIL_MS + 500,
        cooldownMs: COOLDOWN_MS,
      }),
    ).toBe('accept');
  });

  it('still treats a long verbatim echo during playback as an echo', () => {
    expect(
      resolveEcho({
        heard: 'skip this machine',
        lastSpoken: 'skip this machine?',
        msSinceSpeechStarted: 900,
        msSinceSpeechEnded: null,
        cooldownMs: COOLDOWN_MS,
      }),
    ).toBe('echo-content');
  });
});
