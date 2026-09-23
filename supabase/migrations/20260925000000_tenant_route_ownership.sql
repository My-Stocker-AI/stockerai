-- Apply only after reviewed aggregate preflight and the access-boundary release.
-- One company per login. Membership removal revokes access; rejoining another
-- company with that same identity requires a separately reviewed transfer design.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.account_users, public.routes IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT user_id FROM public.account_users GROUP BY user_id HAVING count(*) <> 1)
    OR EXISTS (SELECT 1 FROM public.routes r WHERE
      (SELECT count(*) FROM public.account_users a WHERE a.user_id=r.user_id) <> 1)
    OR EXISTS (
      SELECT 1 FROM public.sessions s
      LEFT JOIN public.account_users su ON su.user_id=s.user_id
      LEFT JOIN public.routes r ON r.id=s.current_route_id
      LEFT JOIN public.account_users ru ON ru.user_id=r.user_id
      LEFT JOIN public.machines m ON m.id=s.current_machine_id
      WHERE su.account_id IS NULL
        OR (s.current_route_id IS NOT NULL AND
          (r.id IS NULL OR ru.account_id IS DISTINCT FROM su.account_id))
        OR (s.current_machine_id IS NOT NULL AND
          (m.id IS NULL OR m.route_id IS DISTINCT FROM s.current_route_id)))
    OR EXISTS (
      SELECT 1 FROM public.route_assignments ra
      LEFT JOIN public.account_users au ON au.user_id=ra.user_id
      LEFT JOIN public.routes r ON r.id=ra.route_id
      LEFT JOIN public.account_users ru ON ru.user_id=r.user_id
      LEFT JOIN public.account_users assigner ON assigner.user_id=ra.assigned_by
      WHERE au.account_id IS NULL OR ru.account_id IS DISTINCT FROM au.account_id
        OR (ra.assigned_by IS NOT NULL AND assigner.account_id IS DISTINCT FROM au.account_id))
    OR EXISTS (
      SELECT 1 FROM public.picking_operations po
      JOIN public.sessions s ON s.id=po.session_id
      WHERE po.user_id IS DISTINCT FROM s.user_id) THEN
    RAISE EXCEPTION 'Tenant preflight failed: reconcile memberships or cross-company references';
  END IF;
END $$;

CREATE TABLE public.tenant_user_bindings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id),
  UNIQUE(user_id, account_id)
);
ALTER TABLE public.tenant_user_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_user_bindings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.tenant_user_bindings TO service_role;
INSERT INTO public.tenant_user_bindings(user_id,account_id)
  SELECT user_id,account_id FROM public.account_users;
ALTER TABLE public.account_users ADD CONSTRAINT one_company_per_login UNIQUE(user_id);

CREATE FUNCTION public.bind_tenant_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE bound uuid;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR
                         NEW.account_id IS DISTINCT FROM OLD.account_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Company membership cannot be transferred.';
  END IF;
  INSERT INTO public.tenant_user_bindings(user_id,account_id)
    VALUES(NEW.user_id,NEW.account_id) ON CONFLICT(user_id) DO NOTHING;
  SELECT account_id INTO bound FROM public.tenant_user_bindings WHERE user_id=NEW.user_id;
  IF bound IS DISTINCT FROM NEW.account_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Company membership cannot be transferred.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bind_tenant_membership() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER bind_tenant_membership BEFORE INSERT OR UPDATE ON public.account_users
  FOR EACH ROW EXECUTE FUNCTION public.bind_tenant_membership();

ALTER TABLE public.routes ADD COLUMN account_id uuid REFERENCES public.accounts(id);
UPDATE public.routes r SET account_id=b.account_id FROM public.tenant_user_bindings b WHERE b.user_id=r.user_id;
ALTER TABLE public.routes ALTER COLUMN account_id SET NOT NULL;
CREATE INDEX routes_account_date ON public.routes(account_id,delivery_date);

-- Service-side authority is rechecked within picking transactions, not taken
-- from a cached/supplied teammate list. Share locks serialize membership revocation.
CREATE FUNCTION public.tenant_account_for_user(p_user_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tenant uuid;
BEGIN
  SELECT a.account_id INTO tenant FROM public.account_users a
    JOIN public.tenant_user_bindings b USING(user_id,account_id)
    WHERE a.user_id=p_user_id FOR SHARE OF a;
  IF tenant IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not available on this account.';
  END IF;
  RETURN tenant;
END $$;
REVOKE ALL ON FUNCTION public.tenant_account_for_user(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_account_for_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_picking_account(p_user_id uuid)
RETURNS TABLE(account_id uuid, team_user_ids uuid[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tenant uuid;
BEGIN
  tenant := public.tenant_account_for_user(p_user_id);
  RETURN QUERY
    SELECT tenant, array_agg(a.user_id ORDER BY a.user_id)
    FROM public.account_users a
    JOIN public.tenant_user_bindings b USING(user_id,account_id)
    WHERE a.account_id=tenant;
END $$;
REVOKE ALL ON FUNCTION public.resolve_picking_account(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_picking_account(uuid) TO service_role;

CREATE FUNCTION public.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT a.account_id FROM public.account_users a JOIN public.tenant_user_bindings b USING(user_id,account_id)
  WHERE a.user_id=auth.uid()
$$;
REVOKE ALL ON FUNCTION public.current_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO anon,authenticated,service_role;

CREATE FUNCTION public.tenant_can_access_route(p_route_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM public.routes r WHERE r.id=p_route_id AND r.account_id=public.current_tenant_id())
$$;
CREATE FUNCTION public.tenant_can_access_machine(p_machine_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM public.machines m JOIN public.routes r ON r.id=m.route_id
    WHERE m.id=p_machine_id AND r.account_id=public.current_tenant_id())
$$;
REVOKE ALL ON FUNCTION public.tenant_can_access_route(uuid), public.tenant_can_access_machine(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_can_access_route(uuid), public.tenant_can_access_machine(uuid) TO anon,authenticated,service_role;

CREATE FUNCTION public.guard_route_tenant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tenant uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Route company ownership is permanent.';
  END IF;
  IF TG_OP='INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    tenant := public.tenant_account_for_user(NEW.user_id);
    IF NEW.account_id IS NULL THEN NEW.account_id := tenant; END IF;
    IF NEW.account_id IS DISTINCT FROM tenant THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not available on this account.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_route_tenant() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_route_tenant BEFORE INSERT OR UPDATE ON public.routes
  FOR EACH ROW EXECUTE FUNCTION public.guard_route_tenant();

-- Reparenting existing work can silently move customer data and invalidate
-- active picking references. Create reviewed replacement records instead.
CREATE FUNCTION public.guard_picking_parent() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF (TG_TABLE_NAME='machines' AND to_jsonb(NEW)->'route_id' IS DISTINCT FROM to_jsonb(OLD)->'route_id') OR
     (TG_TABLE_NAME='items' AND to_jsonb(NEW)->'machine_id' IS DISTINCT FROM to_jsonb(OLD)->'machine_id') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Picking work cannot be moved between parents.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_picking_parent() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_machine_parent BEFORE UPDATE OF route_id ON public.machines
  FOR EACH ROW EXECUTE FUNCTION public.guard_picking_parent();
CREATE TRIGGER guard_item_parent BEFORE UPDATE OF machine_id ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.guard_picking_parent();

CREATE FUNCTION public.guard_picking_reference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tenant uuid; target uuid; route_tenant uuid;
BEGIN
  tenant := public.tenant_account_for_user(NEW.user_id);
  IF TG_TABLE_NAME='sessions' THEN
    IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Session owner cannot be changed.';
    END IF;
    target := NEW.current_route_id;
    IF NEW.current_machine_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM public.machines WHERE id=NEW.current_machine_id AND route_id=target) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not available on this account.';
    END IF;
  ELSE
    target := NEW.route_id;
    IF NEW.assigned_by IS NOT NULL AND public.tenant_account_for_user(NEW.assigned_by) IS DISTINCT FROM tenant THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not available on this account.';
    END IF;
  END IF;
  IF target IS NOT NULL THEN
    SELECT account_id INTO route_tenant FROM public.routes WHERE id=target;
    IF route_tenant IS DISTINCT FROM tenant THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not available on this account.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_picking_reference() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_session_reference BEFORE INSERT OR UPDATE OF user_id,current_route_id,current_machine_id ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_picking_reference();
CREATE TRIGGER guard_assignment_reference BEFORE INSERT OR UPDATE ON public.route_assignments
  FOR EACH ROW EXECUTE FUNCTION public.guard_picking_reference();

-- The public API no longer supplies its cached team list to mutation functions.
-- These overloads lock the caller's current membership, validate the session's
-- route against the immutable company, then invoke the reviewed transition.
CREATE FUNCTION public.authorized_picking_route_owner(p_user_id uuid,p_session_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tenant uuid; owner_id uuid;
BEGIN
  tenant := public.tenant_account_for_user(p_user_id);
  SELECT r.user_id INTO owner_id
    FROM public.sessions s JOIN public.routes r ON r.id=s.current_route_id
    WHERE s.id=p_session_id AND s.user_id=p_user_id AND r.account_id=tenant;
  IF owner_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not available on this account.';
  END IF;
  RETURN owner_id;
END $$;
REVOKE ALL ON FUNCTION public.authorized_picking_route_owner(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.authorized_picking_route_owner(uuid,uuid) TO service_role;

CREATE FUNCTION public.picking_context(p_user_id uuid,p_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE owner_id uuid;
BEGIN
  owner_id := public.authorized_picking_route_owner(p_user_id,p_session_id);
  RETURN public.picking_context(p_user_id,ARRAY[owner_id],p_session_id);
END $$;

CREATE FUNCTION public.advance_picking(p_user_id uuid,p_session_id uuid,p_operation_id uuid,
  p_machine_id uuid,p_completed_items integer,p_count integer,p_direction text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE owner_id uuid;
BEGIN
  owner_id := public.authorized_picking_route_owner(p_user_id,p_session_id);
  RETURN public.advance_picking(p_user_id,ARRAY[owner_id],p_session_id,p_operation_id,
    p_machine_id,p_completed_items,p_count,p_direction);
END $$;

CREATE FUNCTION public.transition_picking(p_user_id uuid,p_session_id uuid,p_operation_id uuid,
  p_revision uuid,p_machine_id uuid,p_action text,p_count integer,p_direction text,p_expected jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE owner_id uuid;
BEGIN
  owner_id := public.authorized_picking_route_owner(p_user_id,p_session_id);
  RETURN public.transition_picking(p_user_id,ARRAY[owner_id],p_session_id,p_operation_id,
    p_revision,p_machine_id,p_action,p_count,p_direction,p_expected);
END $$;

-- Keep the previous service-role-only signatures during the staged rollout so
-- the currently deployed API remains available between migration and API deploy.
-- Retire those signatures only after the new API is live and verified.
REVOKE ALL ON FUNCTION public.picking_context(uuid,uuid),
  public.advance_picking(uuid,uuid,uuid,uuid,integer,integer,text),
  public.transition_picking(uuid,uuid,uuid,uuid,uuid,text,integer,text,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.picking_context(uuid,uuid),
  public.advance_picking(uuid,uuid,uuid,uuid,integer,integer,text),
  public.transition_picking(uuid,uuid,uuid,uuid,uuid,text,integer,text,jsonb)
  TO service_role;

-- Restrictive policies cannot be bypassed by an older permissive owner/admin
-- policy. These contain tenant scope without silently broadening role powers.
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_routes_boundary ON public.routes AS RESTRICTIVE FOR ALL TO anon,authenticated
  USING(account_id=public.current_tenant_id()) WITH CHECK(account_id=public.current_tenant_id());
CREATE POLICY tenant_machines_boundary ON public.machines AS RESTRICTIVE FOR ALL TO anon,authenticated
  USING(public.tenant_can_access_route(route_id)) WITH CHECK(public.tenant_can_access_route(route_id));
CREATE POLICY tenant_items_boundary ON public.items AS RESTRICTIVE FOR ALL TO anon,authenticated
  USING(public.tenant_can_access_machine(machine_id)) WITH CHECK(public.tenant_can_access_machine(machine_id));
CREATE POLICY tenant_sessions_boundary ON public.sessions AS RESTRICTIVE FOR ALL TO anon,authenticated
  USING(user_id=auth.uid() AND public.current_tenant_id() IS NOT NULL AND
    (current_route_id IS NULL OR public.tenant_can_access_route(current_route_id)))
  WITH CHECK(user_id=auth.uid() AND public.current_tenant_id() IS NOT NULL AND
    (current_route_id IS NULL OR public.tenant_can_access_route(current_route_id)));
CREATE POLICY tenant_assignments_boundary ON public.route_assignments AS RESTRICTIVE FOR ALL TO anon,authenticated
  USING(public.tenant_can_access_route(route_id)) WITH CHECK(public.tenant_can_access_route(route_id));

NOTIFY pgrst, 'reload schema';
COMMIT;
