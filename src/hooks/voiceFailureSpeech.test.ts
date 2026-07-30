import { describe, it, expect } from 'vitest';
import {
  classifyFailure,
  resolveFailureSpeech,
  FAILURE_PHRASES,
  type FailureKind,
} from './voiceFailureSpeech';

/**
 * Proof, not a claim. These replay what actually happened to Davy.
 *
 * 2026-07-12, South route, machine 3 of 6: the app froze after he spoke over it. It kept
 * transcribing and never acted. Crucially it never SAID anything — handleVoiceError only ever
 * called setError(), which paints the screen. He was holding stock. Silence from a working app
 * and silence from a dead one are the same sound, so he stopped and never came back.
 *
 * The bar these tests hold: he is told when it matters, and not nagged when it doesn't.
 */

describe('what the picker is told', () => {
  it('says voice is coming back — so he waits instead of repeating himself', () => {
    // 'Reconnecting voice…' is already emitted (useVoice.ts:796) — it was screen-only.
    const r = resolveFailureSpeech({
      errorMsg: 'Reconnecting voice…',
      hasCurrentItem: true,
      lastSpokenKind: null,
    });
    expect(r.speak).toBe(true);
    expect(r).toMatchObject({ kind: 'reconnecting' });
  });

  it('says it is listening again — the line that ends "is this thing dead?"', () => {
    const r = resolveFailureSpeech({
      errorMsg: 'Voice recovered — listening again',
      hasCurrentItem: true,
      lastSpokenKind: null,
    });
    expect(r).toMatchObject({ speak: true, kind: 'recovered' });
  });

  it('tells him to tap when voice will NOT come back on its own', () => {
    // useVoice.ts:854 — 'Voice paused — tap to reconnect.' Waiting here is waiting forever.
    const r = resolveFailureSpeech({
      errorMsg: 'Voice paused — tap to reconnect.',
      hasCurrentItem: true,
      lastSpokenKind: null,
    });
    expect(r).toMatchObject({ speak: true, kind: 'needs-tap' });
  });

  it('speaks a blocked microphone even with no pick running — he is stuck either way', () => {
    const r = resolveFailureSpeech({
      errorMsg: 'Microphone access denied. Please allow microphone access.',
      hasCurrentItem: false,
      lastSpokenKind: null,
    });
    expect(r).toMatchObject({ speak: true, kind: 'mic-blocked' });
  });
});

describe('what the picker is NOT told — the nagging guard', () => {
  it('stays quiet when no pick is running', () => {
    expect(
      resolveFailureSpeech({
        errorMsg: 'Reconnecting voice…',
        hasCurrentItem: false,
        lastSpokenKind: null,
      }),
    ).toEqual({ speak: false, reason: 'no-active-pick' });
  });

  it('never chants — a reconnect loop speaks once, not once per attempt', () => {
    expect(
      resolveFailureSpeech({
        errorMsg: 'Reconnecting voice…',
        hasCurrentItem: true,
        lastSpokenKind: 'reconnecting',
      }),
    ).toEqual({ speak: false, reason: 'already-said' });
  });

  it('stays quiet for failures he cannot act on', () => {
    for (const noise of [
      'Voice service is busy. Please wait a moment and try again.',
      'WebSocket closed 1006',
      'HTTP 429',
      '',
    ]) {
      expect(
        resolveFailureSpeech({ errorMsg: noise, hasCurrentItem: true, lastSpokenKind: null }),
      ).toEqual({ speak: false, reason: 'not-actionable' });
    }
  });

  it('lets a DIFFERENT failure through even right after another one spoke', () => {
    // Reconnecting, then it gives up: he must hear the second one or he waits forever.
    const r = resolveFailureSpeech({
      errorMsg: 'Voice paused — tap to reconnect.',
      hasCurrentItem: true,
      lastSpokenKind: 'reconnecting',
    });
    expect(r).toMatchObject({ speak: true, kind: 'needs-tap' });
  });
});

describe('the spoken lines themselves', () => {
  it('are short enough to land in a loud warehouse', () => {
    for (const phrase of Object.values(FAILURE_PHRASES)) {
      expect(phrase.split(/\s+/).length).toBeLessThanOrEqual(10);
      expect(phrase.trim()).not.toBe('');
    }
  });

  it('never speak the app’s internal vocabulary at the picker', () => {
    const jargon = /websocket|deepgram|socket|token|api|http|null|undefined|sentinel|watchdog/i;
    for (const phrase of Object.values(FAILURE_PHRASES)) {
      expect(phrase).not.toMatch(jargon);
    }
  });

  it('covers every failure kind — no kind can be classified but left mute', () => {
    const kinds: FailureKind[] = ['reconnecting', 'recovered', 'needs-tap', 'mic-blocked'];
    for (const k of kinds) expect(FAILURE_PHRASES[k]).toBeTruthy();
  });
});

describe('classification of the real messages useVoice already emits', () => {
  it.each([
    ['Reconnecting voice…', 'reconnecting'],
    ['Voice paused — tap to reconnect.', 'needs-tap'],
    ['Voice is already running in another window. Close it, then tap to resume.', 'needs-tap'],
    ['Microphone access denied. Please allow microphone access.', 'mic-blocked'],
    ['No microphone found. Please connect a microphone.', 'mic-blocked'],
    ['Microphone is in use by another application.', 'mic-blocked'],
  ])('"%s" → %s', (msg, expected) => {
    expect(classifyFailure(msg)).toBe(expected);
  });
});
