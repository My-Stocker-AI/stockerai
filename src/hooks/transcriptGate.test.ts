import { describe, it, expect } from 'vitest';
import { resolveTranscriptGate, gateReason, type GateDecision } from './transcriptGate';
import type { VoiceStatus } from './useVoice';

/**
 * Proof, not a claim.
 *
 * The shipped code read the voice status through a value that only refreshes on the next render.
 * When the picker talked over an announcement, the voice layer stopped the audio and set
 * 'listening' — then handed the phrase up in the SAME synchronous call, before React had
 * re-rendered. So the app still saw 'speaking' and threw the phrase away.
 *
 * These tests pin both halves: the live reading acts, the stale reading does not.
 */

const BASE = { isProcessing: false, sessionInvalidated: false };

describe('the interruption Davy actually performs', () => {
  it('acts on a phrase spoken over an announcement', () => {
    // The voice layer already stopped the audio and set 'listening' before calling up.
    expect(resolveTranscriptGate({ ...BASE, liveStatus: 'listening' })).toBe('handle');
  });

  it('SHIPPED BEHAVIOR — the stale reading dropped that same phrase', () => {
    // Same moment, same utterance, but read one render behind: still 'speaking'.
    // This is the bug, kept visible so the fix cannot silently regress.
    expect(resolveTranscriptGate({ ...BASE, liveStatus: 'speaking' })).toBe('drop-speaking');
  });
});

describe('the guard that was there for a reason is still there', () => {
  it('drops a phrase that arrives while genuinely mid-announcement', () => {
    // A tap-driven or injected phrase that never went through the interrupt handler. Acting on
    // it would advance the pick before the picker heard which item he was on.
    expect(resolveTranscriptGate({ ...BASE, liveStatus: 'speaking' })).toBe('drop-speaking');
  });

  it('drops a second phrase while the first is still being handled', () => {
    expect(
      resolveTranscriptGate({ ...BASE, liveStatus: 'listening', isProcessing: true }),
    ).toBe('drop-busy');
  });

  it('busy wins over everything — the order the original code used', () => {
    expect(
      resolveTranscriptGate({
        liveStatus: 'speaking',
        isProcessing: true,
        sessionInvalidated: true,
      }),
    ).toBe('drop-busy');
  });

  it('drops a stale command aimed at a route that already finished', () => {
    expect(
      resolveTranscriptGate({ ...BASE, liveStatus: 'listening', sessionInvalidated: true }),
    ).toBe('drop-invalidated');
  });

  it('still-speaking wins over invalidated, matching the original order', () => {
    expect(
      resolveTranscriptGate({ ...BASE, liveStatus: 'speaking', sessionInvalidated: true }),
    ).toBe('drop-speaking');
  });
});

describe('every other state the app can be in gets acted on', () => {
  it.each(['listening', 'idle', 'thinking', 'paused', 'muted', 'error'] as VoiceStatus[])(
    'handles a phrase that arrives during %s',
    (liveStatus) => {
      // Reaching this function at all means the voice layer already decided to dispatch —
      // paused/muted phrases are dropped upstream, and error phrases are queued upstream.
      // Re-filtering here would drop them twice.
      expect(resolveTranscriptGate({ ...BASE, liveStatus })).toBe('handle');
    },
  );
});

describe('a dropped phrase always says why, in words a person can read', () => {
  it.each([
    ['drop-busy', /previous command/],
    ['drop-speaking', /announcement/],
    ['drop-invalidated', /finished|replaced/],
    ['handle', /acted on/],
  ])('%s explains itself', (decision, shape) => {
    expect(gateReason(decision as GateDecision)).toMatch(shape as RegExp);
  });

  it('never leaks internal words into a reason', () => {
    const all: GateDecision[] = ['handle', 'drop-busy', 'drop-speaking', 'drop-invalidated'];
    for (const d of all) {
      expect(gateReason(d)).not.toMatch(/ref|status|boolean|null|undefined|state machine|FSM/i);
    }
  });
});
