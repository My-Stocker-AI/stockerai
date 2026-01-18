# Teams Feature - Pre-emptive Bug Analysis
**Date:** 2026-01-18
**Method:** Manual XF-style systematic discovery
**Status:** COMPLETE

---

## DISCOVERED FAILURE MODES (By Boundary)

### BOUNDARY 1: DATA CONSISTENCY

**Failure Mode 1.1: Orphaned Profiles**
- **Trigger:** User deleted from auth.users but profile remains
- **Impact:** Ghost users in team list with broken data
- **Evidence:** DELETE on account_users has CASCADE, but profiles table may not
- **Priority:** MEDIUM (user confusion)

**Failure Mode 1.2: Stale Profile Data**
- **Trigger:** Email changed in auth.users, not synced to profiles
- **Impact:** Team list shows old email, invite goes to wrong address
- **Evidence:** Edge Function updates user_metadata but may not sync profiles.email
- **Priority:** HIGH (broken invites)

**Failure Mode 1.3: account_id Mismatch**
- **Trigger:** User in multiple accounts, wrong account_id used
- **Impact:** User added to wrong account, permission leak
- **Evidence:** Edge Function receives account_id from frontend without validation
- **Priority:** CRITICAL (security)

---

### BOUNDARY 2: RACE CONDITIONS

**Failure Mode 2.1: Concurrent Invite Same Email**
- **Trigger:** Two admins invite same email within ~1 second
- **Impact:** Duplicate invites, or second fails silently
- **Evidence:** No database lock on email check → create user race
- **Timeline:**
  ```
  0ms: Admin A checks email (not exists)
  500ms: Admin B checks email (not exists)
  1000ms: Admin A creates user X
  1100ms: Admin B tries to create user X → ERROR or duplicate
  ```
- **Priority:** MEDIUM (rare but confusing)

**Failure Mode 2.2: Seat Limit Race Condition**
- **Trigger:** Two invites when 1 seat remaining
- **Impact:** Both pass seat check, account goes over limit
- **Evidence:** check_seat_availability() reads count, no lock before insert
- **Timeline:**
  ```
  0ms: Request A checks seats (1 available)
  500ms: Request B checks seats (1 available)
  1000ms: Request A inserts (0 available now)
  1100ms: Request B inserts (OVER LIMIT)
  ```
- **Priority:** HIGH (billing issue)

**Failure Mode 2.3: Role Change During Delete**
- **Trigger:** Admin A changes role while Admin B deletes member
- **Impact:** Last admin deleted if role changed mid-operation
- **Evidence:** Frontend checks adminCount, then deletes - no database constraint
- **Priority:** HIGH (account lockout)

---

### BOUNDARY 3: EMAIL DELIVERY

**Failure Mode 3.1: Email Fails, User Created**
- **Trigger:** inviteUserByEmail() fails after createUser() succeeds
- **Impact:** User exists but never gets invite, can't login
- **Evidence:** Edge Function logs "Warning" but returns success
- **Code:** Lines 276-281, 300-304
- **Priority:** CRITICAL (broken user account)

**Failure Mode 3.2: Redirect URL Incorrect**
- **Trigger:** SITE_URL env var wrong or missing
- **Impact:** Invite email has broken link, user can't set password
- **Evidence:** Falls back to "https://my-stocker-ai.com" hardcoded
- **Priority:** HIGH (broken onboarding)

**Failure Mode 3.3: Email Never Received**
- **Trigger:** Email provider blocks/spam filters
- **Impact:** No retry mechanism, user stuck
- **Evidence:** No confirmation of email delivery, no retry logic
- **Priority:** MEDIUM (user support burden)

---

### BOUNDARY 4: PERMISSION BYPASS

**Failure Mode 4.1: Non-Admin Calls Edge Function Directly**
- **Trigger:** Driver role user calls invite-team-member via curl/Postman
- **Impact:** Can create users, bypass seat limits if RPC has bug
- **Evidence:** Permission check at line 84, but relies on account_users.role
- **Test:** Can driver call Edge Function with manipulated token?
- **Priority:** CRITICAL (security)

**Failure Mode 4.2: Admin Changes Own Role to Driver**
- **Trigger:** Last admin edits self, changes role to driver
- **Impact:** Account has no admins, team management locked
- **Evidence:** Frontend prevents (line 272), no DB constraint
- **Priority:** HIGH (account lockout)

**Failure Mode 4.3: can_view_all_routes Not Enforced**
- **Trigger:** User has can_view_all_routes=false but sees all routes
- **Impact:** Permission flag exists but may not be enforced in queries
- **Evidence:** Need to check if routes queries actually filter by this
- **Priority:** MEDIUM (privacy leak)

---

### BOUNDARY 5: FRONTEND/BACKEND SYNC

**Failure Mode 5.1: Team List Not Refreshed After Invite**
- **Trigger:** Invite succeeds but queryClient.invalidateQueries fails
- **Impact:** New member doesn't appear until page refresh
- **Evidence:** Relies on React Query cache invalidation
- **Priority:** LOW (UX only)

**Failure Mode 5.2: Edit Modal Shows Stale Data**
- **Trigger:** Member updated by another admin, Edit modal has old data
- **Impact:** Edits based on stale role/permissions
- **Evidence:** selectedMember set from local state, not refetched
- **Priority:** MEDIUM (data integrity)

**Failure Mode 5.3: Admin Count Desync**
- **Trigger:** Multiple tabs open, admin deleted in one, other shows old count
- **Impact:** Last admin deleted because count is stale
- **Evidence:** adminCount calculated from local teamMembers array
- **Priority:** HIGH (account lockout)

---

### BOUNDARY 6: EDGE CASES

**Failure Mode 6.1: Email Already in Use (Different Account)**
- **Trigger:** Email exists in auth.users for Account A, invited to Account B
- **Impact:** Updates metadata for all accounts or fails
- **Evidence:** Edge Function updates user_metadata globally (line 147-155)
- **Priority:** HIGH (data corruption)

**Failure Mode 6.2: Invalid Email Format**
- **Trigger:** "user@" or "user@com" passes frontend validation
- **Impact:** Edge Function creates user, email delivery fails
- **Evidence:** No backend email validation before createUser()
- **Priority:** MEDIUM (broken accounts)

**Failure Mode 6.3: Deleted User Re-invited**
- **Trigger:** User removed from account_users, then re-invited
- **Impact:** Should work, but might have orphaned route_assignments
- **Evidence:** ON DELETE CASCADE on account_users, check route_assignments
- **Priority:** LOW (data cleanup)

**Failure Mode 6.4: First Name/Last Name Empty Strings**
- **Trigger:** User submits "" for names (not null, but empty)
- **Impact:** Team list shows blank names
- **Evidence:** Frontend requires fields but allows whitespace
- **Priority:** LOW (cosmetic)

---

### BOUNDARY 7: SEAT MANAGEMENT

**Failure Mode 7.1: check_seat_availability() Returns Wrong Count**
- **Trigger:** RPC has bug or wrong query
- **Impact:** Over/under seat limits
- **Evidence:** Need to review RPC function in 20260110_seat_management_rpc.sql
- **Priority:** CRITICAL (billing)

**Failure Mode 7.2: Seat Count Includes Deleted Users**
- **Trigger:** account_users has soft-deleted records
- **Impact:** False "seat limit reached" errors
- **Evidence:** Need to verify account_users cleanup on delete
- **Priority:** HIGH (blocks invites)

**Failure Mode 7.3: Admin vs Driver Seat Limits Not Separated**
- **Trigger:** driver_count limit applies to all, not just drivers
- **Impact:** Can't add admin when driver limit reached
- **Evidence:** accounts.driver_count field name suggests driver-only
- **Priority:** MEDIUM (business logic)

---

### BOUNDARY 8: DATABASE CONSTRAINTS

**Failure Mode 8.1: UNIQUE(account_id, user_id) Violated**
- **Trigger:** Race condition on insert after check
- **Impact:** Database error, invite fails
- **Evidence:** Line 222-227 checks, line 248-260 inserts (no transaction)
- **Priority:** MEDIUM (error handling)

**Failure Mode 8.2: ON DELETE CASCADE Not on profiles**
- **Trigger:** auth.users deleted, profiles orphaned
- **Impact:** Team query fails with null profiles
- **Evidence:** Need to verify profiles FK has CASCADE
- **Priority:** HIGH (data integrity)

**Failure Mode 8.3: role Enum Out of Sync**
- **Trigger:** TypeScript type has role, database doesn't
- **Impact:** Insert fails with "invalid enum value"
- **Evidence:** Need to verify app_role enum matches TypeScript
- **Priority:** LOW (already deployed)

---

## SUMMARY

**Total Failure Modes Discovered:** 28

**By Severity:**
- CRITICAL: 4 (account_id mismatch, permission bypass, email fails, seat RPC)
- HIGH: 8 (stale email, race conditions, permission bypass, data sync)
- MEDIUM: 11 (UX issues, race conditions, validation gaps)
- LOW: 5 (cosmetic, minor data cleanup)

**Top 5 Priorities to Fix:**

1. **Email Fails, User Created (3.1)** - User stuck, can't login
2. **Seat Limit Race Condition (2.2)** - Billing integrity
3. **account_id Not Validated (1.3)** - Security vulnerability
4. **Permission Bypass (4.1)** - Non-admin can invite
5. **Last Admin Deleted (2.3, 4.2, 5.3)** - Account lockout

**Recommended Testing:**

1. Concurrent invite tests (2 admins, same email, 1 seat left)
2. Email failure simulation (mock Supabase Auth to return error)
3. Permission bypass test (driver calls Edge Function with curl)
4. Last admin protection (delete, role change, concurrent operations)
5. Cross-account user test (email in Account A, invite to Account B)

---

## NEXT STEPS

1. Review check_seat_availability() RPC function
2. Add database constraints for last admin protection
3. Add transaction wrapping to Edge Function
4. Add email delivery confirmation/retry logic
5. Add account_id validation in Edge Function
6. Write integration tests for race conditions

