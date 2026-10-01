-- Read-only catalog verification for the keyword RPC authority migration.
-- Expected: exactly two rows with the same grants/settings in each row.
-- This query reads PostgreSQL catalogs only and does not read keyword or driver rows.

SELECT
  p.oid::regprocedure::text AS signature,
  p.prosecdef AS security_definer,
  p.proconfig AS function_settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
  position('auth.uid()' in pg_get_functiondef(p.oid)) > 0 AS checks_auth_uid,
  md5(pg_get_functiondef(p.oid)) AS definition_hash
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('upsert_user_keyword', 'get_top_user_keywords')
ORDER BY p.proname;
