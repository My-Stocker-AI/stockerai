# CRITICAL BUGS FOUND - 2026-01-21 Production Analysis

## Summary
Found 3 critical bugs in `determine_next_state` logic that explain ALL of Davy's reported issues.

---

## BUG 1: Machine Completion Not Recognized (Items Remaining Calculation)

**Location:** `determine_next_state` line 67

**Code:**
```javascript
var remaining = pickDirection === 'reverse' ? newIndex - 1 : items.length - newIndex;
```

**Problem:**
In reverse mode, the calculation is **off by 1**.

**Example (Reverse mode with 30 items):**
- Currently at sequence 30 (last item)
- User picks item → newIndex = 29
- Calculation: `remaining = 29 - 1 = 28` ❌ WRONG!
- Should be: `remaining = 29` (29 items left: 1-29)

When at sequence 2:
- User picks → newIndex = 1
- Calculation: `remaining = 1 - 1 = 0` ❌ Says "0 items left"
- Should be: `remaining = 1` (1 item left: sequence 1)

**Impact:**
- Shows "0 items remaining" when 1 item is actually left
- User says "next" → no item at sequence 0 → thinks machine complete
- **Repeats last item indefinitely** because it can't find nextItem

**Fix:**
```javascript
var remaining = pickDirection === 'reverse' ? newIndex : items.length - newIndex;
```

---

## BUG 2: Direction Confusion Mid-Machine (Wrong items.length)

**Location:** `determine_next_state` lines 112-119, 150-156

**Code:**
```javascript
if (nextMachine) {
  var startingIndex;
  if (pickDirection === 'reverse') {
    startingIndex = items.length;  // ❌ BUG: Uses CURRENT machine's items
  } else {
    startingIndex = 0;
  }

  return [{
    json: {
      action: 'next_machine',
      new_item_index: startingIndex,  // Sets wrong index for next machine
      ...
    }
  }];
}
```

**Problem:**
- When transitioning to next machine, sets `startingIndex = items.length`
- But `items` array contains the **CURRENT** machine's items (not next machine!)
- Next machine hasn't been loaded yet
- **Uses wrong starting index for next machine**

**Example:**
- Current machine (Machine 1) has 30 items
- Next machine (Machine 2) has 50 items
- Code sets: `new_item_index: 30` for Machine 2
- Should be: `new_item_index: 50` (Machine 2's item count)

**Impact:**
- Starts next machine at wrong index
- System gets confused about position
- Asks "top or bottom?" in the middle of picking
- When user says "next" it continues from correct position (because start_machine recalculates)

**Fix:**
The starting index should be determined AFTER loading the next machine's items, OR we need to query the next machine's item count here. Better solution: Let start_machine handle the index (it already does this correctly).

Actually, looking at the flow:
1. determine_next_state returns `action: 'next_machine'`
2. Frontend gets this and prompts "top or bottom?"
3. User responds
4. start_machine workflow loads items and sets correct index

So the `new_item_index` here is actually just a placeholder that gets overwritten by start_machine. The bug is that we're setting it at all - it creates confusion.

**Better Fix:**
Set `new_item_index: 0` as a safe placeholder - start_machine will set the real value.

---

## BUG 3: 2-Item Mode Skips Last Item (Odd Number Edge Case)

**Location:** `determine_next_state` lines 52-65

**Code:**
```javascript
if (count === 2) {
  var item2Index = pickDirection === 'reverse' ? newIndex - 1 : newIndex + 1;
  for (var i = 0; i < items.length; i++) {
    if (items[i].sequence === item2Index) {
      item2 = items[i];
      break;
    }
  }
  if (item2) {  // ❌ BUG: Only updates newIndex if item2 exists
    newIndex = item2Index;
  }
}
```

**Problem:**
When only 1 item remains and count=2:
- Looks for item2 at `item2Index`
- Doesn't find it (only 1 item left)
- item2 stays null
- **Doesn't update newIndex** (stays at first item index)
- Remaining calculation uses first item newIndex
- Shows "0 items remaining" when 1 item is left

**Example (Reverse mode, 31 items total):**
- User picks items in pairs: 31-30, 29-28, 27-26, ... 3-2
- Now at index 2, 1 item left (sequence 1)
- nextItem = item at sequence 1 ✓
- newIndex = 1
- Looks for item2 at sequence 0
- No item at sequence 0
- item2 = null
- **Doesn't update newIndex to 1**
- Wait, that's wrong. Let me re-read...

Actually, looking more carefully:
```javascript
var newIndex = pickDirection === 'reverse' ? currentItemIndex - 1 : currentItemIndex + 1;
```
This happens BEFORE the item2 check. So newIndex = 1 (correct).

Then:
```javascript
if (item2) {
  newIndex = item2Index;  // Only runs if item2 exists
}
```

So when item2 is null, newIndex stays at 1 (the first item's index). That's actually correct.

Let me check the remaining calculation:
```javascript
var remaining = pickDirection === 'reverse' ? newIndex - 1 : items.length - newIndex;
```

With newIndex = 1:
- `remaining = 1 - 1 = 0` ❌ WRONG!

Ah! So BUG 3 is actually the SAME root cause as BUG 1 - the items_remaining calculation is wrong in reverse mode.

When only 1 item left:
- Should show "1 item remaining"
- Actually shows "0 items remaining"
- User says "next" → system thinks machine complete → skips last item

---

## Root Cause Summary

**All three bugs trace to TWO core issues:**

1. **Items Remaining Calculation is Off by 1 in Reverse Mode**
   - Causes BUG 1 (repeating last item)
   - Causes BUG 3 (skipping last item in 2-item mode)

2. **startingIndex Uses Wrong items.length for Next Machine**
   - Causes BUG 2 (direction confusion mid-machine)

---

## Fixes Required

### Fix 1: Items Remaining Calculation
**File:** Workflow node "Determine Next State"
**Line:** 67

**Change:**
```javascript
// BEFORE (WRONG):
var remaining = pickDirection === 'reverse' ? newIndex - 1 : items.length - newIndex;

// AFTER (CORRECT):
var remaining = pickDirection === 'reverse' ? newIndex : items.length - newIndex;
```

**Explanation:**
- In reverse mode with sequence numbers, the "remaining" is literally the index value
- If at sequence 5, there are 5 items remaining (1, 2, 3, 4, 5)
- If at sequence 1, there is 1 item remaining (1)
- If at sequence 0, there are 0 items remaining (machine complete)

### Fix 2: Next Machine Starting Index
**File:** Workflow node "Determine Next State"
**Lines:** 112-119, 150-156

**Change:**
```javascript
// BEFORE (CONFUSING):
var startingIndex;
if (pickDirection === 'reverse') {
  startingIndex = items.length;  // Wrong machine's item count
} else {
  startingIndex = 0;
}

// AFTER (SAFE):
// Don't set startingIndex at all - let start_machine handle it
// OR set to 0 as safe placeholder:
var startingIndex = 0;  // Placeholder - start_machine will set correct value
```

**Explanation:**
- The `new_item_index` returned here is just a placeholder
- start_machine workflow will query the next machine's items and set the correct index
- Using current machine's items.length causes confusion
- Safer to use 0 or omit entirely

---

## Testing Plan

### Test 1: Normal Completion (BUG 1)
1. Start machine in reverse mode
2. Pick all items down to the last one
3. Say "next" on the last item
4. **Expected:** Machine completes, asks "top or bottom?" for next machine
5. **Before fix:** Repeats last item, never completes

### Test 2: 2-Item Mode Odd Count (BUG 3)
1. Start machine with 31 items in reverse mode
2. Enable 2-item mode
3. Pick all items in pairs
4. Get to last item (only 1 left)
5. Say "next"
6. **Expected:** Picks the last item, then machine completes
7. **Before fix:** Skips last item, says "machine finished"

### Test 3: Direction Confusion (BUG 2)
1. Complete first machine
2. Start second machine
3. Pick items normally
4. **Expected:** No "top or bottom?" prompts mid-machine
5. **Before fix:** Randomly asks "top or bottom?" halfway through

---

## Impact Assessment

**Severity:** CRITICAL
**Affected Users:** ALL users in reverse mode (default for most machines)
**Data Loss:** No - just operational confusion
**Workaround:** Skip machine when reaching last item (loses progress tracking)

**User Impact:**
- Cannot complete machines normally
- Must skip every machine at the last item
- 2-item mode unusable with odd item counts
- Confusing mid-machine prompts

---

## Deployment Plan

1. Update `determine_next_state` node in workflow `iykbFj7f9222PF7r`
2. Test with both modes (forward and reverse)
3. Test with 2-item mode enabled/disabled
4. Test with odd and even item counts
5. Deploy to production
6. Monitor Davy's next run

---

## Prevention

**Add to test suite:**
- Reverse mode with odd item count
- Reverse mode with even item count
- 2-item mode with odd remaining items
- Machine transitions in both directions

**Code review checklist:**
- Items remaining calculation matches mode (forward/reverse)
- Index calculations tested at boundaries (0, 1, length-1, length)
- Placeholder values clearly marked as placeholders
