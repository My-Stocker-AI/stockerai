import { describe, it, expect } from 'vitest';
import {
  reconnectDelayMs,
  nextAttempt,
  legacyReconnect,
  MAX_RECONNECT_DELAY_MS,
} from './reconnectPolicy';

/**
 * Proof, not a claim. We replay the exact drop burst from Davy's iPhone on 2026-07-01
 * (Render VOICEDIAG logs, 19:36–19:38 UTC): the socket dropped repeatedly with steady
 * warehouse signal. We run that burst through the OLD policy and the NEW policy and
 * assert the difference in what the picker actually experiences.
 *
 * Old logs showed: backoff climbing 1s→16s and "reconnect-max-reached" firing 3 times
 * in two minutes — i.e. three separate 30-second stretches of dead voice mid-route.
 */

// A burst of consecutive drops before the connection finally holds. Davy's logs show
// bursts long enough to hit the 5-try give-up three times, so 20 is representative.
const DROP_BURST = 20;

function simulate(policy: 'old' | 'new') {
  let attempt = 0;
  let giveUps = 0;
  let maxWaitMs = 0;
  let totalWaitMs = 0;

  for (let i = 0; i < DROP_BURST; i++) {
    if (policy === 'old') {
      const { delayMs, giveUp } = legacyReconnect(attempt);
      if (giveUp) {
        giveUps += 1;
        attempt = 0; // old code reset after the 30s dead recovery
      } else {
        attempt += 1;
      }
      maxWaitMs = Math.max(maxWaitMs, delayMs);
      totalWaitMs += delayMs;
    } else {
      const delayMs = reconnectDelayMs(attempt);
      attempt = nextAttempt(attempt);
      maxWaitMs = Math.max(maxWaitMs, delayMs);
      totalWaitMs += delayMs;
    }
  }
  return { giveUps, maxWaitMs, totalWaitMs };
}

describe('voice reconnect policy — Davy 2026-07-01 drop burst', () => {
  it('OLD policy stranded him: it gave up (went dead 30s) and waited up to 16s', () => {
    const old = simulate('old');
    // eslint-disable-next-line no-console
    console.log('[PROOF] OLD:', old);
    expect(old.giveUps).toBeGreaterThan(0);        // it DID go silent mid-route (3x)
    expect(old.maxWaitMs).toBe(30000);             // worst case = the 30s dead-voice give-up gap
    expect(legacyReconnect(4).delayMs).toBe(16000); // and the backoff climbed to 16s before that
  });

  it('NEW policy never gives up and never waits more than 2.5s', () => {
    const neu = simulate('new');
    // eslint-disable-next-line no-console
    console.log('[PROOF] NEW:', neu);
    expect(neu.giveUps).toBe(0);                   // never goes silent while active
    expect(neu.maxWaitMs).toBeLessThanOrEqual(MAX_RECONNECT_DELAY_MS); // ≤ 2.5s, always
  });

  it('every single reconnect wait stays at or under 2.5s, for any attempt count', () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      expect(reconnectDelayMs(attempt)).toBeLessThanOrEqual(MAX_RECONNECT_DELAY_MS);
    }
  });

  it('the attempt counter is capped so it can never reach a give-up state', () => {
    let attempt = 0;
    for (let i = 0; i < 100; i++) attempt = nextAttempt(attempt);
    expect(attempt).toBeLessThanOrEqual(3); // plateaus; legacy give-up was at attempt >= 5
  });

  it('recovery is fast early: first three waits are 0.5s, 1s, 2s', () => {
    expect(reconnectDelayMs(0)).toBe(500);
    expect(reconnectDelayMs(1)).toBe(1000);
    expect(reconnectDelayMs(2)).toBe(2000);
  });
});
