-- FIND SEQUENCE=32 ANYWHERE IN CURRENT ROUTE
-- This checks if sequence=32 was misplaced on wrong machine
-- Date: 2026-02-08

WITH
  current_session AS (
    SELECT route_id
    FROM sessions
    WHERE status IN ('active', 'in_progress')
    ORDER BY updated_at DESC
    LIMIT 1
  )

SELECT
  'SEQUENCE 32 SEARCH RESULTS' as header,
  m.sequence as machine_sequence,
  m.name as machine_name,
  i.sequence as item_sequence,
  i.product_name,
  i.par_level,
  i.status as item_status
FROM items i
JOIN machines m ON i.machine_id = m.id
JOIN current_session cs ON m.route_id = cs.route_id
WHERE i.sequence = 32
ORDER BY m.sequence;

-- If no results, sequence=32 doesn't exist anywhere in the current route
