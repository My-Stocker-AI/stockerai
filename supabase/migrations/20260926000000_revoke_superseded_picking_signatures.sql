-- The deployed API uses the tenant-resolving overloads introduced in
-- 20260925000000_tenant_route_ownership.sql.  Keep the array-based functions
-- as private implementation details for those SECURITY DEFINER wrappers, but
-- stop external service-role callers from supplying their own authority list.
BEGIN;

REVOKE EXECUTE ON FUNCTION public.picking_context(uuid, uuid[], uuid)
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.advance_picking(
  uuid, uuid[], uuid, uuid, uuid, integer, integer, text
) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.transition_picking(
  uuid, uuid[], uuid, uuid, uuid, uuid, text, integer, text, jsonb
) FROM service_role;

COMMIT;
