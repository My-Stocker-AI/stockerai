# Boundary 2: Sequence/Index Confusion - Deep Analysis
**Date:** 2026-01-17
**Method:** XF Sequential Discovery
**Status:** Complete

---

## Discovery Question

**Where can position tracking break in StockerAI?**

---

## Core Concepts

```
SEQUENCE (1-based):  Item's logical order (1, 2, 3, ... 39)
INDEX (0-based):     Array position (0, 1, 2, ... 38)
ITEM_INDEX (varies): Workflow's current position tracker

Forward mode:  item_index starts at 0, increments
Reverse mode:  item_index starts at items.length, decrements
```

---

## Discovered Failure Modes (MECE)

### 1. OFF-BY-ONE ERRORS
**Trigger:** Sequence vs Index confusion

**Scenarios:**

#### 1A. Looking for sequence=-1 in reverse mode ✅ FIXED
- **Location:** `determine_next_state_REVERSE_FIX.js:103-109`
- **Symptom:** Machine marked complete immediately on new machine
- **Code (OLD - BUGGY):**
  ```javascript
  if (nextMachine) {
    return [{
      json: {
        action: 'next_machine',
        new_item_index: 0,  // ← BUG: Always 0
  ```
- **Code (NEW - FIXED):**
  ```javascript
  if (nextMachine) {
    var startingIndex;
    if (pickDirection === 'reverse') {
      startingIndex = items.length;  // ← FIXED
    } else {
      startingIndex = 0;
    }
  ```
- **Status:** ✅ FIXED (awaiting production test)
- **Likelihood:** Was 5/5, now 0/5
- **Impact:** Was 4/5
- **Priority:** Was 20, now 0

#### 1B. Forward mode starts at sequence=1 instead of 0
- **Trigger:** If items start at sequence=1 but code expects sequence=0
- **Symptom:** First item never found, machine marked complete
- **Location:** Check database schema and workflow logic
- **Investigation:** What's the ACTUAL sequence range in DB?
- **Likelihood:** Unknown - need to check DB
- **Impact:** 4/5 (can't start machine)
- **Priority:** TBD

#### 1C. Two-item mode only increments by 1 instead of 2
- **Location:** `determine_next_state_REVERSE_FIX.js:47-62`
- **Code:**
  ```javascript
  if (nextItem) {
    var newIndex = pickDirection === 'reverse' ? currentItemIndex - 1 : currentItemIndex + 1;

    var item2 = null;
    if (count === 2) {
      var item2Index = pickDirection === 'reverse' ? newIndex - 1 : newIndex + 1;
      // ...
      if (item2) {
        newIndex = item2Index;  // ← Does this work correctly?
      }
    }
  ```
- **Analysis:** Code DOES update to item2Index if item2 exists
- **Edge Case:** What if item2 is null? Does newIndex stay at item1?
- **Likelihood:** Low (2/5) - Logic looks correct
- **Impact:** Medium (3/5) - Would re-show item
- **Priority:** 6

---

### 2. ROUTE-LEVEL vs MACHINE-LEVEL INDEX
**Trigger:** Index carries across machine boundaries

**Scenarios:**

#### 2A. Index doesn't reset on machine switch ✅ FIXED
- **Was the bug:** Index carried from Machine 1 (ended at 35) to Machine 2 (only has 4 items)
- **Status:** ✅ FIXED with reverse mode fix
- **Evidence:** `XF_TWO_ITEM_BUG_ACTUAL_CODE_ANALYSIS.md` documents this

#### 2B. Skipped items leave gaps in sequence
- **Trigger:** User skips item 5, then continues
- **Question:** Does sequence jump 4→6, or does something fill the gap?
- **Symptom:** If code expects continuous sequence, might break
- **Location:** Workflow assumes `sequence = currentIndex ± 1`
- **Likelihood:** Medium (3/5) - Users might want to skip individual items
- **Impact:** Medium (3/5) - Item skipping broken
- **Priority:** 9
- **Investigation:** Is individual item skipping even supported?

#### 2C. Items reordered mid-session
- **Trigger:** Database sequence changes while user is working
- **Symptom:** User expects item 10 but gets item 15
- **Likelihood:** Very Low (1/5) - Sequences are static
- **Impact:** Low (2/5) - Would just be confusing
- **Priority:** 2

---

### 3. EMPTY/NULL EDGE CASES
**Trigger:** Machine has unexpected item count

**Scenarios:**

#### 3A. Machine has 0 items
- **Trigger:** All items already stocked or filtered out
- **Question:** What should `items.length` return? What's the starting index?
- **Code:**
  ```javascript
  var startingIndex;
  if (pickDirection === 'reverse') {
    startingIndex = items.length;  // ← If length=0, index=0
  }
  ```
- **Analysis:** If items.length=0, reverse mode sets index=0
- **Then:** Looks for sequence=-1 → not found → marks machine complete ✓ CORRECT
- **Likelihood:** Low (2/5) - Rare but possible
- **Impact:** Low (2/5) - Machine should be skipped anyway
- **Priority:** 4

#### 3B. Single item on machine in two-item mode
- **Trigger:** count=2 but machine only has 1 item
- **Code:**
  ```javascript
  if (count === 2) {
    var item2Index = pickDirection === 'reverse' ? newIndex - 1 : newIndex + 1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].sequence === item2Index) {
        item2 = items[i];
        break;
      }
    }
    if (item2) {
      newIndex = item2Index;
    }
    // ← If item2 not found, newIndex stays at item1 position
  }
  ```
- **Analysis:** If only 1 item, item2 stays null, returns item1 only ✓ CORRECT
- **Likelihood:** Low (2/5)
- **Impact:** Low (1/5) - Degrades gracefully
- **Priority:** 2

---

### 4. FORWARD/REVERSE CALCULATION ERRORS
**Trigger:** Wrong arithmetic for direction

**Scenarios:**

#### 4A. Reverse mode decrements when should increment ✅ FIXED
- **Status:** Already fixed in reverse mode fix

#### 4B. items_remaining calculation wrong
- **Location:** `determine_next_state_REVERSE_FIX.js:64`
- **Code:**
  ```javascript
  var remaining = pickDirection === 'reverse' ? newIndex - 1 : items.length - newIndex;
  ```
- **Analysis:**
  - Forward: items.length=39, newIndex=10 → remaining=29 ✓
  - Reverse: newIndex=30 → remaining=29 ✓
- **Wait:** In reverse mode, if newIndex=30, that means we're AT item 30
  - Items remaining should be 30-1=29 (items 1-29 left) ✓ CORRECT
- **Likelihood:** 1/5 - Logic is correct
- **Impact:** 2/5 - Just display issue
- **Priority:** 2

#### 4C. Undo in reverse mode moves wrong direction
- **Location:** `StockerApp.tsx:212-225` (undoLastItem)
- **Code:**
  ```typescript
  const undoLastItem = useCallback(() => {
    if (routeState.completedItems.length === 0) {
      return { success: false, message: "Nothing to undo" };
    }

    const lastItem = routeState.completedItems[routeState.completedItems.length - 1];
    const newCompleted = routeState.completedItems.slice(0, -1);

    setRouteState({
      ...routeState,
      currentItem: lastItem,
      completedItems: newCompleted
    });
  ```
- **Question:** Does this account for reverse mode? Does it update item_index?
- **Analysis:** This is FRONTEND only, doesn't sync with workflow item_index
- **Likelihood:** Medium (3/5) - Undo might be used
- **Impact:** Medium (3/5) - State desync
- **Priority:** 9
- **Investigation:** Does undo update session in DB?

---

### 5. DATABASE SEQUENCE vs WORKFLOW SEQUENCE
**Trigger:** Schema mismatch

**Scenarios:**

#### 5A. Database uses 1-based, workflow expects 0-based
- **Investigation:** Check actual schema
- **Query:** `SELECT MIN(sequence), MAX(sequence) FROM route_items WHERE route_id=X`
- **Likelihood:** Unknown
- **Impact:** 4/5 (nothing works)
- **Priority:** TBD - MUST CHECK

#### 5B. Sequence gaps in database
- **Trigger:** Items with sequences 1,2,4,5 (missing 3)
- **Symptom:** Workflow looks for sequence=3, doesn't find it
- **Likelihood:** Low (2/5) - Sequences should be continuous
- **Impact:** Medium (3/5) - Skips items
- **Priority:** 6

---

### 6. TYPE COERCION BUGS
**Trigger:** String sequence compared to number

**Scenarios:**

#### 6A. Sequence stored as string in DB
- **Code:**
  ```javascript
  if (items[i].sequence === currentItemIndex - 1)
  // If sequence is "10" (string) and currentItemIndex is 9 (number)
  // "10" === 8 → false (wrong!)
  ```
- **Investigation:** Check DB schema - is sequence INTEGER or TEXT?
- **Likelihood:** Low (2/5) - Should be integer
- **Impact:** High (4/5) - Breaks entirely
- **Priority:** 8
- **Action:** Verify DB schema

---

## Risk Assessment Summary

| Failure Mode | Likelihood | Impact | Priority | Action |
|--------------|------------|--------|----------|--------|
| 1A. Reverse mode sequence=-1 | 0 (FIXED) | 4 | 0 | ✅ Done |
| 1B. Forward starts at wrong sequence | ? | 4 | TBD | **Check DB** |
| 1C. Two-item mode wrong increment | 2 | 3 | 6 | Document |
| 2A. Index doesn't reset | 0 (FIXED) | 4 | 0 | ✅ Done |
| 2B. Skipped items create gaps | 3 | 3 | 9 | **Investigate** |
| 2C. Items reordered mid-session | 1 | 2 | 2 | Ignore |
| 3A. Machine with 0 items | 2 | 2 | 4 | Monitor |
| 3B. Single item in two-item mode | 2 | 1 | 2 | Ignore |
| 4A. Reverse decrement error | 0 (FIXED) | 4 | 0 | ✅ Done |
| 4B. items_remaining wrong | 1 | 2 | 2 | Ignore |
| 4C. Undo in reverse mode | 3 | 3 | 9 | **Investigate** |
| 5A. DB 1-based vs 0-based | ? | 4 | TBD | **Check DB** |
| 5B. Sequence gaps in DB | 2 | 3 | 6 | Document |
| 6A. String vs number sequence | 2 | 4 | 8 | **Check DB** |

---

## High Priority Items (9+)

### 2B. Skipped items create sequence gaps (Priority: 9)
**Investigation:**
- Is individual item skipping supported?
- If user says "skip this item", what happens?
- Does sequence stay continuous or jump?

### 4C. Undo in reverse mode (Priority: 9)
**Investigation:**
- Does `undoLastItem` update workflow state?
- In reverse mode, does undo go to correct previous item?
- Check if undo syncs `item_index` back to DB

### DB Schema Checks (Priority: TBD)
**Must verify:**
1. What's the actual sequence range? (0-based or 1-based)
2. Is sequence INTEGER or TEXT?
3. Are sequences guaranteed continuous or can they have gaps?

---

## Code Locations to Inspect

1. `determine_next_state_REVERSE_FIX.js:47-62` - Two-item mode increment
2. `StockerApp.tsx:212-225` - Undo logic (reverse mode handling?)
3. Database schema - `route_items.sequence` type and range
4. Database query - Check for sequence gaps in actual data

---

## Evidence Collection

**Questions for Davy:**
1. Does two-item mode ever skip items or show items twice?
2. Ever use undo in reverse mode? Does it work correctly?
3. Ever skip individual items (not whole machine)?
4. Ever see items shown out of order?

---

## Next Boundary

**Boundary 3: Voice Recognition Ambiguity**

---

**Status:** Boundary 2 complete - 14 failure modes discovered, 2 high-priority investigations + DB schema verification needed
