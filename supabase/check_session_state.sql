-- Quick check: What machine is the session actually on?
-- Run this to verify session state vs expectation
-- Date: 2026-02-08

SELECT
  s.id as session_id,
  s.current_machine_index,
  s.current_machine_id,
  m.name as current_machine_name,
  m.sequence as machine_sequence_in_route,
  m.total_items,
  m.completed_items,
  m.status as machine_status,
  m.pick_direction,
  s.status as session_status
FROM sessions s
LEFT JOIN machines m ON s.current_machine_id = m.id
WHERE s.status IN ('active', 'in_progress')
ORDER BY s.updated_at DESC
LIMIT 1;
