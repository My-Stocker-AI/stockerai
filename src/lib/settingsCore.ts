/**
 * settingsCore — PURE driver-settings helpers. No React, no Supabase, no side effects
 * at import time. Safe to import from the voice pipeline AND from unit tests without
 * dragging in the auth/supabase client (which touches localStorage at module load and
 * would break the node test environment).
 *
 * Shared by the useDriverSettings store and the useVoice Scope 2 tuning path.
 */

export type EnvironmentType = 'quiet' | 'moderate' | 'loud' | 'unknown';

export interface DriverSettings {
  ttsVolume: number;
  callTwoItems: boolean;
  environmentType: EnvironmentType;
}

// Reused verbatim from the original screens — never renamed, so saved prefs carry over.
export const SETTINGS_KEYS = {
  ttsVolume: 'stocker-tts-volume',
  callTwoItems: 'stocker-call-two-items',
  environmentType: 'stocker-environment-type',
} as const;

export const SETTINGS_DEFAULTS: DriverSettings = {
  ttsVolume: 1.5,
  callTwoItems: false,
  environmentType: 'unknown',
};

const ENV_VALUES: EnvironmentType[] = ['quiet', 'moderate', 'loud'];

export function readSettingsFromLocalStorage(): DriverSettings {
  try {
    const v = localStorage.getItem(SETTINGS_KEYS.ttsVolume);
    const t = localStorage.getItem(SETTINGS_KEYS.callTwoItems);
    const e = localStorage.getItem(SETTINGS_KEYS.environmentType);
    const vol = v !== null ? parseFloat(v) : SETTINGS_DEFAULTS.ttsVolume;
    return {
      ttsVolume: Number.isFinite(vol) ? vol : SETTINGS_DEFAULTS.ttsVolume,
      callTwoItems: t !== null ? t === 'true' : SETTINGS_DEFAULTS.callTwoItems,
      environmentType: e && ENV_VALUES.includes(e as EnvironmentType)
        ? (e as EnvironmentType)
        : SETTINGS_DEFAULTS.environmentType,
    };
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

export function writeSettingsToLocalStorage(patch: Partial<DriverSettings>) {
  try {
    if (patch.ttsVolume !== undefined) {
      localStorage.setItem(SETTINGS_KEYS.ttsVolume, String(patch.ttsVolume));
    }
    if (patch.callTwoItems !== undefined) {
      localStorage.setItem(SETTINGS_KEYS.callTwoItems, String(patch.callTwoItems));
    }
    if (patch.environmentType !== undefined) {
      localStorage.setItem(SETTINGS_KEYS.environmentType, patch.environmentType);
    }
  } catch {
    /* private mode / storage full — settings still live in component state */
  }
}

// ── Scope 2 — environment -> voice-pipeline tuning ────────────────────────────────
// Mirrors useEnvironmentDetection.getOptimalSettings so the dial means the same thing
// whether auto-detected or chosen by hand. Only `endpointing` is a real Deepgram
// connection parameter; micGain and vadThreshold are carried for observability and are
// intentionally NOT layered on top of the browser's autoGainControl + Deepgram's
// server-side VAD (they'd fight those and can hurt recognition).
export type EnvVoiceTuning = { micGain: number; vadThreshold: number; endpointing: number };

export const ENV_VOICE_TUNING: Record<string, EnvVoiceTuning> = {
  quiet: { micGain: 1.0, vadThreshold: 0.3, endpointing: 100 },
  moderate: { micGain: 1.2, vadThreshold: 0.5, endpointing: 150 },
  loud: { micGain: 1.5, vadThreshold: 0.7, endpointing: 200 },
  unknown: { micGain: 1.0, vadThreshold: 0.5, endpointing: 100 },
};

export function readEnvVoiceTuning(fallbackEndpointing?: number): EnvVoiceTuning {
  let envType = 'unknown';
  try {
    const saved = localStorage.getItem(SETTINGS_KEYS.environmentType);
    if (saved === 'quiet' || saved === 'moderate' || saved === 'loud') {
      envType = saved;
    }
  } catch {
    /* storage unavailable — fall through to unknown */
  }
  const tuning = ENV_VOICE_TUNING[envType] ?? ENV_VOICE_TUNING.unknown;
  // No environment chosen yet, but a caller passed an explicit endpointing? Honor it.
  if (envType === 'unknown' && typeof fallbackEndpointing === 'number') {
    return { ...tuning, endpointing: fallbackEndpointing };
  }
  return { ...tuning };
}
