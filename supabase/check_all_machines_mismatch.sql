-- Check if OTHER machines have the same total_items mismatch
-- Date: 2026-02-08

SELECT
  m.id as machine_id,
  m.name as machine_name,
  m.sequence as machine_order,
  m.total_items as total_items_field,
  COUNT(i.id) as actual_items_in_db,
  (m.total_items - COUNT(i.id)) as difference,
  CASE
    WHEN m.total_items = COUNT(i.id) THEN '✅ OK'
    ELSE '❌ MISMATCH - NEEDS FIX'
  END as status
FROM machines m
LEFT JOIN items i ON m.id = i.machine_id
WHERE m.route_id = (
  SELECT route_id FROM machines WHERE id = 'd375ff94-fb1a-4652-abfb-0b408e0925f5'
)
GROUP BY m.id, m.name, m.sequence, m.total_items
ORDER BY m.sequence;
