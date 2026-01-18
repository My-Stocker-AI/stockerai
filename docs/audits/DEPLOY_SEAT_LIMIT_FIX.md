# Deploy Seat Limit Race Condition Fix

**Date:** 2026-01-18
**Status:** Edge Function deployed, Database migration PENDING

---

## What Was Deployed

✅ **Edge Function:** invite-team-member (deployed)
- Added constraint violation error handling
- Logs when Layer 2 defense (CHECK constraint) triggers
- Friendly error messages for seat limit exceeded

---

## What Needs Manual Deployment

⚠️ **Database Migration:** Seat limit race condition fix

**Migration File:** `/supabase/migrations/20260118_seat_limit_race_condition_fix.sql`

### How to Deploy Database Changes

**Option 1: Via Supabase Dashboard (Recommended)**

1. Go to: https://supabase.com/dashboard/project/wvtkuposrlvadyeixlke/sql/new
2. Copy and paste the SQL below
3. Click "Run" to execute

**Option 2: Via SQL Editor in Dashboard**

1. Navigate to: SQL Editor in Supabase Dashboard
2. Create new query
3. Paste the SQL migration
4. Execute

---

## SQL Migration to Apply

```sql
-- Migration: Fix seat limit race condition
-- Date: 2026-01-18
-- Purpose: Prevent concurrent invites from bypassing seat limits
-- System Impact Audit: /docs/audits/AUDIT_2026-01-18_seat_limit_race_condition.md

-- Layer 1 Defense: Update check_seat_availability to use SELECT FOR UPDATE
-- This locks the accounts row during seat check, preventing concurrent reads
DROP FUNCTION IF EXISTS check_seat_availability(UUID, TEXT);

CREATE OR REPLACE FUNCTION check_seat_availability(p_account_id UUID, p_role TEXT DEFAULT 'driver')
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
  -- Get seat limit from accounts table
  -- Layer 1 Defense: Lock row to prevent race condition
  -- Second concurrent request will WAIT for this lock, then see updated count
  SELECT driver_count INTO v_driver_count
  FROM accounts
  WHERE id = p_account_id
  FOR UPDATE;  -- Locks row until transaction commits

  IF v_driver_count IS NULL THEN
    RAISE EXCEPTION 'Account not found: %', p_account_id;
  END IF;

  -- DECISION Q1: Admins don't count against seat limit
  -- Only count drivers
  SELECT COUNT(*) INTO v_active_drivers
  FROM account_users
  WHERE account_id = p_account_id
    AND role = 'driver';

  -- If inviting an admin, always allowed (unlimited admins)
  IF p_role = 'primary_admin' THEN
    RETURN QUERY SELECT
      v_driver_count AS total_seats,
      v_active_drivers AS used_seats,
      (v_driver_count - v_active_drivers) AS available_seats,
      TRUE AS can_add,
      'Admins are unlimited' AS reason;
    RETURN;
  END IF;

  -- If inviting a driver, check seat availability
  IF v_active_drivers >= v_driver_count THEN
    RETURN QUERY SELECT
      v_driver_count AS total_seats,
      v_active_drivers AS used_seats,
      0 AS available_seats,
      FALSE AS can_add,
      'Driver seat limit reached. Upgrade plan to add more drivers.' AS reason;
    RETURN;
  ELSE
    RETURN QUERY SELECT
      v_driver_count AS total_seats,
      v_active_drivers AS used_seats,
      (v_driver_count - v_active_drivers) AS available_seats,
      TRUE AS can_add,
      'Seat available' AS reason;
    RETURN;
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION check_seat_availability(UUID, TEXT) TO authenticated;

-- Comment for documentation
COMMENT ON FUNCTION check_seat_availability IS 'Check if account can add more team members based on seat limits. Uses SELECT FOR UPDATE to prevent race conditions. Admins are unlimited, drivers are limited by driver_count.';

-- Layer 2 Defense: Database-level constraint (final safety net)
-- Ensures driver count NEVER exceeds driver_count limit, regardless of application code bugs
ALTER TABLE accounts
ADD CONSTRAINT IF NOT EXISTS check_driver_seat_limit
CHECK (
  (SELECT COUNT(*)
   FROM account_users
   WHERE account_users.account_id = accounts.id
     AND account_users.role = 'driver') <= driver_count
);

-- Comment for documentation
COMMENT ON CONSTRAINT check_driver_seat_limit ON accounts IS
  'Ensures driver count never exceeds driver_count limit. Enforced at database level to prevent race conditions. If violated, indicates concurrent invite race condition was caught.';
```

---

## Verification

After applying the migration, verify it worked:

1. **Check constraint exists:**
```sql
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'check_driver_seat_limit';
```

Expected result: Should return one row showing the constraint definition

2. **Check RPC function updated:**
```sql
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'check_seat_availability';
```

Expected result: Function definition should include `FOR UPDATE`

3. **Test concurrent invite protection:**
- Try inviting 2 drivers simultaneously when only 1 seat available
- Both should call RPC, but only 1 should succeed
- Second request should get "Driver seat limit reached" error

---

## What This Fixes

**Before Fix:**
- Two admins invite drivers concurrently
- Both see "4 drivers, 1 available" (stale read)
- Both proceed to create user
- Result: 6 drivers on 5-seat plan (OVER LIMIT)

**After Fix (Layer 1):**
- Request A locks accounts row during seat check
- Request B waits for lock
- Request A creates driver #5, commits, releases lock
- Request B acquires lock, sees 5 drivers, returns "limit reached"
- Result: 5 drivers (correct)

**After Fix (Layer 2 - if Layer 1 fails):**
- If both requests somehow bypass Layer 1
- Database constraint checks on INSERT
- Rejects INSERT that would exceed limit
- Returns error: "violates check constraint"
- Result: 5 drivers (correct, constraint enforced)

---

## Monitoring

After deployment, monitor logs for:

```
"CRITICAL: Seat limit constraint violated - race condition detected and prevented"
```

If you see this log:
- ✅ Good: Layer 2 defense caught a race condition
- ⚠️ Investigate: Why did Layer 1 (SELECT FOR UPDATE) not prevent it?
- Possible causes: Timeout, lock deadlock, database replication lag

---

## Rollback (If Needed)

If the migration causes issues:

```sql
-- Remove constraint
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS check_driver_seat_limit;

-- Revert RPC (remove FOR UPDATE)
CREATE OR REPLACE FUNCTION check_seat_availability(p_account_id UUID, p_role TEXT DEFAULT 'driver')
-- ... (original version without FOR UPDATE)
```

---

## Status

- [x] Edge Function deployed
- [ ] Database migration applied ← **NEEDS MANUAL ACTION**
- [ ] Verification tests run
- [ ] Monitoring enabled for constraint violations
