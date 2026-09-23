BEGIN;

-- Public signup supplies an explicit intent marker. Invited users do not, so
-- creating an invited Auth identity cannot accidentally create a new company.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
-- Existing account constraints and trigger functions resolve public relations
-- through the caller's search path, so keep the trusted schema explicit here.
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_account_id uuid;
  v_driver_count integer := 2;
  v_first_name text := nullif(btrim(NEW.raw_user_meta_data ->> 'first_name'), '');
  v_last_name text := nullif(btrim(NEW.raw_user_meta_data ->> 'last_name'), '');
  v_company_name text;
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (NEW.id, NEW.email, v_first_name, v_last_name)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        first_name = COALESCE(EXCLUDED.first_name, public.profiles.first_name),
        last_name = COALESCE(EXCLUDED.last_name, public.profiles.last_name);

  IF lower(COALESCE(NEW.raw_user_meta_data ->> 'stocker_account_signup', 'false')) <> 'true' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.raw_user_meta_data ->> 'driver_count', '') ~ '^[0-9]+$' THEN
    v_driver_count := LEAST(50, GREATEST(2, (NEW.raw_user_meta_data ->> 'driver_count')::integer));
  END IF;

  v_company_name := COALESCE(
    nullif(btrim(NEW.raw_user_meta_data ->> 'company_name'), ''),
    CASE WHEN v_first_name IS NOT NULL THEN v_first_name || '''s Company' END,
    split_part(COALESCE(NEW.email, 'Stocker'), '@', 1) || '''s Company'
  );

  -- Auth signup, company creation, and the first administrator membership are
  -- one database transaction. Any failure aborts the Auth user insertion too.
  INSERT INTO public.accounts (name, driver_count)
  VALUES (v_company_name, v_driver_count)
  RETURNING id INTO v_account_id;

  INSERT INTO public.account_users (
    account_id, user_id, role, can_view_all_routes, can_upload_routes
  ) VALUES (
    v_account_id, NEW.id, 'primary_admin', true, true
  );

  RETURN NEW;
END;
$function$;

-- Customers may edit ordinary company settings, but billing and complimentary
-- access are controlled by Stripe/service code or the platform-admin RPC below.
CREATE OR REPLACE FUNCTION public.protect_account_access_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
     AND (
       NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id OR
       NEW.subscription_status IS DISTINCT FROM OLD.subscription_status OR
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

DROP TRIGGER IF EXISTS protect_account_access_fields_trigger ON public.accounts;
CREATE TRIGGER protect_account_access_fields_trigger
BEFORE UPDATE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.protect_account_access_fields();

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
  IF p_subscription_status NOT IN ('trialing', 'active', 'past_due', 'canceled') THEN
    RAISE EXCEPTION 'Unsupported subscription status' USING ERRCODE = '22023';
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

  UPDATE public.accounts
  SET driver_count = p_driver_count,
      is_platform_account = p_is_complimentary,
      subscription_status = CASE WHEN p_is_complimentary THEN 'active' ELSE p_subscription_status END,
      trial_ends_at = CASE
        WHEN p_is_complimentary THEN NULL
        WHEN is_platform_account AND NOT p_is_complimentary AND p_subscription_status = 'trialing'
          THEN now() + interval '14 days'
        ELSE trial_ends_at
      END
  WHERE id = p_account_id
  RETURNING * INTO v_account;

  RETURN v_account;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_update_account_access(uuid, integer, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_account_access(uuid, integer, boolean, text) TO authenticated;

COMMIT;
