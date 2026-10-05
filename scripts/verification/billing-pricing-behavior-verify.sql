-- Disposable-database behavioral verification for the card-required trial gate.
-- Creates and removes one synthetic account inside this block. Never run this
-- against production; use only after checking stockerai_disposable_marker().
DO $verify$
DECLARE
  v_marker text;
  v_account_id uuid;
  v_event timestamptz := clock_timestamp();
  v_account public.accounts%ROWTYPE;
  v_applied boolean;
BEGIN
  SELECT public.stockerai_disposable_marker() INTO v_marker;
  IF v_marker IS DISTINCT FROM 'stockerai-local-only-20260918' THEN
    RAISE EXCEPTION 'Refusing an unmarked database';
  END IF;

  INSERT INTO public.accounts (name, driver_count)
  VALUES ('Disposable billing verification', 2)
  RETURNING id INTO v_account_id;

  BEGIN
    PERFORM public.apply_stripe_account_state_v2(
      v_account_id, 'cus_disposable_pricing_verification',
      'sub_disposable_pricing_verification', 'trialing', 2,
      v_event + interval '7 days', v_event + interval '7 days', v_event,
      'annual', '2026-10-graduated', false
    );
    RAISE EXCEPTION 'Trial without a payment method was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  SELECT * INTO v_account FROM public.accounts WHERE id = v_account_id;
  IF v_account.subscription_status IS NOT NULL OR NOT v_account.billing_onboarding_required THEN
    RAISE EXCEPTION 'Rejected trial changed account access';
  END IF;

  v_applied := public.apply_stripe_account_state_v2(
    v_account_id, 'cus_disposable_pricing_verification',
    'sub_disposable_pricing_verification', 'trialing', 2,
    v_event + interval '7 days', v_event + interval '7 days', v_event,
    'annual', '2026-10-graduated', true
  );
  IF NOT v_applied THEN RAISE EXCEPTION 'Valid trial was not applied'; END IF;

  SELECT * INTO v_account FROM public.accounts WHERE id = v_account_id;
  IF v_account.subscription_status IS DISTINCT FROM 'trialing' OR
     v_account.billing_onboarding_required OR
     v_account.billing_term IS DISTINCT FROM 'annual' OR
     v_account.pricing_version IS DISTINCT FROM '2026-10-graduated' OR
     v_account.trial_ends_at IS DISTINCT FROM v_event + interval '7 days' OR
     v_account.trial_redeemed_at IS DISTINCT FROM v_event THEN
    RAISE EXCEPTION 'Valid card-required trial state did not reconcile';
  END IF;

  v_applied := public.apply_stripe_account_state_v2(
    v_account_id, 'cus_disposable_pricing_verification',
    'sub_disposable_pricing_verification', 'canceled', 2,
    v_event + interval '7 days', NULL, v_event - interval '1 second',
    'annual', '2026-10-graduated', true
  );
  IF v_applied THEN RAISE EXCEPTION 'Older Stripe state was applied'; END IF;

  v_applied := public.apply_stripe_account_state_v2(
    v_account_id, 'cus_disposable_pricing_verification',
    'sub_disposable_pricing_verification', 'canceled', 2,
    v_event + interval '7 days', NULL, v_event + interval '1 second',
    'annual', '2026-10-graduated', true
  );
  IF NOT v_applied THEN RAISE EXCEPTION 'New cancellation was not applied'; END IF;

  SELECT * INTO v_account FROM public.accounts WHERE id = v_account_id;
  IF v_account.subscription_status IS DISTINCT FROM 'canceled' OR
     v_account.trial_redeemed_at IS DISTINCT FROM v_event THEN
    RAISE EXCEPTION 'Cancellation lost durable trial history';
  END IF;

  DELETE FROM public.accounts WHERE id = v_account_id;
END;
$verify$;
