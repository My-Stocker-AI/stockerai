BEGIN;

-- Company-level onboarding belongs to the company, while the short picker
-- orientation belongs to each person. Existing customers are backfilled as
-- complete so a release cannot interrupt an active route.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS report_source text,
  ADD COLUMN IF NOT EXISTS report_source_name text,
  ADD COLUMN IF NOT EXISTS report_format_status text NOT NULL DEFAULT 'needs_source',
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_report_source_check;
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_report_source_check
  CHECK (report_source IS NULL OR report_source IN ('parlevel', 'other', 'not_sure'));

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_report_format_status_check;
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_report_format_status_check
  CHECK (report_format_status IN (
    'needs_source', 'ready', 'needs_submission', 'submitted', 'mapping', 'ready_for_validation'
  ));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

UPDATE public.accounts
SET onboarding_completed_at = now(),
    report_format_status = 'ready'
WHERE onboarding_completed_at IS NULL;

UPDATE public.profiles
SET onboarding_completed_at = now()
WHERE onboarding_completed_at IS NULL;

COMMENT ON COLUMN public.accounts.report_source IS
  'The account route-report source selected during onboarding.';
COMMENT ON COLUMN public.accounts.report_source_name IS
  'The operator-entered vendor/system name when report_source is not Parlevel.';
COMMENT ON COLUMN public.accounts.report_format_status IS
  'Lifecycle for a company route-report format; only ready formats may be treated as generally usable.';
COMMENT ON COLUMN public.accounts.onboarding_completed_at IS
  'Completion time for the company administrator onboarding flow.';
COMMENT ON COLUMN public.profiles.onboarding_completed_at IS
  'Completion time for the individual picker orientation.';

COMMIT;
