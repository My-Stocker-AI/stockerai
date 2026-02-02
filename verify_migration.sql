-- Verify current_item_index removed from public.sessions table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'sessions'
ORDER BY ordinal_position;

-- Expected: Should NOT include current_item_index
-- Should include: id, user_id, session_key, current_route_id, current_machine_id, pick_direction, etc.
