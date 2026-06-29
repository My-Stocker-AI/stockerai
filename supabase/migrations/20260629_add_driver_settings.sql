-- Driver picking preferences persisted on the per-driver profiles row.
-- Backs the shared SettingsPanel (useDriverSettings): localStorage is the offline
-- cache, these columns are the cross-device source of truth re-read on login.
--
-- Settings are per-DRIVER (a profiles row == one driver), not per-company-account.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tts_volume      numeric  NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS call_two_items  boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS environment_type text   NOT NULL DEFAULT 'unknown';

-- Keep the noise-level value to the four the app understands.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_environment_type_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_environment_type_check
      CHECK (environment_type IN ('quiet', 'moderate', 'loud', 'unknown'));
  END IF;
END $$;

-- Keep the voice multiplier in the slider's real range (50%–250%).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_tts_volume_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_tts_volume_check
      CHECK (tts_volume >= 0.5 AND tts_volume <= 2.5);
  END IF;
END $$;
