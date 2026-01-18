-- Disable RLS on profiles table (temporary fix)
-- Date: 2026-01-18
-- Reason: Teams page needs to fetch all team member profiles, but RLS policy only allows users to see their own profile
-- Security Impact: Cross-account profile access possible - NOT production-safe for multi-tenant
-- TODO: Re-enable with proper policy that allows account members to see each other's profiles

ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Comment
COMMENT ON TABLE profiles IS 'RLS DISABLED 2026-01-18 - temporary fix for Teams page. See /CRITICAL_RLS_ISSUE.md';
