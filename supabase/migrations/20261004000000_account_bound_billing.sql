BEGIN;

DO $block$
BEGIN
  IF EXISTS (
    SELECT stripe_customer_id
    FROM public.accounts
    WHERE stripe_customer_id IS NOT NULL
    GROUP BY stripe_customer_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate Stripe customer bindings must be reconciled before billing migration';
  END IF;
END
$block$;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_state_event_created_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_stripe_customer_id_unique
  ON public.accounts(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_stripe_subscription_id_unique
  ON public.accounts(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  event_created_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'processed', 'failed')),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
  last_error text,
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stripe_webhook_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.stripe_webhook_events TO service_role;

CREATE TABLE IF NOT EXISTS public.billing_checkout_intents (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL UNIQUE,
  driver_count integer NOT NULL CHECK (driver_count BETWEEN 2 AND 999),
  status text NOT NULL DEFAULT 'preparing'
    CHECK (status IN ('preparing', 'open', 'completed', 'expired')),
  stripe_checkout_session_id text UNIQUE,
  stripe_checkout_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_checkout_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.billing_checkout_intents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.billing_checkout_intents TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_billing_checkout(
  p_account_id uuid,
  p_operation_id uuid,
  p_driver_count integer
)
RETURNS TABLE (
  operation_id uuid,
  driver_count integer,
  status text,
  stripe_checkout_session_id text,
  stripe_checkout_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_intent public.billing_checkout_intents%ROWTYPE;
BEGIN
  IF p_driver_count < 2 OR p_driver_count > 999 THEN
    RAISE EXCEPTION 'Invalid checkout quantity' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.billing_checkout_intents(account_id, operation_id, driver_count)
  VALUES (p_account_id, p_operation_id, p_driver_count)
  ON CONFLICT (account_id) DO NOTHING;

  SELECT * INTO v_intent
  FROM public.billing_checkout_intents i
  WHERE i.account_id = p_account_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout intent could not be reserved' USING ERRCODE = '55000';
  END IF;

  IF v_intent.status IN ('preparing', 'open') THEN
    IF v_intent.driver_count IS DISTINCT FROM p_driver_count THEN
      RAISE EXCEPTION 'A checkout for a different quantity is already in progress'
        USING ERRCODE = '55000';
    END IF;
  ELSE
    UPDATE public.billing_checkout_intents i
    SET operation_id = p_operation_id,
        driver_count = p_driver_count,
        status = 'preparing',
        stripe_checkout_session_id = NULL,
        stripe_checkout_url = NULL,
        created_at = now(),
        updated_at = now()
    WHERE i.account_id = p_account_id
    RETURNING i.* INTO v_intent;
  END IF;

  RETURN QUERY SELECT
    v_intent.operation_id,
    v_intent.driver_count,
    v_intent.status,
    v_intent.stripe_checkout_session_id,
    v_intent.stripe_checkout_url;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_billing_checkout(
  p_account_id uuid,
  p_operation_id uuid,
  p_session_id text,
  p_session_url text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF nullif(btrim(p_session_id), '') IS NULL OR nullif(btrim(p_session_url), '') IS NULL THEN
    RAISE EXCEPTION 'Complete checkout session identity is required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.billing_checkout_intents i
  SET stripe_checkout_session_id = p_session_id,
      stripe_checkout_url = p_session_url,
      status = 'open',
      updated_at = now()
  WHERE i.account_id = p_account_id
    AND i.operation_id = p_operation_id
    AND i.status IN ('preparing', 'open');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout reservation changed before completion' USING ERRCODE = '40001';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expire_billing_checkout(
  p_account_id uuid,
  p_operation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.billing_checkout_intents i
  SET status = 'expired', updated_at = now()
  WHERE i.account_id = p_account_id
    AND i.operation_id = p_operation_id
    AND i.status IN ('preparing', 'open');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout reservation changed before expiration' USING ERRCODE = '40001';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_event_created_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event public.stripe_webhook_events%ROWTYPE;
  v_inserted boolean := false;
BEGIN
  IF nullif(btrim(p_event_id), '') IS NULL OR nullif(btrim(p_event_type), '') IS NULL THEN
    RAISE EXCEPTION 'Stripe event identity is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stripe_webhook_events(event_id, event_type, event_created_at)
  VALUES (p_event_id, p_event_type, p_event_created_at)
  ON CONFLICT (event_id) DO NOTHING
  RETURNING true INTO v_inserted;

  IF v_inserted THEN
    RETURN 'claimed';
  END IF;

  SELECT * INTO v_event
  FROM public.stripe_webhook_events
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF v_event.event_type IS DISTINCT FROM p_event_type OR
     v_event.event_created_at IS DISTINCT FROM p_event_created_at THEN
    RAISE EXCEPTION 'Stripe event identity mismatch' USING ERRCODE = '22023';
  END IF;
  IF v_event.status = 'processed' THEN
    RETURN 'processed';
  END IF;
  IF v_event.status = 'processing' AND v_event.updated_at > now() - interval '5 minutes' THEN
    RETURN 'processing';
  END IF;

  UPDATE public.stripe_webhook_events
  SET status = 'processing', attempts = attempts + 1, last_error = NULL, updated_at = now()
  WHERE event_id = p_event_id;
  RETURN 'claimed';
END;
$function$;

CREATE OR REPLACE FUNCTION public.finish_stripe_webhook_event(
  p_event_id text,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.stripe_webhook_events
  SET status = CASE WHEN p_error IS NULL THEN 'processed' ELSE 'failed' END,
      last_error = left(p_error, 1000),
      processed_at = CASE WHEN p_error IS NULL THEN now() ELSE NULL END,
      updated_at = now()
  WHERE event_id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stripe event was not claimed' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_stripe_account_state(
  p_account_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_subscription_status text,
  p_driver_count integer,
  p_period_end timestamptz,
  p_event_created_at timestamptz
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
      stripe_state_event_created_at = p_event_created_at
  WHERE id = p_account_id;
  RETURN true;
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

REVOKE ALL ON FUNCTION public.claim_stripe_webhook_event(text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_stripe_webhook_event(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_stripe_account_state(uuid, text, text, text, integer, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_billing_checkout(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_billing_checkout(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_billing_checkout(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_webhook_event(text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_stripe_webhook_event(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_stripe_account_state(uuid, text, text, text, integer, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_billing_checkout(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_billing_checkout(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_billing_checkout(uuid, uuid) TO service_role;

COMMIT;
