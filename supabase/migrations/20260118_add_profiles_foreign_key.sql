-- Add foreign key relationship from account_users to profiles
-- This allows PostgREST to join the tables in queries

-- Add foreign key constraint
ALTER TABLE account_users
ADD CONSTRAINT account_users_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES profiles(id)
ON DELETE CASCADE;

-- Comment
COMMENT ON CONSTRAINT account_users_user_id_fkey ON account_users IS
'Foreign key to profiles table - allows PostgREST to join account_users and profiles in queries';
