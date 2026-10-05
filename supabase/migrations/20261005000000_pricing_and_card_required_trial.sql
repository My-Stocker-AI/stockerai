BEGIN;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS billing_onboarding_required boolean,
  ADD COLUMN IF NOT EXISTS billing_term text,
  ADD COLUMN IF NOT EXISTS pricing_version text,
  ADD COLUMN IF NOT EXISTS trial_redeemed_at timestamptz;

-- Everything that predates this release is grandfathered from the new-card gate
-- and cannot accidentally receive another introductory trial.
UPDATE public.accounts
SET billing_onboarding_required = false
WHERE billing_onboarding_required IS NULL;

UPDATE public.accounts
SET trial_redeemed_at = COALESCE(created_at, now())
WHERE trial_redeemed_at IS NULL;

ALTER TABLE public.accounts
  ALTER COLUMN billing_onboarding_required SET DEFAULT true,
  ALTER COLUMN billing_onboarding_required SET NOT NULL;

-- Account creation alone no longer grants a database-created trial. Stripe is
-- the only authority that may establish trialing status and its exact end.
ALTER TABLE public.accounts
  ALTER COLUMN subscription_status DROP DEFAULT,
  ALTER COLUMN trial_ends_at DROP DEFAULT;

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_billing_term_check;
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_billing_term_check
  CHECK (billing_term IS NULL OR billing_term IN ('monthly', 'semiannual', 'annual', 'legacy'));

CREATE OR REPLACE FUNCTION public.apply_stripe_account_state_v2(
  p_account_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_subscription_status text,
  p_driver_count integer,
  p_period_end timestamptz,
  p_trial_end timestamptz,
  p_event_created_at timestamptz,
  p_billing_term text,
  p_pricing_version text,
  p_has_payment_method boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_account public.accounts%ROWTYPE;
  v_status text;
BEGIN
  IF nullif(btrim(p_customer_id), '') IS NULL OR
     nullif(btrim(p_subscription_id), '') IS NULL OR
     p_event_created_at IS NULL THEN
    RAISE EXCEPTION 'Complete Stripe identity is required' USING ERRCODE = '22023';
  END IF;

  v_status := CASE p_subscription_status
    WHEN 'trialing' THEN 'trialing'
    WHEN 'active' THEN 'active'
    WHEN 'past_due' THEN 'past_due'
    WHEN 'unpaid' THEN 'past_due'
    WHEN 'incomplete' THEN 'past_due'
    WHEN 'paused' THEN 'past_due'
    WHEN 'canceled' THEN 'canceled'
    WHEN 'incomplete_expired' THEN 'canceled'
    ELSE NULL
  END;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Unsupported Stripe subscription status: %', p_subscription_status
      USING ERRCODE = '22023';
  END IF;
  IF p_driver_count < 0 OR p_driver_count > 999 THEN
    RAISE EXCEPTION 'Invalid Stripe subscription quantity' USING ERRCODE = '22023';
  END IF;
  IF p_billing_term NOT IN ('monthly', 'semiannual', 'annual', 'legacy') THEN
    RAISE EXCEPTION 'Unsupported billing term' USING ERRCODE = '22023';
  END IF;
  IF v_status = 'trialing' AND (p_trial_end IS NULL OR NOT p_has_payment_method) THEN
    RAISE EXCEPTION 'A trial requires an end date and stored payment method'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_account
  FROM public.accounts
  WHERE id = p_account_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_account.is_platform_account THEN
    RAISE EXCEPTION 'Complimentary accounts cannot be Stripe-linked' USING ERRCODE = '55000';
  END IF;
  IF v_account.stripe_customer_id IS NOT NULL AND
     v_account.stripe_customer_id IS DISTINCT FROM p_customer_id THEN
    RAISE EXCEPTION 'Stripe customer/account mismatch' USING ERRCODE = '23514';
  END IF;
  IF v_account.stripe_state_event_created_at IS NOT NULL AND
     v_account.stripe_state_event_created_at > p_event_created_at THEN
    RETURN false;
  END IF;

  UPDATE public.accounts
  SET stripe_customer_id = p_customer_id,
      stripe_subscription_id = p_subscription_id,
      subscription_status = v_status,
      driver_count = GREATEST(2, p_driver_count),
      subscription_current_period_end = p_period_end,
      stripe_state_event_created_at = p_event_created_at,
      billing_term = p_billing_term,
      pricing_version = nullif(btrim(p_pricing_version), ''),
      billing_onboarding_required = CASE
        WHEN v_status IN ('trialing', 'active') THEN false
        ELSE billing_onboarding_required
      END,
      trial_ends_at = CASE WHEN v_status = 'trialing' THEN p_trial_end ELSE NULL END,
      trial_redeemed_at = CASE
        WHEN p_trial_end IS NOT NULL THEN COALESCE(trial_redeemed_at, p_event_created_at)
        ELSE trial_redeemed_at
      END
  WHERE id = p_account_id;
  RETURN true;
END;
$function$;

-- Complimentary platform access remains an explicit administrative option,
-- but administrators may no longer manufacture a trial or paid state outside
-- Stripe. Removing complimentary access sends the company through checkout.
CREATE OR REPLACE FUNCTION public.admin_update_account_access(
  p_account_id uuid,
  p_driver_count integer,
  p_is_complimentary boolean,
  p_subscription_status text
)
RETURNS public.accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_account public.accounts%ROWTYPE;
  v_platform_admin constant uuid := 'bdc96b72-3f35-4cae-9e79-99473eb4a23b';
BEGIN
  IF auth.uid() IS DISTINCT FROM v_platform_admin THEN
    RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_driver_count < 1 OR p_driver_count > 999 THEN
    RAISE EXCEPTION 'Driver count must be between 1 and 999' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_account
  FROM public.accounts
  WHERE id = p_account_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_account.stripe_customer_id IS NOT NULL AND (
    p_is_complimentary OR
    p_driver_count IS DISTINCT FROM v_account.driver_count OR
    p_subscription_status IS DISTINCT FROM v_account.subscription_status
  ) THEN
    RAISE EXCEPTION 'Stripe-linked accounts must be changed through Stripe'
      USING ERRCODE = '55000';
  END IF;

  IF NOT p_is_complimentary AND NOT v_account.is_platform_account THEN
    RAISE EXCEPTION 'Paid and trial access must be established through Stripe checkout'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.accounts
  SET driver_count = p_driver_count,
      is_platform_account = p_is_complimentary,
      subscription_status = CASE WHEN p_is_complimentary THEN 'active' ELSE 'canceled' END,
      billing_onboarding_required = NOT p_is_complimentary,
      trial_ends_at = NULL
  WHERE id = p_account_id
  RETURNING * INTO v_account;

  RETURN v_account;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_account_access_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
     AND (
       NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id OR
       NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id OR
       NEW.subscription_status IS DISTINCT FROM OLD.subscription_status OR
       NEW.subscription_current_period_end IS DISTINCT FROM OLD.subscription_current_period_end OR
       NEW.stripe_state_event_created_at IS DISTINCT FROM OLD.stripe_state_event_created_at OR
       NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at OR
       NEW.trial_redeemed_at IS DISTINCT FROM OLD.trial_redeemed_at OR
       NEW.billing_onboarding_required IS DISTINCT FROM OLD.billing_onboarding_required OR
       NEW.billing_term IS DISTINCT FROM OLD.billing_term OR
       NEW.pricing_version IS DISTINCT FROM OLD.pricing_version OR
       NEW.driver_count IS DISTINCT FROM OLD.driver_count OR
       NEW.min_drivers_required IS DISTINCT FROM OLD.min_drivers_required OR
       NEW.is_platform_account IS DISTINCT FROM OLD.is_platform_account
     ) THEN
    RAISE EXCEPTION 'Account access and billing fields cannot be changed directly'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_stripe_account_state_v2(
  uuid, text, text, text, integer, timestamptz, timestamptz, timestamptz,
  text, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_account_state_v2(
  uuid, text, text, text, integer, timestamptz, timestamptz, timestamptz,
  text, text, boolean
) TO service_role;

COMMIT;
