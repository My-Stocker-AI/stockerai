-- Check if the foreign key constraint exists
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM
    information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name='account_users'
  AND kcu.column_name='user_id';

-- Also try to manually join to see if data relationship works
SELECT
  au.id,
  au.user_id,
  au.role,
  p.first_name,
  p.last_name,
  p.email
FROM account_users au
LEFT JOIN profiles p ON p.id = au.user_id
LIMIT 5;
