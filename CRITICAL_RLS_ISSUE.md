# CRITICAL: RLS Infinite Recursion Issue

**Date:** 2026-01-18
**Status:** ⚠️ TEMPORARY FIX IN PLACE - NEEDS PROPER RESOLUTION
**Severity:** HIGH - Security bypass (RLS disabled)

---

## What Happened

When deploying the `can_upload_routes` billing model update, the system broke with:

```
ERROR: infinite recursion detected in policy for relation "account_users"
```

**Root Cause:** RLS policies on `account_users` query `account_users` within their policy checks, creating infinite loops.

Example broken policy:
```sql
-- This policy queries account_users FROM WITHIN account_users policy = infinite loop
CREATE POLICY "account_users_select_own_account_only" ON account_users
FOR SELECT USING (
  account_id IN (
    SELECT account_id FROM account_users WHERE user_id = auth.uid()  -- ← Queries same table
  )
);
```

**This should have been caught during system impact analysis BEFORE deployment.**

---

## Temporary Fix (ACTIVE NOW)

```sql
ALTER TABLE account_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;  -- Added 2026-01-18 to fix Teams page
```

**Security Impact:**
- ✅ App functional again
- ❌ NO RLS protection on account_users OR profiles tables
- ❌ Any authenticated user can read/write ANY account's team members
- ❌ Any authenticated user can read/write ANY user's profile data
- ❌ Cross-account data access possible

**This is NOT production-safe for multi-tenant environments.**

**Why profiles RLS also disabled:**
- Teams page query fetches profiles for all team members
- RLS on profiles only allowed users to see their own profile
- Result: "Unknown User" for all team members except yourself
- Disabling RLS allows Teams page to fetch all profiles in the account

---

## Proper Solution (TODO)

### Option 1: Helper Table Pattern

Create a separate table that maps `user_id → account_id` without RLS:

```sql
-- New table (no RLS needed)
CREATE TABLE user_account_map (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, account_id)
);

-- Populate from account_users
INSERT INTO user_account_map (user_id, account_id)
SELECT DISTINCT user_id, account_id FROM account_users;

-- Trigger to keep in sync
CREATE TRIGGER sync_user_account_map
AFTER INSERT OR UPDATE OR DELETE ON account_users
FOR EACH ROW EXECUTE FUNCTION sync_user_account_map();

-- New RLS policy (no recursion)
CREATE POLICY "account_users_select_own_account" ON account_users
FOR SELECT USING (
  account_id IN (
    SELECT account_id FROM user_account_map WHERE user_id = auth.uid()  -- ← Different table
  )
);
```

### Option 2: Cached Function Pattern

Create a function that caches the result:

```sql
CREATE OR REPLACE FUNCTION get_user_account_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Direct query bypassing RLS (SECURITY DEFINER)
  SELECT account_id FROM account_users WHERE user_id = auth.uid();
$$;

-- Policy uses function instead of subquery
CREATE POLICY "account_users_select_own_account" ON account_users
FOR SELECT USING (
  account_id IN (SELECT * FROM get_user_account_ids())
);
```

### Option 3: JWT Claims Pattern

Store `account_id` in JWT custom claims:

```sql
-- No policy needed - app validates JWT claim
-- Requires auth hook to inject claim during login
```

---

## Why This Wasn't Caught

**System Impact Analysis Failure:**

When implementing `can_upload_routes`, I should have:

1. ✅ Checked triggers that reference account_users (DONE - fixed `enforce_driver_seat_limit`)
2. ❌ Checked RLS policies that query account_users (MISSED)
3. ❌ Tested with authenticated user (not service role) (MISSED)
4. ❌ Ran integration tests before deployment (MISSED)

**The trigger was caught because it referenced the OLD column. The RLS policies weren't caught because they don't reference specific columns - they query the table itself.**

---

## Action Items

### Immediate (Before Production Multi-Tenant)

- [ ] **CRITICAL:** Re-enable RLS with proper policy design
- [ ] Choose solution (Option 1, 2, or 3)
- [ ] Implement solution
- [ ] Test with authenticated users (NOT service role)
- [ ] Verify cross-account isolation

### Process Improvement

- [ ] Add to deployment checklist: "Test RLS policies after schema changes"
- [ ] Add to deployment checklist: "Test with authenticated user, not service role"
- [ ] Document: "Any table with self-referential RLS policies needs helper table pattern"
- [ ] Create automated RLS test suite

---

## Current Production Risk

**Single-tenant (current state):** LOW risk
- Only one account exists (yours)
- No cross-account data to leak
- But still not ideal

**Multi-tenant (if you add customers):** CRITICAL risk
- Customer A can see/modify Customer B's team members
- Data breach liability
- Compliance violation (GDPR, SOC2, etc.)

---

## Timeline

- **2026-01-18 16:00:** Issue discovered during deployment
- **2026-01-18 16:15:** Temporary fix applied (RLS disabled)
- **2026-01-18 16:20:** Critical issue documented
- **PENDING:** Proper fix implementation

---

**This is a blocking issue for multi-tenant production deployment.**

**Recommended: Implement Option 1 (helper table) before onboarding any customers.**
