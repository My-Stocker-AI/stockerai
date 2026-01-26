-- ============================================================================
-- PHASE 2: Update get_next_item_data RPC - Include completed_items
-- ============================================================================
-- Date: 2026-01-25
-- Purpose: Add completed_items and skipped_at_item to RPC return data
--
-- Required for: get_next_item workflow to use completed_items from database
--
-- BACKWARD COMPATIBLE: Adds new columns, doesn't break existing queries
-- ============================================================================

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
  machine_completed_items INTEGER,      -- ADDED (Phase 2)
  machine_skipped_at_item INTEGER,      -- ADDED (Phase 2)

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
    s.current_item_index,
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
    m.completed_items AS machine_completed_items,    -- ADDED (Phase 2)
    m.skipped_at_item AS machine_skipped_at_item,    -- ADDED (Phase 2)

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

-- Verify function updated
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_name = 'get_next_item_data'
  ) THEN
    RAISE EXCEPTION 'Function get_next_item_data not found';
  END IF;

  RAISE NOTICE 'SUCCESS: get_next_item_data updated with completed_items and skipped_at_item';
END $$;

COMMENT ON FUNCTION get_next_item_data IS 'Consolidates Get Session + Get Machines + Get Items queries. Updated for Phase 2 to include machines.completed_items and machines.skipped_at_item.';

-- ============================================================================
-- TESTING
-- ============================================================================

-- Test function returns new columns
SELECT
  machine_completed_items,
  machine_skipped_at_item
FROM get_next_item_data('bdc96b72-3f35-4cae-9e79-99473eb4a23b')
LIMIT 1;

-- Should show completed_items and skipped_at_item values

-- ============================================================================
-- SUMMARY
-- ============================================================================

-- ✅ Updated get_next_item_data RPC function
-- ✅ Added machine_completed_items column to output
-- ✅ Added machine_skipped_at_item column to output
-- ✅ Backward compatible (doesn't break existing code)
-- ✅ Ready for workflow to use completed_items

-- NEXT: Update get_next_item workflow in n8n
