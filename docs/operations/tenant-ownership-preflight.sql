-- Read-only aggregate preflight. Returns no customer or driver identifiers.
WITH
membership_anomalies AS (
  SELECT count(*) AS n FROM (
    SELECT user_id FROM public.account_users GROUP BY user_id HAVING count(*) <> 1
  ) x
),
route_violations AS (
  SELECT count(*) AS n FROM public.routes r
  WHERE (SELECT count(*) FROM public.account_users a WHERE a.user_id=r.user_id) <> 1
),
session_violations AS (
  SELECT count(*) AS n
  FROM public.sessions s
  LEFT JOIN public.account_users su ON su.user_id=s.user_id
  LEFT JOIN public.routes r ON r.id=s.current_route_id
  LEFT JOIN public.account_users ru ON ru.user_id=r.user_id
  LEFT JOIN public.machines m ON m.id=s.current_machine_id
  WHERE su.account_id IS NULL
    OR (s.current_route_id IS NOT NULL AND
      (r.id IS NULL OR ru.account_id IS DISTINCT FROM su.account_id))
    OR (s.current_machine_id IS NOT NULL AND
      (m.id IS NULL OR m.route_id IS DISTINCT FROM s.current_route_id))
),
assignment_violations AS (
  SELECT count(*) AS n
  FROM public.route_assignments ra
  LEFT JOIN public.account_users au ON au.user_id=ra.user_id
  LEFT JOIN public.routes r ON r.id=ra.route_id
  LEFT JOIN public.account_users ru ON ru.user_id=r.user_id
  LEFT JOIN public.account_users assigner ON assigner.user_id=ra.assigned_by
  WHERE au.account_id IS NULL OR ru.account_id IS DISTINCT FROM au.account_id
    OR (ra.assigned_by IS NOT NULL AND assigner.account_id IS DISTINCT FROM au.account_id)
),
operation_violations AS (
  SELECT count(*) AS n FROM public.picking_operations po
  JOIN public.sessions s ON s.id=po.session_id
  WHERE po.user_id IS DISTINCT FROM s.user_id
)
SELECT
  (SELECT n FROM membership_anomalies) AS ambiguous_logins,
  (SELECT n FROM route_violations) AS routes_without_one_company,
  (SELECT n FROM session_violations) AS invalid_session_references,
  (SELECT n FROM assignment_violations) AS invalid_assignment_references,
  (SELECT n FROM operation_violations) AS invalid_operation_owners,
  to_regclass('public.tenant_user_bindings') IS NOT NULL AS binding_table_already_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='routes' AND column_name='account_id'
  ) AS route_account_column_already_exists;

SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN (
     'bind_tenant_membership','tenant_account_for_user','current_tenant_id',
     'tenant_can_access_route','tenant_can_access_machine','guard_route_tenant',
     'guard_picking_parent','guard_picking_reference','authorized_picking_route_owner'
   )) AS conflicting_functions,
  (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN (
    'bind_tenant_membership','guard_route_tenant','guard_machine_parent',
    'guard_item_parent','guard_session_reference','guard_assignment_reference'
  )) AS conflicting_triggers,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname IN (
    'tenant_routes_boundary','tenant_machines_boundary','tenant_items_boundary',
    'tenant_sessions_boundary','tenant_assignments_boundary'
  )) AS conflicting_policies,
  (SELECT count(*) FROM pg_constraint WHERE conname='one_company_per_login')
    AS conflicting_constraints;
