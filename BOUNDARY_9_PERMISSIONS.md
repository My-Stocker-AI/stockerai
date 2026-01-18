# Boundary 9: Permission & Access Control - Deep Analysis
**Date:** 2026-01-17
**Status:** Complete

---

## Discovery Question

**Where can unauthorized access or data leaks occur?**

---

## Discovered Failure Modes

### 1. RLS POLICY GAPS

#### 1A. User sees other users' routes
- **Trigger:** RLS policy missing or wrong
- **Symptom:** Route list includes routes from other users
- **Likelihood:** 2/5 | **Impact:** 5/5 | **Priority:** 10
- **Action:** **AUDIT RLS POLICIES**

#### 1B. User modifies other user's session
- **Trigger:** Session update doesn't check user_id
- **Symptom:** User A can advance User B's progress
- **Likelihood:** 1/5 | **Impact:** 5/5 | **Priority:** 5
- **Action:** **VERIFY SESSION RLS**

---

### 2. SESSION HIJACKING

#### 2A. Two users share session_id
- **Trigger:** Session ID collision or sharing
- **Symptom:** Both users control same route progress
- **Likelihood:** 1/5 (UUID collision unlikely) | **Impact:** 4/5 | **Priority:** 4

#### 2B. Session ID guessable
- **Trigger:** Predictable session ID generation
- **Symptom:** Attacker can access sessions
- **Likelihood:** 0/5 (UUIDs) | **Impact:** 5/5 | **Priority:** 0

---

### 3. API KEY EXPOSURE

#### 3A. OpenAI key exposed in frontend
- **Investigation:** Is API key in environment vars or hardcoded?
- **Likelihood:** ? | **Impact:** 5/5 | **Priority:** TBD
- **Action:** **VERIFY API KEY STORAGE**

#### 3B. Supabase anon key misuse
- **Trigger:** Frontend uses anon key, RLS not configured
- **Symptom:** Users bypass access control
- **Likelihood:** 2/5 | **Impact:** 5/5 | **Priority:** 10
- **Action:** **CONFIRM RLS ON ALL TABLES**

---

### 4. CROSS-USER DATA BLEED

#### 4A. Cache shows User A's data to User B
- **Trigger:** Cache keyed by route_id not user_id
- **Symptom:** Wrong user's items displayed
- **Likelihood:** 1/5 | **Impact:** 4/5 | **Priority:** 4

---

### 5. DELETED USER ACCESS

#### 5A. User deleted but session persists
- **Trigger:** User account deleted, session not cleared
- **Symptom:** Deleted user can still access system
- **Likelihood:** 1/5 | **Impact:** 3/5 | **Priority:** 3

---

### 6. ADMIN vs USER PERMISSIONS

#### 6A. Regular user accesses admin functions
- **Trigger:** No role-based access control
- **Question:** Are there admin functions? (route management, user management)
- **Likelihood:** ? | **Impact:** 4/5 | **Priority:** TBD

---

### 7. RATE LIMITING

#### 7A. User spams API calls
- **Trigger:** No rate limiting on endpoints
- **Symptom:** API abuse, OpenAI credit drain
- **Likelihood:** 2/5 | **Impact:** 4/5 | **Priority:** 8
- **Action:** **CHECK RATE LIMITS**

---

## Risk Summary

| Failure Mode | Priority | Action |
|--------------|----------|--------|
| 1A. User sees others' routes | 10 | **AUDIT RLS** |
| 1B. User modifies others' sessions | 5 | **VERIFY RLS** |
| 2A. Session ID collision | 4 | Monitor (unlikely) |
| 2B. Predictable session ID | 0 | ✅ Using UUIDs |
| 3A. OpenAI key exposed | TBD | **VERIFY** |
| 3B. Supabase anon key misuse | 10 | **CONFIRM RLS** |
| 4A. Cache data bleed | 4 | Monitor |
| 5A. Deleted user access | 3 | Monitor |
| 6A. Admin access control | TBD | **CHECK RBAC** |
| 7A. Rate limiting | 8 | **CHECK LIMITS** |

---

## High Priority (10+)

1. **RLS Policy Audit** (Priority: 10) - CRITICAL
2. **Supabase RLS Verification** (Priority: 10) - CRITICAL

---

**Status:** 10 failure modes discovered, 2 CRITICAL security items
