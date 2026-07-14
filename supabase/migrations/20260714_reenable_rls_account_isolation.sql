-- Re-enable Row Level Security on account_users and profiles with account-scoped isolation.
--
-- Context: RLS was DISABLED on both tables on 2026-01-18 (docs/CRITICAL_RLS_ISSUE.md) to work
-- around an infinite-recursion bug: the old account_users SELECT policy queried account_users
-- from within its own USING clause, so evaluating the policy re-triggered the policy forever.
--
-- Fix: delegate the "which account am I in / am I an admin" lookups to the existing
-- SECURITY DEFINER helper functions (get_user_account_id, has_role). Because they run with
-- owner privileges they bypass RLS, so they resolve without re-triggering the policy — no loop.
--
-- Platform-admin bypass: Russ's user_id (bdc96b72-3f35-4cae-9e79-99473eb4a23b) is granted
-- cross-account SELECT so the /admin dashboard keeps full visibility once RLS is live.
--
-- profiles has no account_id column; a profile's account is known only via account_users
-- (profiles.id = account_users.user_id). "Same-account" scoping therefore joins through
-- account_users, itself scoped by get_user_account_id() (SECURITY DEFINER, no recursion).

BEGIN;

-- ---------------------------------------------------------------------------
-- Clean slate: drop the dormant pre-2026-01-18 policies on both tables.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS account_users_select_own_account_only ON public.account_users;
DROP POLICY IF EXISTS account_users_insert_own_account_only ON public.account_users;
DROP POLICY IF EXISTS account_users_update_own_account_only ON public.account_users;
DROP POLICY IF EXISTS account_users_delete_own_account_only ON public.account_users;

DROP POLICY IF EXISTS "Users can view own profile"              ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile"            ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"            ON public.profiles;
DROP POLICY IF EXISTS "Admins can update team member profiles"  ON public.profiles;

-- ---------------------------------------------------------------------------
-- Turn RLS back on.
-- ---------------------------------------------------------------------------
ALTER TABLE public.account_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- account_users
-- ===========================================================================

-- SELECT: members see their own account's roster; platform admin sees all.
CREATE POLICY account_users_select ON public.account_users
  FOR SELECT
  USING (
    account_id = public.get_user_account_id(auth.uid())
    OR auth.uid() = 'bdc96b72-3f35-4cae-9e79-99473eb4a23b'
  );

-- INSERT: only a primary_admin may add members, and only within their own account.
CREATE POLICY account_users_insert ON public.account_users
  FOR INSERT
  WITH CHECK (
    account_id = public.get_user_account_id(auth.uid())
    AND public.has_role(auth.uid(), 'primary_admin')
  );

-- UPDATE: only a primary_admin may change members, and only within their own account.
CREATE POLICY account_users_update ON public.account_users
  FOR UPDATE
  USING (
    account_id = public.get_user_account_id(auth.uid())
    AND public.has_role(auth.uid(), 'primary_admin')
  )
  WITH CHECK (
    account_id = public.get_user_account_id(auth.uid())
    AND public.has_role(auth.uid(), 'primary_admin')
  );

-- DELETE: only a primary_admin may remove members, and only within their own account.
CREATE POLICY account_users_delete ON public.account_users
  FOR DELETE
  USING (
    account_id = public.get_user_account_id(auth.uid())
    AND public.has_role(auth.uid(), 'primary_admin')
  );

-- ===========================================================================
-- profiles  (no account_id column — scope through account_users membership)
-- ===========================================================================

-- SELECT: see your own profile, profiles of same-account members, or all (platform admin).
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.account_users au
      WHERE au.user_id = profiles.id
        AND au.account_id = public.get_user_account_id(auth.uid())
    )
    OR auth.uid() = 'bdc96b72-3f35-4cae-9e79-99473eb4a23b'
  );

-- INSERT: a user may create only their own profile row (platform admin exempt).
CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT
  WITH CHECK (
    auth.uid() = id
    OR auth.uid() = 'bdc96b72-3f35-4cae-9e79-99473eb4a23b'
  );

-- UPDATE: a user may edit only their own profile row (platform admin exempt).
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE
  USING (
    auth.uid() = id
    OR auth.uid() = 'bdc96b72-3f35-4cae-9e79-99473eb4a23b'
  )
  WITH CHECK (
    auth.uid() = id
    OR auth.uid() = 'bdc96b72-3f35-4cae-9e79-99473eb4a23b'
  );

-- DELETE: a primary_admin may remove a same-account member's profile (platform admin exempt).
CREATE POLICY profiles_delete ON public.profiles
  FOR DELETE
  USING (
    (
      public.has_role(auth.uid(), 'primary_admin')
      AND EXISTS (
        SELECT 1 FROM public.account_users au
        WHERE au.user_id = profiles.id
          AND au.account_id = public.get_user_account_id(auth.uid())
      )
    )
    OR auth.uid() = 'bdc96b72-3f35-4cae-9e79-99473eb4a23b'
  );

COMMIT;
