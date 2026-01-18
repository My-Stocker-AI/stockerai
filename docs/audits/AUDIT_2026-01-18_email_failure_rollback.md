# System Impact Audit: Email Failure Rollback

**Date:** 2026-01-18
**Change Type:** Bug Fix - CRITICAL
**Component:** invite-team-member Edge Function
**Severity:** CRITICAL (creates broken user accounts)

---

## Problem Statement

**Current Behavior:**
- Admin invites user via Teams page
- Edge Function creates user in auth.users (lines 185-203)
- Edge Function inserts profile (lines 206-218)
- Edge Function adds to account_users (lines 248-260)
- Edge Function sends invite email (lines 264-305)
- **IF EMAIL FAILS:** Edge Function logs warning but returns success (lines 276-281, 300-304)

**Impact:**
- User exists in database (auth.users, profiles, account_users)
- User NEVER receives invite email (Supabase Auth API failed)
- User cannot login (no password set, email not confirmed)
- User appears in Teams list but is broken
- Takes seat in subscription (billing impact if driver)
- No notification to admin that email failed
- Manual intervention required (delete user, re-invite)

**Evidence:**
```typescript
// Lines 276-281 (existing users)
if (inviteError) {
  logStep("Warning: Failed to send invite email", { error: inviteError.message });
  // Don't fail the whole operation if email fails ← BUG IS HERE
} else {
  logStep("Invite email sent with admin info", { adminName });
}

// Lines 300-304 (new users)
if (inviteError) {
  logStep("Warning: Failed to send invite email", { error: inviteError.message });
} else {
  logStep("Invite email sent for new user with admin info", { adminName });
}
```

---

## Boundary Analysis (Manual XF Discovery)

### 1. DATA FLOW

**Inputs to Edge Function:**
- Request body: `{ email, first_name, last_name, role, can_view_all_routes }`
- Auth header: Bearer token (admin verification)
- Admin context: `account_id`, `adminName`, `adminEmail` (from profiles table)

**Outputs from Edge Function:**
- Success response: `{ success: true, message: "User invited successfully", userId, isNewUser }`
- Error response: `{ success: false, error: "message" }`

**Side-Effect Data Changes:**
1. `auth.users` table: New user created or existing user updated
2. `profiles` table: Profile created or upserted
3. `account_users` table: User added to account or role updated
4. Stripe: Subscription quantity updated (if role=driver)
5. Email service: Invite email sent (or FAILS)

### 2. CALLERS (Upstream Dependencies)

**Frontend Component:**
- File: `/src/pages/dashboard/Teams.tsx` (assumed, not verified)
- Action: Admin clicks "Invite" button
- Expectation: Success response = user successfully invited
- UI Behavior: Shows success toast, adds user to team list
- **BROKEN:** Success response even when email fails → UI shows success but user can't login

**Admin User:**
- Sees "User invited successfully" message
- Expects user to receive email
- **NO WARNING** that email failed

### 3. CALLEES (Downstream Dependencies)

**Supabase Auth API:**
- `supabaseClient.auth.admin.createUser()` - Creates user (lines 185-192)
- `supabaseClient.auth.admin.inviteUserByEmail()` - Sends invite email (lines 265-274, 289-298)
- **CRITICAL:** Email send can FAIL (API error, rate limit, invalid email, etc.)

**Database Tables:**
- `auth.users` - User account created
- `profiles` - User profile created
- `account_users` - User linked to account with role

**Stripe API (via update-subscription-quantity):**
- Subscription quantity incremented (if role=driver)
- Pro-rated charge applied
- **BILLING IMPACT:** Seat taken even if user can't login

**Email Service (Supabase Auth backend):**
- Sends invite email with magic link
- Can fail for many reasons (bounced email, service down, rate limits)

### 4. SIDE EFFECTS

**Permanent State Changes:**
1. User created in auth.users (UUID generated)
2. Profile created in profiles table
3. User added to account_users with role
4. Stripe subscription quantity incremented (if driver)
5. Seat count incremented

**If Email Fails:**
- User exists but CANNOT ACCESS SYSTEM
- Seat occupied but unusable
- Billing charged for unusable seat
- Manual cleanup required

### 5. STATE DEPENDENCIES

**Transaction Boundary:**
- NO TRANSACTION wrapping user creation + email send
- Each operation is independent commit
- **CRITICAL:** Can't rollback auth.users creation if email fails (Supabase Auth is separate service)

**Shared State:**
- `account_users` table: Affects seat count queries
- Stripe subscription: Affects billing
- Admin's team list: Shows broken user

### 6. ERROR PROPAGATION

**Current Error Handling:**
- User creation errors → throw error → rollback entire operation ✅ CORRECT
- Profile creation errors → throw error → rollback entire operation ✅ CORRECT
- account_users errors → throw error → rollback entire operation ✅ CORRECT
- **Email errors → log warning → continue → return success ❌ BUG**

**What Happens When Email Fails:**
1. Function returns `{ success: true }` ← WRONG
2. Frontend shows "User invited successfully" ← MISLEADING
3. Admin expects user to receive email ← WRONG
4. User never receives email ← BROKEN
5. User tries to login → "Invalid credentials" ← CONFUSING
6. Admin must manually delete user and re-invite ← TEDIOUS

---

## Fix Options Analysis

### Option 1: Fail Entire Operation If Email Fails (Strict)

**Approach:**
```typescript
const { error: inviteError } = await supabaseClient.auth.admin.inviteUserByEmail(...);

if (inviteError) {
  // Rollback: Delete user, profile, account_users
  throw new Error(`Failed to send invite email: ${inviteError.message}`);
}
```

**Pros:**
- Consistent state (no broken users)
- Clear error message to admin
- No billing impact for failed invites
- No manual cleanup needed

**Cons:**
- Requires rollback mechanism (delete from auth.users, profiles, account_users)
- Supabase Auth admin.deleteUser() needed
- Stripe quantity already updated (need to undo)
- Complex error handling

**Rollback Complexity:**
- Can't use database transactions (auth.users is separate service)
- Must manually delete from auth.users via admin API
- Must delete from profiles
- Must delete from account_users
- Must undo Stripe quantity update
- **CRITICAL:** What if rollback ITSELF fails?

### Option 2: Keep User Creation, Return Warning to Frontend (Soft Fail)

**Approach:**
```typescript
const { error: inviteError } = await supabaseClient.auth.admin.inviteUserByEmail(...);

if (inviteError) {
  return new Response(JSON.stringify({
    success: true, // User created successfully
    warning: `User created but email failed: ${inviteError.message}`,
    userId,
    emailFailed: true,
    action_required: "Manually re-send invite or delete user"
  }), { headers: { "Content-Type": "application/json" } });
}
```

**Frontend Changes Required:**
- Detect `emailFailed: true` in response
- Show warning toast instead of success
- Provide "Resend Invite" button
- Provide "Delete User" button

**Pros:**
- No rollback complexity
- Admin gets clear warning
- User exists, can be fixed easily
- Billing already applied (no undo needed)

**Cons:**
- Requires frontend changes
- User exists but broken (until admin acts)
- Seat taken but unusable (until admin acts)

### Option 3: Implement Retry Logic (3 Attempts with Exponential Backoff)

**Approach:**
```typescript
async function sendInviteWithRetry(email: string, data: any, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { error } = await supabaseClient.auth.admin.inviteUserByEmail(email, data);

    if (!error) {
      return { success: true };
    }

    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    } else {
      return { success: false, error };
    }
  }
}
```

**Pros:**
- Handles transient failures (network glitches, rate limits)
- No rollback needed if retry succeeds
- Transparent to admin if retry works

**Cons:**
- Increases Edge Function execution time
- May hit timeout (default 60s)
- Doesn't help if email is invalid or service is down
- Still need fallback for persistent failures

### Option 4: Queue Email for Async Retry, Mark User as "Pending Email" (Complex)

**Approach:**
- Add `email_status` field to account_users: `'pending' | 'sent' | 'failed'`
- Store failed invites in queue table
- Background job retries every 5 minutes
- Admin sees "Pending email" status in Teams list

**Pros:**
- No blocking delay
- Handles persistent failures
- Clear status tracking
- Automatic recovery

**Cons:**
- Requires new database table (`email_queue`)
- Requires background job infrastructure
- Complex implementation
- Overkill for initial MVP

---

## Recommended Solution

**PHASE 1 (Immediate Fix):** Option 2 + Option 3 Combined + NO CHARGE Business Rule

**CRITICAL BUSINESS RULE:** No confirmed email = No charge (per user requirement)

**Implementation:**
1. Implement retry logic (3 attempts with 1s, 2s, 4s delays)
2. If all retries fail → return warning response with `emailFailed: true` + **EXIT BEFORE BILLING**
3. User exists in database but Stripe subscription is NOT updated
4. Frontend shows warning toast: "User created but invite email failed. User NOT charged."
5. Add "Resend Invite" button in Teams page (future enhancement)

**Why This Approach:**
- Handles transient failures automatically (retry)
- Clear error communication to admin (warning response)
- **No billing for broken users** (ethical requirement)
- No complex rollback logic
- No new infrastructure needed
- Can implement quickly
- Low risk

**Key Flow:**
1. Create user → Create profile → Add to account_users
2. **Send email with retry (3 attempts)**
3. **If email fails → return warning + exit (billing code never runs)**
4. **If email succeeds → continue to billing update (Stripe charged)**

**PHASE 2 (Future Enhancement):**
- Add "Resend Invite" button in Teams UI (triggers email + billing together)
- Add email status tracking in account_users
- Consider background retry queue for persistent failures

---

## Implementation Plan

### Required Changes

**File:** `/home/visionairy/StockerAI/supabase/functions/invite-team-member/index.ts`

**Change 1: Add retry helper function** (lines 10-30)
```typescript
async function sendInviteWithRetry(
  supabaseClient: any,
  email: string,
  inviteData: any,
  maxRetries = 3
): Promise<{ success: boolean; error?: any }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { error } = await supabaseClient.auth.admin.inviteUserByEmail(email, inviteData);

    if (!error) {
      return { success: true };
    }

    // If not last attempt, wait before retry (exponential backoff)
    if (attempt < maxRetries) {
      const delayMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delayMs));
      console.log(`Retry ${attempt}/${maxRetries - 1} after ${delayMs}ms delay`);
    } else {
      // All retries exhausted
      return { success: false, error };
    }
  }

  return { success: false, error: new Error("Max retries reached") };
}
```

**Change 2: Replace existing user email send** (lines 264-282)
```typescript
// Re-send invite email with template data
if (!isNewUser) {
  const inviteData = {
    data: {
      admin_name: adminName,
      admin_email: adminEmail,
      first_name,
      last_name,
      role
    },
    redirectTo: `${Deno.env.get("SITE_URL") || "https://my-stocker-ai.com"}/auth/callback?type=invite`
  };

  const retryResult = await sendInviteWithRetry(supabaseClient, email, inviteData);

  if (!retryResult.success) {
    logStep("CRITICAL: Failed to send invite email after 3 retries", { error: retryResult.error });

    return new Response(JSON.stringify({
      success: true, // User was created successfully
      warning: `User updated successfully but invite email failed: ${retryResult.error?.message || 'Unknown error'}`,
      userId,
      isNewUser: false,
      emailFailed: true,
      action_required: "User can be re-invited from Teams page"
    }), {
      headers: { "Content-Type": "application/json" },
      status: 200 // 200 because user operation succeeded, email is secondary
    });
  } else {
    logStep("Invite email sent with admin info", { adminName });
  }
}
```

**Change 3: Replace new user email send** (lines 283-305)
```typescript
else {
  // For new users, update the user to trigger invite with proper data
  const { error: updateError } = await supabaseClient.auth.admin.updateUserById(userId, {
    email_confirm: false // Ensure they need to confirm via invite
  });

  // Now send invite with template data
  const inviteData = {
    data: {
      admin_name: adminName,
      admin_email: adminEmail,
      first_name,
      last_name,
      role
    },
    redirectTo: `${Deno.env.get("SITE_URL") || "https://my-stocker-ai.com"}/auth/callback?type=invite`
  };

  const retryResult = await sendInviteWithRetry(supabaseClient, email, inviteData);

  if (!retryResult.success) {
    logStep("CRITICAL: Failed to send invite email for new user after 3 retries", { error: retryResult.error });

    // CRITICAL DECISION: User created but can't receive email
    // Options: 1) Rollback user creation, 2) Return warning
    // CHOOSING: Return warning (safer, allows manual recovery)

    return new Response(JSON.stringify({
      success: true, // User was created successfully
      warning: `User created successfully but invite email failed: ${retryResult.error?.message || 'Unknown error'}`,
      userId,
      isNewUser: true,
      emailFailed: true,
      action_required: "User exists but cannot login. Re-send invite from Teams page or delete user."
    }), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });
  } else {
    logStep("Invite email sent for new user with admin info", { adminName });
  }
}
```

**Change 4: Update success response to include email status** (line 340+)
```typescript
return new Response(JSON.stringify({
  success: true,
  message: isNewUser ? "User invited successfully" : "User role updated successfully",
  userId,
  isNewUser,
  emailSent: true // Indicates email was sent successfully
}), {
  headers: { "Content-Type": "application/json" },
  status: 200
});
```

---

## Testing Plan

### Test Scenario 1: Email Send Success (Happy Path)
**Setup:** Valid email, working Supabase Auth service
**Action:** Invite new user
**Expected:**
- User created in auth.users ✓
- Profile created ✓
- account_users entry created ✓
- Email sent (no retries needed) ✓
- Response: `{ success: true, emailSent: true }` ✓
- User receives email ✓
- User can login ✓

### Test Scenario 2: Email Send Fails Once, Succeeds on Retry
**Setup:** Mock Supabase Auth to fail first call, succeed on second
**Action:** Invite new user
**Expected:**
- First email attempt fails
- Retry #1 after 1s → succeeds ✓
- Response: `{ success: true, emailSent: true }` ✓
- User receives email ✓

### Test Scenario 3: Email Send Fails All 3 Attempts
**Setup:** Mock Supabase Auth to always fail (invalid email or service down)
**Action:** Invite new user
**Expected:**
- User created in auth.users ✓
- Profile created ✓
- account_users entry created ✓
- Email attempt 1 fails
- Retry #1 after 1s → fails
- Retry #2 after 2s → fails
- Retry #3 after 4s → fails
- Response: `{ success: true, warning: "...", emailFailed: true }` ✓
- User exists but can't login ✓
- Admin sees warning in UI ✓

### Test Scenario 4: Existing User Re-Invite Email Failure
**Setup:** User already exists, email send fails
**Action:** Re-invite existing user with role change
**Expected:**
- Role updated in account_users ✓
- Email retries 3 times, all fail
- Response: `{ success: true, warning: "...", emailFailed: true }` ✓
- User can still login with old credentials ✓ (not broken)

### Test Scenario 5: Driver Added, Email Fails, Billing Updated
**Setup:** Invite driver (role=driver), email fails
**Action:** Invite new driver
**Expected:**
- User created ✓
- Billing updated (Stripe quantity incremented) ✓
- Email fails after 3 retries
- Response: `{ success: true, warning: "...", emailFailed: true }` ✓
- Seat occupied, charged, but user can't login (admin must fix)

---

## Frontend Impact

### Required Changes (Future)

**File:** `/src/pages/dashboard/Teams.tsx` (or equivalent)

**Change 1: Handle emailFailed in response**
```typescript
const handleInvite = async () => {
  const response = await fetch('/functions/v1/invite-team-member', {
    method: 'POST',
    body: JSON.stringify({ email, first_name, last_name, role, can_view_all_routes }),
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const data = await response.json();

  if (data.success) {
    if (data.emailFailed) {
      // Show warning toast
      toast.warning(data.warning || "User created but email failed", {
        description: data.action_required,
        duration: 10000 // Longer duration for critical warning
      });
    } else {
      // Show success toast
      toast.success(data.message || "User invited successfully");
    }

    // Refresh team list
    fetchTeamMembers();
  } else {
    toast.error(data.error || "Failed to invite user");
  }
};
```

**Change 2: Add "Resend Invite" button** (future enhancement)
- Only show for users where email failed
- Calls new Edge Function: `resend-team-invite`
- Provides manual retry option

---

## Rollback Plan

**If fix causes issues:**

1. Revert Edge Function code to previous version
2. Redeploy via: `supabase functions deploy invite-team-member --no-verify-jwt`
3. Previous behavior restored (silently fails email send)

**Rollback is SAFE because:**
- No database schema changes
- No frontend changes required (backward compatible)
- Response format extended (not breaking)

---

## Success Criteria

### Phase 1 (This Fix)
- ✅ Transient email failures automatically retry (3 attempts)
- ✅ Persistent email failures return warning response
- ✅ Admin gets clear error message
- ✅ No silent failures (current bug)
- ✅ User creation still succeeds (no rollback complexity)

### Phase 2 (Future)
- ✅ Frontend shows warning toast for email failures
- ✅ "Resend Invite" button in Teams UI
- ✅ Email status tracking in database
- ✅ Background retry queue for persistent failures

---

## Risk Assessment

**Risk Level:** LOW-MEDIUM

**Risks:**
1. **Retry delays increase execution time** (max +7s for 3 retries)
   - Mitigation: Acceptable for edge function, still under 60s timeout
2. **User created but email fails** (existing problem, not solved)
   - Mitigation: Clear warning to admin, manual recovery possible
3. **Billing impact for broken users** (existing problem)
   - Mitigation: Admin can delete user manually, billing adjusted

**Benefits:**
- Fixes silent email failures (critical bug)
- Handles transient failures automatically
- Clear error communication
- No complex rollback logic
- Low implementation risk

---

## Affected Boundaries Summary

| Boundary | Impact | Changes Required |
|----------|--------|------------------|
| **CALLERS (Frontend)** | Medium | Optional: Handle `emailFailed` warning |
| **CALLEES (Supabase Auth)** | None | Same API calls, add retry logic |
| **DATABASE** | None | No schema changes |
| **BILLING** | None | Same behavior (quantity updated) |
| **ERROR HANDLING** | High | Email failures now return warning instead of silent fail |
| **USER EXPERIENCE** | High | Broken users visible to admin (instead of silent) |

---

## Approval Required

**Before implementation:**
- [ ] User approves retry approach (3 attempts)
- [ ] User approves warning response for persistent failures
- [ ] User approves NOT rolling back user creation
- [ ] User approves billing impact (seat taken even if email fails)

**Questions for User:**
1. Is 3 retries (total ~7s delay) acceptable?
2. Should we rollback user creation if email fails, or return warning?
3. Should we implement "Resend Invite" button now or later?
4. Is it acceptable to charge for seat even if email fails (user can be fixed manually)?
