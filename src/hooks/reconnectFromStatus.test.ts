import { describe, it, expect } from 'vitest';
import { shouldReconnectFromStatus } from './reconnectPolicy';
import type { VoiceStatus } from './voiceHandoffPolicy';

/**
 * Proof, not a claim. Davy's 2026-07-01 route: ~29 utterances, zero transcripts, voice dead for
 * the rest of the run. The socket had dropped while the app was ANNOUNCING an item, and the
 * close handler's status list did not include 'speaking', so no reconnect was ever attempted.
 * The watchdog could not save it — it only fires when a command is queued, and a dead socket
 * delivers nothing to queue.
 */

describe('reconnect must be attempted from every live status', () => {
  it('reconnects from speaking — the shipped gap that left voice dead mid-route', () => {
    expect(shouldReconnectFromStatus('speaking')).toBe(true);
  });

  it('reconnects from every state where a picking session is still alive', () => {
    for (const s of ['listening', 'thinking', 'speaking', 'idle', 'paused', 'muted'] as VoiceStatus[]) {
      expect(shouldReconnectFromStatus(s)).toBe(true);
    }
  });

  it('does NOT reconnect from error — that state means we already gave up and asked for a tap', () => {
    // Retrying here rebuilds the reconnect storm the bounded policy exists to prevent.
    expect(shouldReconnectFromStatus('error')).toBe(false);
  });
});
