# Boundary 5: Machine State Transitions - Deep Analysis
**Date:** 2026-01-17
**Status:** Complete

---

## Discovery Question

**Where can machine status become inconsistent?**

---

## State Machine

```
PENDING → IN_PROGRESS → COMPLETED
    ↓           ↓
  SKIPPED ←────┘
    ↓
IN_PROGRESS (return to skipped)
```

---

## Discovered Failure Modes

### 1. TRANSITION TIMING

#### 1A. Pending → In Progress never fires
- **Trigger:** When does this transition happen? On `start_machine`?
- **Symptom:** Machine stays "pending" even after items picked
- **Likelihood:** 2/5 | **Impact:** 2/5 | **Priority:** 4
- **Investigation:** Check if start_machine updates status

#### 1B. In Progress → Completed fires too early
- **Trigger:** Last item triggers completion
- **Question:** What if user wants to undo? Can't go back to completed machine
- **Likelihood:** 2/5 | **Impact:** 3/5 | **Priority:** 6

---

### 2. SKIPPED MACHINE HANDLING

#### 2A. Skipped machine never visited ✅ FIXED
- **Status:** Reverse mode fix includes returning to skipped machines

#### 2B. Partial work then skip
- **Trigger:** User does 10 of 50 items, then skips machine
- **Question:** Are those 10 items marked complete? Machine status?
- **Symptom:** Progress lost or machine status wrong
- **Likelihood:** 3/5 | **Impact:** 3/5 | **Priority:** 9
- **Investigation:** What happens to completedItems on skip?

#### 2C. All machines skipped
- **Trigger:** User skips every machine
- **Question:** Does route complete? Or loop forever trying to find non-skipped?
- **Likelihood:** 1/5 | **Impact:** 3/5 | **Priority:** 3

---

### 3. COMPLETED BUT NOT REALLY

#### 3A. Machine marked complete with items remaining
- **Trigger:** Bug causes early completion
- **Symptom:** User can't access remaining items
- **Likelihood:** 2/5 (was 5/5 before fixes) | **Impact:** 4/5 | **Priority:** 8

#### 3B. Undo after completion
- **Trigger:** User completes machine, realizes mistake, wants undo
- **Question:** Can you undo from completed machine?
- **Likelihood:** 2/5 | **Impact:** 3/5 | **Priority:** 6

---

### 4. CONCURRENT STATUS UPDATES

#### 4A. Multiple machines "in_progress" simultaneously
- **Trigger:** State update race condition
- **Symptom:** Two machines both marked active
- **Likelihood:** 1/5 | **Impact:** 2/5 | **Priority:** 2

---

### 5. STATUS PERSISTENCE

#### 5A. Frontend shows different status than DB
- **Trigger:** Optimistic update not confirmed
- **Symptom:** UI says "completed", DB says "in_progress"
- **Likelihood:** 2/5 | **Impact:** 3/5 | **Priority:** 6
- **Already covered:** Boundary 1 (State Sync)

---

## Risk Summary

| Failure Mode | Priority | Action |
|--------------|----------|--------|
| 1A. Pending never updates | 4 | **Check start_machine** |
| 1B. Completed fires early | 6 | Monitor |
| 2A. Skipped never visited | 0 | ✅ Fixed |
| 2B. Partial work then skip | 9 | **Investigate skip behavior** |
| 2C. All skipped | 3 | Document edge case |
| 3A. Complete with items left | 8 | Monitor (was high priority) |
| 3B. Undo after complete | 6 | **Check if supported** |
| 4A. Multiple in_progress | 2 | Ignore |
| 5A. Frontend/DB mismatch | 6 | Covered (Boundary 1) |

---

## High Priority (9+)

1. **Partial work then skip** (Priority: 9) - What happens to completed items?

---

**Status:** 9 failure modes discovered, 1 high-priority item
