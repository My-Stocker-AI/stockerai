# Database Technical Audit - Proactive Bug Discovery
**Date:** 2026-01-18
**Location:** `/supabase/migrations/*.sql`
**Purpose:** Identify potential database integrity bugs before they manifest in production
**Method:** Schema review, trigger analysis, CASCADE verification, RLS policy analysis

---

## CRITICAL BUGS DISCOVERED

### 🔴 BUG-DB-1: RLS Disabled on Critical Tables (ALREADY DOCUMENTED)

**Location:** `supabase/migrations/20260118_disable_profiles_rls.sql`, `CRITICAL_RLS_ISSUE.md`
**Severity:** CRITICAL (Security vulnerability)
**Impact:** Cross-account data access possible - NOT production-safe for multi-tenant

**Current Status:**
```sql
ALTER TABLE account_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
```

**Why Disabled:**
- account_users: RLS policies caused infinite recursion (`get_user_account_id()` → `account_users` SELECT → RLS check → `get_user_account_id()` → loop)
- profiles: Teams page needs to fetch all team member profiles, but RLS only allowed users to see their own

**BLOCKING Customer Onboarding:** Cannot enable multi-tenant production until RLS re-enabled with non-recursive policies.

**This is a KNOWN ISSUE, not a new discovery.**

---

### 🟡 BUG-DB-2: handle_new_user Trigger Creates Incomplete Profiles (ALREADY FIXED)

**Location:** `supabase/migrations/20251230043143_558bb929-169d-4fc8-80eb-24ffbde5a8ab.sql`
**Severity:** MEDIUM (Data quality issue)
**Impact:** Profiles created with NULL first_name/last_name → "Unknown User" on Teams page

**Trigger Code:**
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    INSERT INTO public.profiles (id, email)  -- ← Only id/email, no names!
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
END;
$function$;
```

**This was FIXED in Session 43:**
Updated trigger to copy first_name/last_name from user_metadata:
```sql
INSERT INTO public.profiles (id, email, first_name, last_name)
VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
);
```

**Status:** Fixed, deployed ✅

---

### 🟡 BUG-DB-3: No Foreign Key Constraint on profiles.id → auth.users(id)

**Location:** Schema definition
**Severity:** MEDIUM (Data integrity)
**Impact:** If auth.users record deleted but profiles record remains → orphaned profile

**Current Schema:**
```sql
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY,
    email TEXT,
    first_name TEXT,
    last_name TEXT,
    -- NO FOREIGN KEY to auth.users(id)!
);
```

**Issue:**
- account_users has: `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
- profiles should have: `id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
- Without FK, Supabase admin can delete user in auth.users but profile stays

**Check if Fixed:**
Migration `20260118_add_profiles_foreign_key.sql` might have added this.

**Should Be:**
```sql
ALTER TABLE profiles
ADD CONSTRAINT profiles_id_fkey
FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
```

**How to Reproduce:**
1. Create user via invite
2. Manually delete user from auth.users (Supabase dashboard)
3. Profile record stays in database
4. Teams page tries to join → NULL results

---

### 🟡 BUG-DB-4: route_assignments References routes(id) But routes Table May Not Exist

**Location:** `supabase/migrations/20251230043114_06e2d9be-3145-4be3-bac5-f2a6731a698b.sql:29`
**Severity:** MEDIUM (Migration failure)
**Impact:** If routes table created AFTER account_users migration, foreign key creation fails

**Current Code:**
```sql
CREATE TABLE public.route_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,  -- ← routes must exist!
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- ...
);
```

**Issue:** Migration assumes routes table already exists. If migration order is wrong:
1. Run migration 20251230043114 (creates account_users, route_assignments)
2. Error: "relation public.routes does not exist"
3. Migration fails, database in broken state

**Need to Verify:**
- Does an earlier migration create the routes table?
- Or is this migration expected to run AFTER routes is created?
- If routes created later, migration will fail

**Fix:** Either:
1. Ensure routes table created BEFORE this migration (check migration timestamps)
2. Or make foreign key nullable initially, add constraint later

---

### 🟢 BUG-DB-5: get_user_account_id() Returns First Account Only (Intentional?)

**Location:** `supabase/migrations/20251230043114_06e2d9be-3145-4be3-bac5-f2a6731a698b.sql:72-83`
**Severity:** LOW (Design question)
**Impact:** If user belongs to multiple accounts, function only returns first account_id → RLS might block legitimate access

**Function Code:**
```sql
CREATE OR REPLACE FUNCTION public.get_user_account_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT account_id
    FROM public.account_users
    WHERE user_id = _user_id
    LIMIT 1;  -- ← Only returns FIRST account
$$;
```

**Issue:** If user is in Account A and Account B:
1. LIMIT 1 returns Account A (arbitrary order)
2. RLS policies use get_user_account_id() to check access
3. User can see Account A data but NOT Account B data
4. Cross-account collaboration breaks

**Questions:**
- Is multi-account membership supported?
- If yes, this function is wrong (should return SET OF UUID or check specific account)
- If no, UNIQUE constraint should enforce (user_id) NOT (account_id, user_id)

**Current Constraint:**
```sql
UNIQUE(account_id, user_id)  -- ← Allows user in multiple accounts!
```

**Should Be (if single-account intended):**
```sql
UNIQUE(user_id)  -- Enforce one account per user
```

**Or (if multi-account intended):**
Fix RLS policies to handle multiple accounts properly.

---

### 🟢 BUG-DB-6: Trigger on auth.users Not Defined in Migration

**Location:** Missing from migrations
**Severity:** LOW (Documentation issue)
**Impact:** handle_new_user trigger function exists but trigger CREATE statement not in migrations

**Function Exists:**
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user() ...
```

**Trigger Creation Missing:**
```sql
-- This should be in a migration but isn't visible
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

**Issue:** If database restored from migrations, trigger won't be created → profiles not auto-created.

**Need to Verify:**
- Is trigger created via Supabase dashboard (not in migrations)?
- Or is there a migration file that creates the trigger?

---

## RLS POLICY ISSUES (FOR RE-ENABLE)

### Documented Issues from CRITICAL_RLS_ISSUE.md:

1. **Infinite Recursion in account_users Policies:**
   - Policy: `USING (account_id = public.get_user_account_id(auth.uid()))`
   - Function: `SELECT account_id FROM public.account_users WHERE user_id = _user_id`
   - Loop: Policy calls function → function queries account_users → triggers policy → calls function → infinite loop

2. **profiles RLS Too Restrictive:**
   - User can only see own profile
   - Teams page needs to see all team member profiles
   - Required: Policy that allows account members to see each other

**These are DOCUMENTED BLOCKERS, not new discoveries.**

---

## CASCADE COMPLETENESS REVIEW

**Tables with CASCADE:**
✅ account_users → accounts (ON DELETE CASCADE)
✅ account_users → auth.users (ON DELETE CASCADE)
✅ route_assignments → routes (ON DELETE CASCADE)
✅ route_assignments → auth.users (ON DELETE CASCADE)

**Potential Missing:**
❓ profiles → auth.users (Need to verify if added in later migration)
❓ Other tables not reviewed yet (sessions, routes, machines, items, etc.)

**Recommendation:** Full CASCADE audit requires reviewing ALL tables.

---

## INDEX COVERAGE REVIEW

**Performance Indexes Added (20260116_add_critical_performance_indexes.sql):**
✅ sessions(user_id, delivery_date)
✅ routes(user_id, delivery_date)
✅ machines(route_id, sequence)
✅ items(machine_id, sequence)

**Potential Missing Indexes:**
- account_users(user_id) - for join from profiles
- profiles(email) - for case-insensitive lookup (see BUG-AUDIT-3 fix)
- route_assignments(user_id) - for user's routes query

**Recommendation:** Add indexes based on query patterns.

---

## SUMMARY

**Total Bugs Found:** 6 (2 already fixed/documented)
- 🔴 CRITICAL: 1 (RLS disabled - KNOWN ISSUE, blocking production)
- 🟡 MEDIUM: 3 (1 fixed, 1 FK missing, 1 migration dependency)
- 🟢 LOW: 2 (Multi-account design question, trigger not in migrations)

**Audit Coverage:** Database schema and migrations (partial - core tables reviewed)

**Already Documented:**
1. BUG-DB-1: RLS disabled → CRITICAL_RLS_ISSUE.md
2. BUG-DB-2: handle_new_user incomplete → Fixed in Session 43

**New Discoveries:**
3. BUG-DB-3: profiles.id missing FK to auth.users(id)
4. BUG-DB-4: route_assignments references routes before creation
5. BUG-DB-5: get_user_account_id() only returns first account
6. BUG-DB-6: Trigger creation not in migrations

**Next Steps:**
1. Verify BUG-DB-3: Check if 20260118_add_profiles_foreign_key.sql added FK
2. Verify BUG-DB-4: Check routes table creation order
3. Clarify design: Single-account or multi-account users?
4. Review remaining tables: sessions, routes, machines, items
5. Design non-recursive RLS policies for re-enabling security

---

**END OF DATABASE AUDIT**
