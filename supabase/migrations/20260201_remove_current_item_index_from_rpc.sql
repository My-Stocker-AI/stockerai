-- ============================================================================
-- SYSTEMIC FIX: Remove current_item_index from get_next_item_data RPC
-- ============================================================================
-- Date: 2026-02-01
-- Session: 51
-- Purpose: Fix RPC function to stop querying removed sessions.current_item_index column
--
-- Context:
-- - Migration 345fc92 removed sessions.current_item_index column from database
-- - RPC function still tries to SELECT this column → "column does not exist" error
-- - Causing 500 errors in Edge Function (execution 28685)
-- - Blocking ALL workflows that use get-next-item-data Edge Function
--
-- Fix:
-- - DROP existing function (return type changed)
-- - CREATE new function without current_item_index
-- - System now uses ONLY machines.completed_items for progress tracking
-- ============================================================================

-- Drop existing function (required when changing return type)
DROP FUNCTION IF EXISTS get_next_item_data(UUID);

-- Create updated function without current_item_index
CREATE FUNCTION get_next_item_data(p_user_id UUID)
RETURNS TABLE (
  -- Session fields
  session_id UUID,
  session_key TEXT,
  user_id UUID,
  current_route_id UUID,
  current_machine_id UUID,
  -- REMOVED: current_item_index INTEGER,  ← Dual-counter eliminated (2026-02-01)
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
  machine_completed_items INTEGER,
  machine_skipped_at_item INTEGER,

  -- Item fields
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
BEGIN
  RETURN QUERY
  SELECT
    -- Session data
    s.id AS session_id,
    s.session_key,
    s.user_id,
    s.current_route_id,
    s.current_machine_id,
    -- REMOVED: s.current_item_index,  ← Column no longer exists
    s.status,
    s.pick_direction,
    s.created_at AS session_created_at,
    s.updated_at AS session_updated_at,

    -- Machine data
    m.id AS machine_id,
    m.route_id,
    m.machine_name,
    m.machine_number,
    m.location_name,
    m.sequence AS machine_sequence,
    m.status AS machine_status,
    m.total_items AS machine_total_items,
    m.completed_items AS machine_completed_items,
    m.skipped_at_item AS machine_skipped_at_item,

    -- Item data
    i.id AS item_id,
    i.product_name,
    i.quantity,
    i.slot,
    i.sequence AS item_sequence,
    i.status AS item_status,
    i.inventory_current,
    i.inventory_parlevel
  FROM sessions s
  LEFT JOIN machines m ON m.route_id = s.current_route_id
  LEFT JOIN items i ON i.machine_id = m.id
  WHERE s.user_id = p_user_id
    AND s.status = 'stocking'
  ORDER BY s.created_at DESC, m.sequence ASC, i.sequence ASC
  LIMIT 100;
END;
$$;

-- Restore permissions
GRANT EXECUTE ON FUNCTION get_next_item_data(UUID) TO anon, authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify function recreated
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_name = 'get_next_item_data'
  ) THEN
    RAISE EXCEPTION 'Function get_next_item_data not found';
  END IF;

  RAISE NOTICE 'SUCCESS: get_next_item_data recreated - current_item_index removed';
END $$;

-- Update function comment
COMMENT ON FUNCTION get_next_item_data IS 'Consolidates Get Session + Get Machines + Get Items queries. Updated 2026-02-01: Removed current_item_index (dual-counter architecture eliminated). Progress now tracked via machines.completed_items only.';

-- ============================================================================
-- TESTING
-- ============================================================================

-- Test function executes without "column does not exist" error
DO $$
DECLARE
  v_test_user_id UUID := 'bdc96b72-3f35-4cae-9e79-99473eb4a23b';
  v_row_count INTEGER;
  v_has_session BOOLEAN;
  v_has_machine BOOLEAN;
  v_has_completed_items BOOLEAN;
BEGIN
  -- Count rows returned
  SELECT COUNT(*) INTO v_row_count
  FROM get_next_item_data(v_test_user_id);

  -- Check session data returned
  SELECT EXISTS (
    SELECT 1 FROM get_next_item_data(v_test_user_id)
    WHERE session_id IS NOT NULL
    LIMIT 1
  ) INTO v_has_session;

  -- Check machine data returned
  SELECT EXISTS (
    SELECT 1 FROM get_next_item_data(v_test_user_id)
    WHERE machine_id IS NOT NULL
    LIMIT 1
  ) INTO v_has_machine;

  -- Verify completed_items field exists and is accessible
  SELECT EXISTS (
    SELECT 1 FROM get_next_item_data(v_test_user_id)
    WHERE machine_completed_items IS NOT NULL
    LIMIT 1
  ) INTO v_has_completed_items;

  -- Report results
  RAISE NOTICE '=== RPC Function Test Results ===';
  RAISE NOTICE 'Rows returned: %', v_row_count;
  RAISE NOTICE 'Has session data: %', v_has_session;
  RAISE NOTICE 'Has machine data: %', v_has_machine;
  RAISE NOTICE 'Has completed_items: %', v_has_completed_items;

  -- Verify no errors
  IF v_row_count = 0 THEN
    RAISE WARNING 'No rows returned - user may not have active session';
  ELSIF NOT v_has_session THEN
    RAISE EXCEPTION 'Session data missing from RPC output';
  ELSIF NOT v_has_machine THEN
    RAISE EXCEPTION 'Machine data missing from RPC output';
  ELSIF NOT v_has_completed_items THEN
    RAISE EXCEPTION 'completed_items field missing or NULL';
  ELSE
    RAISE NOTICE '✅ ALL TESTS PASSED - RPC function working correctly';
  END IF;
END $$;

-- ============================================================================
-- MANUAL VERIFICATION QUERIES
-- ============================================================================

-- Query 1: Verify function returns data without errors
SELECT
  session_id,
  current_route_id,
  current_machine_id,
  machine_completed_items,
  machine_total_items,
  product_name
FROM get_next_item_data('bdc96b72-3f35-4cae-9e79-99473eb4a23b')
LIMIT 5;

-- Query 2: Verify completed_items is accessible
SELECT
  machine_name,
  machine_completed_items,
  machine_total_items,
  machine_status
FROM get_next_item_data('bdc96b72-3f35-4cae-9e79-99473eb4a23b')
WHERE machine_id IS NOT NULL
LIMIT 5;

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================

-- To rollback, restore previous version:
-- DROP FUNCTION get_next_item_data(UUID);
-- Then re-run migration: 20260125_update_get_next_item_data_rpc.sql

-- ============================================================================
-- SUMMARY
-- ============================================================================

-- ✅ Dropped old function (return type change requires DROP)
-- ✅ Created new function without current_item_index
-- ✅ Restored GRANT permissions for anon and authenticated
-- ✅ Function now queries only existing columns
-- ✅ Progress tracking via machines.completed_items (single source of truth)
-- ✅ Verification tests included
-- ✅ Backward compatible with Edge Function (already updated)

-- IMPACT:
-- - Fixes 500 errors in get-next-item-data Edge Function
-- - Unblocks get_next_item workflow
-- - Unblocks start_machine workflow
-- - Enables Synta batch workflow fixes to proceed

-- NEXT STEP: Fix 6 workflows via Synta batch operations
