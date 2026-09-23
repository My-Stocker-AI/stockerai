-- Apply only after upgrading legacy Edge callers. The Python API uses service_role.
-- Exact signatures from the inspected catalog; a missing function aborts the transaction.
BEGIN;
REVOKE ALL ON FUNCTION public.get_next_item_and_increment(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_next_item_data(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_machine_items(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_next_item(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_routes_for_date(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_session_with_lock(uuid, integer, integer, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_item_and_increment(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_next_item_data(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_machine_items(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_next_item(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_routes_for_date(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_session_with_lock(uuid, integer, integer, uuid, text) TO service_role;
COMMIT;
