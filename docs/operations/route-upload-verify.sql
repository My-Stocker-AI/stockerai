-- Read-only post-migration verification for atomic route upload and private reports.
-- This reads only PostgreSQL catalogs and bucket metadata. It does not list or open
-- Storage objects and does not read customer routes, assignments, sessions or uploads.

SELECT
  p.oid::regprocedure::text AS signature,
  p.prosecdef AS security_definer,
  p.proconfig AS function_settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
  position('pg_advisory_xact_lock' in pg_get_functiondef(p.oid)) > 0 AS serializes_uploads,
  position('can_upload_routes' in pg_get_functiondef(p.oid)) > 0 AS checks_upload_capability,
  position('Cannot replace a route with an active session.' in pg_get_functiondef(p.oid)) > 0
    AS protects_active_session,
  position('pending_unrecognized_formats' in pg_get_functiondef(p.oid)) > 0
    AS rejects_review_operation,
  md5(pg_get_functiondef(p.oid)) AS definition_md5,
  length(pg_get_functiondef(p.oid)) AS definition_length
FROM pg_proc p
WHERE p.oid = to_regprocedure(
  'public.replace_route_upload(uuid,uuid,uuid,uuid,text,text,date,text,text,jsonb)'
);

SELECT
  p.oid::regprocedure::text AS signature,
  p.prosecdef AS security_definer,
  p.proconfig AS function_settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
  position('pg_advisory_xact_lock' in pg_get_functiondef(p.oid)) > 0 AS serializes_retries,
  position('can_upload_routes' in pg_get_functiondef(p.oid)) > 0 AS checks_upload_capability,
  position('route_upload_operations' in pg_get_functiondef(p.oid)) > 0 AS rejects_route_operation,
  md5(pg_get_functiondef(p.oid)) AS definition_md5,
  length(pg_get_functiondef(p.oid)) AS definition_length
FROM pg_proc p
WHERE p.oid = to_regprocedure(
  'public.record_pending_format_upload(uuid,uuid,uuid,uuid,text,text,text,text,text,text)'
);

SELECT
  c.oid::regclass::text AS table_name,
  c.relrowsecurity AS rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
  has_table_privilege('service_role', c.oid, 'SELECT') AS service_role_select,
  has_table_privilege('service_role', c.oid, 'INSERT') AS service_role_insert,
  has_table_privilege('service_role', c.oid, 'UPDATE') AS service_role_update,
  has_table_privilege('service_role', c.oid, 'DELETE') AS service_role_delete
FROM pg_class c
WHERE c.oid = to_regclass('public.route_upload_operations');

SELECT
  c.oid::regclass::text AS table_name,
  c.relrowsecurity AS rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
  has_table_privilege('service_role', c.oid, 'SELECT') AS service_role_select,
  has_table_privilege('service_role', c.oid, 'INSERT') AS service_role_insert,
  has_table_privilege('service_role', c.oid, 'UPDATE') AS service_role_update,
  has_table_privilege('service_role', c.oid, 'DELETE') AS service_role_delete
FROM pg_class c
WHERE c.oid = to_regclass('public.pending_unrecognized_formats');

SELECT
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = to_regclass('public.route_upload_operations')
ORDER BY conname;

SELECT
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = to_regclass('public.pending_unrecognized_formats')
ORDER BY conname;

SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'route-pdfs';

SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY policyname;
