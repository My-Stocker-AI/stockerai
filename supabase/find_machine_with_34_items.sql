-- Find the machine that has 34 items and reverse direction
-- This will help us identify Machine 3 even without session
-- Date: 2026-02-08

SELECT
  'MACHINES WITH 34 ITEMS' as section,
  m.id as machine_id,
  m.name,
  m.sequence,
  m.total_items,
  m.completed_items,
  m.status,
  m.pick_direction,
  r.name as route_name,
  r.scheduled_date
FROM machines m
LEFT JOIN routes r ON m.route_id = r.id
WHERE m.total_items = 34
ORDER BY m.created_at DESC
LIMIT 5;

-- Check items for that machine
SELECT
  'ITEMS COUNT BY MACHINE (34-item machines)' as section,
  i.machine_id,
  COUNT(*) as actual_item_count,
  MIN(i.sequence) as min_seq,
  MAX(i.sequence) as max_seq,
  COUNT(DISTINCT i.sequence) as unique_sequences
FROM items i
WHERE i.machine_id IN (
  SELECT m.id FROM machines m WHERE m.total_items = 34
)
GROUP BY i.machine_id;

-- Check if sequence 32 exists anywhere
SELECT
  'SEQUENCE 32 ANYWHERE' as section,
  i.machine_id,
  i.sequence,
  i.product_name,
  m.name as machine_name,
  m.sequence as machine_sequence_in_route
FROM items i
LEFT JOIN machines m ON i.machine_id = m.id
WHERE i.sequence = 32
LIMIT 10;
