-- The route-name completion repair recreated the array-authority implementation
-- and inadvertently restored direct service-role execution. The deployed API
-- uses the tenant-resolving overload; keep the array form private so callers
-- cannot supply their own authority list.
BEGIN;

REVOKE EXECUTE ON FUNCTION public.advance_picking(
  uuid, uuid[], uuid, uuid, uuid, integer, integer, text
) FROM service_role;

COMMIT;
