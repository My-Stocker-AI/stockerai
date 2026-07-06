-- ============================================================================
-- CREATE MINIMAL TEST ROUTE FOR E2E TESTING
-- ============================================================================
-- Purpose: 3 machines × 5 items = 15 items total
-- User: bdc96b72-3f35-4cae-9e79-99473eb4a23b (russ@visionairy.biz)
-- Date: Tomorrow
-- ============================================================================

-- Step 1: Clean up existing test route
DELETE FROM items WHERE machine_id IN (
  SELECT id FROM machines WHERE route_id IN (
    SELECT id FROM routes WHERE route_name = 'E2E Test Route'
  )
);

DELETE FROM machines WHERE route_id IN (
  SELECT id FROM routes WHERE route_name = 'E2E Test Route'
);

DELETE FROM routes WHERE route_name = 'E2E Test Route';

-- Step 2: Create test route for TOMORROW
WITH new_route AS (
  INSERT INTO routes (
    user_id,
    route_name,
    delivery_date,
    total_machines,
    total_items,
    driver_name,
    created_at
  )
  VALUES (
    'bdc96b72-3f35-4cae-9e79-99473eb4a23b'::uuid,
    'E2E Test Route',
    CURRENT_DATE + INTERVAL '1 day',
    3,
    15,
    'Test Driver',
    NOW()
  )
  RETURNING id
),

-- Step 3: Create 3 test machines
machines_insert AS (
  INSERT INTO machines (
    route_id,
    route_name,
    machine_name,
    location_name,
    machine_number,
    sequence,
    status,
    total_items,
    completed_items,
    created_at
  )
  VALUES
    -- Machine 1
    (
      (SELECT id FROM new_route),
      'E2E Test Route',
      'Test Machine 1',
      'Test Location 1',
      101,
      1,
      'pending',
      5,
      0,
      NOW()
    ),
    -- Machine 2
    (
      (SELECT id FROM new_route),
      'E2E Test Route',
      'Test Machine 2',
      'Test Location 2',
      102,
      2,
      'pending',
      5,
      0,
      NOW()
    ),
    -- Machine 3
    (
      (SELECT id FROM new_route),
      'E2E Test Route',
      'Test Machine 3',
      'Test Location 3',
      103,
      3,
      'pending',
      5,
      0,
      NOW()
    )
  RETURNING id, sequence
),

-- Step 4: Create 5 items per machine (15 total)
items_insert AS (
  INSERT INTO items (
    machine_id,
    machine_name,
    product_name,
    quantity,
    slot,
    sequence,
    status,
    inventory_current,
    inventory_parlevel,
    created_at
  )
  SELECT
    m.id,
    'Test Machine ' || m.sequence,
    'Product ' || item_seq || ' (Machine ' || m.sequence || ')',
    CASE item_seq
      WHEN 1 THEN 3
      WHEN 2 THEN 5
      WHEN 3 THEN 2
      WHEN 4 THEN 4
      WHEN 5 THEN 1
    END,
    'A' || item_seq,
    item_seq,
    'pending',
    0,
    10,
    NOW()
  FROM machines_insert m
  CROSS JOIN generate_series(1, 5) AS item_seq
  RETURNING machine_id, product_name, quantity
)

-- Step 5: Return summary
SELECT
  'E2E Test route created successfully' AS status,
  (SELECT id FROM new_route) AS route_id,
  (SELECT COUNT(*) FROM machines_insert) AS machines_created,
  (SELECT COUNT(*) FROM items_insert) AS items_created;
