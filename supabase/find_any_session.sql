-- Find ANY session (regardless of status)
-- This will show us if sessions exist at all
-- Date: 2026-02-08

-- Check 1: Most recent sessions (any status)
SELECT
  'RECENT SESSIONS (any status)' as section,
  id as session_id,
  route_id,
  current_machine_id,
  current_machine_index,
  status,
  created_at,
  updated_at
FROM sessions
ORDER BY updated_at DESC
LIMIT 5;

-- Check 2: Check if there are ANY sessions at all
SELECT
  'TOTAL SESSION COUNT' as section,
  COUNT(*) as total_sessions,
  COUNT(CASE WHEN status = 'active' THEN 1 END) as active_sessions,
  COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_sessions,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sessions,
  COUNT(CASE WHEN status = 'paused' THEN 1 END) as paused_sessions
FROM sessions;

-- Check 3: Check machines table
SELECT
  'MACHINES IN DATABASE' as section,
  COUNT(*) as total_machines,
  COUNT(CASE WHEN sequence = 3 THEN 1 END) as machines_at_sequence_3
FROM machines;

-- Check 4: Check if Machine 3 exists in ANY route
SELECT
  'MACHINE 3 CANDIDATES' as section,
  m.id as machine_id,
  m.name,
  m.sequence,
  m.route_id,
  m.total_items,
  m.completed_items,
  m.status,
  r.name as route_name
FROM machines m
LEFT JOIN routes r ON m.route_id = r.id
WHERE m.sequence = 3
ORDER BY m.created_at DESC
LIMIT 3;
