-- SIMPLIFIED INVESTIGATION: Machine 3 Sequence=32 Missing
-- Run this entire script in Supabase SQL Editor
-- It will automatically find the current route and Machine 3
-- Date: 2026-02-08

-- ============================================================
-- FULL AUTOMATED INVESTIGATION
-- ============================================================

WITH
  -- Get current active session
  current_session AS (
    SELECT
      id as session_id,
      route_id,
      current_machine_index,
      status
    FROM sessions
    WHERE status IN ('active', 'in_progress')
    ORDER BY updated_at DESC
    LIMIT 1
  ),

  -- Get Machine 3 (sequence=3 in route)
  machine3 AS (
    SELECT
      m.id as machine_id,
      m.name,
      m.sequence,
      m.total_items,
      m.completed_items,
      m.status
    FROM machines m
    JOIN current_session cs ON m.route_id = cs.route_id
    WHERE m.sequence = 3
    LIMIT 1
  ),

  -- Get all items for Machine 3
  machine3_items AS (
    SELECT
      i.sequence,
      i.product_name,
      i.par_level,
      i.status
    FROM items i
    JOIN machine3 m ON i.machine_id = m.machine_id
  ),

  -- Generate expected sequences (1 to total_items)
  expected_sequences AS (
    SELECT generate_series(1, (SELECT total_items FROM machine3)) AS seq
  ),

  -- Find missing sequences
  missing_sequences AS (
    SELECT e.seq
    FROM expected_sequences e
    LEFT JOIN machine3_items i ON e.seq = i.sequence
    WHERE i.sequence IS NULL
  ),

  -- Find duplicate sequences
  duplicate_sequences AS (
    SELECT sequence, COUNT(*) as count
    FROM machine3_items
    GROUP BY sequence
    HAVING COUNT(*) > 1
  )

-- ============================================================
-- RESULTS OUTPUT
-- ============================================================

SELECT '========================================' as separator
UNION ALL SELECT 'CURRENT SESSION INFO'
UNION ALL SELECT '========================================'
UNION ALL
SELECT
  'Session ID: ' || session_id::text ||
  ' | Route ID: ' || route_id::text ||
  ' | Current Machine Index: ' || current_machine_index::text ||
  ' | Status: ' || status
FROM current_session

UNION ALL SELECT ''
UNION ALL SELECT '========================================'
UNION ALL SELECT 'MACHINE 3 DETAILS'
UNION ALL SELECT '========================================'
UNION ALL
SELECT
  'Machine ID: ' || machine_id::text ||
  ' | Name: ' || name ||
  ' | Sequence: ' || sequence::text ||
  ' | Total Items: ' || total_items::text ||
  ' | Completed: ' || completed_items::text ||
  ' | Status: ' || status
FROM machine3

UNION ALL SELECT ''
UNION ALL SELECT '========================================'
UNION ALL SELECT 'ITEM COUNT VERIFICATION'
UNION ALL SELECT '========================================'
UNION ALL
SELECT
  'Total Items Field: ' || m.total_items::text ||
  ' | Actual Items in DB: ' || (SELECT COUNT(*)::text FROM machine3_items) ||
  ' | Difference: ' || (m.total_items - (SELECT COUNT(*) FROM machine3_items))::text
FROM machine3 m

UNION ALL SELECT ''
UNION ALL SELECT '========================================'
UNION ALL SELECT 'MISSING SEQUENCES'
UNION ALL SELECT '========================================'
UNION ALL
SELECT 'Missing: ' || seq::text
FROM missing_sequences
ORDER BY seq

UNION ALL SELECT ''
UNION ALL SELECT '========================================'
UNION ALL SELECT 'DUPLICATE SEQUENCES (if any)'
UNION ALL SELECT '========================================'
UNION ALL
SELECT 'Sequence ' || sequence::text || ' appears ' || count::text || ' times'
FROM duplicate_sequences

UNION ALL SELECT ''
UNION ALL SELECT '========================================'
UNION ALL SELECT 'ALL ITEMS FOR MACHINE 3 (ordered by sequence)'
UNION ALL SELECT '========================================'
UNION ALL
SELECT
  'Seq ' || LPAD(sequence::text, 2, '0') ||
  ' | ' || RPAD(COALESCE(product_name, 'NULL'), 30, ' ') ||
  ' | Par: ' || LPAD(par_level::text, 2, ' ') ||
  ' | Status: ' || status
FROM machine3_items
ORDER BY sequence;
