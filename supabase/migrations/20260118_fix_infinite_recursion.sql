-- Fix: Infinite recursion in RLS policies
-- Date: 2026-01-18
-- Problem: Duplicate policies calling helper functions that query account_users
-- Solution: Drop policies that use get_user_account_id() and has_role() functions

-- Drop the policies that use helper functions (causing recursion)
DROP POLICY IF EXISTS "Users can view members of their account" ON account_users;
DROP POLICY IF EXISTS "Primary admins can delete account users" ON account_users;
DROP POLICY IF EXISTS "Primary admins can insert account users" ON account_users;
DROP POLICY IF EXISTS "Primary admins can update account users" ON account_users;

-- Verify remaining policies (should only have 4 policies with direct queries)
-- Expected policies:
-- - account_users_select_own_account_only
-- - account_users_insert_own_account_only
-- - account_users_update_own_account_only
-- - account_users_delete_own_account_only
