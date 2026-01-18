# System Impact Audit: account_id Validation Missing

**Date:** 2026-01-18
**Change Type:** Security Fix - CRITICAL
**Component:** invite-team-member Edge Function
**Severity:** CRITICAL (privilege escalation, cross-account access)

---

## Problem Statement

**CRITICAL SECURITY VULNERABILITY: Cross-Account Privilege Escalation**

**Current Behavior:**
- Admin from Account A invokes invite-team-member Edge Function
- Edge Function checks: "Is requesting user an admin?" (lines 112-121)
- Query: `SELECT role FROM account_users WHERE user_id = requesting_user.id`
- **MISSING:** No filter for `account_id` in admin check
- Result: If user is admin in ANY account → passes check
- Edge Function accepts `account_id` from request body (line 125)
- **VULNERABILITY:** Admin from Account A can send `account_id` for Account B
- Edge Function proceeds to invite users to Account B

**Attack Scenario:**
```
1. Attacker creates free account (Account A) → becomes admin
2. Attacker discovers target Account B's UUID (via enumeration or leaked data)
3. Attacker calls Edge Function with:
   {
     "account_id": "<Account B UUID>",
     "email": "attacker@example.com",
     "first_name": "Attacker",
     "last_name": "User",
     "role": "driver"
   }
4. Edge Function checks: "Is attacker an admin?" → YES (in Account A)
5. Edge Function doesn't check: "Is attacker admin OF Account B?" → MISSING
6. Attacker added to Account B as driver
7. Attacker can now access Account B's routes, data, etc.
```

**Impact:**
- **Data Breach:** Attacker gains access to victim's routes, delivery data, driver info
- **Seat Theft:** Attacker consumes victim's subscription seats
- **Billing Fraud:** Victim charged for attacker's seat
- **Privacy Violation:** Cross-account data access (potential GDPR/compliance issue)
- **Account Takeover:** Attacker could invite themselves as admin (if role validation also missing)

**Evidence:**

**Lines 112-121 (Current Code):**
```typescript
// Verify requesting user is an admin
const { data: requestingUserRole, error: roleError } = await supabaseClient
  .from('account_users')
  .select('role')
  .eq('user_id', requestingUser.id)  // ← ONLY checks user_id
  .single();  // ← NO account_id filter!

if (roleError || requestingUserRole?.role !== 'primary_admin') {
  throw new Error("Only admins can invite team members");
}
```

**Missing validation:**
- No check that `requestingUser.id` is admin OF `account_id` from request body
- Admin status is global (any account) not scoped to target account

---

## Boundary Analysis (Manual XF Discovery)

### 1. DATA FLOW

**Inputs:**
- Request body: `account_id`, `email`, `first_name`, `last_name`, `role`
- Auth token: `requestingUser.id` (from JWT)

**Current Validation:**
1. Check if `requestingUser.id` has role='primary_admin' in ANY account ❌
2. Accept `account_id` from request body (untrusted input) ❌
3. Use untrusted `account_id` to modify database ❌

**Missing Validation:**
- No verification that `requestingUser.id` is admin OF `account_id`
- Attacker controls `account_id` parameter

### 2. CALLERS (Upstream Dependencies)

**Legitimate Caller:**
- Frontend Teams page
- Admin logged into their own account
- Sends their own `account_id` in request

**Malicious Caller:**
- Attacker with valid JWT (any account)
- Sends DIFFERENT `account_id` (victim's account)
- Edge Function doesn't validate ownership

**Frontend Assumption:**
- Frontend sends user's own `account_id`
- Assumes backend validates this
- **WRONG:** Backend doesn't validate

### 3. CALLEES (Downstream Dependencies)

**Database Operations (All use untrusted account_id):**
- `check_seat_availability(account_id)` - Checks victim's seats
- `INSERT INTO account_users (account_id, ...)` - Adds to victim's account
- `update-subscription-quantity` - Charges victim's Stripe

**All operations trust the `account_id` from request body without validation.**

### 4. SIDE EFFECTS

**If Attacker Exploits This:**
1. Attacker added to victim's `account_users` table
2. Victim's seat count incremented
3. Victim's Stripe subscription charged
4. Attacker gains access to victim's data via RLS policies
5. Attacker can view victim's routes, machines, deliveries

### 5. STATE DEPENDENCIES

**Shared State Affected:**
- `account_users` table (attacker added to victim's account)
- `accounts.driver_count` (victim's seats consumed)
- Stripe subscription (victim charged)

**Trust Boundary Violated:**
- Request body `account_id` is UNTRUSTED input
- Function treats it as TRUSTED without validation

### 6. ERROR PROPAGATION

**Current Error Handling:**
- If user is not admin (in ANY account) → Error ✓
- If account_id doesn't match user's account → **NO ERROR** ❌

**What Happens on Attack:**
1. Attacker sends victim's account_id
2. Admin check passes (attacker is admin in their own account)
3. No error raised
4. Attacker added to victim's account
5. No audit trail of cross-account access

---

## Attack Vectors

### Attack Vector 1: Known account_id (Direct Attack)

**Prerequisites:**
- Attacker has valid account (free tier)
- Attacker knows victim's account_id UUID

**How to get victim's account_id:**
- Social engineering (shared invite link with account_id in URL)
- Database leak
- API response leakage
- UUID enumeration (if predictable)

**Attack:**
```bash
curl -X POST https://...supabase.co/functions/v1/invite-team-member \
  -H "Authorization: Bearer <attacker_jwt>" \
  -d '{
    "account_id": "<victim_account_uuid>",
    "email": "attacker@example.com",
    "first_name": "Attacker",
    "last_name": "User",
    "role": "driver"
  }'
```

**Result:** Attacker added to victim's account

### Attack Vector 2: UUID Enumeration

**If account UUIDs are sequential or predictable:**
```python
import uuid
import requests

# Try many UUIDs
for i in range(1000000):
    test_uuid = str(uuid.uuid4())
    response = invite_to_account(test_uuid, attacker_email)
    if response.success:
        print(f"Found valid account: {test_uuid}")
```

### Attack Vector 3: Privilege Escalation to Admin

**If attacker sends `role: "primary_admin"`:**
```json
{
  "account_id": "<victim_uuid>",
  "email": "attacker@example.com",
  "role": "primary_admin"  // ← Can attacker become admin?
}
```

**Current validation:**
- No check that non-super-admin can't create other admins
- Attacker could escalate to admin of victim account

---

## Fix Options Analysis

### Option 1: Validate account_id Against Requesting User (REQUIRED)

**Approach:**
```typescript
// After verifying user is admin, verify they're admin OF THIS ACCOUNT
const { data: requestingUserRole, error: roleError } = await supabaseClient
  .from('account_users')
  .select('role, account_id')
  .eq('user_id', requestingUser.id)
  .eq('account_id', account_id)  // ← ADD THIS
  .single();

if (roleError || requestingUserRole?.role !== 'primary_admin') {
  throw new Error("Only admins of this account can invite team members");
}
```

**What This Does:**
- Verifies user is admin (role='primary_admin')
- **AND** verifies admin status is for THIS SPECIFIC account
- If user is admin of Account A but tries to invite to Account B → FAIL

**Pros:**
- Simple fix (one line added)
- Eliminates vulnerability completely
- Clear error message
- No performance impact

**Cons:**
- None (this is mandatory)

### Option 2: Get account_id from Database, Not Request Body

**Approach:**
```typescript
// Don't trust account_id from request - get it from database
const { data: adminAccount, error: accountError } = await supabaseClient
  .from('account_users')
  .select('account_id, role')
  .eq('user_id', requestingUser.id)
  .eq('role', 'primary_admin')
  .single();

if (accountError || !adminAccount) {
  throw new Error("Only admins can invite team members");
}

// Use database-sourced account_id (TRUSTED)
const account_id = adminAccount.account_id;

// Request body should NOT include account_id
const { email, first_name, last_name, role, can_view_all_routes } = body;
```

**Pros:**
- Completely eliminates attack surface (request body can't influence account_id)
- Simpler frontend (no need to send account_id)
- Impossible to exploit

**Cons:**
- Breaks current frontend (expects to send account_id)
- Requires frontend changes
- What if user is admin of MULTIPLE accounts? (need to handle)

**Better for new implementation, but Option 1 is safer for quick fix.**

### Option 3: Database-Level RLS Policy (Defense in Depth)

**Approach:**
Add RLS policy to `account_users` table:
```sql
CREATE POLICY "Users can only invite to their own account"
ON account_users
FOR INSERT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM account_users admin
    WHERE admin.user_id = auth.uid()
      AND admin.account_id = account_users.account_id
      AND admin.role = 'primary_admin'
  )
);
```

**What This Does:**
- Database enforces that INSERT to account_users only succeeds if:
  - Requesting user (auth.uid()) is admin of that account
- Even if application code has bug, database rejects cross-account insert

**Pros:**
- Defense in depth (survives application bugs)
- Self-documenting (policy shows security requirement)
- Applies to ALL code paths (not just Edge Function)

**Cons:**
- More complex (harder to debug if misconfigured)
- Error message less friendly ("RLS policy violation" vs "not admin of account")

**Recommended:** Combine Option 1 + Option 3 (defense in depth)

---

## Recommended Solution

**DEFENSE IN DEPTH: Option 1 + Option 3**

**Layer 1 (Application):** Validate account_id in Edge Function
- Add `.eq('account_id', account_id)` to admin check
- Clear error message
- Fast fail (before database operations)

**Layer 2 (Database):** RLS policy on account_users
- Enforce at database level
- Catches bugs in application code
- Applies to all insert methods

**Why Both:**
- Layer 1 provides clear error messages and fast validation
- Layer 2 guarantees security even if Layer 1 has bugs
- RLS policy protects against other code paths (not just invite-team-member)

---

## Implementation Plan

### Change 1: Update Admin Validation in Edge Function

**File:** `/home/visionairy/StockerAI/supabase/functions/invite-team-member/index.ts`

**Replace lines 112-121:**
```typescript
// OLD (VULNERABLE):
const { data: requestingUserRole, error: roleError } = await supabaseClient
  .from('account_users')
  .select('role')
  .eq('user_id', requestingUser.id)
  .single();

if (roleError || requestingUserRole?.role !== 'primary_admin') {
  throw new Error("Only admins can invite team members");
}

// NEW (SECURE):
const { data: requestingUserRole, error: roleError } = await supabaseClient
  .from('account_users')
  .select('role, account_id')
  .eq('user_id', requestingUser.id)
  .eq('account_id', account_id)  // ← CRITICAL: Validate account ownership
  .single();

if (roleError || requestingUserRole?.role !== 'primary_admin') {
  logStep("SECURITY: Unauthorized account access attempt", {
    requestingUserId: requestingUser.id,
    requestedAccountId: account_id,
    error: roleError?.message
  });
  throw new Error("Unauthorized: You can only invite members to your own account");
}
```

**Move validation AFTER request body parsing:**
- Need to parse body first to get `account_id`
- Then validate admin status for that specific account

### Change 2: Add RLS Policy to account_users Table

**File:** `/home/visionairy/StockerAI/supabase/migrations/20260118_account_users_rls_policy.sql`

```sql
-- Migration: Add RLS policy to prevent cross-account invites
-- Date: 2026-01-18
-- Purpose: Defense-in-depth security for account_id validation
-- System Impact Audit: /docs/audits/AUDIT_2026-01-18_account_id_validation.md

-- Ensure RLS is enabled on account_users
ALTER TABLE account_users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only insert into accounts where they are admins
CREATE POLICY "account_users_insert_own_account_only"
ON account_users
FOR INSERT
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

-- Policy: Users can only view account_users for accounts they belong to
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

-- Policy: Admins can update users in their own account
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
);

-- Policy: Admins can delete users from their own account
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
  'Prevents cross-account privilege escalation. Users can only invite to accounts where they are admins.';

COMMENT ON POLICY "account_users_select_own_account_only" ON account_users IS
  'Users can only view account_users for accounts they belong to. Prevents data leakage.';
```

---

## Testing Plan

### Test Scenario 1: Legitimate Admin Invites to Own Account (Happy Path)

**Setup:**
- User A is admin of Account A
- User A invites driver to Account A

**Expected:**
- Admin validation passes (user is admin of requested account)
- User created successfully
- RLS policy allows INSERT
- **PASS**

### Test Scenario 2: Cross-Account Attack (Security Test)

**Setup:**
- Attacker is admin of Account A
- Attacker tries to invite user to Account B (victim's account)

**Request:**
```json
{
  "account_id": "<Account B UUID>",
  "email": "attacker@example.com",
  "role": "driver"
}
```

**Expected WITH FIX:**
- Admin validation fails (attacker not admin of Account B)
- Error: "Unauthorized: You can only invite members to your own account"
- RLS policy blocks INSERT (even if application code bypassed)
- Logs "SECURITY: Unauthorized account access attempt"
- **PASS** (attack prevented)

**Expected WITHOUT FIX (current bug):**
- Admin validation passes (attacker is admin in Account A)
- User added to Account B
- **FAIL** (vulnerability exploited)

### Test Scenario 3: Non-Admin User Attempts Invite

**Setup:**
- User is driver (not admin) in Account A
- User tries to invite to Account A

**Expected:**
- Admin validation fails (user role is 'driver' not 'primary_admin')
- Error: "Unauthorized: You can only invite members to your own account"
- **PASS**

### Test Scenario 4: RLS Policy Enforcement (Layer 2 Test)

**Setup:**
- Simulate application code with bug (bypasses Layer 1 validation)
- Direct INSERT attempt to account_users for different account

**Test:**
```sql
-- As user who is admin of Account A
-- Try to INSERT into Account B
INSERT INTO account_users (account_id, user_id, role)
VALUES ('<Account B UUID>', '<user_uuid>', 'driver');
```

**Expected:**
- RLS policy rejects INSERT
- Error: "new row violates row-level security policy"
- **PASS** (Layer 2 defense works)

### Test Scenario 5: Logging and Audit Trail

**Setup:**
- Attacker attempts cross-account invite

**Expected:**
- Edge Function logs:
  ```
  "SECURITY: Unauthorized account access attempt"
  requestingUserId: <attacker_id>
  requestedAccountId: <victim_account_id>
  ```
- Allows forensic analysis of attack attempts

---

## Security Impact

### Before Fix (CRITICAL Vulnerability)

**CVSS Score:** 9.1 (Critical)
- **Attack Vector:** Network (AV:N)
- **Attack Complexity:** Low (AC:L)
- **Privileges Required:** Low (PR:L) - any registered user
- **User Interaction:** None (UI:N)
- **Scope:** Changed (S:C) - affects other accounts
- **Confidentiality:** High (C:H) - access to victim's data
- **Integrity:** High (I:H) - modify victim's account
- **Availability:** Low (A:L) - consume victim's seats

### After Fix (Secure)

**Vulnerability:** Eliminated
- Application validates account ownership
- Database enforces with RLS policies
- Defense in depth strategy

---

## Rollback Plan

**If fix causes issues:**

**Edge Function:**
```typescript
// Revert to previous version (remove account_id validation)
git revert <commit-hash>
supabase functions deploy invite-team-member --no-verify-jwt
```

**Database RLS Policies:**
```sql
-- Disable policies temporarily
ALTER TABLE account_users DISABLE ROW LEVEL SECURITY;

-- Or drop specific policies
DROP POLICY IF EXISTS "account_users_insert_own_account_only" ON account_users;
-- ... (drop others)
```

**Rollback is RISKY because:**
- Reverts to vulnerable state
- Only rollback if fix breaks legitimate functionality
- Prioritize fixing the fix over rolling back security

---

## Success Criteria

**Functionality:**
- ✅ Legitimate admins can invite to own account
- ✅ Cross-account invites blocked at application level
- ✅ Cross-account invites blocked at database level (RLS)
- ✅ Clear error messages for unauthorized attempts
- ✅ Security events logged for audit

**Security:**
- ✅ Attack Vector 1 (known account_id) - BLOCKED
- ✅ Attack Vector 2 (UUID enumeration) - BLOCKED
- ✅ Attack Vector 3 (privilege escalation) - BLOCKED
- ✅ Defense in depth (2 layers of protection)

---

## Affected Boundaries Summary

| Boundary | Impact | Changes Required |
|----------|--------|------------------|
| **EDGE FUNCTION** | High | Add account_id validation to admin check |
| **DATABASE (RLS)** | High | Add 4 RLS policies to account_users table |
| **FRONTEND** | None | No changes needed |
| **SECURITY** | Critical | Eliminates privilege escalation vulnerability |
| **AUDIT LOGS** | Medium | Add logging for unauthorized access attempts |

---

## Compliance Impact

**Data Protection Regulations:**
- **GDPR:** Prevents unauthorized access to personal data (Article 32)
- **CCPA:** Prevents disclosure of personal information
- **SOC 2:** Access control requirements (CC6.1)

**This vulnerability could result in:**
- Data breach notifications required
- Regulatory fines
- Loss of customer trust
- Legal liability

**Fix is MANDATORY for compliance.**

---

## Approval Required

**Before implementation:**
- [ ] User approves fix approach (Option 1 + Option 3)
- [ ] User approves RLS policy deployment
- [ ] User approves security logging

**Questions for User:**
1. Should we alert/log every unauthorized access attempt? (I recommend YES)
2. Should we implement additional admin action logging? (who invited whom, when)
3. Is it acceptable to enable RLS on account_users table? (might affect other queries)
