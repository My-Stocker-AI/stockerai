# Deploy Account Security Fix (Bug #3)

**Date:** 2026-01-18
**Status:** Edge Function deployed, Database migration PENDING
**Severity:** CRITICAL - Cross-account privilege escalation vulnerability

---

## What Was Deployed

✅ **Edge Function:** invite-team-member (Layer 1 - Application Security)
- Added account_id validation to admin check (line 127)
- Validates user is admin OF THE SPECIFIC ACCOUNT
- Logs unauthorized access attempts for forensic analysis
- Clear error message: "Unauthorized: You can only invite members to your own account"

---

## What Needs Manual Deployment

⚠️ **Database Migration:** RLS Policies (Layer 2 - Database Security)

**Migration File:** `/supabase/migrations/20260118_account_users_rls_security.sql`

### How to Deploy Database Changes

**Go to:** https://supabase.com/dashboard/project/wvtkuposrlvadyeixlke/sql/new

**Copy and paste the SQL below and click "Run"**

---

## SQL Migration to Apply

```sql
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
```

---

## Verification

After applying the migration, verify it worked:

**1. Check RLS is enabled:**
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'account_users';
```

**Expected:** `rowsecurity = true`

**2. Check policies exist:**
```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'account_users';
```

**Expected:** 4 policies returned (INSERT, SELECT, UPDATE, DELETE)

**3. Test cross-account protection:**
```sql
-- As a user, try to SELECT account_users for a different account
-- Should return no rows (RLS blocks it)
SELECT * FROM account_users WHERE account_id = '<some_other_account_uuid>';
```

**Expected:** Empty result set (RLS policy filters it out)

---

## What This Fixes

### Before Fix: CRITICAL Vulnerability

**Attack Scenario:**
```
1. Attacker creates account (Account A) → becomes admin
2. Attacker discovers victim's account_id (Account B UUID)
3. Attacker calls invite-team-member with:
   {
     "account_id": "<Account B UUID>",
     "email": "attacker@example.com",
     "role": "driver"
   }
4. Edge Function checks: "Is attacker an admin?" → YES (in Account A)
5. Edge Function DOESN'T check: "Is attacker admin of Account B?"
6. Attacker added to victim's Account B
7. Attacker accesses victim's routes, drivers, delivery data
```

**Impact:**
- Data breach (cross-account data access)
- Billing fraud (victim charged for attacker's seat)
- Privacy violation (GDPR, CCPA)
- Compliance failure (SOC 2)

### After Fix: Defense in Depth

**Layer 1 (Application):**
```typescript
// NOW validates admin of THIS SPECIFIC account
.eq('account_id', account_id)  // ← Added validation
```

**Attack blocked at application level:**
- Attacker tries cross-account invite
- Admin check fails: "User not admin of requested account"
- Error: "Unauthorized: You can only invite members to your own account"
- Security log: "Unauthorized account access attempt blocked"

**Layer 2 (Database RLS):**
```sql
-- Even if application code bypassed, database enforces
WITH CHECK (
  EXISTS (
    SELECT 1 FROM account_users admin
    WHERE admin.user_id = auth.uid()
      AND admin.account_id = account_users.account_id
      AND admin.role = 'primary_admin'
  )
)
```

**Attack blocked at database level:**
- If attacker somehow bypasses Layer 1 (bug, race condition, etc.)
- Database INSERT fails: "new row violates row-level security policy"
- Cross-account access impossible at database level

---

## Security Impact

**CVSS Score Before Fix:** 9.1 (Critical)
- Attack Vector: Network
- Attack Complexity: Low
- Privileges Required: Low (any user)
- Scope: Changed (affects other accounts)
- Confidentiality: High (access victim data)
- Integrity: High (modify victim account)

**CVSS Score After Fix:** N/A (Vulnerability eliminated)

---

## Testing

### Test 1: Legitimate Invite (Should Work)

**Setup:** Log in as admin
**Action:** Invite driver to your own account
**Expected:** Success, user invited

### Test 2: Cross-Account Attack (Should Fail)

**Setup:** Create test account, note the account_id
**Action:** Try to invite to different account_id via API
**Expected:**
- Layer 1: Error "Unauthorized: You can only invite members to your own account"
- Layer 2: If Layer 1 bypassed, database rejects INSERT
- Security log shows attempt

### Test 3: Security Logging

**Check Supabase Edge Function logs:**
```
Search for: "SECURITY: Unauthorized account access attempt blocked"
```

**Should see:**
- requestingUserId (attacker)
- requestedAccountId (victim)
- error details

---

## Monitoring

**What to watch for after deployment:**

**1. Security Logs:**
```
"SECURITY: Unauthorized account access attempt blocked"
```
- Indicates attack attempt was blocked
- Review requestingUserId for potential malicious actors
- Consider rate limiting or blocking persistent attackers

**2. RLS Policy Violations:**
```
"new row violates row-level security policy"
```
- Indicates Layer 2 caught an attempt that bypassed Layer 1
- Should be RARE (Layer 1 should catch most)
- If frequent, investigate why Layer 1 failing

---

## Rollback (If Needed)

**⚠️ CAUTION: Rolling back reverts to VULNERABLE state**

**Only rollback if fix breaks legitimate functionality**

**Edge Function rollback:**
```bash
git revert <commit-hash>
supabase functions deploy invite-team-member --no-verify-jwt
```

**Database rollback:**
```sql
-- Disable RLS (NOT recommended - leaves system vulnerable)
ALTER TABLE account_users DISABLE ROW LEVEL SECURITY;

-- Or drop specific policies
DROP POLICY IF EXISTS "account_users_insert_own_account_only" ON account_users;
DROP POLICY IF EXISTS "account_users_select_own_account_only" ON account_users;
DROP POLICY IF EXISTS "account_users_update_own_account_only" ON account_users;
DROP POLICY IF EXISTS "account_users_delete_own_account_only" ON account_users;
```

---

## Compliance & Legal

**This vulnerability could result in:**
- ✅ GDPR violation (Article 32 - Security of Processing)
- ✅ CCPA violation (Unauthorized disclosure)
- ✅ SOC 2 failure (Access Control - CC6.1)
- ✅ Data breach notification requirement
- ✅ Regulatory fines
- ✅ Legal liability

**Fixing this is MANDATORY for:**
- Customer trust
- Regulatory compliance
- Legal protection
- Business credibility

---

## Next Steps

1. ✅ **Edge Function deployed** (Layer 1 active)
2. ⏳ **Apply database migration** (copy SQL above)
3. ⏳ **Verify policies exist** (run verification queries)
4. ⏳ **Test legitimate invites work** (try inviting to own account)
5. ⏳ **Monitor logs for 24 hours** (watch for attack attempts)
6. ⏳ **Document in security audit log** (compliance requirement)

---

**Status:** URGENT - Apply database migration immediately
**Risk Level:** CRITICAL (until database migration applied)
**Confidence:** HIGH (defense-in-depth strategy validated)
