# FUNCTIONAL AUDIT: skip_current_machine Workflow

**Date:** 2026-02-08
**Auditor:** Claude Sonnet 4.5
**Workflow ID:** ElCSMeguJNxwp0HO
**Status:** COMPLETE

## Flow Overview

```
Webhook → Get Session → Extract Session → Get Current Machine →
Prepare Skip Update → Mark Skipped → Find Next Machine →
Process Next Machine → Prepare Session Update → Update Session → Format Output
```

**Purpose:** Marks current machine as skipped, moves to next non-skipped machine

**User Command:** "skip", "skip this machine", "skip it"

---

## NODE ANALYSIS

### NODE 1-3: Webhook, Get Session, Extract Session

**Purpose:** Standard session lookup

**✅ CORRECT:** Same pattern as other workflows

---

### NODE 4: Get Current Machine

**Purpose:** Fetch current machine details

**Query:**
```
GET /machines?id=eq.{{ current_machine_id }}
SELECT: id, machine_name, location_name, machine_number, sequence, route_id, status, completed_items, total_items
```

**✅ CORRECT:** Gets all fields needed for skip logic

---

### NODE 5: Prepare Skip Update (CRITICAL VALIDATION)

**Purpose:** Validate machine can be skipped

**Logic:**
```javascript
if (machine.status === 'skipped') {
  throw new Error('Machine already skipped. Say "go back" to resume.');
}
```

**✅ EXCELLENT:** Prevents double-skipping

**Edge Cases:**
- ✅ Machine already skipped → Error with helpful message
- ⚠️ Machine already complete (completed_items = total_items) → NOT validated

**Recommendation:** Add validation for completed machines
```javascript
if (machine.completed_items >= machine.total_items) {
  throw new Error('Machine already complete. Say "next" to continue.');
}
```

---

### NODE 6: Mark Skipped (DATABASE UPDATE)

**Purpose:** Mark machine as skipped in database

**Update:**
```javascript
PATCH /machines?id=eq.{{ id }}
{
  status: 'skipped',
  skipped_at_item: {{ completed_items || 0 }}
}
```

**✅ EXCELLENT DESIGN:**
- Sets status='skipped' for filtering ✅
- Stores `skipped_at_item` (progress when skipped) ✅
- Allows resuming from correct position later ✅

**Race Condition Risk:** LOW
- User unlikely to skip same machine twice rapidly
- Double-skip prevented by Prepare Skip Update validation

---

### NODE 7: Find Next Machine (CRITICAL LOGIC)

**Purpose:** Find next non-skipped machine

**Query:**
```sql
WHERE route_id = {{ route_id }}
  AND sequence > {{ current_sequence }}
  AND status != 'skipped'
ORDER BY sequence ASC
LIMIT 1
```

**✅ EXCELLENT - BETTER THAN get_next_item:**
- Uses `sequence > current` (not `sequence = current + 1`) ✅
- Handles sequence gaps correctly ✅
- Filters out already-skipped machines ✅
- LIMIT 1 is safe (only want next machine) ✅

**Comparison to get_next_item:**
- get_next_item uses `sequence = current + 1` ❌ (fails on gaps)
- skip_current_machine uses `sequence > current` ✅ (handles gaps)
- **This is the CORRECT approach** that get_next_item should copy

**Edge Cases:**
- ✅ All remaining machines skipped → Returns empty array → Handled downstream
- ✅ Sequence gaps (machine deleted) → Finds next available sequence ✅

---

### NODE 8: Process Next Machine

**Purpose:** Handle route completion vs. next machine found

**Logic:**
```javascript
if (nextMachines.length === 0) {
  return {
    route_complete: true,
    next_machine_id: null
  };
}

var next = nextMachines[0];
return {
  skipped_machine, next_machine, next_machine_id,
  next_location, route_complete: false
};
```

**✅ CORRECT:**
- Handles no next machine (route complete) ✅
- Extracts next machine details ✅

---

### NODE 9: Prepare Session Update

**Purpose:** Build database update payload

**Logic:**
```javascript
if (next_machine_id) {
  update.current_machine_id = next_machine_id;
} else {
  update.status = 'completed';
}
```

**✅ CORRECT:**
- Updates to next machine if found ✅
- Marks session complete if no more machines ✅

---

### NODE 10: Update Session

**Purpose:** Update session in database

**Update:**
```javascript
PATCH /sessions?id=eq.{{ session_id }}
{
  current_machine_id: {{ next_machine_id }},
  current_route_id: {{ current_route_id }},
  status: {{ status }}  // 'stocking' or 'completed'
}
```

**✅ CORRECT:**
- Updates current_machine_id to next machine ✅
- Preserves current_route_id ✅
- Updates status if route complete ✅

**⚠️ MISSING:** Does NOT update pick_direction
- Assumption: User will be asked "top or bottom?" for next machine
- start_machine will set pick_direction when called
- This is consistent with get_next_item behavior (doesn't set direction either) ✅

---

### NODE 11: Format Output

**Purpose:** Format response for frontend

**Output:**
```javascript
if (route_complete) {
  return {
    action: 'route_complete',
    spoken: 'All machines complete. Route finished!',
    route_complete: true
  };
}

return {
  action: 'next_machine',
  skipped_machine, next_machine, next_machine_id,
  next_machine_number, next_location,
  route_complete: false,
  spoken: "Skipped X. Next up is Y at Z. Top or bottom?"
};
```

**✅ CORRECT:**
- Matches get_next_item contract for action='next_machine' ✅
- Provides all fields frontend needs ✅
- Randomizes voice output (3 variations) for natural feel ✅

**Contract Compliance:** Already validated ✅

---

## EDGE CASE ANALYSIS

### 1. User Skips Last Machine
**Scenario:**
- User on Machine 5 (last machine)
- Says "skip"

**Flow:**
1. Mark Machine 5 as skipped ✅
2. Find Next Machine → Empty array (no machines left) ✅
3. Set route_complete=true ✅
4. Update session status='completed' ✅
5. Return route_complete response ✅

**Result:** ✅ Works correctly

---

### 2. User Skips Machine Mid-Progress
**Scenario:**
- Machine 2 has 10 items
- User picked 5 items (completed_items=5)
- Says "skip"

**Flow:**
1. Mark Machine 2 as skipped ✅
2. Store skipped_at_item=5 ✅
3. Find Machine 3 ✅
4. Update session to Machine 3 ✅

**Later - User Says "Go Back":**
- go_back_to_skipped finds Machine 2 (status='skipped') ✅
- Resumes from item 6 (sequence = skipped_at_item + 1) ✅

**Result:** ✅ Works correctly

---

### 3. All Remaining Machines Already Skipped
**Scenario:**
- Route has Machines 1, 2, 3, 4
- User on Machine 1
- Machines 2, 3, 4 already marked skipped
- Says "skip"

**Flow:**
1. Mark Machine 1 as skipped ✅
2. Find Next Machine → Query: `status != 'skipped'` → Empty array ✅
3. Set route_complete=true ✅
4. Session marked completed ✅

**Result:** ✅ Works correctly

---

### 4. User Tries to Skip Already-Skipped Machine
**Scenario:**
- User manually navigates to skipped machine somehow

**Flow:**
1. Get Current Machine → status='skipped' ✅
2. Prepare Skip Update → Error: "Machine already skipped" ✅
3. Workflow fails with error ✅

**Result:** ✅ Correctly prevented

---

### 5. User Skips Completed Machine
**Scenario:**
- Machine 2 has 10 items
- User picked all 10 items (completed_items=10)
- Machine still showing as current
- User says "skip"

**Flow:**
1. Get Current Machine → completed_items=10, total_items=10 ✅
2. Prepare Skip Update → NO VALIDATION ❌
3. Mark as skipped ✅
4. Move to next machine ✅

**Problem:** Machine marked skipped even though it's complete
- ⚠️ Data inconsistency: Machine both complete AND skipped
- Not critical (user progresses correctly) but semantically wrong

**Recommendation:** Add validation in Prepare Skip Update
```javascript
if (machine.completed_items >= machine.total_items) {
  throw new Error('Machine already complete. Say "next" to continue.');
}
```

---

## SECURITY ANALYSIS

**✅ NO ISSUES:**
- Uses Supabase credentials (not hardcoded) ✅
- No SQL injection risk ✅
- No exposed API keys ✅

---

## RACE CONDITION ANALYSIS

**Scenario:** User says "skip" twice rapidly

**Current Behavior:**
1. First call: Marks machine as skipped
2. Second call: Prepare Skip Update detects status='skipped' → Error

**Result:** ✅ Second call fails gracefully (prevented by validation)

**Impact:** NONE - Double-skip correctly prevented

---

## CRITICAL FINDINGS SUMMARY

### 🟢 MEDIUM:

1. **Completed Machine Validation Missing**
   - Allows marking completed machine as skipped
   - Not critical (user progresses) but creates data inconsistency
   - **Action:** Add validation in Prepare Skip Update node

### ✅ WORKING CORRECTLY - BEST PRACTICES:

- **Next Machine Selection** - Uses `sequence > current` (handles gaps) ✅
  - This is BETTER than get_next_item's `sequence = current + 1`
  - **RECOMMENDATION:** get_next_item should adopt this approach
- **Double-skip Prevention** - Validates status != 'skipped' ✅
- **Progress Preservation** - Stores skipped_at_item for resume ✅
- **Route Completion** - Handles no next machine correctly ✅
- **Session Updates** - Correctly updates current_machine_id ✅
- **Error Messages** - Helpful and actionable ✅
- **Security** - Uses credentials, not hardcoded keys ✅

---

## COMPARISON TO get_next_item

| Feature | get_next_item | skip_current_machine | Winner |
|---------|--------------|---------------------|--------|
| Next Machine Logic | `sequence = current + 1` ❌ | `sequence > current` ✅ | **skip** |
| Handles Sequence Gaps | NO ❌ | YES ✅ | **skip** |
| Security | Hardcoded API keys ❌ | Uses credentials ✅ | **skip** |
| Race Conditions | completed_items not atomic ❌ | Prevented by validation ✅ | **skip** |
| Code Quality | 220+ lines, complex ⚠️ | 11 nodes, clean ✅ | **skip** |

**Lesson:** skip_current_machine is a well-designed workflow. get_next_item should learn from it.

---

## RECOMMENDATIONS

### 1. Add Completed Machine Validation (MEDIUM)
**File:** Prepare Skip Update node
```javascript
if (machine.completed_items >= machine.total_items) {
  throw new Error('Machine already complete. Say "next" to continue.');
}
```

### 2. Get_next_item Should Copy Sequence Logic (CRITICAL)
**Current get_next_item:**
```javascript
if (machines[i].sequence === currentMachineSeq + 1) { ... }
```

**Should be (like skip_current_machine):**
```javascript
if (machines[i].sequence > currentMachineSeq) {
  nextMachine = machines[i];  // First machine with higher sequence
  break;
}
```

---

**AUDIT STATUS:** COMPLETE ✅

