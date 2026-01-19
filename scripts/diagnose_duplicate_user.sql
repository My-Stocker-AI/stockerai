-- Diagnostic: Find duplicate user entries in account_users
-- Run this in Supabase SQL Editor

-- 1. Check current auth user
SELECT
  'Current Auth User' as label,
  auth.uid() as user_id,
  p.email,
  p.first_name,
  p.last_name
FROM profiles p
WHERE p.id = auth.uid();

-- 2. Check all account_users for your account
SELECT
  'Account Users' as label,
  au.id as account_user_id,
  au.user_id,
  au.role,
  p.email,
  p.first_name,
  p.last_name,
  CASE
    WHEN au.user_id = auth.uid() THEN '← YOU (current session)'
    ELSE ''
  END as is_current_user
FROM account_users au
JOIN profiles p ON p.id = au.user_id
WHERE au.account_id = (
  SELECT account_id
  FROM account_users
  WHERE user_id = auth.uid()
  LIMIT 1
)
ORDER BY au.created_at;

-- 3. Check for duplicate emails in profiles
SELECT
  'Duplicate Email Check' as label,
  email,
  COUNT(*) as count,
  array_agg(id) as user_ids
FROM profiles
WHERE email ILIKE '%russ%'
GROUP BY email
HAVING COUNT(*) > 1;

-- 4. Find which user_id should be kept
SELECT
  'Auth Users' as label,
  id,
  email,
  created_at,
  last_sign_in_at,
  CASE
    WHEN id = auth.uid() THEN '← ACTIVE SESSION'
    ELSE ''
  END as status
FROM auth.users
WHERE email ILIKE '%russ%'
ORDER BY created_at;
