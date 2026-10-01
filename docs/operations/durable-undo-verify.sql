-- Read-only catalog verification for the durable item-undo migration.
-- Run after applying only 20260930000000_durable_item_undo.sql.
-- Expected: exactly one row; security_definer=true; search_path contains
-- "search_path=public, pg_temp"; anon/authenticated=false; service_role=true.
-- Save the returned definition/hash as release evidence. This query reads no driver rows.

SELECT
  p.oid::regprocedure::text AS signature,
  p.prosecdef AS security_definer,
  p.proconfig AS function_settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
  md5(pg_get_functiondef(p.oid)) AS definition_hash,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.oid = to_regprocedure(
    'public.undo_picking_item(uuid,uuid,uuid,uuid,uuid,jsonb)'
  );
