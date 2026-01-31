-- ============================================================================
-- CREATE REALISTIC TEST ROUTE (4 machines × 5 items = 20 items)
-- ============================================================================
-- Purpose: Create realistic test route mirroring actual vending machine inventory
-- Date: 2026-01-26
-- Structure: 4 machines with 5 items each, realistic product names and locations
-- Usage: Run in Supabase SQL Editor
-- Safe: Uses TEST_ prefix, won't interfere with production routes
-- Idempotent: Delete + recreate on each run
-- ============================================================================

-- STEP 0: Get your user_id (if needed):
-- SELECT id, email FROM auth.users WHERE email = 'russ@visionairy.biz';
-- User ID: bdc96b72-3f35-4cae-9e79-99473eb4a23b

-- Step 1: Delete existing test route if present (idempotent)
DELETE FROM items WHERE machine_id IN (
  SELECT id FROM machines WHERE route_id IN (
    SELECT id FROM routes WHERE route_name = 'TEST ROUTE 4x5 - Realistic'
  )
);

DELETE FROM machines WHERE route_id IN (
  SELECT id FROM routes WHERE route_name = 'TEST ROUTE 4x5 - Realistic'
);

DELETE FROM routes WHERE route_name = 'TEST ROUTE 4x5 - Realistic';

-- Step 2: Create test route for TOMORROW
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
    'bdc96b72-3f35-4cae-9e79-99473eb4a23b'::uuid,
    'TEST ROUTE 4x5 - Realistic',
    CURRENT_DATE + INTERVAL '1 day',
    4,
    20,
    NOW()
  )
  RETURNING id, user_id
),

-- Step 3: Create 4 realistic machines
machines_insert AS (
  INSERT INTO machines (
    route_id,
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
    -- Machine 1: Office Building
    (
      (SELECT id FROM new_route),
      'Office Tower East',
      'TechCorp HQ - 2nd Floor Break Room',
      2104,
      1,
      'pending',
      5,
      0,
      NOW()
    ),
    -- Machine 2: Gym
    (
      (SELECT id FROM new_route),
      'FitLife Gym Lobby',
      'FitLife 24/7 - Main Entrance',
      3217,
      2,
      'pending',
      5,
      0,
      NOW()
    ),
    -- Machine 3: Hospital
    (
      (SELECT id FROM new_route),
      'Memorial Hospital 4th',
      'Memorial Hospital - 4th Floor Waiting Area',
      1856,
      3,
      'pending',
      5,
      0,
      NOW()
    ),
    -- Machine 4: University
    (
      (SELECT id FROM new_route),
      'State U Student Center',
      'State University - Student Center Main Hall',
      4092,
      4,
      'pending',
      5,
      0,
      NOW()
    )
  RETURNING id, sequence
),

-- Step 4: Create realistic items for each machine
items_insert AS (
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
    CASE m.sequence
      -- Machine 1 (Office) - Professional snacks
      WHEN 1 THEN
        CASE item_seq
          WHEN 1 THEN 'Doritos Cool Ranch'
          WHEN 2 THEN 'Nature Valley Oats & Honey'
          WHEN 3 THEN 'KIND Dark Chocolate Nuts'
          WHEN 4 THEN 'Smartfood White Cheddar'
          WHEN 5 THEN 'Snickers'
        END
      -- Machine 2 (Gym) - Health-conscious options
      WHEN 2 THEN
        CASE item_seq
          WHEN 1 THEN 'Pure Protein Chocolate'
          WHEN 2 THEN 'CLIF Bar Crunchy Peanut Butter'
          WHEN 3 THEN 'Quest Protein Chips BBQ'
          WHEN 4 THEN 'RX Bar Chocolate Sea Salt'
          WHEN 5 THEN 'Gatorade Cool Blue'
        END
      -- Machine 3 (Hospital) - Comfort foods
      WHEN 3 THEN
        CASE item_seq
          WHEN 1 THEN 'Lays Classic'
          WHEN 2 THEN 'M&Ms Peanut'
          WHEN 3 THEN 'Grandmas Chocolate Chip Cookies'
          WHEN 4 THEN 'Cheez-It Original'
          WHEN 5 THEN 'Kit Kat'
        END
      -- Machine 4 (University) - Student favorites
      WHEN 4 THEN
        CASE item_seq
          WHEN 1 THEN 'Hot Cheetos'
          WHEN 2 THEN 'Reeses Cups'
          WHEN 3 THEN 'Takis Fuego'
          WHEN 4 THEN 'Pop-Tarts Brown Sugar'
          WHEN 5 THEN 'Monster Energy'
        END
    END AS product_name,
    -- Realistic quantities needed
    CASE item_seq
      WHEN 1 THEN 8
      WHEN 2 THEN 6
      WHEN 3 THEN 7
      WHEN 4 THEN 5
      WHEN 5 THEN 4
    END AS quantity,
    -- Slot numbers (A1-A5)
    'A' || item_seq AS slot,
    item_seq AS sequence,
    -- Current inventory (random realistic values)
    CASE item_seq
      WHEN 1 THEN 2
      WHEN 2 THEN 1
      WHEN 3 THEN 0
      WHEN 4 THEN 3
      WHEN 5 THEN 1
    END AS inventory_current,
    -- Par levels (target inventory)
    CASE item_seq
      WHEN 1 THEN 10
      WHEN 2 THEN 8
      WHEN 3 THEN 7
      WHEN 4 THEN 8
      WHEN 5 THEN 5
    END AS inventory_parlevel,
    NOW()
  FROM machines_insert m
  CROSS JOIN generate_series(1, 5) AS item_seq
  RETURNING machine_id, product_name, quantity
)

-- Step 5: Return summary with details
SELECT
  'Test route created successfully' AS status,
  (SELECT id FROM new_route) AS route_id,
  (SELECT route_name FROM routes WHERE id = (SELECT id FROM new_route)) AS route_name,
  (SELECT delivery_date FROM routes WHERE id = (SELECT id FROM new_route)) AS delivery_date,
  (SELECT COUNT(*) FROM machines_insert) AS machines_created,
  (SELECT COUNT(*) FROM items_insert) AS items_created,
  (SELECT SUM(quantity) FROM items_insert) AS total_quantity_to_pick;

-- ============================================================================
-- VERIFICATION QUERIES (Run these to inspect the created data)
-- ============================================================================

-- View all machines with item counts
/*
SELECT
  m.sequence,
  m.machine_name,
  m.location_name,
  m.machine_number,
  m.total_items,
  m.completed_items,
  m.status,
  COUNT(i.id) as actual_items
FROM machines m
LEFT JOIN items i ON i.machine_id = m.id
WHERE m.route_id IN (SELECT id FROM routes WHERE route_name = 'TEST ROUTE 4x5 - Realistic')
GROUP BY m.id, m.sequence, m.machine_name, m.location_name, m.machine_number, m.total_items, m.completed_items, m.status
ORDER BY m.sequence;
*/

-- View all items with details
/*
SELECT
  m.sequence as machine_seq,
  m.machine_name,
  i.sequence as item_seq,
  i.slot,
  i.product_name,
  i.quantity,
  i.inventory_current,
  i.inventory_parlevel
FROM items i
JOIN machines m ON m.id = i.machine_id
WHERE m.route_id IN (SELECT id FROM routes WHERE route_name = 'TEST ROUTE 4x5 - Realistic')
ORDER BY m.sequence, i.sequence;
*/

-- ============================================================================
-- ROUTE SUMMARY
-- ============================================================================
-- Machine 1 (Office Tower East - TechCorp HQ):
--   Slot A1: Doritos Cool Ranch (8 units)
--   Slot A2: Nature Valley Oats & Honey (6 units)
--   Slot A3: KIND Dark Chocolate Nuts (7 units)
--   Slot A4: Smartfood White Cheddar (5 units)
--   Slot A5: Snickers (4 units)
--
-- Machine 2 (FitLife Gym Lobby):
--   Slot A1: Pure Protein Chocolate (8 units)
--   Slot A2: CLIF Bar Crunchy Peanut Butter (6 units)
--   Slot A3: Quest Protein Chips BBQ (7 units)
--   Slot A4: RX Bar Chocolate Sea Salt (5 units)
--   Slot A5: Gatorade Cool Blue (4 units)
--
-- Machine 3 (Memorial Hospital 4th):
--   Slot A1: Lays Classic (8 units)
--   Slot A2: M&Ms Peanut (6 units)
--   Slot A3: Grandmas Chocolate Chip Cookies (7 units)
--   Slot A4: Cheez-It Original (5 units)
--   Slot A5: Kit Kat (4 units)
--
-- Machine 4 (State U Student Center):
--   Slot A1: Hot Cheetos (8 units)
--   Slot A2: Reeses Cups (6 units)
--   Slot A3: Takis Fuego (7 units)
--   Slot A4: Pop-Tarts Brown Sugar (5 units)
--   Slot A5: Monster Energy (4 units)
--
-- Total: 4 machines, 20 items, 120 total units to pick
-- ============================================================================
