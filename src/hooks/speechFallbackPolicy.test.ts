import { describe, it, expect } from 'vitest';
import { shouldSpeakFallback } from './speechFallbackPolicy';

/**
 * GRID-005 — one utterance, two things happen, in two different voices.
 *
 * The driver interrupts an announcement. The app stops the audio by clearing the player, and on
 * Android clearing the player raises a playback ERROR — so a deliberate stop reaches the error
 * handler looking exactly like a genuine failure. The handler then did the sensible thing for a
 * real failure and re-spoke the whole line in the flat backup voice, while his command was also
 * being carried out.
 *
 * He says "next" over "Aisle four, six Doritos" and the app moves on AND starts reading the old
 * item again in a different voice. It reads as the app arguing with itself.
 */
describe('shouldSpeakFallback — a stop he asked for is not a failure', () => {
  it('does NOT re-speak when the app stopped on purpose (the barge-in)', () => {
    // THE FIX. Interrupting is the driver getting what he asked for, not something to recover
    // from — and re-speaking talks over the command he just gave.
    expect(shouldSpeakFallback({ stoppedOnPurpose: true })).toBe(false);
  });

  it('DOES re-speak when playback genuinely failed and nobody asked it to stop', () => {
    // The backup voice has to keep working. If the audio could not decode or the sound path is
    // dead, he still needs to hear which item to pick — silence there is the worse failure.
    expect(shouldSpeakFallback({ stoppedOnPurpose: false })).toBe(true);
  });
});
