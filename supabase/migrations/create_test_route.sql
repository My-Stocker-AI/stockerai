-- ============================================================================
-- CREATE TEST ROUTE FOR DEVELOPMENT
-- ============================================================================
-- Purpose: Create a small test route (5 machines, 4 items each = 20 items)
--          Always dated for tomorrow so it's available without manual updates
-- Usage: Run in Supabase SQL Editor
-- Safe: Uses TEST_ prefix, won't interfere with production routes
-- Idempotent: Delete + recreate on each run
-- ============================================================================

-- STEP 0: Get your user_id first by running this query:
-- SELECT id, email FROM auth.users WHERE email = 'russ@visionairy.biz';
-- Copy the id and paste it below in the INSERT statement

-- Step 1: Delete existing test route if present (idempotent)
DELETE FROM items WHERE machine_id IN (
  SELECT id FROM machines WHERE route_id IN (
    SELECT id FROM routes WHERE route_name = 'TEST ROUTE - Dev Only'
  )
);

DELETE FROM machines WHERE route_id IN (
  SELECT id FROM routes WHERE route_name = 'TEST ROUTE - Dev Only'
);

DELETE FROM routes WHERE route_name = 'TEST ROUTE - Dev Only';

-- Step 2: Create test route for TOMORROW (always available next day)
WITH new_route AS (
  INSERT INTO routes (
    user_id,
    route_name,
    delivery_date,
    total_machines,
    total_items,
    created_at
  )
  VALUES (
    'PASTE-YOUR-USER-ID-HERE'::uuid,     -- Replace with your user_id from Step 0
    'TEST ROUTE - Dev Only',              -- Clear test identifier
    CURRENT_DATE + INTERVAL '1 day',      -- Always tomorrow
    5,                                    -- 5 machines
    20,                                   -- 20 items (4 per machine)
    NOW()
  )
  RETURNING id, user_id
),

-- Step 3: Create 5 test machines
machines_data AS (
  INSERT INTO machines (
    route_id,
    machine_name,
    location_name,
    machine_number,
    sequence,
    status,
    created_at
  )
  SELECT
    (SELECT id FROM new_route),
    'TEST Machine ' || machine_num,
    'TEST Location',
    100 + machine_num,
    machine_num,
    'pending',
    NOW()
  FROM generate_series(1, 5) AS machine_num
  RETURNING id, sequence
),

-- Step 4: Create 4 items per machine (20 total)
items_data AS (
  INSERT INTO items (
    machine_id,
    product_name,
    quantity,
    slot,
    sequence,
    inventory_current,
    inventory_parlevel,
    created_at
  )
  SELECT
    m.id,
    'TEST Item ' || item_num || ' (Machine ' || m.sequence || ')',
    CASE item_num
      WHEN 1 THEN 6
      WHEN 2 THEN 3
      WHEN 3 THEN 8
      WHEN 4 THEN 4
    END,
    item_num::text,
    item_num,
    0,
    10,
    NOW()
  FROM machines_data m
  CROSS JOIN generate_series(1, 4) AS item_num
  RETURNING machine_id, product_name
)

-- Step 5: Return summary
SELECT
  'Test route created successfully' AS status,
  (SELECT id FROM new_route) AS route_id,
  (SELECT route_name FROM routes WHERE id = (SELECT id FROM new_route)) AS route_name,
  (SELECT delivery_date FROM routes WHERE id = (SELECT id FROM new_route)) AS delivery_date,
  (SELECT COUNT(*) FROM machines_data) AS machines_created,
  (SELECT COUNT(*) FROM items_data) AS items_created;

-- ============================================================================
-- VERIFICATION QUERIES (optional)
-- ============================================================================
-- Run these after to verify creation:
--
-- SELECT * FROM routes WHERE route_name = 'TEST ROUTE - Dev Only';
--
-- SELECT m.sequence, m.machine_name, m.machine_number, COUNT(i.id) as item_count
-- FROM machines m
-- LEFT JOIN items i ON i.machine_id = m.id
-- WHERE m.route_id = '[paste-route-id-from-above]'
-- GROUP BY m.id, m.sequence, m.machine_name, m.machine_number
-- ORDER BY m.sequence;
-- ============================================================================
