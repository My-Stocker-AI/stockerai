# Billing Model Update - Deployment Guide

**Date:** 2026-01-18
**Purpose:** Implement flexible billing model where operational work = billable seat

---

## Problem Statement

**CRITICAL Business Logic Bug:** Current system allows unlimited admins who can upload/pick routes, bypassing seat limits.

**Real-World Scenarios:**
1. **Small shop:** Owner does billing + team management + upload + pick routes (should be 1 billable seat)
2. **Medium shop:** Billing admin (non-billable) + Dispatcher (billable - uploads routes) + Drivers (billable)
3. **Large shop:** Multiple managers (non-billable) + Dispatcher (billable) + Drivers (billable)

---

## Solution: `can_upload_routes` Permission

### New Billing Formula

```
Billable Seats = COUNT(role='driver') + COUNT(role='admin' AND can_upload_routes=true)

Constraints:
- Minimum 2 billable seats per account
- Non-billable admins (can_upload_routes=false) can ONLY do billing + team management
- Billable admins (can_upload_routes=true) count against seat limit
```

### Business Logic

| User Type | can_upload_routes | Counts as Billable? | What They Can Do |
|-----------|-------------------|---------------------|------------------|
| Driver | `true` (default) | ✅ YES | Pick routes, view assigned routes |
| Admin (operational) | `true` | ✅ YES | Upload routes, assign routes, pick routes, billing, team mgmt |
| Admin (billing only) | `false` (default) | ❌ NO | Billing, team management ONLY |

---

## Files Changed

### 1. Database Migration: Add Column

**File:** `/supabase/migrations/20260118_add_can_upload_routes.sql`

**What it does:**
- Adds `can_upload_routes` boolean column to `account_users` table
- Sets sensible defaults: `false` for admins (conservative), `true` for drivers
- Adds index for performance
- Adds documentation comment

**Deploy:** Copy SQL to Supabase SQL Editor and run

### 2. Database Migration: Update Seat Counting Logic

**File:** `/supabase/migrations/20260118_update_seat_counting_logic.sql`

**What it does:**
- Updates `check_seat_availability()` RPC function
- Implements new billable seat counting formula
- Enforces 2-seat minimum constraint
- Allows non-billable admins without counting them

**Deploy:** Copy SQL to Supabase SQL Editor and run (after migration #1)

### 3. Frontend: Teams Page

**File:** `/src/pages/dashboard/Team.tsx`

**Changes:**
- Added `can_upload_routes` to `TeamMember` interface
- Added state variables for invite and edit modals
- Added checkbox to invite modal (shows when role = admin)
- Added checkbox to edit modal (shows when role = admin)
- Sends `can_upload_routes` to Edge Function
- Fetches `can_upload_routes` from database
- Updates `can_upload_routes` on edit

**UI Changes:**
- When inviting admin: Shows blue-highlighted checkbox explaining billing impact
- When editing admin: Shows same checkbox to modify permission
- Explanatory text: "Admins with this permission count as billable seats. Without it, they can only manage billing and team members."

**Deploy:** Already in frontend code, will deploy with next build

### 4. Edge Function: Invite Team Member

**File:** `/supabase/functions/invite-team-member/index.ts`

**Changes:**
- Added `can_upload_routes` to `InviteRequest` interface
- Extracts `can_upload_routes` from request body (defaults: drivers=true, admins=false)
- Passes `can_upload_routes` to `check_seat_availability()` RPC
- Sets `can_upload_routes` when creating account_users record
- Updates `can_upload_routes` when updating existing account_users

**Deploy:** Deploy to Supabase Edge Functions

---

## Deployment Steps

### Step 1: Deploy Database Migrations (SQL)

```bash
# Copy and run in Supabase SQL Editor (in order):
1. /supabase/migrations/20260118_add_can_upload_routes.sql
2. /supabase/migrations/20260118_update_seat_counting_logic.sql
```

**Verify:**
```sql
-- Should show can_upload_routes column
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'account_users' AND column_name = 'can_upload_routes';

-- Should show updated function with 3 parameters
SELECT proname, pg_get_function_arguments(oid)
FROM pg_proc
WHERE proname = 'check_seat_availability';
```

### Step 2: Deploy Edge Function

```bash
# From StockerAI directory
npx supabase functions deploy invite-team-member
```

**Verify:**
- Check Supabase dashboard → Edge Functions → invite-team-member
- Should show "Last deployed" timestamp updated

### Step 3: Deploy Frontend

```bash
# Build and deploy frontend
npm run build
# Deploy to your hosting (Netlify/Vercel/etc)
```

**Verify:**
- Navigate to Teams page
- Click "Add Team Member"
- Select role = Admin
- Should see blue highlighted "Can upload routes" checkbox

---

## Testing Scenarios

### Test 1: Small Shop (Owner Does Everything)

**Setup:**
- Account: 2-seat minimum plan
- Existing: 0 users

**Test:**
1. Invite admin with `can_upload_routes=true` (owner)
2. Verify: Should succeed (1/2 billable seats used)
3. Invite driver
4. Verify: Should succeed (2/2 billable seats used)
5. Try to invite another driver
6. Verify: Should fail with "Billable seat limit reached"

**Expected Result:** ✅ Owner counts as 1 seat, driver counts as 1 seat, total = 2 seats used

### Test 2: Medium Shop (Billing Admin Separate)

**Setup:**
- Account: 5-seat plan
- Existing: 1 admin with `can_upload_routes=false` (billing only)

**Test:**
1. Verify existing admin: 0/5 billable seats used
2. Invite admin with `can_upload_routes=true` (dispatcher)
3. Verify: Should succeed (1/5 billable seats used)
4. Invite 4 drivers
5. Verify: Should succeed (5/5 billable seats used)
6. Try to invite another driver
7. Verify: Should fail with "Billable seat limit reached"
8. Invite another admin with `can_upload_routes=false` (another billing person)
9. Verify: Should succeed (still 5/5 billable, non-billable admin allowed)

**Expected Result:** ✅ Billing-only admins don't count, operational admin + drivers count

### Test 3: Large Shop (Multiple Non-Billable Admins)

**Setup:**
- Account: 10-seat plan
- Existing: 3 admins with `can_upload_routes=false`

**Test:**
1. Verify: 0/10 billable seats used (non-billable admins)
2. Invite 1 admin with `can_upload_routes=true` (dispatcher)
3. Verify: 1/10 billable seats
4. Invite 9 drivers
5. Verify: 10/10 billable seats used
6. Edit one driver → change to admin with `can_upload_routes=false`
7. Verify: 9/10 billable seats (freed 1 seat)
8. Invite another driver
9. Verify: Should succeed (10/10 billable seats)

**Expected Result:** ✅ Converting billable to non-billable frees seats

### Test 4: 2-Seat Minimum Enforcement

**Setup:**
- Account: 5-seat plan
- Existing: 0 users

**Test:**
1. Invite 1 admin with `can_upload_routes=false` (billing only)
2. Verify: Should succeed with message "Account requires minimum 2 billable seats (0/2 used)"
3. Invite another admin with `can_upload_routes=false`
4. Verify: Should succeed with message "Account requires minimum 2 billable seats (0/2 used)"
5. Invite 1 driver (first billable user)
6. Verify: Should succeed (1/2 minimum)
7. Invite 1 more driver (second billable user)
8. Verify: Should succeed (2/5 seats used, minimum met)

**Expected Result:** ✅ Non-billable users allowed even at 0 billable seats (up to minimum 2)

### Test 5: Edge Case - Changing Admin Permission

**Setup:**
- Account: 3-seat plan
- Existing: 1 admin with `can_upload_routes=true`, 2 drivers (3/3 seats used)

**Test:**
1. Try to invite another driver
2. Verify: Should fail "Billable seat limit reached"
3. Edit admin → set `can_upload_routes=false` (make them billing-only)
4. Verify: Now 2/3 billable seats (freed 1 seat)
5. Invite another driver
6. Verify: Should succeed (3/3 seats used)
7. Try to edit billing admin → set `can_upload_routes=true`
8. Verify: Should fail "Billable seat limit reached" (would go to 4/3)

**Expected Result:** ✅ Permission changes respect seat limits

### Test 6: Cross-Account Preservation

**Setup:**
- Account A: User exists with `can_upload_routes=true`
- Account B: Inviting same user email

**Test:**
1. Invite user to Account B as admin with `can_upload_routes=false`
2. Verify: User added to Account B with correct permission
3. Check Account A: User's `can_upload_routes` should still be `true` (unchanged)

**Expected Result:** ✅ Cross-account invites preserve per-account permissions

---

## Rollback Plan

If deployment fails or bugs are discovered:

### Quick Rollback (Revert RPC Function)

```sql
-- Restore old seat counting logic (admins unlimited)
CREATE OR REPLACE FUNCTION check_seat_availability(
  p_account_id UUID,
  p_role TEXT DEFAULT 'driver'
)
RETURNS TABLE (
  total_seats INTEGER,
  used_seats INTEGER,
  available_seats INTEGER,
  can_add BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_count INTEGER;
  v_active_drivers INTEGER;
BEGIN
  SELECT driver_count INTO v_driver_count
  FROM accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF v_driver_count IS NULL THEN
    RAISE EXCEPTION 'Account not found: %', p_account_id;
  END IF;

  SELECT COUNT(*) INTO v_active_drivers
  FROM account_users
  WHERE account_id = p_account_id
    AND role = 'driver';

  IF p_role = 'primary_admin' THEN
    RETURN QUERY SELECT
      v_driver_count AS total_seats,
      v_active_drivers AS used_seats,
      (v_driver_count - v_active_drivers) AS available_seats,
      TRUE AS can_add,
      'Admins are unlimited' AS reason;
    RETURN;
  END IF;

  IF v_active_drivers >= v_driver_count THEN
    RETURN QUERY SELECT
      v_driver_count AS total_seats,
      v_active_drivers AS used_seats,
      0 AS available_seats,
      FALSE AS can_add,
      'Driver seat limit reached. Upgrade plan to add more drivers.' AS reason;
  ELSE
    RETURN QUERY SELECT
      v_driver_count AS total_seats,
      v_active_drivers AS used_seats,
      (v_driver_count - v_active_drivers) AS available_seats,
      TRUE AS can_add,
      'Seat available' AS reason;
  END IF;
END;
$$;
```

### Full Rollback (Remove Column)

**NOT RECOMMENDED** unless critical data corruption occurs.

```sql
-- Remove can_upload_routes column
ALTER TABLE account_users DROP COLUMN can_upload_routes;
```

---

## Post-Deployment Verification

### Check 1: Database Schema

```sql
-- Verify column exists
SELECT * FROM account_users LIMIT 1;
-- Should show can_upload_routes column

-- Verify function signature
SELECT proname, pg_get_function_arguments(oid)
FROM pg_proc
WHERE proname = 'check_seat_availability';
-- Should show 3 parameters: p_account_id UUID, p_role TEXT, p_can_upload_routes BOOLEAN
```

### Check 2: Frontend UI

- Navigate to /dashboard/team
- Click "Add Team Member"
- Select role = "Admin"
- **VERIFY:** Blue highlighted "Can upload routes" checkbox appears
- **VERIFY:** Explanatory text about billing impact shows

### Check 3: Seat Counting

```sql
-- Get your account_id from auth
SELECT account_id FROM account_users WHERE user_id = auth.uid();

-- Check seat availability (replace YOUR_ACCOUNT_ID)
SELECT * FROM check_seat_availability('YOUR_ACCOUNT_ID', 'primary_admin', true);
SELECT * FROM check_seat_availability('YOUR_ACCOUNT_ID', 'primary_admin', false);
SELECT * FROM check_seat_availability('YOUR_ACCOUNT_ID', 'driver', true);

-- Should show different results:
-- Admin with can_upload_routes=true → counts as billable
-- Admin with can_upload_routes=false → does not count
-- Driver → always counts as billable
```

### Check 4: Edge Function Logs

- Go to Supabase Dashboard → Edge Functions → invite-team-member → Logs
- Invite a new admin with `can_upload_routes=true`
- **VERIFY:** Log shows `can_upload_routes: true` in request
- **VERIFY:** Log shows seat check passed/failed correctly

---

## Known Edge Cases

### Edge Case 1: Existing Admins

**Situation:** Existing admins have `can_upload_routes=false` by default (conservative)

**Impact:** They can no longer upload routes until permission is granted

**Solution:** Admin must edit existing admin users and check "Can upload routes" if they need operational access

**Migration Script (if needed):**
```sql
-- OPTIONAL: Set all existing admins to can_upload_routes=true
-- Only run if you want to preserve existing behavior for all admins
UPDATE account_users
SET can_upload_routes = true
WHERE role = 'primary_admin';
```

### Edge Case 2: Account with 1 Admin (Owner)

**Situation:** Small shop owner is only admin, needs operational access

**Impact:** Default `can_upload_routes=false` would block them from uploading routes

**Solution:** When inviting FIRST admin to account, set `can_upload_routes=true` by default in UI

**Frontend Enhancement (optional):**
```typescript
// In Team.tsx, auto-check can_upload_routes if first admin
const isFirstAdmin = teamMembers.filter(m => m.role === 'primary_admin').length === 0;
const [inviteCanUploadRoutes, setInviteCanUploadRoutes] = useState(isFirstAdmin);
```

---

## Success Criteria

✅ **Database migrations deployed** - column exists, function updated
✅ **Edge Function deployed** - accepts can_upload_routes parameter
✅ **Frontend deployed** - checkbox appears for admin role
✅ **Billing logic works** - drivers + operational admins count, billing-only admins don't
✅ **2-seat minimum enforced** - accounts can't go below 2 billable seats
✅ **Cross-account preserved** - permissions are per-account, not global

---

## Support Scenarios

### User: "I can't invite more admins!"

**Question:** Are you at your seat limit?
**Check:** How many admins do you have with "Can upload routes" checked?
**Solution:** Admins with operational access count as billable seats. Either:
1. Upgrade plan for more seats
2. Uncheck "Can upload routes" for admins who only do billing/team mgmt (frees seats)

### User: "My admin can't upload routes anymore!"

**Question:** What is their role and permission?
**Check:** account_users.role = 'primary_admin' AND can_upload_routes = ?
**Solution:** Admin must edit the user and check "Can upload routes" permission

### User: "I only have 1 person, why do I need 2 seats?"

**Explanation:** 2-seat minimum ensures business continuity. If your only user leaves/locked out, you'd lose access.
**Note:** Non-billable admins (billing-only) don't count against minimum. You can have 1 operational person + 1 billing admin = meets minimum.

---

**END OF DEPLOYMENT GUIDE**
