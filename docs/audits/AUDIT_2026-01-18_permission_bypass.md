# System Impact Audit: Permission Bypass Vulnerabilities

**Date:** 2026-01-18
**Change Type:** Security Fix - CRITICAL
**Component:** invite-team-member Edge Function + Teams Frontend
**Severity:** CRITICAL (account lockout, permission bypass)

---

## Problem Statement

**Multiple Permission Bypass Vulnerabilities Identified**

### Issue 4.1: JWT Verification Status (VERIFICATION NEEDED)

**Current Deployment:**
- Edge Function deployed with `--no-verify-jwt` flag
- Function manually verifies JWT at line 85: `supabaseClient.auth.getUser(token)`

**Question:** Is JWT verification sufficient?
- Manual verification is in place (line 79-93)
- Uses Supabase auth.getUser() which validates JWT
- **Status:** APPEARS SECURE (needs confirmation)

---

### Issue 4.2: Last Admin Protection (CRITICAL - NOT IMPLEMENTED)

**Current Behavior:**
- Account can have multiple admins
- Admin can change ANY user's role (including their own)
- **NO CHECK:** Prevent last admin from changing own role to driver
- Result: Account with NO admins (team management locked forever)

**Attack/Accident Scenario:**
```
1. Account has 1 admin (User A)
2. Admin A goes to Teams page, edits own role to "driver"
3. Frontend may warn but doesn't prevent submission
4. Edge Function doesn't check "is this the last admin?"
5. Admin A role changed to driver
6. Account now has 0 admins
7. No one can invite new members, manage team, etc.
8. ACCOUNT PERMANENTLY LOCKED
```

**Impact:**
- **Account Lockout:** No way to manage team
- **Support Burden:** Manual intervention required
- **Business Disruption:** Can't add/remove team members
- **No Self-Recovery:** User cannot fix this themselves

**Evidence:**
- Frontend may have warning (Teams.tsx line 272) but no enforcement
- No database constraint preventing 0 admins
- No Edge Function check for last admin

---

### Issue 4.3: can_view_all_routes Flag Not Enforced (MEDIUM - VERIFICATION NEEDED)

**Current Behavior:**
- `account_users` table has `can_view_all_routes` boolean field
- Field is set when inviting users
- **QUESTION:** Is this flag actually enforced in route queries?

**Potential Impact:**
- Driver with `can_view_all_routes=false` might see ALL routes
- Privacy leak (driver sees routes not assigned to them)
- Permission flag exists but may be ignored

**Needs Verification:**
- Check MyRoutes.tsx query
- Check route assignment logic
- Check if RLS policies enforce this flag

---

## Boundary Analysis (Manual XF Discovery)

### 1. DATA FLOW

**Inputs:**
- JWT token (requestingUser.id)
- account_id (from request body, now validated per Bug #3 fix)
- role (can be "driver" or "primary_admin")
- can_view_all_routes (boolean flag)

**Current Validation:**
1. ✅ JWT verified (line 85)
2. ✅ account_id validated (Bug #3 fix, line 127)
3. ✅ Admin role checked (line 130)
4. ❌ Last admin protection - NOT CHECKED
5. ? can_view_all_routes enforcement - UNKNOWN

### 2. CALLERS (Upstream Dependencies)

**Legitimate Caller:**
- Frontend Teams page (Admin clicks "Invite" or "Edit Role")
- Sends JWT token in Authorization header
- Sends role change request

**Edge Cases:**
- Admin edits own role to driver (should this be allowed?)
- Last admin changes own role (should be prevented)
- Frontend might warn but can't enforce (user can bypass via DevTools)

### 3. CALLEES (Downstream Dependencies)

**Database Operations:**
- INSERT into account_users (new member)
- UPDATE account_users (role change for existing member)
- **Missing:** SELECT to count current admins before role change

**State Changes:**
- User role changed in account_users
- No validation that at least 1 admin remains

### 4. SIDE EFFECTS

**If Last Admin Locks Self Out:**
1. Account has 0 admins
2. No one can invite new members
3. No one can promote users to admin
4. Account management frozen
5. Requires manual database intervention
6. Support ticket required

**Customer Impact:**
- Angry customer
- Lost productivity
- Support costs
- Reputation damage

### 5. STATE DEPENDENCIES

**Shared State:**
- `account_users` table admin count
- Must maintain: COUNT(admins) >= 1 at ALL times
- **Currently:** No enforcement mechanism

### 6. ERROR PROPAGATION

**Current Error Handling:**
- If last admin changes own role → NO ERROR
- Operation succeeds silently
- Account locked with no warning

**What Should Happen:**
- Check admin count BEFORE role change
- If changing last admin → REJECT with clear error
- Message: "Cannot change role: You are the last admin. Promote another user to admin first."

---

## Fix Options Analysis

### Fix 4.1: JWT Verification (VERIFICATION ONLY - No Fix Needed)

**Current Implementation:**
```typescript
// Line 79-93
const authHeader = req.headers.get("Authorization");
if (!authHeader) {
  throw new Error("No authorization header provided");
}

const token = authHeader.replace("Bearer ", "");
const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
if (userError) {
  throw new Error(`Authentication error: ${userError.message}`);
}
```

**Analysis:**
- ✅ JWT token required
- ✅ Validated via Supabase auth.getUser()
- ✅ User identity verified
- ✅ --no-verify-jwt flag is correct (function does manual verification)

**Recommendation:** NO FIX NEEDED (already secure)

---

### Fix 4.2: Last Admin Protection (CRITICAL - MUST IMPLEMENT)

**Option A: Application-Level Check (Recommended)**

Add check before role changes:

```typescript
// If changing an existing user's role to non-admin
if (!isNewUser && role !== 'primary_admin') {
  // Check if this user is currently an admin
  const { data: currentRole } = await supabaseClient
    .from('account_users')
    .select('role')
    .eq('user_id', userId)
    .eq('account_id', account_id)
    .single();

  if (currentRole?.role === 'primary_admin') {
    // Count other admins in this account
    const { data: adminCount } = await supabaseClient
      .from('account_users')
      .select('id')
      .eq('account_id', account_id)
      .eq('role', 'primary_admin');

    if (adminCount && adminCount.length === 1) {
      // This is the last admin
      throw new Error(
        "Cannot change role: You are the last admin for this account. " +
        "Promote another user to admin before changing your own role."
      );
    }
  }
}
```

**Pros:**
- Clear error message
- Prevents accidental lockout
- No database schema changes needed

**Cons:**
- Race condition possible (two admins demote simultaneously)
- Need Layer 2 defense (database constraint)

**Option B: Database Constraint (Defense in Depth)**

Add trigger to prevent last admin removal:

```sql
CREATE OR REPLACE FUNCTION prevent_last_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_admin_count INTEGER;
BEGIN
  -- Only check if role is being changed FROM admin TO non-admin
  IF TG_OP = 'UPDATE' AND OLD.role = 'primary_admin' AND NEW.role != 'primary_admin' THEN
    -- Count remaining admins (excluding this row)
    SELECT COUNT(*) INTO v_admin_count
    FROM account_users
    WHERE account_id = OLD.account_id
      AND role = 'primary_admin'
      AND id != OLD.id;

    IF v_admin_count = 0 THEN
      RAISE EXCEPTION 'Cannot remove last admin from account. Promote another user to admin first.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_last_admin_removal_trigger
  BEFORE UPDATE ON account_users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_last_admin_removal();
```

**Pros:**
- Foolproof (database enforces)
- Survives application bugs
- Prevents race conditions

**Cons:**
- Generic error message
- Requires database migration

**Recommendation:** BOTH (Defense in Depth)
- Option A for clear error messages
- Option B for absolute guarantee

---

### Fix 4.3: can_view_all_routes Enforcement (VERIFICATION NEEDED)

**Step 1: Verify Current Enforcement**

Check route queries in frontend:
```sql
-- Should routes be filtered by can_view_all_routes?
SELECT *
FROM routes
WHERE account_id = <user's account>
  AND (
    can_view_all_routes = true
    OR assigned_driver_id = <user_id>
  );
```

**Step 2: If Not Enforced, Add RLS Policy**

```sql
CREATE POLICY "routes_visibility_by_permission"
ON routes
FOR SELECT
TO authenticated
USING (
  account_id IN (
    SELECT account_id
    FROM account_users
    WHERE user_id = auth.uid()
      AND (
        can_view_all_routes = true
        OR role = 'primary_admin'
      )
  )
  OR
  -- Driver can see routes assigned to them
  assigned_driver_id = auth.uid()
);
```

**Recommendation:**
1. First VERIFY if this is actually a problem
2. Check MyRoutes.tsx query
3. If not enforced, add RLS policy

---

## Recommended Solution

**PRIORITY ORDER:**

**1. Fix 4.2 (CRITICAL): Last Admin Protection**
- Implement Option A (application check) immediately
- Add Option B (database trigger) for defense in depth
- Test: Try to demote last admin → should fail

**2. Verify 4.1: JWT Verification**
- Review current implementation
- Confirm security is adequate
- Document that manual verification is intentional

**3. Verify 4.3: can_view_all_routes**
- Check if flag is actually enforced
- If not enforced, decide if this is desired behavior
- If should be enforced, add RLS policy

---

## Implementation Plan

### Change 1: Add Last Admin Check to Edge Function

**File:** `/home/visionairy/StockerAI/supabase/functions/invite-team-member/index.ts`

**Add after line 260 (after account_users INSERT/UPDATE):**

```typescript
// SECURITY: Prevent last admin from being demoted (account lockout protection)
// This check happens AFTER determining if user is new or existing
if (!isNewUser && role !== 'primary_admin') {
  // Check if user being updated is currently an admin
  const { data: currentUserRole } = await supabaseClient
    .from('account_users')
    .select('role')
    .eq('user_id', userId)
    .eq('account_id', account_id)
    .single();

  if (currentUserRole?.role === 'primary_admin') {
    // User is currently admin, being changed to non-admin
    // Check if this is the last admin
    const { data: adminCount, error: countError } = await supabaseClient
      .from('account_users')
      .select('id')
      .eq('account_id', account_id)
      .eq('role', 'primary_admin');

    if (countError) {
      logStep("Warning: Failed to count admins", { error: countError.message });
    }

    if (adminCount && adminCount.length === 1) {
      // This is the last admin
      logStep("SECURITY: Last admin demotion prevented", {
        account_id,
        userId,
        adminCount: adminCount.length
      });

      throw new Error(
        "Cannot change role: You are the last admin for this account. " +
        "Promote another user to admin before changing your own role."
      );
    }

    logStep("Admin demotion allowed", {
      remainingAdmins: adminCount ? adminCount.length - 1 : 0
    });
  }
}
```

### Change 2: Add Database Trigger (Defense in Depth)

**File:** `/home/visionairy/StockerAI/supabase/migrations/20260118_prevent_last_admin_removal.sql`

```sql
-- Migration: Prevent last admin removal (account lockout protection)
-- Date: 2026-01-18
-- Purpose: Defense-in-depth security to prevent accounts from having zero admins
-- System Impact Audit: /docs/audits/AUDIT_2026-01-18_permission_bypass.md

-- Trigger function to prevent last admin from being demoted
CREATE OR REPLACE FUNCTION prevent_last_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_admin_count INTEGER;
BEGIN
  -- Only check if role is being changed FROM admin TO non-admin
  IF TG_OP = 'UPDATE' AND OLD.role = 'primary_admin' AND NEW.role != 'primary_admin' THEN
    -- Count remaining admins (excluding this row being updated)
    SELECT COUNT(*) INTO v_admin_count
    FROM account_users
    WHERE account_id = OLD.account_id
      AND role = 'primary_admin'
      AND id != OLD.id;  -- Exclude the admin being demoted

    IF v_admin_count = 0 THEN
      RAISE EXCEPTION 'Cannot remove last admin from account. Promote another user to admin first.'
        USING ERRCODE = 'check_violation',
              HINT = 'At least one admin is required per account.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS prevent_last_admin_removal_trigger ON account_users;

-- Create trigger
CREATE TRIGGER prevent_last_admin_removal_trigger
  BEFORE UPDATE ON account_users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_last_admin_removal();

-- Comment for documentation
COMMENT ON FUNCTION prevent_last_admin_removal IS
  'SECURITY: Prevents last admin from being demoted, which would lock the account. Ensures every account always has at least one admin.';
```

---

## Testing Plan

### Test Scenario 1: Last Admin Protection (Application Layer)

**Setup:**
- Account with 1 admin (User A)
- User A tries to change own role to driver

**Expected:**
- Admin count check runs
- Detects: adminCount.length === 1
- Error: "Cannot change role: You are the last admin..."
- Role change rejected
- **PASS**

### Test Scenario 2: Last Admin Protection (Database Layer)

**Setup:**
- Bypass application layer (direct database UPDATE)
- Try to change last admin's role to driver

**Test:**
```sql
UPDATE account_users
SET role = 'driver'
WHERE user_id = <last_admin_id>
  AND account_id = <account_id>
  AND role = 'primary_admin';
```

**Expected:**
- Trigger fires before UPDATE
- Admin count check runs
- Detects: 0 remaining admins
- EXCEPTION raised: "Cannot remove last admin..."
- UPDATE rejected
- **PASS**

### Test Scenario 3: Multiple Admins (Should Allow)

**Setup:**
- Account with 2 admins (User A, User B)
- User A changes own role to driver

**Expected:**
- Admin count check runs
- Detects: adminCount.length === 2
- 1 admin will remain after demotion
- Role change allowed
- **PASS**

### Test Scenario 4: JWT Verification

**Setup:**
- Try to call Edge Function with invalid JWT
- Try with missing Authorization header
- Try with expired token

**Expected:**
- All attempts rejected
- Error: "Authentication error" or "No authorization header"
- **PASS**

### Test Scenario 5: can_view_all_routes Enforcement (If Implemented)

**Setup:**
- Driver with can_view_all_routes=false
- Driver tries to query routes table

**Expected:**
- Only sees routes assigned to them
- Cannot see routes assigned to other drivers
- **VERIFY if this is currently enforced**

---

## Rollback Plan

**Edge Function Rollback:**
```bash
git revert <commit-hash>
supabase functions deploy invite-team-member --no-verify-jwt
```

**Database Trigger Rollback:**
```sql
DROP TRIGGER IF EXISTS prevent_last_admin_removal_trigger ON account_users;
DROP FUNCTION IF EXISTS prevent_last_admin_removal();
```

**Rollback is LOW RISK because:**
- Only adds validation, doesn't change data model
- Reverting returns to current behavior (no lockout protection)

---

## Success Criteria

**Fix 4.2 (Last Admin Protection):**
- ✅ Single admin cannot demote self (application prevents)
- ✅ Database trigger catches bypass attempts
- ✅ Clear error message guides user
- ✅ Multiple admins can demote each other normally

**Verification 4.1 (JWT):**
- ✅ JWT verification is secure
- ✅ Documentation updated

**Verification 4.3 (can_view_all_routes):**
- ✅ Verified if enforcement needed
- ✅ If needed, RLS policy added

---

## Affected Boundaries Summary

| Boundary | Impact | Changes Required |
|----------|--------|------------------|
| **EDGE FUNCTION** | Medium | Add last admin check before role change |
| **DATABASE (Trigger)** | Medium | Add trigger to prevent last admin removal |
| **FRONTEND** | None | Already has warning (line 272) |
| **SECURITY** | High | Prevents account lockout |
| **UX** | High | Clear error message guides user |

---

## Approval Required

**Before implementation:**
- [ ] User approves last admin protection approach
- [ ] User approves database trigger (defense in depth)
- [ ] User confirms JWT verification is adequate
- [ ] User decides if can_view_all_routes should be enforced

**Questions for User:**
1. Should we allow admin to demote self if other admins exist? (I recommend YES)
2. Should we add UI to prevent last admin demotion attempt? (I recommend YES - better UX)
3. Should can_view_all_routes be enforced via RLS? (Need to check if it's currently a problem)
