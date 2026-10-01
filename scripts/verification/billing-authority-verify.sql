-- Read-only verification for 20261004000000_account_bound_billing.sql.
-- This inspects catalog metadata only; it does not read customer billing rows.
WITH expected(column_name) AS (
  VALUES
    ('stripe_customer_id'),
    ('stripe_subscription_id'),
    ('subscription_current_period_end'),
    ('stripe_state_event_created_at')
)
SELECT e.column_name, (c.column_name IS NOT NULL) AS present
FROM expected e
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = 'accounts'
 AND c.column_name = e.column_name
ORDER BY e.column_name;

SELECT
  c.relrowsecurity AS rls_enabled,
  has_table_privilege('anon', 'public.stripe_webhook_events', 'SELECT') AS anon_select,
  has_table_privilege('authenticated', 'public.stripe_webhook_events', 'SELECT') AS authenticated_select,
  has_table_privilege('service_role', 'public.stripe_webhook_events', 'SELECT') AS service_select,
  has_table_privilege('service_role', 'public.stripe_webhook_events', 'INSERT') AS service_insert,
  has_table_privilege('service_role', 'public.stripe_webhook_events', 'UPDATE') AS service_update
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'stripe_webhook_events';

SELECT
  c.relrowsecurity AS rls_enabled,
  has_table_privilege('anon', 'public.billing_checkout_intents', 'SELECT') AS anon_select,
  has_table_privilege('authenticated', 'public.billing_checkout_intents', 'SELECT') AS authenticated_select,
  has_table_privilege('service_role', 'public.billing_checkout_intents', 'SELECT') AS service_select,
  has_table_privilege('service_role', 'public.billing_checkout_intents', 'INSERT') AS service_insert,
  has_table_privilege('service_role', 'public.billing_checkout_intents', 'UPDATE') AS service_update
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'billing_checkout_intents';

WITH expected(signature) AS (
  VALUES
    ('claim_stripe_webhook_event(text,text,timestamp with time zone)'),
    ('finish_stripe_webhook_event(text,text)'),
    ('apply_stripe_account_state(uuid,text,text,text,integer,timestamp with time zone,timestamp with time zone)'),
    ('reserve_billing_checkout(uuid,uuid,integer)'),
    ('complete_billing_checkout(uuid,uuid,text,text)'),
    ('expire_billing_checkout(uuid,uuid)')
)
SELECT
  e.signature,
  p.prosecdef AS security_definer,
  p.proconfig @> ARRAY['search_path=""'] AS empty_search_path,
  has_function_privilege('anon', 'public.' || e.signature, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', 'public.' || e.signature, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role', 'public.' || e.signature, 'EXECUTE') AS service_execute
FROM expected e
LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.' || e.signature)
ORDER BY e.signature;

SELECT
  to_regclass('public.accounts_stripe_customer_id_unique') IS NOT NULL AS customer_unique_index,
  to_regclass('public.accounts_stripe_subscription_id_unique') IS NOT NULL AS subscription_unique_index;
