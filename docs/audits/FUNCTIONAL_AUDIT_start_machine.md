# FUNCTIONAL AUDIT: start_machine Workflow

**Date:** 2026-02-08
**Auditor:** Claude Sonnet 4.5
**Workflow ID:** JbKdJuKgGbyvzlF0
**Status:** IN PROGRESS

## Flow Overview

```
Webhook → Get Session → Extract Session → Get Items → Select Item
  ├─ Update Machine (parallel)
  └─ Merge Preserve Data ← Update Machine
       ↓
     Update Session → Format Output
```

**Purpose:** Called when user says "top" or "bottom" after machine transition. Starts picking items from new machine.

**User Commands:** "top", "bottom"
**AI Maps To:** `start_machine(direction="beginning")` or `start_machine(direction="end")`

---

## NODE 1: Webhook

**Purpose:** Trigger endpoint

**Path:** `/start-machine`

**Expected Parameters:**
- `user_id` (UUID)
- `direction` (string: "beginning", "end", "top", "bottom", "last")
- `count` (integer: 1 or 2, optional, defaults to 1)

**Edge Cases:**
- Missing parameters → Handled downstream ✅

---

## NODE 2: Get Session

**Purpose:** Fetch active session for user

**Query:**
```
GET /sessions?user_id=eq.{{ user_id }}&status=eq.stocking&order=created_at.desc&limit=1
SELECT: id, current_machine_id, current_route_id, pick_direction
```

**✅ CORRECT:**
- LIMIT 1 is safe (only want latest session)
- ORDER BY created_at DESC ensures most recent
- Filters to status='stocking'

**Edge Cases:**
- No session found → Returns empty array → Handled in Extract Session ✅
- Multiple sessions → Takes most recent ✅

---

## NODE 3: Extract Session (CRITICAL)

**Purpose:** Validates direction parameter and maps to pick_direction

**Logic:**
```javascript
var direction = input.direction;
if (!direction) {
  return error: 'direction_required'
}

var pickDirection = (direction === 'end' || direction === 'bottom' || direction === 'last')
  ? 'reverse' : 'forward';
```

**✅ CORRECT:**
- Requires direction parameter (no default) → Forces explicit user choice
- Maps direction synonyms correctly:
  - "end", "bottom", "last" → reverse (bottom to top)
  - "beginning", "top", "start" → forward (top to bottom)

**⚠️ EDGE CASE:** Invalid direction value
- Input: `direction="middle"` or `direction="sideways"`
- Result: Falls through to `'forward'` (default else branch)
- Impact: User says nonsense, gets top-to-bottom (might not be what they wanted)
- **Recommendation:** Validate direction against allowed values:
```javascript
var validDirections = ['beginning', 'top', 'start', 'end', 'bottom', 'last'];
if (validDirections.indexOf(direction.toLowerCase()) === -1) {
  return error: 'invalid_direction'
}
```

---

## NODE 4: Get Items

**Purpose:** Fetch all items for current machine

**Query:**
```
GET /items?machine_id=eq.{{ machine_id }}
SELECT: id, product_name, quantity, slot, sequence, inventory_current, inventory_parlevel
ORDER BY sequence ASC
```

**✅ CORRECT:**
- No LIMIT clause → Gets all items (no truncation)
- ORDER BY sequence ASC → Items in correct order

**Edge Cases:**
- machine_id is NULL → Query returns empty array → Handled in Select Item ✅
- No items found → Returns empty array → Handled in Select Item ✅

---

## NODE 5: Select Item (CORE LOGIC)

**Purpose:** Select first item(s) based on direction and count

**Logic:**
```javascript
var count = input.count || 1;

var items = [];
for (var i = 0; i < itemsData.length; i++) {
  if (item && item.id) {
    items.push(item);
  }
}

if (items.length === 0) {
  return error: 'No items found in machine'
}

if (pick_direction === 'reverse') {
  selectedItem = items[items.length - 1];  // Last item
  if (count === 2 && items.length >= 2) {
    item2 = items[items.length - 2];  // Second to last
  }
} else {
  selectedItem = items[0];  // First item
  if (count === 2 && items.length >= 2) {
    item2 = items[1];  // Second item
  }
}
```

**✅ CORRECT:**
- Handles empty items array with error ✅
- 2-pick mode logic correct:
  - Forward: items[0], items[1]
  - Reverse: items[last-1], items[last]
- Graceful fallback if only 1 item but count=2 → item2 stays null ✅

**⚠️ DEAD CODE:**
```javascript
var itemIndex;
if (sessionData.pick_direction === 'reverse') {
  // ...
  itemIndex = selectedItem.sequence;
  if (count === 2 && items.length >= 2) {
    itemIndex = item2.sequence;  // ← Reassigned
  }
}
```
- Variable `itemIndex` is declared and assigned but NEVER USED
- Not returned in output
- Can be removed (code cleanup)

**Edge Cases:**
- ✅ count=2 but only 1 item → item2=null, works correctly
- ✅ Empty items array → Error returned
- ❓ count > 2 (e.g., count=3) → Only picks 2 items max (no validation error)

---

## NODE 6: Update Machine (CRITICAL ANALYSIS)

**Purpose:** Set completed_items counter when starting machine

**Database Update:**
```javascript
PATCH /machines?id=eq.{{ machine_id }}
{
  completed_items: {{ count }}  // ← SETS to count (1 or 2)
}
```

**⚠️ CRITICAL QUESTION:** Is this SETTING or INCREMENTING?

**Analysis:**
- Code SETS `completed_items` to `count` (not incrementing)
- Purpose: Initialize counter when starting NEW machine
- Assumption: Only called when machine just transitioned (completed_items should be 0)
- Context: User just finished previous machine, said "top/bottom" for next machine

**When is this workflow called?**
1. User completes Machine 1 → get_next_item returns `action='next_machine'`
2. AI asks "Top or bottom for Machine 2?"
3. User says "bottom"
4. AI calls `start_machine(direction="end")`
5. **start_machine sets completed_items=count (1 or 2)**

**Is this correct?**
- ✅ YES if machine is fresh (completed_items was 0)
- ❌ NO if machine was partially completed (would reset counter)

**Scenario where this could fail:**
1. User picks 5 items on Machine 3 (completed_items=5)
2. User says "go back" to Machine 2
3. User says "bottom" to restart Machine 2 from bottom
4. **start_machine sets completed_items=1** (should be 0 or preserve existing count)
5. Data corruption: counter resets mid-machine

**Root Question:** Does start_machine only get called for NEW machines, or can it be called mid-machine?

**Checking AI prompt logic:**
- start_machine is called when user says "top/bottom"
- This happens ONLY after `action='next_machine'` (new machine transition)
- So start_machine SHOULD only be called for fresh machines

**BUT:** What if user manually says "bottom" mid-machine?
- AI prompt should prevent this (only accept "top/bottom" when pendingMachineTransition)
- Frontend enforces state machine (see CLAUDE.md Session 43)
- So this SHOULD be safe

**Recommendation:** Add defensive validation
```javascript
// Before update, verify machine hasn't started yet
var currentCompleted = getMachineCompletedItems(machine_id);
if (currentCompleted > 0) {
  return error: 'machine_already_started'
}
```

---

## NODE 7: Update Session (DATA DEPENDENCY ISSUE)

**Purpose:** Update session with pick_direction

**Database Update:**
```javascript
PATCH /sessions?id=eq.{{ session_id }}
{
  current_route_id: {{ current_route_id }},
  pick_direction: {{ pick_direction }}
}
```

**⚠️ MISSING FIELD:** Does NOT update `current_machine_id`

**Analysis:**
- Workflow updates `pick_direction` but not `current_machine_id`
- This creates DATA DEPENDENCY on previous workflow
- Assumption: `current_machine_id` was already updated by `get_next_item` when it returned `action='next_machine'`

**Data Flow:**
1. get_next_item detects machine complete
2. get_next_item returns `action='next_machine'` with `next_machine_id`
3. **get_next_item updates session.current_machine_id** (assumed)
4. User says "bottom"
5. start_machine uses session.current_machine_id (already updated)
6. start_machine updates pick_direction

**Verification needed:** Does get_next_item update session.current_machine_id?
- Need to check get_next_item workflow "Update Session" node
- If NO → start_machine will start items from WRONG machine (previous machine)

**From get_next_item audit:**
- Node: "Update Session" in next_machine path
- Updates: ???  (need to verify)

**Recommendation:** Either:
1. start_machine should update current_machine_id explicitly (self-contained)
2. OR document dependency clearly (get_next_item MUST update machine_id first)

---

## NODE 8: Format Output

**Purpose:** Format response for frontend

**Contract Compliance:** ✅ Already validated in contract audit (Session 56)

**Output Structure:**
```javascript
{
  action: 'item_ready',
  machine_id: sessionData.machine_id,
  items_remaining: itemData.total_items,
  direction: itemData.pick_direction,
  item1: {
    product_name, quantity, slot, slot_spoken,
    inventory_current, inventory_parlevel,
    product_parsed: { name, size, type }
  },
  item2: { ... },  // If count=2
  display_text: "...",
  voice_text: "...",
  spoken: "..."
}
```

**✅ CORRECT:**
- Wraps first item in `item1` object (frontend contract)
- Includes machine_id (frontend state sync)
- Semantic product parsing
- TTS pronunciation fixes

---

## SECURITY ANALYSIS

**✅ NO ISSUES FOUND:**
- Uses Supabase predefined credentials (not hardcoded) ✅
- No API keys in code ✅
- No SQL injection risk (parameterized queries) ✅

**Comparison to get_next_item:**
- get_next_item had hardcoded API keys in "Increment Completed Items" node ❌
- start_machine uses n8n credentials throughout ✅

---

## RACE CONDITION ANALYSIS

**Scenario:** User says "bottom" twice rapidly

**Current Behavior:**
1. First call: Sets completed_items=1
2. Second call: Sets completed_items=1 again
3. Result: Counter at 1 (correct if both failed, wrong if first succeeded)

**Frontend Protection:**
- `pendingMachineTransition` state prevents rapid calls (see CLAUDE.md Session 43)
- Command recognizer blocks non-direction commands during transition

**Database Protection:**
- None - no unique constraint preventing duplicate start_machine calls
- No optimistic locking

**Impact:** LOW (frontend prevents, database vulnerable if bypassed)

**Recommendation:** Add idempotency check
```javascript
// Check if machine already started
if (completed_items > 0) {
  return current_item;  // Already started, return current state
}
```

---

## CRITICAL FINDINGS SUMMARY

### 🟡 HIGH PRIORITY:

1. **completed_items SETS Instead of Validates**
   - Sets completed_items=count without checking if machine already started
   - Could reset counter mid-machine if workflow called incorrectly
   - **Action:** Add defensive validation (completed_items should be 0)

### 🟢 MEDIUM:

2. **Invalid Direction Handling**
   - Invalid direction values (e.g., "middle") fall through to 'forward'
   - No validation error returned
   - **Action:** Validate direction against allowed values

3. **Dead Code - itemIndex Variable**
   - Variable declared and assigned but never used
   - **Action:** Remove for code cleanup

### ✅ WORKING CORRECTLY:

- Empty items array handling ✅
- 2-pick mode logic ✅
- Direction mapping (top/bottom → forward/reverse) ✅
- Security (no hardcoded keys) ✅
- Contract compliance ✅
- TTS pronunciation fixes ✅
- **Data dependency** - get_next_item updates session.current_machine_id before start_machine runs ✅

---

## DEPENDENCY VERIFICATION: ✅ CONFIRMED

**CRITICAL VERIFICATION:** Does get_next_item update `session.current_machine_id`?

**Answer: YES** ✅

**Evidence:** get_next_item workflow "Update Session" node (line 1776):
```javascript
PATCH /sessions?id=eq.{{ session_record_id }}
{
  current_machine_id: {{ new_machine_id }},  // ← UPDATES machine_id
  current_route_id: {{ new_route_id }},
  status: {{ new_status || 'stocking' }}
}
```

**Data Flow Verified:**
1. get_next_item detects machine complete (action='next_machine')
2. get_next_item sets `new_machine_id = nextMachine.id` (Determine Next State node)
3. get_next_item **updates database**: `session.current_machine_id = new_machine_id` ✅
4. User says "bottom"
5. start_machine fetches session → gets UPDATED current_machine_id ✅
6. start_machine queries items for correct machine ✅

**Conclusion:** Dependency is SATISFIED. start_machine correctly assumes current_machine_id was already updated.

---

## WORKFLOW DEPENDENCIES

```
get_next_item (action='next_machine')
  ↓
  Updates session.current_machine_id = next_machine_id  ✅ VERIFIED
  ↓
start_machine
  ↓
  Reads session.current_machine_id (already pointing to next machine)
  Updates session.pick_direction
```

**Status:** Dependency working correctly. No bug.

