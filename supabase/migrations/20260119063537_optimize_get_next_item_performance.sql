-- PERFORMANCE FIX: Only join items from current machine (not all machines)
-- Problem: Was returning 100+ rows (all items from all machines), filtering to ~20 client-side
-- Solution: Only join items WHERE machine_id = current_machine_id
-- Expected improvement: 80% reduction in result set size, faster query execution

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
  LEFT JOIN items i ON i.machine_id = m.id AND m.id = s.current_machine_id  -- PERFORMANCE FIX: Only current machine items
  WHERE s.user_id = p_user_id
    AND s.status = 'stocking'
  ORDER BY s.created_at DESC, m.sequence ASC, i.sequence ASC
  LIMIT 100;
END;
$$;

COMMENT ON FUNCTION get_next_item_data IS 'Performance optimized: only joins items from current machine (not all machines in route)';
