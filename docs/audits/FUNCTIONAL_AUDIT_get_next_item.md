# FUNCTIONAL AUDIT: get_next_item Workflow

**Date:** 2026-02-08
**Auditor:** Claude Sonnet 4.5
**Workflow ID:** iykbFj7f9222PF7r
**Status:** IN PROGRESS

## Flow Overview

```
Webhook → Call Edge Function → Extract Data → Determine Next State → Switch Action
  ├─ [next_machine] → Add First Item → Merge → Update Session → Format Output
  ├─ [next_item] → Increment Completed Items → Merge → Update Session → Format Output
  └─ [complete] → Merge → Update Session → Format Output
```

---

## NODE 1: Call Edge Function

**Purpose:** Fetches consolidated session/machines/items data from Edge Function

**Calls:** `POST /functions/v1/get-next-item-data`

**Returns:** `{ session: [...], items: [...], machines: [...] }`

**Edge Cases to Check:**
- [ ] What if Edge Function times out?
- [ ] What if Edge Function returns 500 error?
- [ ] What if session not found?
- [ ] What if items array is empty?
- [ ] What if machines array is empty?

---

## NODE 2: Extract Consolidated Data

**Purpose:** Validates and extracts data from Edge Function response

**Logic:**
```javascript
if (!data || !data.session || !Array.isArray(data.session) || data.session.length === 0) {
  throw new Error('No active session found');
}
```

**✅ CORRECT:** Validates session exists before proceeding

**Edge Cases:**
- [x] Empty session array → Throws error ✅
- [ ] Empty items array → Should this throw error? Or return "no items"?
- [ ] Empty machines array → Should this throw error?

---

## NODE 3: Determine Next State (CRITICAL - 220+ lines)

**Purpose:** Core logic - determines next action (next_item, next_machine, or complete)

### Data Flow Analysis:

**Inputs:**
- `count` (1 or 2 for 2-pick mode)
- `session` (current_machine_id, current_route_id, pick_direction)
- `items` (all items for current machine)
- `machines` (all machines on route)

**Outputs:** 3 possible actions
1. `next_item` - Return next item to pick
2. `next_machine` - Machine complete, transition to next
3. `complete` - Route complete

### LOGIC BUGS TO CHECK:

#### 1. Machine Lookup (Lines 20-29)
```javascript
for (var i = 0; i < machines.length; i++) {
  if (machines[i].id === currentMachineId) {
    currentMachine = machines[i];
    currentMachineSeq = machines[i].sequence;
    break;
  }
}

if (!currentMachine) {
  throw new Error('Current machine not found: ' + currentMachineId);
}
```

**✅ CORRECT:** Validates machine exists

**Edge Case:** What if `currentMachineId` is NULL? → Should check before loop

#### 2. Machine Complete Detection (Lines 38-46)
```javascript
if (completedItems >= totalItems) {
  // Find next machine
}
```

**⚠️ POTENTIAL BUG:** Uses `>=` instead of `===`
- What if `completedItems > totalItems`? (data corruption scenario)
- Should this throw an error instead of silently continuing?

**Recommendation:** Add validation
```javascript
if (completedItems > totalItems) {
  throw new Error('Data corruption: completed > total');
}
if (completedItems === totalItems) {
  // Find next machine
}
```

#### 3. Next Machine Selection (Lines 47-56)
```javascript
for (var i = 0; i < machines.length; i++) {
  if (machines[i].sequence === currentMachineSeq + 1 && machines[i].status !== 'skipped') {
    nextMachine = machines[i];
    break;
  }
}
```

**❌ CRITICAL BUG:** Assumes sequential machine numbering
- What if machine sequences have gaps? (e.g., 1, 2, 4, 5 - machine 3 deleted)
- Will skip machine 4 and fail to find next machine

**Fix:** Find LOWEST sequence > currentMachineSeq
```javascript
var nextMachine = null;
var minNextSeq = 9999;
for (var i = 0; i < machines.length; i++) {
  if (machines[i].sequence > currentMachineSeq &&
      machines[i].sequence < minNextSeq &&
      machines[i].status !== 'skipped') {
    nextMachine = machines[i];
    minNextSeq = machines[i].sequence;
  }
}
```

#### 4. Skipped Machine Logic (Lines 66-90)
```javascript
var skippedMachines = [];
for (var i = 0; i < machines.length; i++) {
  if (machines[i].status === 'skipped') {
    skippedMachines.push(machines[i]);
  }
}

if (skippedMachines.length > 0) {
  var firstSkipped = skippedMachines[0];
  // Return to first skipped
}
```

**⚠️ EDGE CASE:** What if skipped machine was completed by another workflow?
- Should verify skipped machine still has incomplete items
- What if ALL skipped machines are now complete?

#### 5. Target Sequence Calculation (Lines 118-123)
```javascript
var targetSequence;
if (pickDirection === 'forward') {
  targetSequence = completedItems + 1;
} else {
  targetSequence = totalItems - completedItems;
}
```

**✅ CORRECT for 1-pick mode**

**⚠️ CHECK:** Does this work correctly for 2-pick mode?
- Forward: completed=5, count=2 → target=6, then 7 ✅
- Reverse: total=10, completed=5, count=2 → target=5, then 4 ✅

#### 6. Item Lookup (Lines 125-131)
```javascript
for (var i = 0; i < items.length; i++) {
  if (items[i].sequence === targetSequence) {
    nextItem = items[i];
    break;
  }
}
```

**✅ CORRECT:** Finds item by sequence

**⚠️ EDGE CASE:** What if item with targetSequence doesn't exist?
- Falls through to error at end ✅
- Error message is helpful ✅

#### 7. 2-Pick Mode Logic (Lines 136-147)
```javascript
if (count === 2) {
  var item2Sequence = pickDirection === 'reverse' ? targetSequence - 1 : targetSequence + 1;
  for (var i = 0; i < items.length; i++) {
    if (items[i].sequence === item2Sequence) {
      item2 = items[i];
      break;
    }
  }
  if (item2) {
    newIndex = item2Sequence;
  }
}
```

**⚠️ LOGIC ERROR:** `pickDirection === 'reverse'` but should be `'backward'` or check actual value

**⚠️ EDGE CASE:** What if only 1 item remaining but count=2?
- Should return 1 item, not fail
- Current code sets item2=null which is correct ✅
- But what about itemsToIncrement calculation?

#### 8. Completed Items Calculation (Lines 149-152)
```javascript
var itemsAvailable = totalItems - completedItems;
var itemsToIncrement = Math.min(count, itemsAvailable);
var newCompletedItems = completedItems + itemsToIncrement;
var newItemsRemaining = totalItems - newCompletedItems;
```

**✅ CORRECT:** Uses Math.min to handle last item edge case

---

## NODE 4: Switch Action

**Purpose:** Routes to correct path based on action

**✅ CORRECT:** Simple switch with 3 outputs

---

## NODE 5: Increment Completed Items

**Purpose:** Updates machine.completed_items in database

**⚠️ SECURITY ISSUE:** Hardcoded API keys in code
```javascript
'apikey': 'eyJhbGci...',
'Authorization': 'Bearer eyJhbGci...'
```

**Recommendation:** Use n8n credentials instead

**⚠️ RACE CONDITION RISK:**
- Two rapid "next" commands could both read completedItems=5
- Both increment to 6
- One overwrites the other
- Result: completedItems=6 but user picked 2 items

**Fix:** Use atomic increment
```sql
UPDATE machines
SET completed_items = completed_items + $1
WHERE id = $2
```

---

## NODE 6-8: Merge, Update Session, Format Output

**Purpose:** Final processing and response formatting

**Contract Compliance:** Already validated ✅

---

## CRITICAL FINDINGS SUMMARY

### 🔴 CRITICAL BUGS:
1. **Next Machine Selection** - Assumes no sequence gaps, will fail if machine deleted
2. **Race Condition** - completed_items increment not atomic

### 🟡 HIGH PRIORITY:
3. **completed > total** - Should error instead of continuing
4. **Skipped machine validation** - Doesn't verify skipped machine still incomplete
5. **Security** - Hardcoded API keys

### 🟢 MEDIUM:
6. **pick_direction value** - Check if 'reverse' is correct value
7. **Empty items array** - Should throw meaningful error early

### ✅ WORKING CORRECTLY:
- LIMIT 100 bug fixed (removed)
- machine_id contract fixed
- 2-pick mode logic
- Error messages helpful
- Edge case handling (last item, Math.min)

---

---

## EDGE FUNCTION AUDIT: get-next-item-data

**File:** `supabase/functions/get-next-item-data/index.ts`

### Flow:
```
Request → Validate user_id → Call RPC → Extract session/machines/items → Return JSON
```

### ✅ CORRECT:
1. **Single RPC call** - Consolidates 3 queries into 1 ✅
2. **Returns ALL machines** - Workflow needs full list for completion logic ✅
3. **Filters items to current machine** - Correct scoping ✅
4. **Error logging** - Good debugging info ✅

### ⚠️ ISSUES FOUND:

#### 1. Empty Session Returns 200 OK (Lines 43-49)
```typescript
if (!data || data.length === 0) {
  return new Response(JSON.stringify([]), {
    status: 200,  // ← Should this be 404?
  });
}
```

**Problem:** Returns empty array with 200 OK when no session found
- Workflow expects session and will throw error
- But HTTP status says "success"
- Makes debugging harder (looks like success in logs)

**Recommendation:** Return 404 or 400 with error message
```typescript
return new Response(JSON.stringify({
  error: 'No active session found'
}), {
  status: 404,
});
```

#### 2. No Validation of RPC Response Structure
```typescript
const sessionArray = [{
  id: data[0].session_id,  // ← What if data[0] is undefined?
  current_machine_id: data[0].current_machine_id,
  current_route_id: data[0].current_route_id,
  pick_direction: data[0].pick_direction
}];
```

**Problem:** Assumes `data[0]` exists without checking
- Edge case: RPC returns empty array (handled above)
- Edge case: RPC returns array with null fields (not handled)

**Recommendation:** Validate fields exist:
```typescript
if (!data[0].session_id || !data[0].current_machine_id) {
  throw new Error('Invalid session data from RPC');
}
```

### 🟢 NO DATA BOUNDARY ISSUES:
- Returns ALL machines ✅
- No LIMIT clauses ✅
- No truncation risk ✅

---

## COMBINED FINDINGS: get_next_item (Workflow + Edge Function + RPC)

### 🔴 CRITICAL (Fix Required):
1. **Next Machine Selection Bug** - Assumes sequential numbering, fails if machine deleted
2. **Race Condition** - completed_items increment not atomic
3. **Hardcoded API Keys** - Security issue in Increment Completed Items node

### 🟡 HIGH (Should Fix):
4. **completed > total** - Should error instead of continuing
5. **Empty Session Returns 200** - Should return 404
6. **No RPC Response Validation** - Could fail on null fields

### 🟢 MEDIUM (Monitor):
7. **Skipped machine validation** - Doesn't verify still incomplete
8. **pick_direction value** - Verify 'reverse' vs 'backward'

### ✅ VERIFIED CORRECT:
- LIMIT 100 bug fixed ✅
- machine_id contract fixed ✅
- 2-pick mode logic ✅
- All machines returned (no truncation) ✅
- Items scoped to current machine ✅

---

## NEXT STEPS:

1. ~~Check Edge Function~~ ✅ DONE
2. Fix critical bugs in workflow
3. Verify pick_direction values in database
4. Check if machine sequences can have gaps
5. Test race condition scenario
6. Move to next user function: start_machine
