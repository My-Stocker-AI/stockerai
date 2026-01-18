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

## VOICE RECOGNITION - AUDIT COMPLETE

**See:** `/VOICE_SYSTEM_AUDIT.md` for detailed findings

**Total Bugs Found:** 9
- 🔴 CRITICAL: 4 (Wake lock leak, audio stream leak, AudioContext leak, speak queue deadlock)
- 🟡 MEDIUM: 5 (Volume validation, keep-alive leak, silence timer, echo filtering, MediaRecorder state)
- 🟢 LOW: 1 (Reconnection race)

**Most Critical Issues:**
1. Wake lock not released on startListening failure → battery drain
2. Audio stream not released on connection failure → microphone stays on (privacy issue)
3. Multiple AudioContexts accumulate on speak() failures → memory leak
4. Speak queue deadlock when stopAudio called → UI freeze

---

## N8N WORKFLOWS - AUDIT COMPLETE

**See:** `/N8N_WORKFLOWS_AUDIT.md` for detailed findings

**Total Bugs Found:** 7
- 🔴 CRITICAL: 2 (Debounce false positives, session validation missing)
- 🟡 MEDIUM: 4 (Success field not validated, getRoutes no retry, error parsing, timeout accumulation)
- 🟢 LOW: 1 (Error logging)

**Most Critical Issues:**
1. Debounce blocks legitimate commands with different arguments → user commands ignored
2. Session ID not validated before tool calls → wrong session data
3. Workflow errors (success: false) treated as success → user sees wrong data
4. Timeout accumulates across retries → 127s hangs instead of 30s max

---

## DATABASE - AUDIT COMPLETE

**See:** `/DATABASE_AUDIT.md` for detailed findings

**Total New Bugs Found:** 4 (2 already fixed/documented)
- 🔴 CRITICAL: 0 (RLS disabled is KNOWN ISSUE from earlier session)
- 🟡 MEDIUM: 3 (1 FK missing, 1 migration dependency, 1 already fixed)
- 🟢 LOW: 2 (Multi-account design question, trigger not in migrations)

**Already Documented Issues:**
1. RLS disabled on account_users + profiles → CRITICAL_RLS_ISSUE.md (BLOCKING production)
2. handle_new_user trigger incomplete → Fixed in Session 43 ✅

**New Discoveries:**
3. profiles.id missing FK to auth.users(id) → orphaned records possible
4. route_assignments references routes(id) before table created → migration dependency
5. get_user_account_id() only returns first account → multi-account issue
6. Trigger creation not in migrations → manual setup required

---

## SUMMARY

**Total Bugs Found:** 29
- 🔴 CRITICAL: 7 (1 billing + 4 voice + 2 n8n)
- 🟡 MEDIUM: 19 (7 teams + 5 voice + 4 n8n + 3 database)
- 🟢 LOW: 5 (1 billing + 1 voice + 1 n8n + 2 database)

**Audit Coverage:** 100% COMPLETE ✅
- Teams invite flow ✅ (9 bugs found, all fixed and deployed)
- Voice recognition ✅ (9 bugs found)
- n8n workflows ✅ (7 bugs found)
- Database integrity ✅ (4 new bugs + 2 already documented)

**Most Critical Bugs:**
1. **BILLING** - Operational admins not charged (revenue loss) → FIXED ✅
2. **VOICE** - Wake lock + audio stream leaks (battery drain, privacy)
3. **VOICE** - AudioContext accumulation (memory leak)
4. **VOICE** - Speak queue deadlock (UI freeze)
5. **N8N** - Debounce blocks legitimate commands (user commands ignored)
6. **N8N** - Session validation missing (wrong session data)
7. **DATABASE** - RLS disabled (multi-tenant security BLOCKING production)

**Next Steps:**
1. Fix CRITICAL voice bugs (wake lock, audio stream, AudioContext leaks)
2. Fix CRITICAL n8n bugs (debounce, session validation)
3. Fix MEDIUM bugs before next production deployment
4. Re-enable RLS with non-recursive policies (BLOCKING customer onboarding)
5. Create comprehensive test plan for all discovered bugs

---

**END OF TECHNICAL AUDIT - ALL BOUNDARIES COMPLETE**
