BEGIN;

-- Route ownership is tenant-bound, while user_id identifies the assigned driver.
-- Give account route viewers read access to every route in their own account and
-- give route uploaders/admins the management access exposed by the dashboard.
CREATE OR REPLACE FUNCTION public.can_view_account_routes(p_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.account_users au
    WHERE au.user_id = auth.uid()
      AND au.account_id = p_account_id
      AND (au.role = 'primary_admin' OR COALESCE(au.can_view_all_routes, false))
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_account_routes(p_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.account_users au
    WHERE au.user_id = auth.uid()
      AND au.account_id = p_account_id
      AND (au.role = 'primary_admin' OR COALESCE(au.can_upload_routes, false))
  )
$$;

REVOKE ALL ON FUNCTION public.can_view_account_routes(uuid),
  public.can_manage_account_routes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_account_routes(uuid),
  public.can_manage_account_routes(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS account_route_viewers_select ON public.routes;
CREATE POLICY account_route_viewers_select ON public.routes
  FOR SELECT TO authenticated
  USING (public.can_view_account_routes(account_id));

DROP POLICY IF EXISTS account_route_managers_update ON public.routes;
CREATE POLICY account_route_managers_update ON public.routes
  FOR UPDATE TO authenticated
  USING (public.can_manage_account_routes(account_id))
  WITH CHECK (public.can_manage_account_routes(account_id));

DROP POLICY IF EXISTS account_route_managers_delete ON public.routes;
CREATE POLICY account_route_managers_delete ON public.routes
  FOR DELETE TO authenticated
  USING (public.can_manage_account_routes(account_id));

NOTIFY pgrst, 'reload schema';
COMMIT;
