# System Impact Audit: Allow Zero-Item Machines

**Date:** 2026-02-04
**Change:** Modify database constraint to allow `total_items >= 0` instead of `> 0`
**Severity:** MEDIUM
**Trigger:** Upload failed for route with 2 empty machines (execution 29079)

---

## Problem Statement

PDF contains machines with 0 items:
- Machine 4: "Hillsboro Air Academy" (0 items)
- Machine 6: "Jesuit High School - Boys Locker Room" (0 items)

Database constraint `machines_total_items_positive CHECK (total_items > 0)` rejects these machines, causing route upload to fail.

---

## Proposed Change

```sql
-- Current constraint
ALTER TABLE machines DROP CONSTRAINT machines_total_items_positive;

-- New constraint
ALTER TABLE machines ADD CONSTRAINT machines_total_items_non_negative
CHECK (total_items >= 0);
```

---

## Boundary Analysis

### DATA

**Field:** `machines.total_items` (integer)
- Current: Must be > 0 (minimum 1 item per machine)
- Proposed: Can be >= 0 (0 items allowed)

**Data Contract:**
- Field name: UNCHANGED ✅
- Field type: UNCHANGED (integer) ✅
- Null handling: Still NOT NULL ✅
- Only change: Valid range expands from [1, ∞) to [0, ∞)

### NODES (Downstream Consumers)

**1. PDF Upload Workflow - Insert Machines**
- Impact: ✅ INSERT now succeeds with total_items = 0
- Change needed: None
- Risk: None

**2. Frontend - Machine List Display**
- Code: `MachineListPanel.tsx` displays `{machine.totalItems}` items
- Impact: Shows "0 items" for empty machines
- Change needed: None
- Risk: ⚠️ UI might show confusing "0/0 complete" progress

**3. start_machine Workflow**
- Query: `SELECT * FROM items WHERE machine_id = X LIMIT 1`
- Impact: ⚠️ Returns empty result for 0-item machines
- Change needed: Handle empty result gracefully
- Risk: 🔴 HIGH - Could return null/undefined to frontend

**4. get_next_item Workflow**
- Impact: ⚠️ No items to return
- Change needed: Handle "no items" case
- Risk: 🔴 HIGH - Could cause errors in voice flow

**5. Progress Calculations (Frontend)**
- Code: `completedItems / totalItems`
- Impact: 🔴 CRITICAL - Division by zero (0/0)
- Current: If totalItems = 0, progress bar shows 0/0
- Risk: 🔴 HIGH - Could display NaN% or Infinity%

**6. Machine Completion Logic**
- Check: `completedItems >= totalItems`
- Impact: ⚠️ Machine with 0 items instantly "complete"
- Risk: 🟡 MEDIUM - User sees machine but can't interact

### FLOW (Critical Paths)

**Path 1: User starts route with 0-item machine**
```
User: "Start route"
  ↓
Frontend: Loads machines, shows "0 items" ✅
  ↓
User: Selects machine with 0 items
  ↓
start_machine workflow runs
  ↓
Query returns: [] (no items) ⚠️
  ↓
Frontend tries to display first item
  ↓
🔴 ERROR: Cannot read property 'product_name' of undefined
```

**Path 2: Machine completion detection**
```
Machine has 0 items
  ↓
User hasn't picked anything (completedItems = 0)
  ↓
Check: 0 >= 0 ? YES
  ↓
Machine marked complete ✅
  ↓
User moves to next machine
```

**Path 3: Progress bar calculation**
```
totalItems = 0
completedItems = 0
  ↓
Progress = 0 / 0 = NaN
  ↓
UI displays: "NaN% complete" ❌
```

### ERRORS (New Failure Modes)

**Error 1: start_machine returns no items**
- Symptom: Frontend crashes or shows blank screen
- Frequency: Every time user starts 0-item machine
- Severity: CRITICAL
- User impact: Cannot proceed with route

**Error 2: Division by zero in progress bar**
- Symptom: Shows "NaN%" or "Infinity%"
- Frequency: Every time 0-item machine is displayed
- Severity: HIGH
- User impact: Confusing UI

**Error 3: Voice AI has nothing to say**
- Symptom: Silence or "Pick undefined"
- Frequency: If user tries to interact with 0-item machine
- Severity: HIGH
- User impact: System appears broken

---

## Required Code Changes

### 1. Frontend - Handle 0-Item Machines

**File:** `src/hooks/useStockerSession.ts`

**Change 1: Skip 0-item machines in start_machine**
```typescript
// Line ~200 (start_machine result handler)
if (result && result.status === 'success') {
  // NEW: Check if machine has items
  if (!result.item1 || result.total_items === 0) {
    // Auto-complete this machine and move to next
    setRouteState(prev => ({
      ...prev,
      completedMachines: [...prev.completedMachines, currentMachineId],
      currentMachineIndex: prev.currentMachineIndex + 1
    }));
    // Show toast: "Machine has no items, skipping"
    return;
  }
  // ... existing logic
}
```

**Change 2: Progress bar safe division**

**File:** `src/components/MachineListPanel.tsx`

```typescript
// Line ~136 (progress display)
const progress = machine.totalItems > 0
  ? machine.completedItems / machine.totalItems
  : 1.0; // 0 items = 100% complete

const displayText = machine.totalItems > 0
  ? `${machine.completedItems}/${machine.totalItems}`
  : "No items"; // Show "No items" instead of "0/0"
```

**Change 3: Machine completion detection**

**File:** `src/hooks/useStockerSession.ts`

```typescript
// Line ~400 (machine completion check)
const isMachineComplete = (machineId: string) => {
  const machine = routeState.machines.find(m => m.id === machineId);
  if (!machine) return false;

  // NEW: 0-item machines are instantly complete
  if (machine.totalItems === 0) return true;

  return machine.completedItems >= machine.totalItems;
};
```

### 2. start_machine Workflow - Return Empty State

**File:** n8n workflow "start_machine"

**Node:** Format Output

**Change:** Add check for empty machine
```javascript
// Check if machine has items
if (!items || items.length === 0) {
  return [{
    json: {
      status: 'empty',
      message: 'Machine has no items',
      machine_id: machineId,
      machine_name: machineName,
      total_items: 0,
      suggestion: 'Skip this machine'
    }
  }];
}

// ... existing logic for machines with items
```

### 3. Voice AI - Handle Empty Machines

**File:** `src/hooks/useStockerAI.ts`

**Change:** Add handling for empty machine status
```typescript
// After start_machine tool call
if (result.status === 'empty') {
  const message = `${result.machine_name} has no items to pick. Say "next" to skip to the next machine.`;
  // Set pending skip
  setSkipPending(result.machine_id);
  return message;
}
```

---

## Risk Assessment

### Without Code Changes (Just Constraint Removal)

| Risk | Severity | Probability | Impact |
|------|----------|-------------|--------|
| Frontend crash on 0-item machine | CRITICAL | HIGH | App unusable |
| NaN% in progress bar | HIGH | HIGH | Confusing UI |
| Voice AI silent/error | HIGH | MEDIUM | Poor UX |

**Verdict:** ❌ **DO NOT deploy constraint change alone**

### With Code Changes (Constraint + Frontend/Workflow Updates)

| Risk | Severity | Probability | Impact |
|------|----------|-------------|--------|
| Machine auto-skips unexpectedly | LOW | LOW | User notices, says "ok" |
| UI shows "No items" label | NONE | N/A | Informative |
| Voice says "skip this machine" | NONE | N/A | Clear guidance |

**Verdict:** ✅ **Safe to deploy with code changes**

---

## Alternative: Skip 0-Item Machines in Parser

**Instead of allowing in database, filter them out during parsing:**

**File:** `workflows/fixes/PARSE_PDF_TEXT_SLOT_BOUNDARY_FIX.js`

**Change:** Add filter after parsing
```javascript
// After parsing all machines
locations[locationName].machines.push(machine);

// NEW: Filter out empty machines
locations[locationName].machines = locations[locationName].machines.filter(function(m) {
  if (m.items.length === 0) {
    console.log('[PARSER]   SKIP machine with 0 items:', m.machine_name);
    return false;
  }
  return true;
});
```

**Pros:**
- ✅ No database changes needed
- ✅ No frontend changes needed
- ✅ Empty machines never enter system

**Cons:**
- ❌ Loses information about machines on route
- ❌ Can't track "already stocked" machines
- ❌ User doesn't know why machine is missing

---

## Recommendation

### Option A: Full Fix (Constraint + Code Changes)
**Effort:** 3-4 hours
**Risk:** Low (with proper testing)
**Benefit:** Tracks all machines, graceful handling

### Option B: Parser Filter (Quick Fix)
**Effort:** 5 minutes
**Risk:** Very low
**Benefit:** Works immediately, no database/frontend changes

### Which to Choose?

**Choose Option B if:**
- Need quick fix for immediate upload
- Empty machines have no business value
- Don't need to track "already stocked" status

**Choose Option A if:**
- Need to track all machines (even empty)
- Want to show "already complete" status
- Have time for proper implementation

---

## Immediate Action

**For now, I recommend Option B** to unblock the upload, then decide if Option A is needed later.

Would you like me to:
1. ✅ Deploy Option B (filter in parser) - 5 minutes
2. ⏸️ Deploy Option A (full fix) - needs testing
3. ❓ Investigate why machines have 0 items in PDF

**Your call!**
