# System Impact Audit: Reverse Mode + Count=2 Machine Premature Completion

**Date:** 2026-01-20
**Symptom:** Machine completes after first pick in reverse mode with count=2
**Method:** XF Boundary-Based Root Discovery (BBRD)

---

## BOUNDARY 1: USER ACTION → SYSTEM STATE

### Question: What sequence of user actions leads to this bug?

**Elements:**
1. User selects route
2. User starts machine with "bottom" (reverse mode)
3. Settings panel shows count=2
4. User says "next"
5. **SYMPTOM:** Machine completes prematurely

### Data Flow:
```
User: "start at bottom"
  → Frontend: direction="bottom"
  → start_machine webhook: {direction: "bottom", count: 2, user_id}
  → Database: pick_direction="reverse", current_item_index=35
  → TTS: "Starting from bottom. Item 36, Item 35"

User: "next"
  → get_next_item webhook: {count: 2, user_id, date}
  → Edge Function: Returns session with current_item_index=35
  → **BUG OCCURS HERE**
  → TTS: "Machine complete, moving to next machine"
```

---

## BOUNDARY 2: SESSION STATE MANAGEMENT

### Question: Where does `current_item_index` get read/written?

**Write Locations:**
1. **start_machine** (JbKdJuKgGbyvzlF0) - Line ~70 in "Select Item" node
   - Reverse + count=2: Sets `current_item_index = items.length - 1` (e.g., 35)
   - Forward + count=2: Sets `current_item_index = 2`

2. **get_next_item** (iykbFj7f9222PF7r) - Line ~120 in "Determine Next State" node
   - Sets `new_item_index` based on calculation
   - Updates session via "Update Session" node

3. **Update Session** HTTP node
   - Writes to `sessions` table: `current_item_index`, `current_machine_id`

**Read Locations:**
1. **Edge Function** (get-next-item-data)
   - Queries: `SELECT current_item_index, current_machine_id, pick_direction FROM sessions WHERE user_id=...`

2. **Determine Next State** node
   - Reads: `session.current_item_index` from Edge Function response
   - Uses for calculations

---

## BOUNDARY 3: INDEX ARITHMETIC IN REVERSE MODE

### Question: How does count=2 change index calculations?

**start_machine behavior (CORRECT):**
```javascript
if (pick_direction === 'reverse') {
  selectedItem = items[items.length - 1];  // Item at sequence 36
  itemIndex = items.length;  // 36

  if (count === 2 && items.length >= 2) {
    item2 = items[items.length - 2];  // Item at sequence 35
    itemIndex = items.length - 1;  // ✅ Sets to 35
  }
}
```

**get_next_item "Determine Next State" behavior (SUSPECT):**
```javascript
// Current index from session: 35 (after showing 36,35)
var currentItemIndex = session.current_item_index || 0;  // 35

if (pickDirection === 'reverse') {
  // Looking for sequence 35 - 1 = 34
  for (var i = 0; i < items.length; i++) {
    if (items[i].sequence === currentItemIndex - 1) {  // Looking for sequence 34
      nextItem = items[i];
      break;
    }
  }
}

// If nextItem NOT found → Machine complete logic
```

**HYPOTHESIS:** The logic is looking for `sequence = currentItemIndex - 1`, but:
- `currentItemIndex` represents the HIGHEST sequence shown (35)
- It should look for `sequence = currentItemIndex - count` or handle count=2 properly

---

## BOUNDARY 4: MACHINE TRANSITION LOGIC

### Question: When does system decide "machine complete"?

**Code Path:**
```javascript
//get_next_item "Determine Next State" node, line ~95

if (nextItem) {
  // Found next item → return next_item action
} else {
  // No next item found → Check for next machine

  for (var i = 0; i < machines.length; i++) {
    if (machines[i].sequence === currentMachineSeq + 1 && machines[i].status !== 'skipped') {
      nextMachine = machines[i];
      break;
    }
  }

  if (nextMachine) {
    var startingIndex;
    if (pickDirection === 'reverse') {
      startingIndex = items.length;  // ❌ USING OLD MACHINE'S ITEM COUNT!
    }

    return [{
      json: {
        action: 'next_machine',
        new_item_index: startingIndex,  // ❌ Wrong for new machine
        ...
      }
    }];
  }
}
```

**TWO BUGS IDENTIFIED:**
1. **Bug A:** Not finding next item due to incorrect index arithmetic with count=2
2. **Bug B:** Using old machine's `items.length` for new machine's starting index

---

## BOUNDARY 5: RECENT CHANGES IMPACT

### Question: What recent changes could have affected this?

**Changes Made (Session 44 - 2026-01-19):**
1. **Reset Route Button** - Added session clearing logic
   - Files: `StockerApp.tsx`, `useSessionPersistence.ts`
   - Impact: Session deletion/recreation
   - **POTENTIAL CONTAMINATION:** Session state corruption during reset?

2. **Progress Bar** - Added `currentMachineTotalItems` field
   - Files: `useStockerSession.ts`, database query
   - Impact: New field in session state
   - **POTENTIAL CONTAMINATION:** Field interference with index?

3. **Session DELETE instead of UPDATE** - Changed reset logic
   - File: `useSessionPersistence.ts`
   - Impact: Complete session deletion
   - **POTENTIAL CONTAMINATION:** Incomplete recreation?

**Analysis:**
- Progress bar adds NEW fields but doesn't modify index logic
- Reset button affects session lifecycle but not mid-route behavior
- **UNLIKELY** these caused the bug UNLESS user tested immediately after a reset

---

## BOUNDARY 6: EDGE FUNCTION DATA CONTRACT

### Question: What data does Edge Function return to get_next_item?

**Query:**
```sql
SELECT
  s.id, s.current_machine_id, s.current_item_index,
  s.current_route_id, s.pick_direction
FROM sessions s
WHERE s.user_id = $1 AND s.status = 'stocking'
```

**Returns to workflow:**
```json
{
  "session": [{
    "id": "...",
    "current_machine_id": "...",
    "current_item_index": 35,  // Last value written
    "pick_direction": "reverse"
  }],
  "items": [...36 items...],
  "machines": [...3 machines...]
}
```

**Contract Validation:**
- ✅ Edge Function returns current index
- ✅ Items are for current_machine_id
- ✅ Machines list includes current + next
- ❓ Does workflow expect index to mean "last shown" or "next to show"?

---

## ROOT CAUSE HYPOTHESIS

### Primary Hypothesis: Index Semantics Mismatch in Count=2 Reverse Mode

**The Bug:**
```javascript
// start_machine sets: current_item_index = 35 (after showing items 36, 35)
// This means: "We just showed up to sequence 35"

// get_next_item reads: current_item_index = 35
// It looks for: sequence = 35 - 1 = 34

// ❌ BUT: With count=2, we already showed 35 AND 36
// ❌ Next should be 34 AND 33, with index advancing to 33
// ❌ The code doesn't account for count=2 in reverse mode advancement
```

**Why Count=1 Works:**
- start_machine: index = 36 (just showed 36)
- get_next_item: looks for sequence = 36 - 1 = 35 ✅

**Why Count=2 Breaks:**
- start_machine: index = 35 (showed 36, 35)
- get_next_item: looks for sequence = 35 - 1 = 34... but wait!
  - Code finds sequence 34 ✅
  - BUT then tries to find item2 at sequence 34 - 1 = 33
  - **OR** the count=2 logic isn't properly applied in reverse mode

---

## VERIFICATION NEEDED

### Execute These Steps to Confirm Root Cause:

1. **Check n8n execution logs** for the failing "next" command
   - Execution ID: 27467 (already retrieved)
   - Confirm: currentItemIndex value
   - Confirm: What sequence it searched for
   - Confirm: Whether nextItem was found or null

2. **Trace exact code path:**
   - Did it enter "if (nextItem)" or go to "else" (machine complete)?
   - What was the value of `count` in the workflow?
   - Did count=2 logic execute?

3. **Compare working vs broken:**
   - Reverse + count=1: Working
   - Reverse + count=2: Broken
   - Difference: The count=2 branch in reverse mode

---

## RECOMMENDED FIX (Pending Verification)

### Fix Location: get_next_item workflow, "Determine Next State" node

**Current Logic (BROKEN):**
```javascript
var newIndex = pickDirection === 'reverse' ? currentItemIndex - 1 : currentItemIndex + 1;

var item2 = null;
if (count === 2) {
  var item2Index = pickDirection === 'reverse' ? newIndex - 1 : newIndex + 1;
  // ...
}
```

**Proposed Fix:**
```javascript
// Calculate advancement based on count
var advancement = count || 1;

var newIndex;
if (pickDirection === 'reverse') {
  newIndex = currentItemIndex - advancement;  // Advance by count, not just 1
} else {
  newIndex = currentItemIndex + advancement;
}

// Then find items at the new positions
```

**BUT WAIT** - Need to verify the exact execution data first!

---

## NEXT STEPS

1. ✅ Get execution 27467 data (done above)
2. ⏳ Analyze execution to see exact values
3. ⏳ Identify whether nextItem was found or not
4. ⏳ Determine if count=2 logic executed
5. ⏳ Apply correct fix based on findings
6. ⏳ Test fix in isolation
7. ⏳ Deploy and verify

---

## SYSTEMIC LEARNINGS

### What This Audit Reveals:

1. **Index Semantics Are Ambiguous**
   - Does current_item_index mean "last shown" or "current position"?
   - Need clear documentation

2. **Count=2 Is Undertested**
   - Reverse + count=2 edge case missed
   - Need automated test coverage

3. **Machine Transition Uses Wrong Data**
   - Setting next machine's index using current machine's item count
   - Needs fix regardless of primary bug

4. **Recent Changes May Interact**
   - Session lifecycle changes + index bugs could compound
   - Need regression testing

---

**STATUS:** Analysis complete, awaiting execution data review for final confirmation
