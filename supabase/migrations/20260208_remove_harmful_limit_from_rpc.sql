-- ============================================================================
-- FIX: Remove harmful LIMIT 100 from get_next_item_data RPC
-- ============================================================================
-- Date: 2026-02-08
-- Bug: LIMIT 100 truncates Machine 3 items when Machine 1 + Machine 2 > 75 items
--
-- Symptom: "Item not found but machine incomplete. targetSequence=32"
-- Root cause: RPC joins sessions × machines × items, LIMIT cuts off mid-machine
--
-- Business constraints (per user 2026-02-08):
-- - Max 8 machines per route
-- - Max 60 items per machine
-- - Worst case: 480 rows (well within PostgreSQL limits)
--
-- Solution: Remove LIMIT entirely - it serves no purpose except causing bugs
-- Also removes obsolete fields: current_item_index (dual-counter eliminated), session_key
-- ============================================================================

-- Drop existing function
DROP FUNCTION IF EXISTS get_next_item_data(UUID);

-- Recreate with actual schema (no current_item_index, no session_key)
CREATE OR REPLACE FUNCTION get_next_item_data(p_user_id UUID)
RETURNS TABLE (
  -- Session fields (minimal - only what Edge Function uses)
  session_id UUID,
  user_id UUID,
  current_route_id UUID,
  current_machine_id UUID,
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
    -- Session data (only fields that exist)
    s.id AS session_id,
    s.user_id,
    s.current_route_id,
    s.current_machine_id,
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
  ORDER BY s.created_at DESC, m.sequence ASC, i.sequence ASC;
  -- REMOVED: LIMIT 100 (was causing Machine 3 truncation bug)
END;
$$;

-- Verify function recreated
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_name = 'get_next_item_data'
  ) THEN
    RAISE EXCEPTION 'Function get_next_item_data not found';
  END IF;

  RAISE NOTICE 'SUCCESS: Removed harmful LIMIT 100 from get_next_item_data';
END $$;

COMMENT ON FUNCTION get_next_item_data IS 'Consolidates Get Session + Get Machines + Get Items queries. LIMIT removed (2026-02-08) - was truncating results mid-machine. current_item_index removed (dual-counter eliminated).';

-- ============================================================================
-- TESTING
-- ============================================================================

-- Verify Machine 3 now returns all 34 items (not just 25)
SELECT COUNT(*) as machine3_items
FROM get_next_item_data('bdc96b72-3f35-4cae-9e79-99473eb4a23b')
WHERE machine_id = 'd375ff94-fb1a-4652-abfb-0b408e0925f5'
  AND item_id IS NOT NULL;

-- Expected: 34 (was returning 25 before fix)

-- ============================================================================
-- DEPLOYMENT
-- ============================================================================

-- Run this migration in Supabase SQL Editor
-- Then test: User says "bottom" for Machine 3 in reverse mode
-- Should now find sequence 32 successfully
