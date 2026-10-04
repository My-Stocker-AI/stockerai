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

ALTER TABLE public.pending_unrecognized_formats
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz;

CREATE OR REPLACE FUNCTION public.update_report_format_review(
  p_item_id uuid,
  p_reviewer_id uuid,
  p_status text,
  p_notes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_account_id uuid;
  saved public.pending_unrecognized_formats%ROWTYPE;
BEGIN
  IF p_reviewer_id IS DISTINCT FROM 'bdc96b72-3f35-4cae-9e79-99473eb4a23b'::uuid THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not available on this account.';
  END IF;
  IF p_status NOT IN ('new', 'mapping', 'ready_for_validation', 'ready') OR
     length(COALESCE(p_notes, '')) > 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid report-format review update.';
  END IF;

  SELECT account_id INTO target_account_id
  FROM public.pending_unrecognized_formats
  WHERE id = p_item_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not available on this account.';
  END IF;

  UPDATE public.pending_unrecognized_formats
  SET status = p_status,
      review_notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
      reviewed_by = p_reviewer_id,
      updated_at = now(),
      ready_at = CASE WHEN p_status = 'ready' THEN COALESCE(ready_at, now()) ELSE NULL END
  WHERE id = p_item_id
  RETURNING * INTO saved;

  IF target_account_id IS NOT NULL THEN
    UPDATE public.accounts
    SET report_format_status = CASE p_status
      WHEN 'new' THEN 'submitted'
      WHEN 'mapping' THEN 'mapping'
      WHEN 'ready_for_validation' THEN 'ready_for_validation'
      WHEN 'ready' THEN 'ready'
    END
    WHERE id = target_account_id;
  END IF;

  RETURN jsonb_build_object(
    'id', saved.id,
    'status', saved.status,
    'review_notes', COALESCE(saved.review_notes, ''),
    'updated_at', saved.updated_at,
    'account_format_status', CASE p_status WHEN 'new' THEN 'submitted' ELSE p_status END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_report_format_review(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_report_format_review(uuid, uuid, text, text)
  TO service_role;

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
