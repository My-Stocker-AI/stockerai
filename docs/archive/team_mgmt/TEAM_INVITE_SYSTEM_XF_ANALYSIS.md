# Team Invite System - Cross-Functional Analysis & Fix Plan
**Date:** 2026-01-10
**Status:** CRITICAL ISSUES IDENTIFIED - Requires Complete Redesign
**Purpose:** Fix team invite system to properly handle seat management, billing, and user onboarding

---

## EXECUTIVE SUMMARY

### 🚨 CRITICAL ISSUES DISCOVERED (2026-01-10)

**User Report:**
1. Error message when inviting team member (but email still sends)
2. Email sent with WRONG NAME (old test data "Bill Murray" instead of new "David Spencer")
3. Admin name showing "()" in email template
4. Invite link goes to /login instead of /set-password
5. No seat limit enforcement before sending invite
6. No prorated billing prompt before adding users

**Root Cause Analysis:**
- **Workflow Issue:** Doesn't handle existing users properly (returns stale data, doesn't update metadata)
- **Email Issue:** Supabase invite email goes to generic confirmation, not /set-password
- **Business Logic Gap:** No seat management, billing integration, or usage limits

**Impact:** 🔴 CRITICAL
- Invites break for existing users (wrong name, broken flow)
- No revenue protection (unlimited free seats)
- Poor UX (wrong redirect, no context in emails)

---

## PART 1: CURRENT STATE (WHAT EXISTS)

### 1.1 Execution Analysis (Execution #25775)

**Workflow:** "Stocker: Invite Team Member" (ID: TxrJyFmG4yNazEEF)
**Date:** 2026-01-10 19:40 UTC
**Status:** "Success" (but with hidden errors)

**Input Data:**
```json
{
  "email": "russwright63@gmail.com",
  "first_name": "David",
  "last_name": "Spencer",
  "account_id": "6ed5d948-479c-466a-8c95-67246c821e66",
  "role": "primary_admin",
  "can_view_all_routes": true,
  "admin_name": "Russ Wright",
  "admin_email": "russ@visionairy.biz"
}
```

**What Actually Happened:**

| Node | Status | Output | Issue |
|------|--------|--------|-------|
| **Webhook** | ✅ Success | Received invite request | OK |
| **Create User in Supabase Auth** | ✅ Success | Returned EXISTING user data | ⚠️ Didn't create new, didn't update |
| **Check User Result** | ✅ Success | Set `needs_lookup: false` | OK |
| **Lookup Existing User** | 🔴 ERROR | "Unknown error", 0 items | ⚠️ Failed but continued |
| **Prepare Account Data** | ❓ Unknown | Continued despite error | ? |
| **Update Profile** | ❓ Unknown | Likely updated with wrong data | ? |
| **Create Account User** | ❓ Unknown | Likely succeeded | ? |
| **Check Account Result** | ❓ Unknown | - | ? |
| **Final Response** | ✅ Success | Workflow reports success | ⚠️ Hides errors |

**Critical Finding:**
- User created_at: `2026-01-08T06:54:03.16077Z` (2 days ago)
- user_metadata: `{ first_name: "Bill", last_name: "Murray" }` (OLD test data)
- NEW input: `{ first_name: "David", last_name: "Spencer" }` (IGNORED)

**Why This Happened:**
Supabase Admin API `/auth/v1/admin/users` with POST:
- If user email already exists → Returns existing user (doesn't throw error)
- Does NOT update user_metadata
- Does NOT re-send invite if user already exists

**Correct Approach:**
1. Check if user exists FIRST (before trying to create)
2. If exists: UPDATE user_metadata, re-send invite
3. If new: CREATE user, send invite

---

### 1.2 Current Workflow Structure (9 nodes)

```
Webhook
  ↓
Create User in Supabase Auth (POST /auth/v1/admin/users)
  ↓
Check User Result (Code node - checks if user_id exists)
  ↓
Lookup Existing User (GET /rest/v1/profiles?select=*&user_id=eq.XXX)
  ↓
Prepare Account Data (Code node)
  ↓
Update Profile (PATCH /rest/v1/profiles)
  ↓
Create Account User (POST /rest/v1/account_users)
  ↓
Check Account Result (Code node)
  ↓
Final Response (respondToWebhook)
```

**Problems:**
1. **No existence check before create** → Gets stale data for existing users
2. **"Lookup Existing User" fails** → Probably because Bill Murray profile doesn't exist
3. **No metadata update for existing users** → Name never changes
4. **No re-invite logic** → Existing users don't get new invite email
5. **Error handling continues silently** → "Success" reported despite errors

---

### 1.3 Frontend Team Invite Flow

**File:** `/src/pages/dashboard/Team.tsx` (lines 100-143)

**What Frontend Sends:**
```typescript
fetch('https://visionairy.app.n8n.cloud/webhook/invite-team-member', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: inviteEmail,
    first_name: inviteFirstName,
    last_name: inviteLastName,
    account_id: userRole?.account_id,
    role: inviteRole,
    can_view_all_routes: inviteCanViewAll,
    admin_name: userProfile?.first_name && userProfile?.last_name
      ? `${userProfile.first_name} ${userProfile.last_name}`
      : 'Your Team Admin',  // ← Fallback if profile not loaded
    admin_email: userProfile?.email || user?.email || '',
  }),
});
```

**Admin Name Issue:**
- If `userProfile.first_name` or `userProfile.last_name` is NULL → Falls back to "Your Team Admin"
- But if they're empty strings ("") → Concatenates to " " → Email shows "()"
- **Likely cause:** User's profile has empty strings, not null

**No Seat Limit Check:**
- Frontend doesn't check how many users exist vs. how many seats paid for
- Just sends invite immediately
- No billing prompt, no prorated charge warning

---

### 1.4 SetPassword Flow (Invite Acceptance)

**File:** `/src/pages/SetPassword.tsx`

**How It Should Work:**
1. User clicks invite link in email
2. Supabase redirects to app with `#access_token` and `type=invite`
3. App detects invite token, logs user in automatically
4. User redirected to `/set-password`
5. User sets password
6. User redirected to `/dashboard`

**What's Actually Happening:**
- User reports being sent to `/login` instead of `/set-password`
- This suggests the Supabase invite email is using wrong redirect URL

**Supabase Email Configuration:**
- Invite emails use template with confirmation link
- Confirmation link goes to: `https://my-stocker-ai.com/auth/callback` or similar
- Callback needs to check `type=invite` and redirect to `/set-password`

**Missing Piece:**
- No auth callback handler checking for `type=invite`
- OR Supabase email template is configured wrong

---

### 1.5 Database State (Supabase)

**Tables Involved:**

| Table | Columns | Purpose |
|-------|---------|---------|
| `auth.users` | id, email, user_metadata, created_at | Supabase Auth (invisible to RLS) |
| `profiles` | id (FK to auth.users), first_name, last_name, email | Public profile data |
| `account_users` | id, account_id, user_id, role, can_view_all_routes | Team membership |
| `accounts` | id, driver_count, subscription_status, trial_ends_at | Billing/seat info |

**Current Data (from execution):**
- `auth.users`:
  - User ID: `5f4039a8-b89b-404e-b17b-8ffdb680265d`
  - Email: `russwright63@gmail.com`
  - user_metadata: `{ first_name: "Bill", last_name: "Murray" }` ⚠️
  - created_at: `2026-01-08T06:54:03.16077Z`

- `profiles`:
  - Likely missing for Bill Murray (hence "Lookup Existing User" error)
  - OR has Bill Murray name (wrong)

- `account_users`:
  - Probably has entry for russwright63@gmail.com (workflow continued to Create Account User)

**Problem:**
- Stale user_metadata in auth.users
- Missing or wrong profile in profiles table
- No cleanup of test data

---

## PART 2: WHAT'S MISSING (Business Logic Gaps)

### 2.1 Seat Management

**Current State:** NONE
**What's Needed:**

| Feature | Current | Required |
|---------|---------|----------|
| **Seat Limit Enforcement** | ❌ No check | ✅ Check `accounts.driver_count` vs active `account_users` |
| **Role-Based Limits** | ❌ Unlimited admins + drivers | ✅ Admins = unlimited, Drivers = limited by paid seats |
| **Usage Warning** | ❌ None | ✅ Show "You have X of Y seats used" before invite |
| **Prorated Billing Prompt** | ❌ None | ✅ "Adding this user costs $X prorated, proceed?" |
| **Auto-Increment Seats** | ❌ Manual | ✅ OR auto-add seat + charge immediately |

**Questions to Answer:**
1. **Are admins counted against seat limit?**
   - Recommendation: NO (admins = unlimited, only drivers count)
2. **What happens if at limit?**
   - Option A: Block invite, show "Upgrade plan" message
   - Option B: Allow invite, auto-charge prorated amount
3. **How to handle prorated billing?**
   - Option A: Calculate prorated cost, show confirmation dialog
   - Option B: Just add seat, Stripe handles prorating automatically
4. **Trial period behavior?**
   - During trial: Unlimited seats? Or enforce limits?

---

### 2.2 Billing Integration

**Current State:** NONE (accounts table has `driver_count` but no enforcement)

**What's Needed:**

| Feature | Current | Required |
|---------|---------|----------|
| **Stripe Subscription Update** | ❌ No integration | ✅ Update subscription quantity when adding seats |
| **Prorated Charge Calculation** | ❌ None | ✅ Calculate prorated cost based on billing cycle |
| **Payment Method Check** | ❌ None | ✅ Verify card on file before allowing add |
| **Invoice Preview** | ❌ None | ✅ Show "Your next invoice will be $X" |

**Stripe API Calls Required:**
1. `GET /v1/subscriptions/{sub_id}` - Get current subscription
2. `POST /v1/subscriptions/{sub_id}` - Update quantity (Stripe auto-prorates)
3. `GET /v1/upcoming_invoice` - Preview next invoice

---

### 2.3 Invite Email Improvements

**Current State:**
- Generic Supabase confirmation email
- Admin name showing "()" if profile has empty strings
- No context about what they're being invited to
- Link goes to wrong page (/login instead of /set-password)

**What's Needed:**

| Issue | Current | Fix |
|-------|---------|-----|
| **Email Content** | Generic Supabase template | Custom HTML email with branding |
| **Admin Name** | Shows "()" if empty strings | Fallback to "Your Team Admin" for null/empty |
| **Redirect URL** | `/auth/callback` → `/login` | `/auth/callback` → `/set-password` (for invites) |
| **Email Context** | None | "You've been invited by {admin_name} to join {account_name}" |
| **Role Info** | None | "You're being added as a {role}" |

**Two Approaches:**

**Option A: Custom Email (Full Control)**
- n8n workflow sends custom email via SendGrid/Mailgun
- Include `/set-password?token={token}` link
- Fully branded, customizable

**Option B: Supabase Email Template (Simpler)**
- Update Supabase email template to include admin_name, account_name
- Configure redirect URL to include `type=invite` param
- Frontend detects `type=invite` and redirects to /set-password

**Recommendation:** Option B (simpler, leverages Supabase auth flow)

---

### 2.4 User Onboarding Flow

**Current State:**
- Invite link → ??? → /login → User confused
- No clear "You've been invited" messaging
- No explanation of role/permissions

**What's Needed:**

```
User clicks invite email
  ↓
Supabase confirms email + logs user in (auto)
  ↓
Redirect to /set-password?type=invite
  ↓
Show: "Welcome! {Admin Name} invited you to {Account Name} as a {Role}"
  ↓
Set password form
  ↓
Redirect to /dashboard
  ↓
Show onboarding tour (optional)
```

**File Changes Required:**
1. `/src/App.tsx` - Add route for `/auth/callback` to handle invite token
2. `/src/pages/SetPassword.tsx` - Add invite context UI
3. Supabase email template - Update redirect URL

---

## PART 3: BBRD BOUNDARY ANALYSIS

Using the 10 BBRD boundaries from CLAUDE.md Section 5.1:

| # | Boundary | Impact | Issues | Changes Required |
|---|----------|--------|--------|------------------|
| 1 | **WORKFLOW** | 🔴 **CRITICAL** | Doesn't check existence, doesn't update metadata, silent errors | Complete redesign (see Part 4) |
| 2 | **NODE** | 🟡 MEDIUM | "Lookup Existing User" fails, error handling broken | Add existence check, fix error handling |
| 3 | **DATA** | 🔴 **CRITICAL** | Stale user_metadata, wrong names, missing profiles | Data cleanup + proper upsert logic |
| 4 | **CODE** | 🟡 MEDIUM | Frontend doesn't check seat limits | Add seat validation before invite |
| 5 | **CONNECTION** | 🟢 LOW | Supabase API working | None |
| 6 | **EXECUTION** | 🟢 LOW | No timing issues | None |
| 7 | **ENVIRONMENT** | 🟢 LOW | No env changes needed | None |
| 8 | **DATABASE** | 🟡 MEDIUM | Need to track seat usage, billing | Add queries for seat counting |
| 9 | **API** | 🟡 MEDIUM | Missing Stripe integration | Add Stripe API calls |
| 10 | **FRONTEND** | 🔴 **CRITICAL** | No seat UI, wrong redirect, missing invite flow | Add seat counter, billing prompt, auth callback |

**Summary:**
- **CRITICAL:** 3 boundaries (WORKFLOW, DATA, FRONTEND)
- **MEDIUM:** 4 boundaries (NODE, CODE, DATABASE, API)
- **LOW:** 3 boundaries (CONNECTION, EXECUTION, ENVIRONMENT)

---

## PART 4: REDESIGNED TEAM INVITE WORKFLOW

### 4.1 New Workflow Logic (Correct Approach)

```
Webhook (receive invite request)
  ↓
[SEAT LIMIT CHECK]
Get Account → Count Active Users → Compare to driver_count
  ├─ At Limit & Role=Driver → Return Error "Seat limit reached"
  └─ OK → Continue
  ↓
[BILLING CHECK - Optional]
IF at limit AND auto_add_seats enabled:
  Get Stripe Subscription → Calculate Prorated Cost → Return to frontend for confirmation
  ↓
[USER EXISTENCE CHECK]
Check if user exists in auth.users (query by email)
  ├─ EXISTS → Branch A: Update Existing User
  └─ NEW → Branch B: Create New User
  ↓
─────────────────────────────────────────────
BRANCH A: Update Existing User
  ↓
Update user_metadata in auth.users (first_name, last_name)
  ↓
Upsert profile (INSERT ... ON CONFLICT UPDATE)
  ↓
Check if already in account_users
  ├─ YES → Update role/permissions
  └─ NO → Insert into account_users
  ↓
Re-send invite email (Supabase Admin API)
  ↓
Merge to final response
  ↓
─────────────────────────────────────────────
BRANCH B: Create New User
  ↓
Create user in auth.users (with correct metadata)
  ↓
Insert profile (first_name, last_name, email)
  ↓
Insert into account_users
  ↓
Invite email sent automatically by Supabase
  ↓
Merge to final response
  ↓
─────────────────────────────────────────────
Final Response
  ↓
Return success + user details
```

**Key Improvements:**
1. ✅ Check seat limits BEFORE creating user
2. ✅ Check user existence BEFORE attempting create
3. ✅ Update metadata if user exists
4. ✅ Upsert profile (handles both create and update)
5. ✅ Re-send invite for existing users
6. ✅ Proper error handling (stop on seat limit)

---

### 4.2 Seat Limit Logic

**SQL Query to Add:**
```sql
-- Count active users for account
SELECT COUNT(*) as active_count
FROM account_users
WHERE account_id = $1
  AND role = 'driver';  -- Only count drivers against limit

-- Get seat limit
SELECT driver_count
FROM accounts
WHERE id = $1;

-- Compare
IF active_count >= driver_count THEN
  RETURN ERROR "Seat limit reached. Current: X, Limit: Y"
END IF
```

**Frontend Changes:**
```typescript
// Before opening invite modal, check seat usage
const { data: seatUsage } = await supabase.rpc('check_seat_availability', {
  p_account_id: accountId
});

if (seatUsage.available_seats === 0 && inviteRole === 'driver') {
  toast({
    title: "Seat limit reached",
    description: `You have ${seatUsage.used_seats} of ${seatUsage.total_seats} driver seats used. Upgrade your plan to add more.`,
    variant: "destructive"
  });
  return;
}

// Show available seats in invite modal
<p>Available driver seats: {seatUsage.available_seats} of {seatUsage.total_seats}</p>
```

---

### 4.3 Supabase Email Template Fix

**Current Issue:**
- Email redirect goes to generic `/auth/callback`
- No context about invite vs regular signup

**Fix:**
1. Update Supabase email template to include `type=invite` in redirect URL
2. Add admin_name and account_name to email template
3. Update `/auth/callback` handler to check `type` param

**Supabase Dashboard → Authentication → Email Templates:**
```html
<!-- Invite Email Template -->
<h2>You've been invited to Stocker AI</h2>
<p>{{ .admin_name }} has invited you to join {{ .account_name }} as a {{ .role }}.</p>
<p><a href="{{ .SiteURL }}/auth/callback?type=invite&token_hash={{ .TokenHash }}&type=invite">Accept Invitation</a></p>
```

**Frontend Auth Callback:**
```typescript
// /src/pages/AuthCallback.tsx (NEW FILE)
const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const type = searchParams.get('type');
    const token_hash = searchParams.get('token_hash');

    if (type === 'invite') {
      // Handle invite confirmation
      supabase.auth.verifyOtp({ token_hash, type: 'invite' })
        .then(() => navigate('/set-password?invited=true'))
        .catch(err => navigate('/login?error=invalid_invite'));
    } else {
      // Handle regular email confirmation
      supabase.auth.verifyOtp({ token_hash, type: 'signup' })
        .then(() => navigate('/dashboard'))
        .catch(err => navigate('/login?error=invalid_token'));
    }
  }, []);

  return <div>Confirming...</div>;
};
```

---

## PART 5: IMPLEMENTATION PLAN (Phased)

### Phase 1: Critical Fixes (Week 1)
**Priority:** 🔴 URGENT - Fix broken invite flow

**Changes:**
1. ✅ **Data Cleanup**
   - Delete test user (Bill Murray) from auth.users, profiles, account_users
   - Clear any other test data

2. ✅ **Workflow Redesign** (n8n)
   - Add "Check User Exists" node (before Create User)
   - Add "Branch on Existence" (IF node)
   - Branch A: Update user_metadata + Upsert profile + Re-invite
   - Branch B: Create user + Insert profile
   - Fix error handling (stop on errors, don't continue)

3. ✅ **Email Template Fix**
   - Update Supabase email template to include admin_name, account_name
   - Fix redirect URL to include `type=invite`

4. ✅ **Auth Callback Handler**
   - Create `/src/pages/AuthCallback.tsx`
   - Handle `type=invite` → redirect to `/set-password`
   - Handle regular signup → redirect to `/dashboard`

**Testing:**
- [ ] Invite NEW user → receives email with correct name → clicks link → goes to /set-password → sets password → logs in
- [ ] Invite EXISTING user → receives email with UPDATED name → clicks link → goes to /set-password → can change password
- [ ] Admin name shows correctly in email (not "()")

**Rollback:**
- Deactivate new workflow, reactivate old (but old is broken, so this is improvement-only)

---

### Phase 2: Seat Management (Week 2)
**Priority:** 🔴 HIGH - Protect revenue

**Changes:**
1. ✅ **Database Function**
   - Create `check_seat_availability(account_id)` RPC function
   - Returns: `{ used_seats, total_seats, available_seats, can_add_driver }`

2. ✅ **Workflow Seat Check**
   - Add "Check Seat Limit" node at workflow start
   - If role=driver AND available_seats=0 → Return error

3. ✅ **Frontend Seat UI**
   - Show seat usage in Team page: "X of Y driver seats used"
   - Disable "Invite" button if at limit
   - Show "Upgrade plan" button when at limit

4. ✅ **Admin Seat Handling**
   - Decision: Admins don't count against seat limit (unlimited admins)
   - Update seat check to only count drivers

**Testing:**
- [ ] At driver limit → "Invite Driver" button disabled
- [ ] Can still invite admins when at driver limit
- [ ] Seat counter updates after invite
- [ ] Error message if trying to invite driver when at limit

**Rollback:**
- Remove seat check from workflow
- Hide seat counter UI

---

### Phase 3: Billing Integration (Week 3-4)
**Priority:** 🟡 MEDIUM - Automate seat management

**Changes:**
1. ✅ **Stripe Integration**
   - Add Stripe webhook handler for subscription updates
   - Sync `accounts.driver_count` when subscription quantity changes

2. ✅ **Prorated Billing Prompt**
   - When inviting driver at limit → Show "Add seat for $X prorated?"
   - On confirm → Update Stripe subscription quantity
   - Stripe auto-charges prorated amount

3. ✅ **Auto-Add Seat Option**
   - Setting in Billing page: "Auto-add seats when inviting (recommended)"
   - If enabled: Skip confirmation, auto-add seat
   - If disabled: Show error when at limit

4. ✅ **Invoice Preview**
   - Use Stripe API to preview next invoice
   - Show in confirmation dialog

**Testing:**
- [ ] At limit, invite driver → Prompt shows "Add seat for $X?"
- [ ] Confirm → Stripe subscription updated → Seat added → Invite sent
- [ ] Cancel → Invite not sent, subscription not changed
- [ ] Next invoice reflects new seat count

**Rollback:**
- Disable auto-add seat setting
- Revert to manual seat management (Phase 2)

---

### Phase 4: Enhanced UX (Week 5)
**Priority:** 🟢 LOW - Polish

**Changes:**
1. ✅ **Invite Context in SetPassword**
   - Show: "Welcome! {Admin} invited you to {Account} as {Role}"
   - Explain permissions based on role

2. ✅ **Onboarding Tour**
   - First-time driver: Show quick tour of Voice App
   - First-time admin: Show quick tour of Dashboard

3. ✅ **Resend Invite**
   - Add "Resend Invite" button in Team page for pending users
   - Track invite status in account_users (pending/accepted)

**Testing:**
- [ ] SetPassword page shows invite context
- [ ] New driver sees voice app tour
- [ ] Can resend invite to pending users

**Rollback:**
- Hide invite context
- Disable onboarding tour

---

## PART 6: QUESTIONS TO ANSWER (USER DECISIONS)

### 6.1 Seat Limit Policy

**Q1:** Do admins count against seat limit?
- **Option A:** YES - All users count (simpler billing)
- **Option B:** NO - Only drivers count (recommended for flexibility)

**Q2:** What happens when at driver limit?
- **Option A:** Block invite, show "Upgrade plan"
- **Option B:** Allow invite, auto-add seat + charge prorated
- **Option C:** Show confirmation "Add seat for $X prorated?"

**Q3:** During trial period, enforce limits?
- **Option A:** YES - Enforce from day 1
- **Option B:** NO - Unlimited during trial, enforce after

### 6.2 Billing Automation

**Q4:** Auto-add seats or manual?
- **Option A:** Auto-add (frictionless, increases revenue)
- **Option B:** Manual approval (user control, fewer surprise charges)
- **Option C:** User setting (let admin choose)

**Q5:** Show invoice preview before adding seat?
- **Option A:** YES - Always show preview
- **Option B:** NO - Just add, trust Stripe

### 6.3 Invite Flow

**Q6:** Custom email or Supabase template?
- **Option A:** Custom HTML email via SendGrid (full control, more work)
- **Option B:** Supabase template with variables (simpler, less control)

**Q7:** Allow re-inviting existing team members?
- **Option A:** YES - Can re-invite to change role
- **Option B:** NO - Must edit in Team page

---

## PART 7: RECOMMENDED DECISIONS

Based on SaaS best practices and user experience:

| Question | Recommendation | Reasoning |
|----------|---------------|-----------|
| **Q1: Admins count?** | NO (only drivers) | Admins need flexibility, drivers are billable resource |
| **Q2: At limit?** | Option C (confirm prorated) | Balance between friction and transparency |
| **Q3: Trial limits?** | Option B (unlimited trial) | Remove friction, convert more users |
| **Q4: Auto-add?** | Option C (user setting) | Give admins control, default to auto-add |
| **Q5: Invoice preview?** | YES | Transparency builds trust |
| **Q6: Email type?** | Option B (Supabase) | Faster to implement, good enough for MVP |
| **Q7: Re-invite?** | YES | Useful for changing roles |

---

## PART 8: DATA CLEANUP REQUIRED

**Before implementing fixes, clean test data:**

```sql
-- Find Bill Murray user
SELECT * FROM auth.users WHERE email = 'russwright63@gmail.com';
-- ID: 5f4039a8-b89b-404e-b17b-8ffdb680265d

-- Delete from account_users (if exists)
DELETE FROM account_users WHERE user_id = '5f4039a8-b89b-404e-b17b-8ffdb680265d';

-- Delete from profiles (if exists)
DELETE FROM profiles WHERE id = '5f4039a8-b89b-404e-b17b-8ffdb680265d';

-- Delete from auth.users (requires Supabase Dashboard or Admin API)
-- Via Dashboard: Authentication → Users → Search russwright63@gmail.com → Delete

-- Verify cleanup
SELECT COUNT(*) FROM auth.users WHERE email = 'russwright63@gmail.com';  -- Should be 0
```

---

## PART 9: TESTING CHECKLIST

### Critical Path (Must Pass)
- [ ] **Invite NEW user** → Email sent with correct name → Link goes to /set-password → Password set → Login works
- [ ] **Invite EXISTING user** → user_metadata updated → Email sent → Link works → Can set new password
- [ ] **Admin name in email** → Shows actual admin name (not "()" or "Your Team Admin")
- [ ] **At driver limit** → Can't invite driver without upgrading → Can still invite admin
- [ ] **Prorated billing** → Adding seat shows cost → Charges correctly → Updates subscription

### Edge Cases
- [ ] Invite same email twice → Second invite updates first
- [ ] User accepts invite but doesn't set password → Can re-send invite
- [ ] User with empty string names → Fallback to "Your Team Admin" works
- [ ] Account at 0 seats → Can't invite any drivers
- [ ] Trial account → Unlimited seats work

### Rollback Verification
- [ ] Phase 1 rollback → Old workflow still works (even if buggy)
- [ ] Phase 2 rollback → Invites work without seat checks
- [ ] Phase 3 rollback → Manual seat management works

---

## PART 10: ROLLBACK PLAN

### Phase 1 Rollback (Workflow Fixes)
**If new workflow fails:**
1. Deactivate new "Invite Team Member" workflow
2. Reactivate old workflow (ID: TxrJyFmG4yNazEEF)
3. Note: Old workflow is buggy but at least sends emails

**Backup Required:**
- [ ] Export current workflow JSON before modifying

### Phase 2 Rollback (Seat Management)
**If seat checks break invites:**
1. Remove "Check Seat Limit" node from workflow
2. Hide seat counter in frontend (CSS `display: none`)
3. Remove `check_seat_availability` function from database

### Phase 3 Rollback (Billing)
**If Stripe integration breaks:**
1. Disable auto-add seat setting
2. Remove Stripe webhook handler
3. Revert to manual seat management

**Data Safety:**
- All changes are additive (no deletions)
- Can always revert to previous workflow

---

## PART 11: SUCCESS CRITERIA

**Phase 1 Success:**
- ✅ 100% of invites result in correct name in email
- ✅ 100% of invite links go to /set-password (not /login)
- ✅ 0 "Unknown error" failures in workflow executions

**Phase 2 Success:**
- ✅ 0 invites sent when account at driver limit
- ✅ Seat counter visible and accurate in Team page
- ✅ Clear error message when trying to exceed limit

**Phase 3 Success:**
- ✅ Prorated charges calculated correctly (match Stripe invoice)
- ✅ Subscription quantity syncs within 5 seconds of invite
- ✅ $0 unexpected charges (all charges prompted)

**Overall Success:**
- ✅ User (Davy) can invite David Spencer successfully
- ✅ Email shows "Invited by Russ Wright" (not "()")
- ✅ David clicks link → goes to /set-password → sets password → logs in
- ✅ Seat management protects revenue (no unlimited free seats)

---

**END OF CROSS-FUNCTIONAL ANALYSIS**

**Next Steps:**
1. User reviews analysis and answers Q1-Q7
2. Clean test data (delete Bill Murray user)
3. Implement Phase 1 (critical fixes)
4. Test invite flow end-to-end
5. Implement Phase 2 (seat management)
6. Implement Phase 3 (billing integration) - Optional
7. Implement Phase 4 (UX polish) - Optional
