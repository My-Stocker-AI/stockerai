-- Fix PostgREST Schema Cache Issue
-- Issue: PostgREST can't see account_users.user_id -> profiles.id FK
-- Solution: Drop and recreate FK to force schema cache refresh

-- Drop existing constraint
ALTER TABLE account_users
DROP CONSTRAINT IF EXISTS account_users_user_id_fkey;

-- Recreate with same definition
ALTER TABLE account_users
ADD CONSTRAINT account_users_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES profiles(id)
ON DELETE CASCADE;

-- Add comment for documentation
COMMENT ON CONSTRAINT account_users_user_id_fkey ON account_users IS
'Foreign key to profiles table - recreated 2026-01-18 to fix PostgREST schema cache (PGRST200 error)';
