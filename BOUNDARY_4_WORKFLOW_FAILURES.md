# Boundary 4: Workflow Execution Failures - Deep Analysis
**Date:** 2026-01-17
**Status:** Complete

---

## Discovery Question

**Where can n8n workflows fail silently or incorrectly?**

---

## Discovered Failure Modes

### 1. DATABASE QUERY FAILURES

#### 1A. Query returns 0 rows - Machine has no items
- **Trigger:** All items filtered out or already completed
- **Symptom:** Workflow crashes vs returns empty gracefully?
- **Location:** Edge Function `get-next-item-data`
- **Likelihood:** 2/5 | **Impact:** 3/5 | **Priority:** 6

#### 1B. RLS policy blocks user access
- **Trigger:** User doesn't own the session/route
- **Symptom:** Silent failure, empty data returned
- **Likelihood:** 2/5 | **Impact:** 4/5 | **Priority:** 8
- **Investigation:** Check RLS policies on stocker_sessions

#### 1C. Database connection timeout
- **Trigger:** Supabase overload or network issue
- **Symptom:** Workflow hangs, eventual timeout
- **Likelihood:** 1/5 | **Impact:** 4/5 | **Priority:** 4

---

### 2. EDGE FUNCTION TIMEOUTS

#### 2A. Complex route query exceeds 10s limit
- **Trigger:** Large route with 100+ items across 20 machines
- **Symptom:** Edge Function times out, workflow fails
- **Location:** `supabase/functions/get-next-item-data/index.ts`
- **Likelihood:** 1/5 | **Impact:** 4/5 | **Priority:** 4
- **Mitigation:** Optimize query or increase timeout

#### 2B. Cold start delay
- **Trigger:** First call after idle period
- **Symptom:** 3-5s delay on first workflow execution
- **Likelihood:** 3/5 | **Impact:** 2/5 | **Priority:** 6

---

### 3. NULL/UNDEFINED HANDLING

#### 3A. Optional field missing breaks workflow
- **Trigger:** `slot_spoken` is null, code expects string
- **Symptom:** JavaScript error in Code node
- **Likelihood:** 2/5 | **Impact:** 4/5 | **Priority:** 8
- **Investigation:** Check for `|| ''` fallbacks in workflows

#### 3B. item2 is null in two-item mode
- **Already handled:** Code checks `if (item2)`
- **Status:** ✅ Safe

---

### 4. NETWORK / RETRY LOGIC

#### 4A. Webhook call fails, no retry
- **Trigger:** Network blip during webhook execution
- **Symptom:** User sees "loading" forever, workflow never completes
- **Likelihood:** 2/5 | **Impact:** 4/5 | **Priority:** 8
- **Investigation:** Does n8n have retry logic?

#### 4B. Response lost after DB update
- **Trigger:** DB updated successfully but response network fails
- **Symptom:** DB state advanced, frontend state didn't
- **Likelihood:** 1/5 | **Impact:** 4/5 | **Priority:** 4
- **Already covered:** Boundary 1 (State Sync)

---

### 5. CONCURRENT EXECUTIONS

#### 5A. Two "next" commands 100ms apart
- **Trigger:** User double-taps or double-clicks
- **Symptom:** Both read same state, both update, item skipped
- **Likelihood:** 3/5 | **Impact:** 4/5 | **Priority:** 12
- **Already covered:** Boundary 1 (State Sync #2A)

#### 5B. Workflow still running when next call arrives
- **Trigger:** Slow workflow (2s) + impatient user
- **Symptom:** First workflow incomplete, second starts
- **Likelihood:** 2/5 | **Impact:** 3/5 | **Priority:** 6
- **Mitigation:** Frontend should disable "next" during loading

---

### 6. CODE NODE SYNTAX ERRORS

#### 6A. Workflow update introduces JS error
- **Trigger:** Code edit has typo or syntax error
- **Symptom:** Workflow executes but Code node fails
- **Likelihood:** 2/5 (during development) | **Impact:** 5/5 | **Priority:** 10
- **Mitigation:** Test before deploying (already do this)

#### 6B. n8n version update breaks compatibility
- **Trigger:** n8n updates ES version, breaks old syntax
- **Symptom:** Workflows start failing unexpectedly
- **Likelihood:** 1/5 | **Impact:** 4/5 | **Priority:** 4

---

## Risk Summary

| Failure Mode | Priority | Action |
|--------------|----------|--------|
| 1A. Empty query result | 6 | Document |
| 1B. RLS policy block | 8 | **Check RLS** |
| 1C. DB timeout | 4 | Monitor |
| 2A. Edge Function timeout | 4 | Monitor |
| 2B. Cold start | 6 | Accept (Supabase limitation) |
| 3A. Null field breaks workflow | 8 | **Audit null handling** |
| 4A. No retry on failure | 8 | **Check retry config** |
| 5A. Concurrent executions | 12 | Already addressed (Boundary 1) |
| 5B. Overlapping workflows | 6 | **Add loading state** |
| 6A. Syntax errors | 10 | Testing catches this |
| 6B. Version incompatibility | 4 | Monitor n8n updates |

---

## High Priority (8+)

1. **RLS policy verification** (Priority: 8)
2. **Null handling audit** (Priority: 8)
3. **Retry logic check** (Priority: 8)
4. **Syntax error prevention** (Priority: 10)

---

**Status:** 11 failure modes discovered, 4 high-priority items
