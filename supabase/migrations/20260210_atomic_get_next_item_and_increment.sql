-- ============================================================================
-- ATOMIC GET NEXT ITEM AND INCREMENT
-- ============================================================================
-- Date: 2026-02-10
-- Purpose: Eliminate TOCTOU race condition by combining read + calculate + increment
--          in single atomic transaction with row-level locking
--
-- Replaces: n8n "Determine Next State" + "Increment Completed Items"
-- Impact: Moves business logic from n8n to database (correct architecture)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_next_item_and_increment(
  p_user_id UUID,
  p_count INTEGER DEFAULT 1
)
RETURNS TABLE (
  -- Action type
  action TEXT,

  -- Item data (for action='next_item')
  product_name TEXT,
  quantity INTEGER,
  slot TEXT,
  slot_spoken TEXT,
  product_name2 TEXT,
  quantity2 INTEGER,
  slot2 TEXT,
  slot_spoken2 TEXT,
  inventory_current INTEGER,
  inventory_parlevel INTEGER,
  inventory_current2 INTEGER,
  inventory_parlevel2 INTEGER,
  items_remaining INTEGER,
  completed_items INTEGER,
  items_to_increment INTEGER,
  new_completed_items INTEGER,
  total_items INTEGER,
  machine_id UUID,
  machine_name TEXT,
  item_index INTEGER,

  -- Machine transition data (for action='next_machine')
  completed_machine TEXT,
  completed_machine_number INTEGER,
  completed_location TEXT,
  next_machine_id UUID,
  next_machine TEXT,
  next_machine_number INTEGER,
  next_location TEXT,
  returning_to_skipped BOOLEAN,

  -- Completion data (for action='complete')
  completed_route TEXT,
  total_routes INTEGER,

  -- Session state updates
  new_item_index INTEGER,
  new_machine_id UUID,
  new_route_id UUID,
  session_record_id UUID,
  new_status TEXT,
  machine_complete BOOLEAN,
  route_complete BOOLEAN,
  session_complete BOOLEAN,

  -- Expected state for optimistic locking
  original_item_index INTEGER,
  expected_index INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
  v_current_machine RECORD;
  v_next_item RECORD;
  v_item2 RECORD;
  v_next_machine RECORD;
  v_first_skipped RECORD;
  v_target_sequence INTEGER;
  v_new_index INTEGER;
  v_items_available INTEGER;
  v_items_to_increment INTEGER;
  v_new_completed_items INTEGER;
  v_new_items_remaining INTEGER;
  v_item2_sequence INTEGER;
BEGIN
  -- Step 1: Get session with active stocking status
  SELECT
    id,
    current_machine_id,
    current_route_id,
    pick_direction
  INTO v_session
  FROM sessions
  WHERE user_id = p_user_id
    AND status = 'stocking'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active session found for user';
  END IF;

  -- Step 2: Get current machine WITH ROW LOCK (prevents concurrent modifications)
  SELECT
    m.id,
    m.machine_name,
    m.machine_number,
    m.location_name,
    m.sequence,
    m.status,
    m.completed_items,
    m.total_items
  INTO v_current_machine
  FROM machines m
  WHERE m.id = v_session.current_machine_id
  FOR UPDATE;  -- CRITICAL: Locks the row until transaction commits

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Current machine not found: %', v_session.current_machine_id;
  END IF;

  -- Step 3: Check if machine is complete (all items picked)
  IF v_current_machine.completed_items >= v_current_machine.total_items THEN
    -- Find next machine in sequence
    SELECT
      m.id,
      m.machine_name,
      m.machine_number,
      m.location_name,
      m.sequence,
      m.status
    INTO v_next_machine
    FROM machines m
    WHERE m.route_id = v_session.current_route_id
      AND m.sequence > v_current_machine.sequence
      AND m.status NOT IN ('skipped', 'completed')
    ORDER BY m.sequence ASC
    LIMIT 1;

    IF FOUND THEN
      -- Next machine exists
      RETURN QUERY SELECT
        'next_machine'::TEXT,
        NULL::TEXT, NULL::INTEGER, NULL::TEXT, NULL::TEXT,
        NULL::TEXT, NULL::INTEGER, NULL::TEXT, NULL::TEXT,
        NULL::INTEGER, NULL::INTEGER, NULL::INTEGER, NULL::INTEGER,
        NULL::INTEGER,
        v_current_machine.completed_items,
        NULL::INTEGER,
        v_current_machine.completed_items,
        v_current_machine.total_items,
        NULL::UUID,
        NULL::TEXT,
        NULL::INTEGER,
        v_current_machine.machine_name,
        v_current_machine.machine_number,
        v_current_machine.location_name,
        v_next_machine.id,
        v_next_machine.machine_name,
        v_next_machine.machine_number,
        v_next_machine.location_name,
        FALSE,
        NULL::TEXT,
        NULL::INTEGER,
        0, -- new_item_index
        v_next_machine.id, -- new_machine_id
        v_session.current_route_id,
        v_session.id,
        NULL::TEXT,
        TRUE, -- machine_complete
        FALSE, -- route_complete
        FALSE, -- session_complete
        0, -- original_item_index
        0; -- expected_index
      RETURN;
    END IF;

    -- Check for skipped machines
    SELECT
      m.id,
      m.machine_name,
      m.machine_number,
      m.location_name
    INTO v_first_skipped
    FROM machines m
    WHERE m.route_id = v_session.current_route_id
      AND m.status = 'skipped'
    ORDER BY m.sequence ASC
    LIMIT 1;

    IF FOUND THEN
      -- Return to first skipped machine
      RETURN QUERY SELECT
        'next_machine'::TEXT,
        NULL::TEXT, NULL::INTEGER, NULL::TEXT, NULL::TEXT,
        NULL::TEXT, NULL::INTEGER, NULL::TEXT, NULL::TEXT,
        NULL::INTEGER, NULL::INTEGER, NULL::INTEGER, NULL::INTEGER,
        NULL::INTEGER,
        v_current_machine.completed_items,
        NULL::INTEGER,
        v_current_machine.completed_items,
        v_current_machine.total_items,
        NULL::UUID,
        NULL::TEXT,
        NULL::INTEGER,
        v_current_machine.machine_name,
        v_current_machine.machine_number,
        v_current_machine.location_name,
        v_first_skipped.id,
        v_first_skipped.machine_name,
        v_first_skipped.machine_number,
        v_first_skipped.location_name,
        TRUE, -- returning_to_skipped
        NULL::TEXT,
        NULL::INTEGER,
        0,
        v_first_skipped.id,
        v_session.current_route_id,
        v_session.id,
        NULL::TEXT,
        TRUE,
        FALSE,
        FALSE,
        0,
        0;
      RETURN;
    END IF;

    -- Route complete
    RETURN QUERY SELECT
      'complete'::TEXT,
      NULL::TEXT, NULL::INTEGER, NULL::TEXT, NULL::TEXT,
      NULL::TEXT, NULL::INTEGER, NULL::TEXT, NULL::TEXT,
      NULL::INTEGER, NULL::INTEGER, NULL::INTEGER, NULL::INTEGER,
      NULL::INTEGER,
      v_current_machine.completed_items,
      NULL::INTEGER,
      v_current_machine.completed_items,
      v_current_machine.total_items,
      NULL::UUID,
      NULL::TEXT,
      NULL::INTEGER,
      NULL::TEXT, NULL::INTEGER, NULL::TEXT,
      NULL::UUID, NULL::TEXT, NULL::INTEGER, NULL::TEXT,
      FALSE,
      'Route'::TEXT,
      1,
      v_current_machine.completed_items,
      v_session.current_machine_id,
      v_session.current_route_id,
      v_session.id,
      'completed'::TEXT,
      TRUE,
      TRUE,
      TRUE,
      v_current_machine.completed_items,
      v_current_machine.completed_items;
    RETURN;
  END IF;

  -- Step 4: Calculate target sequence based on pick direction
  IF v_session.pick_direction = 'forward' THEN
    v_target_sequence := v_current_machine.completed_items + 1;
  ELSE
    v_target_sequence := v_current_machine.total_items - v_current_machine.completed_items;
  END IF;

  -- Step 5: Get next item(s)
  SELECT
    items.id,
    items.product_name,
    items.quantity,
    items.slot,
    items.sequence,
    items.inventory_current,
    items.inventory_parlevel
  INTO v_next_item
  FROM items
  WHERE items.machine_id = v_current_machine.id
    AND items.sequence = v_target_sequence
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found but machine incomplete. targetSequence=%, completed=%/%, direction=%',
      v_target_sequence,
      v_current_machine.completed_items,
      v_current_machine.total_items,
      v_session.pick_direction;
  END IF;

  v_new_index := v_target_sequence;
  v_item2 := NULL;

  -- Get second item if count=2
  IF p_count = 2 THEN
    IF v_session.pick_direction = 'reverse' THEN
      v_item2_sequence := v_target_sequence - 1;
    ELSE
      v_item2_sequence := v_target_sequence + 1;
    END IF;

    SELECT
      items.id,
      items.product_name,
      items.quantity,
      items.slot,
      items.sequence,
      items.inventory_current,
      items.inventory_parlevel
    INTO v_item2
    FROM items
    WHERE items.machine_id = v_current_machine.id
      AND items.sequence = v_item2_sequence
    LIMIT 1;

    IF FOUND THEN
      v_new_index := v_item2_sequence;
    END IF;
  END IF;

  -- Step 6: Calculate increment amount
  v_items_available := v_current_machine.total_items - v_current_machine.completed_items;
  v_items_to_increment := LEAST(p_count, v_items_available);
  v_new_completed_items := v_current_machine.completed_items + v_items_to_increment;
  v_new_items_remaining := v_current_machine.total_items - v_new_completed_items;

  -- Step 7: ATOMIC INCREMENT (within same transaction as SELECT FOR UPDATE)
  UPDATE machines
  SET completed_items = v_new_completed_items
  WHERE id = v_current_machine.id;

  -- Step 8: Return next_item data
  IF v_item2 IS NOT NULL THEN
    -- 2-pick mode: both items available
    RETURN QUERY SELECT
      'next_item'::TEXT,
      v_next_item.product_name,
      v_next_item.quantity,
      v_next_item.slot,
      NULL::TEXT,
      v_item2.product_name,
      v_item2.quantity,
      v_item2.slot,
      NULL::TEXT,
      COALESCE(v_next_item.inventory_current, 0),
      COALESCE(v_next_item.inventory_parlevel, 0),
      COALESCE(v_item2.inventory_current, 0),
      COALESCE(v_item2.inventory_parlevel, 0),
      v_new_items_remaining,
      v_current_machine.completed_items,
      v_items_to_increment,
      v_new_completed_items,
      v_current_machine.total_items,
      v_current_machine.id,
      v_current_machine.machine_name,
      v_new_index,
      NULL::TEXT, NULL::INTEGER, NULL::TEXT,
      NULL::UUID, NULL::TEXT, NULL::INTEGER, NULL::TEXT,
      FALSE,
      NULL::TEXT,
      NULL::INTEGER,
      v_new_index,
      v_current_machine.id,
      v_session.current_route_id,
      v_session.id,
      NULL::TEXT,
      FALSE,
      FALSE,
      FALSE,
      v_current_machine.completed_items,
      v_current_machine.completed_items;
  ELSE
    -- 1-pick mode: only item1, item2 fields are NULL
    RETURN QUERY SELECT
      'next_item'::TEXT,
      v_next_item.product_name,
      v_next_item.quantity,
      v_next_item.slot,
      NULL::TEXT,
      NULL::TEXT,
      NULL::INTEGER,
      NULL::TEXT,
      NULL::TEXT,
      COALESCE(v_next_item.inventory_current, 0),
      COALESCE(v_next_item.inventory_parlevel, 0),
      0,
      0,
      v_new_items_remaining,
      v_current_machine.completed_items,
      v_items_to_increment,
      v_new_completed_items,
      v_current_machine.total_items,
      v_current_machine.id,
      v_current_machine.machine_name,
      v_new_index,
      NULL::TEXT, NULL::INTEGER, NULL::TEXT,
      NULL::UUID, NULL::TEXT, NULL::INTEGER, NULL::TEXT,
      FALSE,
      NULL::TEXT,
      NULL::INTEGER,
      v_new_index,
      v_current_machine.id,
      v_session.current_route_id,
      v_session.id,
      NULL::TEXT,
      FALSE,
      FALSE,
      FALSE,
      v_current_machine.completed_items,
      v_current_machine.completed_items;
  END IF;
END;
$$;

COMMENT ON FUNCTION get_next_item_and_increment IS
  'Atomically calculates next item and increments completed_items counter. ' ||
  'Uses FOR UPDATE lock to prevent race conditions. ' ||
  'Replaces n8n "Determine Next State" + "Increment Completed Items" logic.';

-- ============================================================================
-- TESTING
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE 'SUCCESS: Created get_next_item_and_increment function';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Deploy migration: supabase db push';
  RAISE NOTICE '  2. Update Edge Function to call new RPC';
  RAISE NOTICE '  3. Simplify n8n workflow';
END $$;
