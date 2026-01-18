-- Migration: Add RLS policies to prevent cross-account privilege escalation
-- Date: 2026-01-18
-- Purpose: Defense-in-depth security for account_id validation
-- System Impact Audit: /docs/audits/AUDIT_2026-01-18_account_id_validation.md

-- CRITICAL SECURITY FIX: Prevents cross-account attacks where attacker exploits
-- missing account_id validation to invite themselves to victim's account

-- Enable RLS on account_users table
ALTER TABLE account_users ENABLE ROW LEVEL SECURITY;

-- Policy 1: INSERT - Users can only invite to accounts where they are admins
CREATE POLICY "account_users_insert_own_account_only"
ON account_users
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM account_users admin
    WHERE admin.user_id = auth.uid()
      AND admin.account_id = account_users.account_id
      AND admin.role = 'primary_admin'
  )
);

-- Policy 2: SELECT - Users can only view account_users for accounts they belong to
CREATE POLICY "account_users_select_own_account_only"
ON account_users
FOR SELECT
TO authenticated
USING (
  account_id IN (
    SELECT account_id
    FROM account_users
    WHERE user_id = auth.uid()
  )
);

-- Policy 3: UPDATE - Admins can update users in their own account
CREATE POLICY "account_users_update_own_account_only"
ON account_users
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM account_users admin
    WHERE admin.user_id = auth.uid()
      AND admin.account_id = account_users.account_id
      AND admin.role = 'primary_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM account_users admin
    WHERE admin.user_id = auth.uid()
      AND admin.account_id = account_users.account_id
      AND admin.role = 'primary_admin'
  )
);

-- Policy 4: DELETE - Admins can delete users from their own account
CREATE POLICY "account_users_delete_own_account_only"
ON account_users
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM account_users admin
    WHERE admin.user_id = auth.uid()
      AND admin.account_id = account_users.account_id
      AND admin.role = 'primary_admin'
  )
);

-- Comments for documentation
COMMENT ON POLICY "account_users_insert_own_account_only" ON account_users IS
  'SECURITY: Prevents cross-account privilege escalation. Users can only invite to accounts where they are admins. Layer 2 defense (database enforces even if application has bugs).';

COMMENT ON POLICY "account_users_select_own_account_only" ON account_users IS
  'SECURITY: Users can only view account_users for accounts they belong to. Prevents data leakage across accounts.';

COMMENT ON POLICY "account_users_update_own_account_only" ON account_users IS
  'SECURITY: Admins can only update users in their own account. Prevents cross-account modifications.';

COMMENT ON POLICY "account_users_delete_own_account_only" ON account_users IS
  'SECURITY: Admins can only delete users from their own account. Prevents cross-account user removal.';
