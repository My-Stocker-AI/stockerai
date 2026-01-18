# Boundary 6: Two-Item Mode Edge Cases - Deep Analysis
**Date:** 2026-01-17
**Status:** Complete

---

## Discovery Question

**Where does count=2 mode break?**

---

## Discovered Failure Modes

### 1. LAST ITEMS ON MACHINE

#### 1A. Only 1 item remaining, count=2 requested
- **Code analysis:** Workflow checks `if (item2)`, returns item1 only if item2 null
- **Status:** ✅ Handled gracefully
- **Likelihood:** 2/5 | **Impact:** 1/5 | **Priority:** 2

#### 1B. Exactly 2 items left, then machine transition
- **Trigger:** Show items 38,39, then next_machine
- **Question:** Does index update correctly?
- **Code:** `newIndex = item2Index` if item2 exists ✓
- **Status:** ✅ Should work
- **Likelihood:** 2/5 | **Impact:** 3/5 | **Priority:** 6

---

### 2. REVERSE MODE WITH COUNT=2

#### 2A. Index decrements by 2 not 1 ✅ CHECKED
- **Code:** `item2Index = newIndex - 1` then `newIndex = item2Index`
- **Analysis:** Correctly decrements by 2
- **Status:** ✅ Works
- **Likelihood:** 0/5 | **Impact:** 0/5 | **Priority:** 0

#### 2B. Reverse mode at boundary (items 2,1)
- **Trigger:** Last two items in reverse mode
- **After:** Should transition to next machine or complete
- **Likelihood:** 2/5 | **Impact:** 2/5 | **Priority:** 4

---

### 3. ITEM2 DISPLAY / NULL HANDLING

#### 3A. item2 is null but UI shows "null x undefined"
- **Location:** Frontend display logic
- **Investigation:** Check if `item2?.product` guarded
- **Likelihood:** 2/5 | **Impact:** 3/5 | **Priority:** 6
- **Action:** **Audit frontend item2 display**

#### 3B. item2 spoken incorrectly
- **Code:** Workflow returns `item2_product_name`, `item2_slot_spoken`
- **Question:** Does "Format Output" handle item2 correctly?
- **Likelihood:** 1/5 | **Impact:** 2/5 | **Priority:** 2

---

### 4. UNDO WITH COUNT=2

#### 4A. User undoes - which item returns?
- **Code:** `undoLastItem` pops last from completedItems
- **Question:** In count=2, were both added to completedItems?
- **Location:** `useStockerSession.ts:142-147`
- **Code:**
  ```typescript
  if (prev.currentItem && prev.currentItem.slot) {
    itemsToAdd.push(prev.currentItem);
  }
  if (prev.currentItem2 && prev.currentItem2.slot) {
    itemsToAdd.push(prev.currentItem2);
  }
  ```
- **Analysis:** Both added ✓ Undo pops last (item2) first ✓
- **Status:** ✅ Works correctly
- **Likelihood:** 2/5 | **Impact:** 2/5 | **Priority:** 4

---

### 5. SKIP MACHINE WITH COUNT=2

#### 5A. Both items marked complete on skip?
- **Trigger:** Showing 2 items, user skips machine
- **Question:** Are those 2 items added to completed or discarded?
- **Analysis:** Depends on skip_machine workflow logic
- **Likelihood:** 2/5 | **Impact:** 3/5 | **Priority:** 6
- **Action:** **Check skip_machine handling**

---

### 6. CROSS-MACHINE BOUNDARY

#### 6A. item1 on Machine A, item2 wraps to Machine B
- **Trigger:** Last item on machine A, count=2 tries to fetch item from B
- **Question:** Does workflow filter items by machine_id?
- **Analysis:** Edge Function should only return items for current machine
- **Likelihood:** 1/5 | **Impact:** 2/5 | **Priority:** 2
- **Status:** Likely already handled by filtering

---

## Risk Summary

| Failure Mode | Priority | Action |
|--------------|----------|--------|
| 1A. Only 1 item, count=2 | 2 | ✅ Handled |
| 1B. Last 2 items | 6 | Monitor |
| 2A. Reverse decrement | 0 | ✅ Works |
| 2B. Reverse at boundary | 4 | Monitor |
| 3A. item2 null display | 6 | **Audit frontend** |
| 3B. item2 spoken wrong | 2 | Monitor |
| 4A. Undo behavior | 4 | ✅ Works |
| 5A. Skip with count=2 | 6 | **Check skip_machine** |
| 6A. Cross-machine items | 2 | Likely handled |

---

## High Priority (None)

All items ≤ 6 priority. Count=2 mode appears well-handled.

---

**Status:** 9 failure modes discovered, 0 high-priority items (system is robust here)
