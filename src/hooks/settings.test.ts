import { describe, it, expect, beforeEach } from 'vitest';
import {
  readSettingsFromLocalStorage,
  SETTINGS_KEYS,
  SETTINGS_DEFAULTS,
  readEnvVoiceTuning,
} from '@/lib/settingsCore';

// Minimal localStorage stub for the node test environment.
class MemoryStorage {
  private store: Record<string, string> = {};
  getItem(k: string) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; }
  setItem(k: string, v: string) { this.store[k] = String(v); }
  removeItem(k: string) { delete this.store[k]; }
  clear() { this.store = {}; }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
});

describe('Scope 1 — readSettingsFromLocalStorage', () => {
  it('returns defaults when nothing is saved', () => {
    expect(readSettingsFromLocalStorage()).toEqual(SETTINGS_DEFAULTS);
  });

  it('reads the reused settings and the new text-size preference', () => {
    localStorage.setItem(SETTINGS_KEYS.ttsVolume, '2.1');
    localStorage.setItem(SETTINGS_KEYS.callTwoItems, 'true');
    localStorage.setItem(SETTINGS_KEYS.environmentType, 'loud');
    localStorage.setItem(SETTINGS_KEYS.textSize, 'large');
    expect(readSettingsFromLocalStorage()).toEqual({
      ttsVolume: 2.1,
      callTwoItems: true,
      environmentType: 'loud',
      textSize: 'large',
    });
  });

  it('rejects an invalid text size and falls back to standard', () => {
    localStorage.setItem(SETTINGS_KEYS.textSize, 'giant');
    expect(readSettingsFromLocalStorage().textSize).toBe('standard');
  });

  it('rejects an invalid environment value and falls back to unknown', () => {
    localStorage.setItem(SETTINGS_KEYS.environmentType, 'spaceship');
    expect(readSettingsFromLocalStorage().environmentType).toBe('unknown');
  });

  it('falls back to default volume when the stored value is not a number', () => {
    localStorage.setItem(SETTINGS_KEYS.ttsVolume, 'not-a-number');
    expect(readSettingsFromLocalStorage().ttsVolume).toBe(SETTINGS_DEFAULTS.ttsVolume);
  });
});

describe('Scope 2 — readEnvVoiceTuning (environment -> voice tuning)', () => {
  it('quiet maps to sensitive tuning + 100ms endpointing', () => {
    localStorage.setItem('stocker-environment-type', 'quiet');
    expect(readEnvVoiceTuning()).toEqual({ micGain: 1.0, vadThreshold: 0.3, endpointing: 100 });
  });

  it('moderate maps to 150ms endpointing', () => {
    localStorage.setItem('stocker-environment-type', 'moderate');
    expect(readEnvVoiceTuning().endpointing).toBe(150);
  });

  it('loud maps to aggressive tuning + 200ms endpointing', () => {
    localStorage.setItem('stocker-environment-type', 'loud');
    expect(readEnvVoiceTuning()).toEqual({ micGain: 1.5, vadThreshold: 0.7, endpointing: 200 });
  });

  it('a saved environment WINS over a caller fallback endpointing', () => {
    localStorage.setItem('stocker-environment-type', 'loud');
    expect(readEnvVoiceTuning(999).endpointing).toBe(200);
  });

  it('with no environment set, honors the caller fallback endpointing', () => {
    expect(readEnvVoiceTuning(175).endpointing).toBe(175);
  });

  it('with no environment and no fallback, uses the safe default (100ms)', () => {
    expect(readEnvVoiceTuning().endpointing).toBe(100);
  });
});
