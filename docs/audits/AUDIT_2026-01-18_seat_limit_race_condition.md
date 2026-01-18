# System Impact Audit: Seat Limit Race Condition

**Date:** 2026-01-18
**Change Type:** Bug Fix - CRITICAL
**Component:** check_seat_availability RPC function + accounts table schema
**Severity:** CRITICAL (allows bypassing subscription seat limits)

---

## Problem Statement

**Current Behavior:**
- Two admins invite drivers simultaneously via Teams page
- Both admins call invite-team-member Edge Function
- Both Edge Functions call check_seat_availability RPC
- Both RPCs read stale seat count (e.g., 4 used, 1 available out of 5 total)
- Both RPCs return `can_add: true`
- Both Edge Functions proceed to create user
- Both Edge Functions insert into account_users
- **Result: 6 drivers on 5-seat plan** (over limit)

**Impact:**
- Subscription seat limits bypassed
- Revenue loss (6 users on 5-seat plan pricing)
- Database integrity violated
- No enforcement mechanism
- Can happen repeatedly with concurrent invites

**Evidence:**

**Current RPC function** (lines 25-38 in `/supabase/migrations/20260110_seat_management_rpc.sql`):
```sql
-- Get seat limit from accounts table
SELECT driver_count INTO v_driver_count
FROM accounts
WHERE id = p_account_id;

-- Count active drivers (NO LOCKING!)
SELECT COUNT(*) INTO v_active_drivers
FROM account_users
WHERE account_id = p_account_id
  AND role = 'driver';

-- Check if can add
IF v_active_drivers >= v_driver_count THEN
  -- Seat limit reached
ELSE
  -- Can add (RACE CONDITION HERE!)
END IF;
```

**Race Condition Timeline:**
```
Time | Request A (Admin 1)                | Request B (Admin 2)
-----|------------------------------------|---------------------------------
T1   | SELECT COUNT(*) → 4 drivers       |
T2   |                                    | SELECT COUNT(*) → 4 drivers (stale!)
T3   | Check: 4 < 5 → can_add: true      |
T4   |                                    | Check: 4 < 5 → can_add: true
T5   | INSERT into account_users         |
T6   |                                    | INSERT into account_users
T7   | Database now has 6 drivers        | Database now has 6 drivers
T8   | Over 5-seat limit!                | Over 5-seat limit!
```

---

## Boundary Analysis (Manual XF Discovery)

### 1. DATA FLOW

**Inputs:**
- Account ID (which account to check)
- Role (driver or primary_admin)
- Concurrent requests from multiple admins

**Current Read Operations (NO LOCKING):**
1. Read `driver_count` from accounts table
2. Read `COUNT(*)` from account_users WHERE role='driver'
3. Compare: used_seats < total_seats?
4. Return can_add boolean

**Output:**
- `can_add: true` or `false`
- Seat count information

**Problem:**
- Read operations are **NOT atomic** with subsequent INSERT
- Gap between check (T1-T4) and insert (T5-T6) allows race condition

### 2. CALLERS (Upstream Dependencies)

**invite-team-member Edge Function:**
- Calls check_seat_availability RPC (line 134)
- Expects atomic check
- Proceeds to create user if `can_add: true`
- **Assumes:** Seat check guarantees availability (WRONG - race condition)

**Frontend Teams Page:**
- Multiple admins can click "Invite" simultaneously
- No client-side serialization
- Expects backend to enforce limits

### 3. CALLEES (Downstream Dependencies)

**Database Tables:**
- `accounts.driver_count` - Read to get limit
- `account_users` - Count WHERE role='driver' to get used seats
- **NO locks acquired** - allows concurrent reads with stale data

**Subsequent Operations:**
- If `can_add: true` → Edge Function inserts into account_users
- If `can_add: false` → Edge Function returns error
- **Gap:** Check and insert are separate transactions

### 4. SIDE EFFECTS

**Current State Changes:**
- account_users table grows without constraint enforcement
- Seat limit can be exceeded
- Stripe charged for more drivers than plan allows

**Violation:**
- Business rule: "driver_count drivers maximum" is NOT enforced
- Only enforced by application logic (check before insert)
- Application logic has race condition

### 5. STATE DEPENDENCIES

**Shared State (Source of Race):**
- Multiple concurrent requests read the SAME `account_users.COUNT(*)`
- Both see stale data before either INSERT commits
- Classic "Read-Then-Act" race condition pattern

**Transaction Boundary:**
- check_seat_availability RPC: One transaction (read only)
- invite-team-member Edge Function: Separate transaction (insert)
- **Gap between transactions = race condition window**

### 6. ERROR PROPAGATION

**Current Error Handling:**
- If seat limit reached → Edge Function returns 400 error
- If seat limit NOT reached → Edge Function proceeds
- **Missing:** Database-level constraint to reject over-limit inserts

**What Happens in Race:**
1. Both requests pass seat check (stale read)
2. Both proceed to insert
3. Both succeed (no database constraint)
4. Result: Over limit, no error raised

---

## Fix Options Analysis

### Option 1: Database CHECK Constraint (Database-Level Enforcement)

**Approach:**
Add CHECK constraint to accounts table that validates seat limit:
```sql
ALTER TABLE accounts
ADD CONSTRAINT check_driver_seat_limit
CHECK (
  (SELECT COUNT(*) FROM account_users
   WHERE account_users.account_id = accounts.id
     AND account_users.role = 'driver') <= driver_count
);
```

**How It Works:**
- Database evaluates constraint on EVERY INSERT into account_users
- If constraint violated → INSERT fails with error
- **Atomic enforcement** - no race condition possible
- Final safety net even if application code has bugs

**Pros:**
- **Foolproof** - survives any code bugs
- Atomic - evaluated at commit time
- Self-documenting (schema shows business rule)
- No code changes needed (database handles it)

**Cons:**
- Error message generic: "check constraint violated"
- Need to handle constraint violation error in Edge Function
- Slightly slower INSERT (constraint evaluation overhead)

**Error Handling Required:**
Edge Function must catch constraint violation and return friendly error.

### Option 2: SELECT FOR UPDATE (Row-Level Locking)

**Approach:**
Lock the accounts row during seat check:
```sql
-- In check_seat_availability RPC
SELECT driver_count INTO v_driver_count
FROM accounts
WHERE id = p_account_id
FOR UPDATE;  -- ← Locks this row until transaction commits

-- Count drivers
SELECT COUNT(*) INTO v_active_drivers
FROM account_users
WHERE account_id = p_account_id
  AND role = 'driver';
```

**How It Works:**
- Request A locks accounts row for this account
- Request B tries to read same row → **WAITS** for lock
- Request A completes insert, commits, releases lock
- Request B gets lock, reads **UPDATED** driver count (5), sees limit reached
- Race condition prevented by serialization

**Pros:**
- Simple implementation (one line of SQL)
- Built-in PostgreSQL feature
- Clear semantics (lock during check)
- Better error messaging (RPC can return friendly error)

**Cons:**
- Requires explicit transaction management in Edge Function
- Lock held during entire invite process (can be slow)
- Blocking (second request waits instead of failing fast)

**Transaction Requirement:**
Edge Function must wrap entire operation in transaction:
```typescript
await supabaseClient.rpc('begin_transaction');
const seatCheck = await supabaseClient.rpc('check_seat_availability', {...});
// ... create user ...
// ... insert into account_users ...
await supabaseClient.rpc('commit_transaction');
```

### Option 3: Advisory Lock (PostgreSQL pg_advisory_lock)

**Approach:**
Use PostgreSQL advisory locks to serialize access per account:
```sql
-- In check_seat_availability RPC
PERFORM pg_advisory_xact_lock(hashtext(p_account_id::text));

-- Now safe to check seats (lock held until transaction ends)
SELECT driver_count INTO v_driver_count FROM accounts WHERE id = p_account_id;
SELECT COUNT(*) INTO v_active_drivers FROM account_users WHERE ...;
```

**How It Works:**
- Advisory lock is application-level lock keyed by account ID
- Request A acquires lock for account X
- Request B tries to acquire same lock → WAITS
- Request A releases lock on commit
- Request B acquires lock, sees updated count

**Pros:**
- Very flexible
- Explicit control over lock scope
- Can lock at account level (not table level)

**Cons:**
- More complex semantics
- Easy to forget to release lock (must use transactional variant)
- Not as self-documenting as constraints

### Option 4: Optimistic Locking (Version Number)

**Approach:**
Add version column to accounts table:
```sql
ALTER TABLE accounts ADD COLUMN version INTEGER DEFAULT 1;

-- In RPC:
SELECT driver_count, version INTO v_driver_count, v_version
FROM accounts WHERE id = p_account_id;

-- Before insert, check version hasn't changed:
UPDATE accounts SET version = version + 1
WHERE id = p_account_id AND version = v_version;

IF NOT FOUND THEN
  RAISE EXCEPTION 'Concurrent modification detected';
END IF;
```

**Pros:**
- Good for high-contention scenarios
- No blocking (fails fast)
- Explicit concurrency control

**Cons:**
- Requires schema change (version column)
- More application code
- Updates accounts row on every invite (unnecessary write)
- Doesn't prevent the INSERT, just detects conflict

---

## Recommended Solution

**DEFENSE IN DEPTH: Option 1 + Option 2 Combined**

**Why Combined Approach:**

1. **Option 1 (CHECK Constraint)** - Final Safety Net
   - Guarantees database integrity ALWAYS
   - Catches bugs in application code
   - Self-documenting schema
   - Zero-trust enforcement

2. **Option 2 (SELECT FOR UPDATE)** - Prevent Race at Source
   - Better user experience (less chance of error)
   - Friendly error messages from RPC
   - Explicit serialization
   - Prevents wasted work (creating user then failing constraint)

**Together:**
- Option 2 prevents race condition at read time (primary defense)
- Option 1 catches any edge cases that slip through (backup defense)
- If Option 2 fails (bug, timeout), Option 1 still prevents over-limit
- If Option 1 triggers, we know Option 2 had a bug (monitoring)

---

## Implementation Plan

### Change 1: Add CHECK Constraint to accounts Table

**File:** `/home/visionairy/StockerAI/supabase/migrations/20260118_add_driver_seat_constraint.sql`

```sql
-- Migration: Add driver seat limit constraint
-- Date: 2026-01-18
-- Purpose: Prevent seat limit bypass via race condition (database-level enforcement)

-- Add constraint to accounts table
ALTER TABLE accounts
ADD CONSTRAINT check_driver_seat_limit
CHECK (
  (SELECT COUNT(*)
   FROM account_users
   WHERE account_users.account_id = accounts.id
     AND account_users.role = 'driver') <= driver_count
);

-- Comment for documentation
COMMENT ON CONSTRAINT check_driver_seat_limit ON accounts IS
  'Ensures driver count never exceeds driver_count limit. Enforced at database level to prevent race conditions.';
```

**Impact:**
- Every INSERT/UPDATE on account_users will trigger constraint check
- If violated → PostgreSQL error: "new row violates check constraint"
- No code changes required (database enforces automatically)

### Change 2: Add SELECT FOR UPDATE to check_seat_availability RPC

**File:** `/home/visionairy/StockerAI/supabase/migrations/20260110_seat_management_rpc.sql`

**Replace line 25:**
```sql
-- OLD (no locking):
SELECT driver_count INTO v_driver_count
FROM accounts
WHERE id = p_account_id;

-- NEW (with locking):
SELECT driver_count INTO v_driver_count
FROM accounts
WHERE id = p_account_id
FOR UPDATE;  -- Lock row until transaction commits
```

**Impact:**
- Concurrent requests for same account will serialize
- Second request waits until first completes
- Prevents stale read of driver count
- Lock released when Edge Function transaction completes

### Change 3: Update invite-team-member Edge Function Error Handling

**File:** `/home/visionairy/StockerAI/supabase/functions/invite-team-member/index.ts`

**Add after account_users insert (around line 260):**
```typescript
if (accountUserError) {
  // Check if error is seat limit constraint violation
  if (accountUserError.message.includes('check_driver_seat_limit')) {
    logStep("CRITICAL: Seat limit constraint violated (race condition detected)", {
      account_id,
      error: accountUserError.message
    });

    return new Response(JSON.stringify({
      success: false,
      error: "Driver seat limit reached. Please upgrade your plan to add more drivers.",
      seat_limit_exceeded: true,
      race_condition_detected: true
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400
    });
  }

  throw new Error(`Failed to add user to account: ${accountUserError.message}`);
}
```

**Impact:**
- Friendly error message if constraint violated
- Logs race condition detection for monitoring
- User sees "seat limit reached" instead of generic database error

---

## Testing Plan

### Test Scenario 1: Sequential Invites (No Race)
**Setup:** Account with 5 driver seats, 4 drivers already
**Action:** Invite 1 driver
**Expected:**
- RPC: can_add = true
- User created successfully
- Database: 5 drivers
- No constraint violation
- **PASS**

### Test Scenario 2: Concurrent Invites (Race Condition)
**Setup:** Account with 5 driver seats, 4 drivers already
**Action:** Two admins invite drivers simultaneously (via API tool)
**Expected WITH FIX:**
- Request A: Acquires lock on accounts row
- Request B: Waits for lock
- Request A: Reads count=4, can_add=true, inserts driver → 5 total
- Request A: Commits, releases lock
- Request B: Acquires lock, reads count=5, can_add=false
- Request B: Returns "seat limit reached" error
- Database: 5 drivers (not 6)
- **PASS**

**Expected WITHOUT FIX (current bug):**
- Request A: Reads count=4, can_add=true
- Request B: Reads count=4, can_add=true (stale!)
- Request A: Inserts driver → 5 total
- Request B: Inserts driver → 6 total (OVER LIMIT!)
- Database: 6 drivers
- **FAIL** (this is the bug we're fixing)

### Test Scenario 3: Constraint Violation (Defense in Depth)
**Setup:** Simulate Option 2 (SELECT FOR UPDATE) failing somehow
**Action:** Directly INSERT into account_users to bypass RPC check
**Expected:**
- Direct INSERT attempted
- CHECK constraint evaluated
- INSERT rejected: "new row violates check constraint check_driver_seat_limit"
- Database: 5 drivers (not 6)
- Constraint prevents over-limit even if application code fails
- **PASS**

### Test Scenario 4: Admin Invite (Unlimited)
**Setup:** Account with 5 driver seats, 4 drivers already
**Action:** Invite primary_admin (admins are unlimited)
**Expected:**
- RPC: can_add = true (admins unlimited)
- Admin user created
- Database: 4 drivers, 1+ admins
- No constraint violation (admins don't count)
- **PASS**

### Test Scenario 5: Three Concurrent Invites
**Setup:** Account with 5 driver seats, 3 drivers already
**Action:** Three admins invite drivers simultaneously
**Expected:**
- Request A: Locks accounts row, reads count=3, can_add=true, inserts → 4 total
- Request B: Waits for lock
- Request C: Waits for lock
- Request A: Commits, releases lock
- Request B: Acquires lock, reads count=4, can_add=true, inserts → 5 total
- Request B: Commits, releases lock
- Request C: Acquires lock, reads count=5, can_add=false
- Request C: Returns "seat limit reached"
- Database: 5 drivers (correct)
- **PASS**

---

## Rollback Plan

**If constraint causes issues:**

```sql
-- Remove CHECK constraint
ALTER TABLE accounts DROP CONSTRAINT check_driver_seat_limit;

-- Revert check_seat_availability RPC (remove FOR UPDATE)
CREATE OR REPLACE FUNCTION check_seat_availability(p_account_id UUID, p_role TEXT DEFAULT 'driver')
-- ... (revert to original without FOR UPDATE)
```

**Rollback is SAFE because:**
- Constraint is additive (doesn't change existing data)
- RPC change is backward compatible
- No application code changes required for rollback

---

## Performance Impact

**CHECK Constraint:**
- Evaluated on every INSERT/UPDATE to account_users
- Subquery: `SELECT COUNT(*) FROM account_users WHERE ...`
- **Cost:** ~10-50ms for small accounts (<100 drivers)
- **Acceptable:** Invites are infrequent operations (not hot path)

**SELECT FOR UPDATE:**
- Locks accounts row during seat check
- Lock held until Edge Function completes (~2-5 seconds)
- **Blocking:** Second request waits instead of failing immediately
- **Acceptable:** Rare concurrent invites, better than data corruption

**Monitoring:**
- Log when constraint violation occurs (indicates race condition detected)
- Alert if frequency increases (may indicate concurrency bug)

---

## Success Criteria

**Functionality:**
- ✅ Concurrent invites do NOT exceed seat limit
- ✅ Seat limit enforced at database level (CHECK constraint)
- ✅ Race condition prevented at read level (SELECT FOR UPDATE)
- ✅ Friendly error messages (not generic constraint violation)
- ✅ Admins still unlimited (constraint only applies to drivers)

**Testing:**
- ✅ Test Scenario 2 passes (concurrent invites → only 1 succeeds)
- ✅ Test Scenario 3 passes (constraint catches bypass attempts)
- ✅ Test Scenario 5 passes (3 concurrent → 2 succeed, 1 fails correctly)

**Monitoring:**
- ✅ Log race condition detections for analysis
- ✅ Alert if constraint violations frequent (indicates upstream bug)

---

## Affected Boundaries Summary

| Boundary | Impact | Changes Required |
|----------|--------|------------------|
| **DATABASE SCHEMA** | High | Add CHECK constraint to accounts table |
| **RPC FUNCTION** | Medium | Add FOR UPDATE to SELECT statement |
| **EDGE FUNCTION** | Low | Add friendly error handling for constraint violation |
| **CALLERS (Frontend)** | None | Same error handling (seat limit reached) |
| **PERFORMANCE** | Low | Minimal (constraint check + row locking) |
| **DATA INTEGRITY** | High | Prevents seat limit bypass permanently |

---

## Approval Required

**Before implementation:**
- [ ] User approves CHECK constraint approach (database-level enforcement)
- [ ] User approves SELECT FOR UPDATE (row locking for serialization)
- [ ] User approves combined defense-in-depth strategy
- [ ] User approves performance impact (locking during invite)

**Questions for User:**
1. Is it acceptable to block second invite request while first is processing? (2-5s wait)
2. Should we alert/log when constraint violation occurs? (indicates race detected)
3. Is database-level enforcement preferred over application-level? (I recommend YES)
