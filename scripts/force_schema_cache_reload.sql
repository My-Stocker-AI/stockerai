-- Force PostgREST Schema Cache Reload
-- Run this in Supabase SQL Editor

-- Option 1: Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- Option 2: Verify foreign key exists
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'account_users'
  AND kcu.column_name = 'user_id';
