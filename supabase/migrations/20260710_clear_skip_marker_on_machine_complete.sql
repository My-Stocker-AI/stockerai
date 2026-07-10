-- Clear skipped_at_item when the RPC marks a machine completed (branch 2d, 2026-07-10).
-- A machine that finishes is no longer skipped; leaving a stale skip marker made it look like
-- a permanent go-back resume and could re-arm the phantom-reset logic. This CREATE OR REPLACE
-- is identical to 20260710_guard_get_next_item_requires_in_progress.sql except the completed-
-- machine UPDATE now also sets skipped_at_item = NULL. (Resume/complete both clear the marker;
-- the Python routes clear it on start-machine and on the get_next_item completion path too.)
-- Apply to prod via management API on deploy; captured here for version control.

CREATE OR REPLACE FUNCTION public.get_next_item_and_increment(p_user_id uuid, p_count integer DEFAULT 1)
 RETURNS TABLE(action text, product_name text, quantity integer, slot text, slot_spoken text, product_name2 text, quantity2 integer, slot2 text, slot_spoken2 text, inventory_current integer, inventory_parlevel integer, inventory_current2 integer, inventory_parlevel2 integer, items_remaining integer, completed_items integer, items_to_increment integer, new_completed_items integer, total_items integer, machine_id uuid, machine_name text, item_index integer, completed_machine text, completed_machine_number integer, completed_location text, next_machine_id uuid, next_machine text, next_machine_number integer, next_location text, returning_to_skipped boolean, completed_route text, total_routes integer, new_item_index integer, new_machine_id uuid, new_route_id uuid, session_record_id uuid, new_status text, machine_complete boolean, route_complete boolean, session_complete boolean, original_item_index integer, expected_index integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

    -- Step 2: Get current machine WITH ROW LOCK
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
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Current machine not found: %', v_session.current_machine_id;
    END IF;


    -- GUARD (2026-07-10, Davy North walk): the count may only advance a machine that is
    -- actually being stocked. An out-of-order get-next-item fired BEFORE start-machine and
    -- advanced a still-'pending' machine's completed_items, leaving a phantom count that then
    -- skipped items. Refuse to advance a machine that has not been started — the caller must
    -- run start-machine (which sets status='in_progress') first.
    IF v_current_machine.status <> 'in_progress' THEN
      RAISE EXCEPTION 'Machine % is % (not in_progress); start-machine must run before get-next-item', v_current_machine.id, v_current_machine.status;
    END IF;

    -- Step 3: Check if machine is complete
    IF v_current_machine.completed_items >= v_current_machine.total_items THEN
      -- Mark current machine as completed
      -- branch 2d: a completed machine is no longer 'skipped' — clear the marker so a
      -- future resume/re-skip can't be misled by a stale value.
      UPDATE machines SET status = 'completed', skipped_at_item = NULL WHERE id = v_current_machine.id;

      -- Find next machine in sequence (exclude skipped AND completed)
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
          0,
          v_next_machine.id,
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
          TRUE,
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

    -- Step 6: Calculate increment
    v_items_available := v_current_machine.total_items - v_current_machine.completed_items;
    v_items_to_increment := LEAST(p_count, v_items_available);
    v_new_completed_items := v_current_machine.completed_items + v_items_to_increment;
    v_new_items_remaining := v_current_machine.total_items - v_new_completed_items;

    -- Step 7: ATOMIC INCREMENT
    UPDATE machines
    SET completed_items = v_new_completed_items
    WHERE id = v_current_machine.id;

    -- Step 8: Return next_item data
    IF v_item2 IS NOT NULL THEN
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
  $function$
