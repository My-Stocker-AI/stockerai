# Data Flow Decomposition: Machine Count Desync

**Date:** 2026-01-22
**Issue:** Picked 2 items, machine count shows 2, current machine count shows 3
**Analysis Method:** BBRD-style step-by-step decomposition

---

## STEP 0: Route Start

**User Action:** Start route "South Route"

**n8n Workflow:** `set_route_sequence`

**What happens:**
1. Creates session in database
2. Returns route info + machines list
3. Frontend stores initial state

**Frontend State After:**
```javascript
{
  currentMachineTotalItems: 0,  // Not set yet
  currentMachineItemsRemaining: 0,  // Not set yet
  completedItems: [],  // Empty
  currentItem: null
}
```

**Question:** What initializes `currentMachineTotalItems`?

---

## STEP 1: Start Machine

**User Action:** Say "top" or "bottom" for first machine

**n8n Workflow:** `start_machine`

**What n8n outputs:**
```javascript
{
  action: 'item_ready',
  product_name: "Item 1",
  quantity: 5,
  items_remaining: 28,  // Example: 29 total items
  machine_id: "abc123",
  // ... other fields
}
```

**Frontend Processing (useStockerSession.ts:132-194):**

```javascript
if (toolName === 'start_machine' && result.machine_id) {
  // Fetch total_items from database
  machineTotalItems = await fetchMachineTotalItems(result.machine_id);
  // Let's say this returns: 29
}

// Then in state update:
next.currentMachineTotalItems = machineTotalItems;  // 29
next.currentMachineItemsRemaining = result.items_remaining || 0;  // 28
next.currentItem = { ... };  // Item 1
```

**Frontend State After Start:**
```javascript
{
  currentMachineTotalItems: 29,  // From database query
  currentMachineItemsRemaining: 28,  // From n8n
  completedItems: [],  // Still empty - no items picked yet
  currentItem: { product: "Item 1", quantity: 5 }
}
```

**UI Display:**
- Machine count: `completedItems.length` = **0 items picked**
- Current machine progress: `totalItems - itemsRemaining` = 29 - 28 = **1 item**

**DESYNC ALREADY EXISTS:** 0 picked vs 1 shown

**Why?** Frontend calculates current progress as `totalItems - itemsRemaining`, but `items_remaining` from n8n counts the CURRENT item as "remaining", not picked yet.

---

## STEP 2: First "Next" (Pick Item 1)

**User Action:** Say "next"

**n8n Workflow:** `get_next_item`

**What happens in n8n Determine Next State:**

1. Current `item_index` = 1 (Item 1 was announced)
2. User says "next" → move to next item
3. Calculate new `item_index` = 2 (Item 2)
4. Calculate `items_remaining`:
   - Forward mode: `items.length - newIndex` = 29 - 2 = 27
   - Reverse mode: `newIndex` = 2

**n8n outputs:**
```javascript
{
  action: 'next_item',
  product_name: "Item 2",
  quantity: 3,
  items_remaining: 27,  // Or 2 in reverse mode
  new_item_index: 2
}
```

**Frontend Processing (useStockerSession.ts:225-285):**

```javascript
if (toolName === 'get_next_item') {
  const action = result.action;

  if (action === 'next_item' || action === 'next_machine' || action === 'route_complete' || action === 'complete') {
    // Add current item to completed list
    if (prev.currentItem && prev.currentItem.slot) {
      itemsToAdd.push(prev.currentItem);  // Add Item 1
    }

    next.completedItems = [...prev.completedItems, ...itemsToAdd];  // [Item 1]

    // Update machine's completedItems count
    next.machines = prev.machines.map(m =>
      m.id === prev.currentMachineId
        ? { ...m, completedItems: m.completedItems + itemsToAdd.length }  // +1
        : m
    );
  }

  if (action === 'next_item') {
    // Update items remaining
    next.currentMachineItemsRemaining = result.items_remaining || 0;  // 27

    // Set new current item
    next.currentItem = { product: "Item 2", quantity: 3 };
  }
}
```

**Frontend State After First Pick:**
```javascript
{
  currentMachineTotalItems: 29,
  currentMachineItemsRemaining: 27,  // From n8n
  completedItems: [Item 1],  // 1 item in list
  currentItem: { product: "Item 2", quantity: 3 },
  machines: [{ completedItems: 1 }]
}
```

**UI Display:**
- Machine count: `completedItems.length` = **1 item**
- Current machine progress: `totalItems - itemsRemaining` = 29 - 27 = **2 items**

**DESYNC:** 1 picked vs 2 shown

---

## STEP 3: Second "Next" (Pick Item 2)

**User Action:** Say "next"

**n8n outputs:**
```javascript
{
  action: 'next_item',
  product_name: "Item 3",
  quantity: 4,
  items_remaining: 26,  // Or 3 in reverse
  new_item_index: 3
}
```

**Frontend Processing:**

```javascript
// Add Item 2 to completed list
next.completedItems = [Item 1, Item 2];  // 2 items

// Update remaining
next.currentMachineItemsRemaining = 26;

// Set new current item
next.currentItem = { product: "Item 3", quantity: 4 };
```

**Frontend State After Second Pick:**
```javascript
{
  currentMachineTotalItems: 29,
  currentMachineItemsRemaining: 26,
  completedItems: [Item 1, Item 2],  // 2 items
  currentItem: { product: "Item 3", quantity: 4 }
}
```

**UI Display:**
- Machine count: `completedItems.length` = **2 items**
- Current machine progress: `totalItems - itemsRemaining` = 29 - 26 = **3 items**

**DESYNC PERSISTS:** 2 picked vs 3 shown

---

## THE ROOT CAUSE

**The calculation is FUNDAMENTALLY WRONG:**

```javascript
currentProgress = totalItems - itemsRemaining
```

**Why this is wrong:**

`items_remaining` from n8n counts **FUTURE items including the CURRENT item being announced**.

**Example at start_machine:**
- Total items: 29
- Current item: Item 1 (announced, not picked yet)
- Items remaining (n8n): 28 (Items 2-29, EXCLUDING Item 1)
- Frontend calculation: 29 - 28 = **1** (WRONG - should be 0 since nothing picked yet)

**The correct calculation should be:**

```javascript
currentProgress = completedItems.length
```

**OR if using items_remaining:**

```javascript
currentProgress = totalItems - itemsRemaining - 1  // -1 for current item
```

**OR n8n should output it directly:**

```javascript
items_completed = item_index - 1  // Current index minus 1
```

---

## IMPACT ON MACHINE COMPLETION

**When machine has 29 items and you've picked 28:**

**Frontend State:**
```javascript
{
  currentMachineTotalItems: 29,
  currentMachineItemsRemaining: 1,  // Item 29 remaining
  completedItems: [28 items],  // 28 items picked
  currentItem: { product: "Item 29", quantity: 2 }  // Announced but not picked
}
```

**UI Shows:**
- Picked: **28 items** ✓ (correct)
- Progress: 29 - 1 = **28 items** ✓ (by accident this matches!)

**User says "next" to pick Item 29:**

**n8n calculates:**
- `item_index` = 29 (last item)
- `items_remaining` = 29 - 29 = 0 (forward) OR 0 (reverse)
- `machine_complete` = TRUE (no items remaining)
- `action` = 'complete'

**Frontend receives:**
```javascript
{
  action: 'complete',
  items_remaining: 0
}
```

**Frontend Processing:**

**OLD CODE (BEFORE MY FIX):**
```javascript
if (action === 'next_item' || action === 'next_machine' || action === 'route_complete') {
  // Add Item 29 to completed
}
```
→ `action === 'complete'` → FALSE → **Item 29 NOT ADDED** ✗

**NEW CODE (AFTER MY FIX):**
```javascript
if (action === 'next_item' || action === 'next_machine' || action === 'route_complete' || action === 'complete') {
  // Add Item 29 to completed
}
```
→ `action === 'complete'` → TRUE → **Item 29 ADDED** ✓

**Then:**
```javascript
if (action === 'complete') {
  next.currentMachineItemsRemaining = 0;
  next.currentItem = null;
}
```

**Final State:**
```javascript
{
  currentMachineTotalItems: 29,
  currentMachineItemsRemaining: 0,
  completedItems: [29 items],  // ✓ All items
  currentItem: null
}
```

**UI Shows:**
- Picked: **29 items** ✓
- Progress: 29 - 0 = **29 items** ✓

**SYNC ACHIEVED at completion** (by accident)

---

## THE ACTUAL BUG

**There are TWO bugs:**

### Bug A: UI Progress Calculation Off by 1 (STILL UNFIXED)

**Where:** UI displays `totalItems - itemsRemaining`

**Problem:** This counts the CURRENT item as "picked" when it's only been announced

**Impact:**
- Shows "1 item" when 0 items picked
- Shows "2 items" when 1 item picked
- Shows "3 items" when 2 items picked

**But ACCIDENTALLY syncs at completion:**
- When last item picked: `items_remaining` = 0
- Calculation: 29 - 0 = 29 ✓ (matches `completedItems.length` = 29)

### Bug B: Last Item Not Added to List (FIXED)

**Where:** `useStockerSession.ts:228`

**Problem:** Didn't check for `action === 'complete'`

**Impact:** Last item announced but not added to picked list

**Status:** ✅ FIXED (added `|| action === 'complete'`)

---

## WHY USER SAW DESYNC

**User's report: "Picked 2 items, machine count shows 2, current machine shows 3"**

**Breakdown:**
- **Machine count (picked items):** `completedItems.length` = 2 ✓
- **Current machine count (progress):** `totalItems - itemsRemaining` = 29 - 26 = 3 ✗

**The +1 error comes from:** Progress calculation counts current item as picked when it hasn't been picked yet

---

## WHERE IS THE UI DISPLAYING THIS?

**Need to find where UI renders "current machine count"**

Looking for code like:
```javascript
{currentMachineTotalItems - currentMachineItemsRemaining} of {currentMachineTotalItems}
```

**This is the ACTUAL bug still present.**

---

## NEXT STEPS

1. Find where UI calculates/displays current machine progress
2. Change from: `totalItems - itemsRemaining`
3. To: `completedItems.filter(item => item.machineId === currentMachineId).length`
4. OR change n8n to output `items_completed` directly

---

**STATUS:** Root cause identified - UI progress calculation off by 1
