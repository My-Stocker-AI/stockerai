-- INVESTIGATION: Machine 3 Sequence=32 Missing Issue
-- Run this in Supabase SQL Editor
-- Date: 2026-02-08

-- ============================================================
-- STEP 1: Find current active session and route
-- ============================================================
SELECT
  'CURRENT SESSION' as info,
  s.id as session_id,
  s.route_id,
  s.status,
  s.current_machine_index,
  s.updated_at
FROM sessions s
WHERE s.status IN ('active', 'in_progress')
ORDER BY s.updated_at DESC
LIMIT 1;

-- ============================================================
-- STEP 2: Get all machines for this route (in order)
-- Replace <route_id> with the route_id from STEP 1
-- ============================================================
SELECT
  'MACHINES IN ROUTE' as info,
  m.id as machine_id,
  m.name as machine_name,
  m.sequence as machine_sequence,
  m.total_items,
  m.completed_items,
  m.status,
  (SELECT COUNT(*) FROM items WHERE machine_id = m.id) as actual_item_count
FROM machines m
WHERE m.route_id = '<route_id>'  -- REPLACE THIS
ORDER BY m.sequence;

-- ============================================================
-- STEP 3: Get Machine 3's actual machine_id
-- This assumes Machine 3 = sequence 3 in the route
-- Replace <route_id> with the route_id from STEP 1
-- ============================================================
WITH machine3 AS (
  SELECT id, name, total_items
  FROM machines
  WHERE route_id = '<route_id>'  -- REPLACE THIS
    AND sequence = 3
  LIMIT 1
)
SELECT
  'MACHINE 3 DETAILS' as info,
  *
FROM machine3;

-- ============================================================
-- STEP 4: Get ALL items for Machine 3 with sequence check
-- Replace <machine_id> with the id from STEP 3
-- ============================================================
SELECT
  'MACHINE 3 ITEMS' as info,
  i.sequence,
  i.product_name,
  i.par_level,
  i.pick_mode,
  i.status
FROM items i
WHERE i.machine_id = '<machine_id>'  -- REPLACE THIS
ORDER BY i.sequence;

-- ============================================================
-- STEP 5: Find sequence gaps in Machine 3
-- Replace <machine_id> with the id from STEP 3
-- ============================================================
WITH
  machine3_id AS (
    SELECT id FROM machines
    WHERE route_id = '<route_id>' AND sequence = 3  -- REPLACE <route_id>
  ),
  expected_sequences AS (
    SELECT generate_series(1, 34) AS seq  -- Adjust 34 to actual total_items
  ),
  actual_sequences AS (
    SELECT sequence FROM items
    WHERE machine_id = (SELECT id FROM machine3_id)
  )
SELECT
  'MISSING SEQUENCES' as info,
  e.seq as missing_sequence
FROM expected_sequences e
LEFT JOIN actual_sequences a ON e.seq = a.sequence
WHERE a.sequence IS NULL
ORDER BY e.seq;

-- ============================================================
-- STEP 6: Check for duplicate sequences
-- Replace <machine_id> with the id from STEP 3
-- ============================================================
SELECT
  'DUPLICATE SEQUENCES' as info,
  sequence,
  COUNT(*) as count
FROM items
WHERE machine_id = '<machine_id>'  -- REPLACE THIS
GROUP BY sequence
HAVING COUNT(*) > 1
ORDER BY sequence;

-- ============================================================
-- STEP 7: Verify total_items matches actual count
-- Replace <machine_id> with the id from STEP 3
-- ============================================================
SELECT
  'TOTAL ITEMS VERIFICATION' as info,
  m.total_items as total_items_field,
  (SELECT COUNT(*) FROM items WHERE machine_id = m.id) as actual_item_count,
  (m.total_items - (SELECT COUNT(*) FROM items WHERE machine_id = m.id)) as difference
FROM machines m
WHERE m.id = '<machine_id>';  -- REPLACE THIS

-- ============================================================
-- STEP 8: Check if sequence=32 exists ANYWHERE in the database
-- ============================================================
SELECT
  'SEQUENCE 32 SEARCH' as info,
  i.machine_id,
  m.name as machine_name,
  m.sequence as machine_sequence,
  i.sequence as item_sequence,
  i.product_name
FROM items i
JOIN machines m ON i.machine_id = m.id
WHERE i.sequence = 32
ORDER BY m.sequence, i.sequence;

-- ============================================================
-- INSTRUCTIONS FOR USER:
-- ============================================================
-- 1. Run STEP 1 to get current session and route_id
-- 2. Replace ALL instances of <route_id> with the actual route_id
-- 3. Run STEP 2 to see all machines and find Machine 3's machine_id
-- 4. Replace ALL instances of <machine_id> with Machine 3's actual id
-- 5. Run STEPS 4-8 to analyze sequences
-- 6. Report all results back to Claude
