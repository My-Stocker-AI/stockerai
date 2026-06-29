import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  EnvironmentType,
  DriverSettings,
  readSettingsFromLocalStorage,
  writeSettingsToLocalStorage,
} from '@/lib/settingsCore';

/**
 * useDriverSettings — single source of truth for a driver's picking preferences.
 *
 * Three settings, shared by the dashboard Settings page AND the in-route gear sheet:
 *   - ttsVolume: voice loudness multiplier, 0.5 to 2.5
 *   - callTwoItems: call two items at once vs one
 *   - environmentType: quiet / moderate / loud warehouse noise level
 *
 * Persistence is two-layer so the app is instant AND survives a reinstall:
 *   1. localStorage  — read synchronously on mount, so the UI never flickers and
 *      works fully offline. These are the SAME keys the old screens used, so nothing
 *      already saved is lost.
 *   2. Supabase profiles row — the driver's account record. Written on every change
 *      (volume debounced) and re-read on login, so a driver who logs in on a new
 *      phone gets their settings back.
 *
 * localStorage renders first; when the Supabase fetch returns it wins (it's the
 * cross-device truth) and is mirrored back into localStorage.
 *
 * The pure read/write helpers live in @/lib/settingsCore (no Supabase coupling).
 */

export type { EnvironmentType, DriverSettings } from '@/lib/settingsCore';
export { SETTINGS_KEYS, SETTINGS_DEFAULTS, readSettingsFromLocalStorage } from '@/lib/settingsCore';

const ENV_VALUES: EnvironmentType[] = ['quiet', 'moderate', 'loud'];

// App field names -> Supabase column names on the profiles (driver) row.
function toProfileColumns(patch: Partial<DriverSettings>): Record<string, unknown> {
  const cols: Record<string, unknown> = {};
  if (patch.ttsVolume !== undefined) cols.tts_volume = patch.ttsVolume;
  if (patch.callTwoItems !== undefined) cols.call_two_items = patch.callTwoItems;
  if (patch.environmentType !== undefined) cols.environment_type = patch.environmentType;
  return cols;
}

export function useDriverSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<DriverSettings>(() => readSettingsFromLocalStorage());
  const [hydrated, setHydrated] = useState(false);
  const volumeWriteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Login hydration: when a driver is known, pull their saved settings from the
  // account record. Server wins over the local cache; mirror the result back local.
  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setHydrated(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('tts_volume, call_two_items, environment_type')
        .eq('id', user.id)
        .single();

      if (cancelled) return;
      // Columns missing (migration not yet applied) or no row — keep localStorage values.
      if (error || !data) {
        setHydrated(true);
        return;
      }

      const row = data as {
        tts_volume: number | null;
        call_two_items: boolean | null;
        environment_type: string | null;
      };
      const next: DriverSettings = {
        ttsVolume: typeof row.tts_volume === 'number' ? row.tts_volume : readSettingsFromLocalStorage().ttsVolume,
        callTwoItems: typeof row.call_two_items === 'boolean' ? row.call_two_items : readSettingsFromLocalStorage().callTwoItems,
        environmentType: row.environment_type && ENV_VALUES.includes(row.environment_type as EnvironmentType)
          ? (row.environment_type as EnvironmentType)
          : readSettingsFromLocalStorage().environmentType,
      };
      writeSettingsToLocalStorage(next);
      setSettings(next);
      setHydrated(true);
    })();

    return () => { cancelled = true; };
  }, [user?.id]);

  // Persist a change to the driver's account record (best-effort, never blocks UI).
  const persistToAccount = useCallback((patch: Partial<DriverSettings>) => {
    if (!user?.id) return;
    const cols = toProfileColumns(patch);
    if (Object.keys(cols).length === 0) return;
    supabase
      .from('profiles')
      .update(cols)
      .eq('id', user.id)
      .then(({ error }) => {
        if (error) {
          // Migration not applied yet, or transient — localStorage still holds the value.
          console.warn('[DriverSettings] account persist failed:', error.message);
        }
      });
  }, [user?.id]);

  const applyPatch = useCallback((patch: Partial<DriverSettings>, debounceAccount = false) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    writeSettingsToLocalStorage(patch);
    if (debounceAccount) {
      if (volumeWriteTimer.current) clearTimeout(volumeWriteTimer.current);
      volumeWriteTimer.current = setTimeout(() => persistToAccount(patch), 600);
    } else {
      persistToAccount(patch);
    }
  }, [persistToAccount]);

  const setTtsVolume = useCallback((value: number) => {
    applyPatch({ ttsVolume: value }, true); // slider fires rapidly — debounce the account write
  }, [applyPatch]);

  const setCallTwoItems = useCallback((value: boolean) => {
    applyPatch({ callTwoItems: value });
  }, [applyPatch]);

  const setEnvironmentType = useCallback((value: EnvironmentType) => {
    applyPatch({ environmentType: value });
  }, [applyPatch]);

  useEffect(() => () => {
    if (volumeWriteTimer.current) clearTimeout(volumeWriteTimer.current);
  }, []);

  return {
    settings,
    hydrated,
    setTtsVolume,
    setCallTwoItems,
    setEnvironmentType,
  };
}
