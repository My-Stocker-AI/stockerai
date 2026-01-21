-- DEFENSIVE FIX: Handle NULL current_route_id gracefully
-- Bug: When current_route_id is NULL, JOIN fails and returns 0 rows
-- This causes "machine complete" false positives and premature route completion
--
-- Root Cause: skip_current_machine workflow wasn't preserving current_route_id
-- This fix: Defensive measure - fall back to machine's route_id if session route_id is NULL
--
-- Impact: Prevents data loss even if workflows fail to preserve route_id
-- Risk: LOW (only changes fallback behavior, doesn't affect normal flow)

CREATE OR REPLACE FUNCTION get_next_item_data(p_user_id UUID)
RETURNS TABLE (
  -- Session fields
  session_id UUID,
  session_key TEXT,
  user_id UUID,
  current_route_id UUID,
  current_machine_id UUID,
  current_item_index INTEGER,
  status TEXT,
  pick_direction TEXT,
  session_created_at TIMESTAMPTZ,
  session_updated_at TIMESTAMPTZ,

  -- Machine fields
  machine_id UUID,
  route_id UUID,
  machine_name TEXT,
  machine_number INTEGER,
  location_name TEXT,
  machine_sequence INTEGER,
  machine_status TEXT,
  machine_total_items INTEGER,

  -- Item fields (NULL for non-current machines)
  item_id UUID,
  product_name TEXT,
  quantity INTEGER,
  slot TEXT,
  item_sequence INTEGER,
  item_status TEXT,
  inventory_current INTEGER,
  inventory_parlevel INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_route_id UUID;
BEGIN
  -- Get the route_id: prefer session's current_route_id, fall back to current machine's route
  SELECT
    COALESCE(
      s.current_route_id,
      (SELECT m.route_id FROM machines m WHERE m.id = s.current_machine_id LIMIT 1)
    ) INTO v_route_id
  FROM sessions s
  WHERE s.user_id = p_user_id
    AND s.status = 'stocking'
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- If still no route_id, return empty result
  IF v_route_id IS NULL THEN
    RETURN;
  END IF;

  -- Return data using the resolved route_id
  RETURN QUERY
  SELECT
    -- Session data
    s.id AS session_id,
    s.session_key,
    s.user_id,
    s.current_route_id,  -- Return original (may be NULL)
    s.current_machine_id,
    s.current_item_index,
    s.status,
    s.pick_direction,
    s.created_at AS session_created_at,
    s.updated_at AS session_updated_at,

    -- Machine data (ALL machines returned via LEFT JOIN)
    m.id AS machine_id,
    m.route_id,
    m.machine_name,
    m.machine_number,
    m.location_name,
    m.sequence AS machine_sequence,
    m.status AS machine_status,
    m.total_items AS machine_total_items,

    -- Item data (ONLY for current machine, NULL for others)
    i.id AS item_id,
    i.product_name,
    i.quantity,
    i.slot,
    i.sequence AS item_sequence,
    i.status AS item_status,
    i.inventory_current,
    i.inventory_parlevel
  FROM sessions s
  LEFT JOIN machines m ON m.route_id = v_route_id  -- Use resolved route_id
  LEFT JOIN items i ON i.machine_id = m.id AND m.id = s.current_machine_id
  WHERE s.user_id = p_user_id
    AND s.status = 'stocking'
  ORDER BY s.created_at DESC, m.sequence ASC, i.sequence ASC
  LIMIT 100;
END;
$$;

COMMENT ON FUNCTION get_next_item_data IS 'Defensive: gracefully handles NULL current_route_id by falling back to current machine route';

-- Test the defensive behavior
DO $$
DECLARE
  v_test_user_id UUID;
  v_test_route_id UUID;
  v_test_session_id UUID;
  v_machine1_id UUID;
  v_machine2_id UUID;
  v_result_count INTEGER;
BEGIN
  -- Create test data
  v_test_user_id := gen_random_uuid();
  v_test_route_id := gen_random_uuid();
  v_machine1_id := gen_random_uuid();
  v_machine2_id := gen_random_uuid();

  -- Insert test session WITH NULL current_route_id (simulating bug)
  INSERT INTO sessions (id, user_id, session_key, current_route_id, current_machine_id, current_item_index, status)
  VALUES (gen_random_uuid(), v_test_user_id, v_test_user_id || '-test-active', NULL, v_machine1_id, 0, 'stocking')
  RETURNING id INTO v_test_session_id;

  -- Insert 2 test machines
  INSERT INTO machines (id, route_id, machine_name, location_name, sequence, status, total_items)
  VALUES
    (v_machine1_id, v_test_route_id, 'Machine 1', 'Location 1', 1, 'pending', 3),
    (v_machine2_id, v_test_route_id, 'Machine 2', 'Location 2', 2, 'pending', 2);

  -- Insert items for machine 1
  INSERT INTO items (machine_id, product_name, quantity, slot, sequence, status)
  VALUES
    (v_machine1_id, 'Test Product 1', 5, '01', 1, 'pending'),
    (v_machine1_id, 'Test Product 2', 3, '02', 2, 'pending');

  -- TEST: Verify function STILL WORKS even with NULL current_route_id
  SELECT COUNT(*) INTO v_result_count
  FROM get_next_item_data(v_test_user_id);

  IF v_result_count > 0 THEN
    RAISE NOTICE '✅ DEFENSIVE FIX TEST PASSED: Returns data even with NULL current_route_id (% rows)', v_result_count;
  ELSE
    RAISE WARNING '❌ DEFENSIVE FIX TEST FAILED: Returned 0 rows with NULL current_route_id';
  END IF;

  -- Cleanup
  DELETE FROM sessions WHERE id = v_test_session_id;
  DELETE FROM items WHERE machine_id IN (v_machine1_id, v_machine2_id);
  DELETE FROM machines WHERE id IN (v_machine1_id, v_machine2_id);
END;
$$;
