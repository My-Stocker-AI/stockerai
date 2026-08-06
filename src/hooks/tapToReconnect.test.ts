import { describe, it, expect } from 'vitest';
import { classifyFailure } from './voiceFailureSpeech';

/**
 * GRID-006 — the failure message said "tap to reconnect", and tapping only hid it.
 *
 * The banner's whole behaviour was to clear itself. So when voice gave up, put
 * "Voice paused — tap to reconnect." on screen, and he did exactly what it said, the words
 * vanished and the voice stayed dead. Worse than silence, because it looks like it worked.
 * (The only real recovery was an undocumented triple-tap anywhere on the screen.)
 *
 * Tapping now genuinely restarts voice — but ONLY because classifyFailure recognises the
 * message as the needs-a-tap kind. That makes the wording load-bearing: reword the message in
 * useVoice.ts without updating the classifier and the tap silently reverts to doing nothing,
 * with every test still green. This is that guard.
 *
 * The strings below are the ones useVoice.ts actually emits and the ones StockerApp.tsx
 * actually sets. Keep them in step.
 */
describe('GRID-006 — the messages that must make a tap reconnect', () => {
  it.each([
    'Voice paused — tap to reconnect.',   // useVoice, after gentleReconnect gives up
    'Tap to resume voice',
    'Voice is open in another window',
  ])('%j is recognised as needing a tap', (msg) => {
    expect(classifyFailure(msg)).toBe('needs-tap');
  });

  it('the acknowledgement shown DURING the reconnect is not itself a tap target', () => {
    // Set the moment he taps, so he can see the tap registered — the credential fetch can take
    // up to ten seconds and nothing else moves in that window. It must not read as "tap me".
    expect(classifyFailure('Reconnecting…')).toBe('reconnecting');
  });

  it.each([
    'Microphone access denied',
    'Voice service is busy. Please wait a moment and try again.',
  ])('%j still just dismisses — a tap cannot fix it', (msg) => {
    expect(classifyFailure(msg)).not.toBe('needs-tap');
  });
});
