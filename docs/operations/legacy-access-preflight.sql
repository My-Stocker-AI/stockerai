-- Read-only metadata and aggregate counts. No driver identifiers or row data returned.
SELECT count(*) AS ambiguous_login_count FROM (
  SELECT user_id FROM public.account_users GROUP BY user_id HAVING count(*) <> 1
) memberships;

SELECT count(*) AS routes_without_unambiguous_owner_account FROM public.routes r
WHERE (SELECT count(*) FROM public.account_users au WHERE au.user_id = r.user_id) <> 1;

SELECT p.oid::regprocedure::text AS signature, p.prosecdef AS security_definer,
       p.proconfig AS settings, p.proacl AS grants,
       md5(pg_get_functiondef(p.oid)) AS definition_hash
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
 'resolve_picking_account', 'get_next_item_and_increment', 'get_next_item_data',
 'increment_machine_items', 'get_next_item', 'get_routes_for_date', 'update_session_with_lock'
) ORDER BY signature;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid = 'public.account_users'::regclass ORDER BY conname;
