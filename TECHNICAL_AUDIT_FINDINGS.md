# Stocker AI Technical Audit - Proactive Bug Discovery
**Date:** 2026-01-18
**Purpose:** Identify potential bugs before they manifest in production
**Method:** Systematic code review across all critical systems

---

## CRITICAL BUGS DISCOVERED

### 🔴 BUG-AUDIT-1: Billing Not Updated for Operational Admins

**Location:** `supabase/functions/invite-team-member/index.ts:525`
**Severity:** CRITICAL (Revenue loss)
**Impact:** Operational admins (`can_upload_routes=true`) are added to account but NOT charged in Stripe

**Current Code:**
```typescript
if (role === 'driver') {  // ← WRONG: ignores operational admins
  // Update Stripe
}
```

**Should Be:**
```typescript
const isBillable = (role === 'driver') || (role === 'primary_admin' && can_upload_routes === true);
if (isBillable) {
  // Update Stripe
}
```

**How to Reproduce:**
1. Invite admin with `can_upload_routes=true`
2. Check Stripe subscription quantity
3. Result: Not incremented (revenue lost)

**Fix Priority:** IMMEDIATE - Deploy before next customer onboarding

---

### 🔴 BUG-AUDIT-2: Seat Count Calculation Wrong in Response

**Location:** `supabase/functions/invite-team-member/index.ts:567-568`
**Severity:** HIGH (UI shows wrong data)
**Impact:** Frontend displays incorrect available seats

**Current Code:**
```typescript
used_seats: seatAvailability.used_seats + (isNewUser && role === 'driver' ? 1 : 0),
```

**Should Be:**
```typescript
const isBillable = (role === 'driver') || (role === 'primary_admin' && can_upload_routes === true);
used_seats: seatAvailability.used_seats + (isNewUser && isBillable ? 1 : 0),
```

---

### 🟡 BUG-AUDIT-3: listUsers() Pagination Not Handled

**Location:** `supabase/functions/invite-team-member/index.ts:219`
**Severity:** MEDIUM (Breaks with scale)
**Impact:** If >1000 users exist, existing users on page 2+ won't be detected → duplicate creation attempt

**Current Code:**
```typescript
const { data: existingUsers } = await supabaseClient.auth.admin.listUsers();
const existingUser = existingUsers.users.find(u => u.email === email);
```

**Issue:** `listUsers()` defaults to first 1000 users. If email exists on page 2, won't be found.

**Fix:** Use pagination or query by email directly (if API supports)

---

### 🟡 BUG-AUDIT-4: Profile Insert Race Condition with Trigger

**Location:** `supabase/functions/invite-team-member/index.ts:309-316`
**Severity:** MEDIUM (Intermittent failures)
**Impact:** `handle_new_user()` trigger creates profile with NULL names, then Edge Function tries to INSERT → duplicate key error

**Timeline:**
1. Edge Function creates user in auth.users (line 288)
2. Trigger `handle_new_user()` fires immediately, inserts profile with (id, email, NULL, NULL)
3. Edge Function tries to INSERT profile with names (line 310)
4. Result: "duplicate key value violates unique constraint"

**Fix:** Change INSERT to UPSERT:
```typescript
const { error: profileError } = await supabaseClient
  .from('profiles')
  .upsert({  // ← Change from insert
    id: userId,
    email,
    first_name,
    last_name
  }, {
    onConflict: 'id',
    ignoreDuplicates: false  // Update if exists
  });
```

---

### 🟡 BUG-AUDIT-5: Email Case Sensitivity Not Handled

**Location:** `supabase/functions/invite-team-member/index.ts:225`
**Severity:** MEDIUM (Duplicate users possible)
**Impact:** "Russ@visionairy.biz" vs "russ@visionairy.biz" treated as different users

**Current Code:**
```typescript
const existingUser = existingUsers.users.find(u => u.email === email);
```

**Fix:**
```typescript
const existingUser = existingUsers.users.find(u => u.email.toLowerCase() === email.toLowerCase());
```

---

### 🟡 BUG-AUDIT-6: Cross-Account Invite - Profile Existence Not Verified

**Location:** `supabase/functions/invite-team-member/index.ts:277-280`
**Severity:** MEDIUM (Data integrity)
**Impact:** If user exists in auth.users but NO profile exists, Teams page query will fail

**Current Code:**
```typescript
// Cross-account invite: User exists in DIFFERENT account
// DON'T update metadata - use existing profile
logStep("Cross-account invite: Using existing profile", { userId });
```

**Issue:** Assumes profile exists. What if it doesn't?

**Fix:** Check if profile exists, create if missing:
```typescript
const { data: existingProfile } = await supabaseClient
  .from('profiles')
  .select('id')
  .eq('id', userId)
  .maybeSingle();

if (!existingProfile) {
  // Create profile for cross-account user
  await supabaseClient.from('profiles').insert({
    id: userId,
    email,
    first_name,
    last_name
  });
}
```

---

### 🟡 BUG-AUDIT-7: Orphaned auth.users on UNIQUE Constraint Violation

**Location:** `supabase/functions/invite-team-member/index.ts:395-411`
**Severity:** MEDIUM (Data cleanup needed)
**Impact:** User created in auth.users (line 288), profile created (line 310), but account_users insert fails → orphaned records

**Sequence:**
1. Create user in auth.users ✓
2. Create profile ✓
3. Insert into account_users → UNIQUE violation (race condition)
4. Return error to frontend
5. Result: auth.users + profiles records exist but user not in any account

**Fix:** Wrap in transaction OR clean up on failure:
```typescript
if (accountUserError.message.includes('duplicate key')) {
  // Clean up orphaned records if this was a new user
  if (isNewUser) {
    await supabaseClient.auth.admin.deleteUser(userId);
    await supabaseClient.from('profiles').delete().eq('id', userId);
  }
  return error response;
}
```

---

### 🟡 BUG-AUDIT-8: Last Admin Check Has Race Condition

**Location:** `supabase/functions/invite-team-member/index.ts:340-366`
**Severity:** MEDIUM (Account lockout possible)
**Impact:** Count admins (finds 2) → Between count and update, another request demotes 1 admin → Update proceeds → 0 admins left

**Current Flow:**
1. SELECT COUNT admins → returns 2
2. Check if count === 1 → false, proceed
3. [RACE WINDOW: Another request demotes admin #2]
4. UPDATE admin #1 to driver → Now 0 admins (lockout!)

**Fix:** Use database-level constraint (already exists as CHECK constraint) OR pessimistic locking

---

### 🟢 BUG-AUDIT-9: Billing Failure Silently Swallowed

**Location:** `supabase/functions/invite-team-member/index.ts:539-547`
**Severity:** LOW (Manual correction needed)
**Impact:** User added to account, Stripe not updated → billing/database mismatch

**Current Code:**
```typescript
if (billingError) {
  logStep("Warning: Failed to update subscription quantity", { error: billingError });
  // Don't fail the whole operation - billing can be corrected manually
}
```

**Issue:** No alert to admin, no retry, no audit trail beyond logs

**Fix:** Send alert email OR add to admin dashboard "Billing Sync Issues" panel

---

## VOICE RECOGNITION - POTENTIAL BUGS

*(Requires deeper analysis of useVoice.ts - deferred to next audit phase)*

### Areas to Audit:
- Wake word detection reliability (echo filtering, cooldown logic)
- Reconnection logic (MAX_RECONNECT_ATTEMPTS, backoff strategy)
- WebSocket error handling (what if Deepgram connection drops mid-session?)
- MediaRecorder lifecycle (cleanup on errors, memory leaks?)
- Wake lock release (battery drain if not released?)

---

## N8N WORKFLOWS - POTENTIAL BUGS

*(Requires workflow JSON analysis - deferred to next audit phase)*

### Areas to Audit:
- Webhook timeout handling (what if response takes >30s?)
- State recovery (if workflow fails mid-execution, is state corrupted?)
- Retry logic (does it exist for external API calls?)
- Error propagation (are errors surfaced to user or silently fail?)

---

## DATABASE - POTENTIAL BUGS

*(Requires schema + trigger analysis - deferred to next audit phase)*

### Areas to Audit:
- ON DELETE CASCADE completeness (all FKs have CASCADE?)
- Trigger race conditions (handle_new_user vs Edge Function inserts)
- RLS policies when re-enabled (what breaks?)
- Index coverage (slow queries on large datasets?)
- Seat count consistency (are counts accurate after deletes/updates?)

---

## SUMMARY

**Total Bugs Found So Far:** 9
- 🔴 CRITICAL: 1 (Billing not updated for operational admins)
- 🟡 MEDIUM: 7 (Race conditions, data integrity, edge cases)
- 🟢 LOW: 1 (Silent billing failure)

**Audit Coverage:** ~40% (Teams invite flow complete, voice/workflows/database pending)

**Next Steps:**
1. Fix CRITICAL billing bug immediately
2. Fix MEDIUM bugs before next sprint
3. Complete audit of voice, workflows, database
4. Create comprehensive test plan for all discovered bugs

---

**END OF INITIAL AUDIT FINDINGS**
