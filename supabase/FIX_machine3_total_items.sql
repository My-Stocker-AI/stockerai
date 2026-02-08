-- FIX: Update Machine 3's total_items to match reality
-- Machine ID: d375ff94-fb1a-4652-abfb-0b408e0925f5
-- Current total_items: 34 (WRONG)
-- Actual items: 25 (sequences 1-25)
-- Date: 2026-02-08

-- STEP 1: Verify the issue
SELECT
  'BEFORE FIX' as status,
  id as machine_id,
  name as machine_name,
  total_items as current_total_items_field,
  (SELECT COUNT(*) FROM items WHERE machine_id = 'd375ff94-fb1a-4652-abfb-0b408e0925f5') as actual_items_in_db,
  completed_items
FROM machines
WHERE id = 'd375ff94-fb1a-4652-abfb-0b408e0925f5';

-- STEP 2: Apply the fix
-- Reset total_items to 25 AND reset completed_items to 0 (since previous picks were invalid)
UPDATE machines
SET
  total_items = 25,
  completed_items = 0  -- Reset because you "picked" items that don't exist
WHERE id = 'd375ff94-fb1a-4652-abfb-0b408e0925f5';

-- STEP 3: Verify the fix
SELECT
  'AFTER FIX' as status,
  id as machine_id,
  name as machine_name,
  total_items as updated_total_items,
  (SELECT COUNT(*) FROM items WHERE machine_id = 'd375ff94-fb1a-4652-abfb-0b408e0925f5') as actual_items_in_db,
  completed_items,
  'Fix applied successfully!' as message
FROM machines
WHERE id = 'd375ff94-fb1a-4652-abfb-0b408e0925f5';
