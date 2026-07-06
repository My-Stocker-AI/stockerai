import { describe, it, expect } from 'vitest';
import {
  gentleReconnect,
  legacyReconnect,
  GENTLE_MAX_ATTEMPTS,
  MAX_RECONNECT_DELAY_MS,
} from './reconnectPolicy';

/**
 * Proof, not a claim. Davy's iPhone on 2026-07-01 (Render VOICEDIAG logs) showed a drop
 * burst that the OLD policy turned into repeated dead-voice give-ups. The real fix landed
 * a layer deeper — raw 16 kHz PCM capture is headerless, so reconnects are now SAFE and a
 * transient drop recovers in a try or two. The reconnect policy therefore no longer needs
 * to storm forever: it retries a few times, then stops and hands control back to the driver.
 */

const DROP_BURST = 20;

describe('voice reconnect policy — bounded gentle recovery (raw-PCM era)', () => {
  it('LEGACY policy stranded him: it gave up (went dead 30s) and climbed to 16s', () => {
    // The regression we removed — kept as a contrast so the proof is explicit.
    expect(legacyReconnect(4).delayMs).toBe(16000);
    expect(legacyReconnect(5).giveUp).toBe(true);
    expect(legacyReconnect(5).delayMs).toBe(30000);
  });

  it('recovery is fast early: first waits are 0.5s, 1s, 2s, then capped at 2.5s', () => {
    expect(gentleReconnect(0).delayMs).toBe(500);
    expect(gentleReconnect(1).delayMs).toBe(1000);
    expect(gentleReconnect(2).delayMs).toBe(2000);
    expect(gentleReconnect(3).delayMs).toBe(2500);
  });

  it('every wait stays at or under 2.5s — never the old 16s crawl', () => {
    for (let attempt = 0; attempt < GENTLE_MAX_ATTEMPTS; attempt++) {
      expect(gentleReconnect(attempt).delayMs).toBeLessThanOrEqual(MAX_RECONNECT_DELAY_MS);
    }
  });

  it('it is BOUNDED: after a few tries it gives up gracefully instead of storming forever', () => {
    // A persistent drop must NOT hammer Deepgram indefinitely (that loop was the storm).
    expect(gentleReconnect(GENTLE_MAX_ATTEMPTS).giveUp).toBe(true);

    // Replay the burst: count how many real retry attempts fire before we stop.
    let attempt = 0;
    let retries = 0;
    let gaveUp = false;
    for (let i = 0; i < DROP_BURST; i++) {
      const { giveUp } = gentleReconnect(attempt);
      if (giveUp) { gaveUp = true; break; }
      retries += 1;
      attempt += 1;
    }
    expect(gaveUp).toBe(true);                 // it stops — no infinite storm
    expect(retries).toBe(GENTLE_MAX_ATTEMPTS); // exactly the bounded number of quick tries
  });
});
