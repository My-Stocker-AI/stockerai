# System Impact Analysis: Machine Counting System Divergence

**Date:** 2026-02-04
**Issue:** Multiple counters out of sync - "13 of 12 items", dropdown shows "2 of 5" when should be "3-4"
**Severity:** CRITICAL (system showing impossible states, breaks trust)
**Analysis Method:** Synta MCP + Explore agent comprehensive boundary mapping

---

## USER REPORT

**Symptoms:**
1. Current machine shows "13 of 12 items picked" (IMPOSSIBLE - more picked than total exists)
2. Machine dropdown shows "2 done" when should show "3-4"
3. Done card shows 5 items but user thought there were 6
4. "This is absolutely a bug we had corrected last night" (MEMORY.md Session 57)

**User Quote:**
> "This is a systemic issue, not a symptom. This needs complete analysis, and System wide impact assessment before changing. Making sure everything impacted by count is taken into consideration."

---

## HISTORICAL CONTEXT

### Session 53: Comprehensive Counting System Failure

**Three counting sync points completely out of sync:**
- Progress Bar: Reads `machines.completed_items`
- Done Card: Frontend state (items array)
- Machine Dropdown: Reads `machines.completed_items`

**User saw:** "8/5" ← Counter says 8, but only 5 items exist!

**User insight:**
> "Shouldn't there just be 1 way of counting everything the whole way through? There are the number of items in a machine, and the number of items that have been presented and picked, being indicated by the user saying next. That's it, isn't it?"

### Session 57 (2026-02-02): POC Benchmark

**BUG 1 - Dropdown Machine Count:**
- Symptom: "4/5" in dropdown, should show "5/5" when complete
- Progress bar shows correct "5/5" ✓
- Done card shows correct 5 items ✓
- Only dropdown is wrong ❌

**Fix Applied:** `src/hooks/useStockerSession.ts:407-420`

**User Quote:**
> "Everything was accurate except for the dropdown machine count."

**BUT:** Fix was incomplete - didn't address root cause of counter divergence.

---

## BOUNDARY ANALYSIS - ALL COUNTING MECHANISMS

### 1. DATABASE COUNTERS (Source of Truth)

**`machines` Table:**
```sql
total_items INTEGER NOT NULL CHECK (total_items > 0)  -- IMMUTABLE
completed_items INTEGER DEFAULT 0                     -- Incremented by workflows
status TEXT                                           -- pending/in_progress/completed/skipped
```

**Constraints:**
- `completed_items >= 0`
- `completed_items <= total_items`
- `total_items` is IMMUTABLE (trigger: `prevent_total_items_change()`)

**Updated By:**
- `get_next_item` Edge Function (atomic increment)
- `start_machine` workflow (sets initial items)
- `increment_machine_items()` RPC function

---

### 2. FRONTEND COUNTERS (Display State)

**`RouteState` in `useStockerSession.ts`:**

```typescript
interface RouteState {
  machines: MachineState[];  // Each has: completedItems, totalItems, status
  completedItems: CurrentItem[];  // Array of picked items (grows as user picks)
  currentMachineTotalItems: number;  // From machines[].totalItems
  currentMachineItemsRemaining: number;  // From workflow response
}

interface MachineState {
  completedItems: number;  // Frontend copy of database counter
  totalItems: number;      // IMMUTABLE - from database
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
}
```

**Updated By:**
- `updateFromTool()` when workflows return `items_to_increment`
- Direct state updates on machine transitions

---

### 3. UI DISPLAY POINTS

| Display | Data Source | Location | Formula |
|---------|-------------|----------|---------|
| **Progress Bar** | `machines[].completedItems` | StockerApp.tsx:1979 | `itemsCompleted / itemsTotal * 100` |
| **"X of Y items"** | `machines[].completedItems` | StockerApp.tsx:1988 | `{completedItems} of {totalItems}` |
| **Done Card** | `completedItems.length` | StockerApp.tsx:2274 | Array length |
| **Dropdown** | `machines.filter(status==='completed')` | StockerApp.tsx:1955 | Count completed |

---

## DATA FLOW ANALYSIS

### Normal Flow (Working Correctly)

```
USER: "next"
  ↓
[Frontend] Calls get_next_item Edge Function
  ↓
[Database] Reads: machines.completed_items = 4
           Increments: completed_items = 5
           Returns: { items_to_increment: 1, completed_items: 4, items_remaining: 7 }
  ↓
[Frontend] useStockerSession.updateFromTool():
  ├─ Adds currentItem to completedItems array (length = 5) ✅
  ├─ Updates: machines[].completedItems += 1 (4 + 1 = 5) ✅
  ↓
[UI] Renders:
  ├─ Progress Bar: "5 of 12 items" ✅
  ├─ Done Card: "5 items" ✅
  └─ Dropdown: "Machine 1 of 5" ✅ (if status updated)
```

---

## DIVERGENCE POINTS - WHERE COUNTERS GET OUT OF SYNC

### 🔴 DIVERGENCE POINT 1: `start_machine` Doesn't Update Frontend Counter

**File:** `useStockerSession.ts:224-271`

**What Happens:**
1. User says "top" or "bottom" → `start_machine` workflow called
2. **Database:** Workflow sets `completed_items = count` (1 or 2)
3. **Frontend:** Does NOT update `machines[].completedItems` ❌
4. **Result:** Frontend counter is BEHIND database counter

**Code Evidence:**
```typescript
if (toolName === 'start_machine') {
  const totalItems = getMachineTotalItems(result.machine_id);
  next.currentMachineTotalItems = totalItems;  // ✅ Sets total
  next.currentMachineItemsRemaining = result.items_remaining;  // ✅ Sets remaining
  next.currentItem = { ...item1 data };  // ✅ Sets item

  // ❌ MISSING: No update to machines[].completedItems
}
```

**Impact:**
```
USER starts machine with 2 items
  Database: completed_items = 2 ✅
  Frontend: machines[].completedItems = 0 ❌

USER says "next" → get_next_item
  Database: completed_items = 4 (2 + 2)
  Frontend: machines[].completedItems = 2 (0 + 2)

Progress Bar shows: "2 of 12" ❌ (should be "4 of 12")
```

**This explains:** "13 of 12 items" - Frontend counter eventually catches up but overshoots because it's tracking wrong baseline.

---

### 🔴 DIVERGENCE POINT 2: Done Card vs Progress Bar

**Different Data Sources:**
- **Done Card:** `completedItems.length` (frontend array)
- **Progress Bar:** `machines[].completedItems` (synced with database)

**Divergence Scenario:**
```
1. Pick item 1: Array length = 1, counter = 1 ✅
2. Pick item 2: Array length = 2, counter = 2 ✅
3. Network error on item 3
4. Frontend retries → Adds item to array (length = 3)
5. But counter stays at 2 (workflow didn't run)
Result: Done card "3 items", Progress bar "2 of 12" ❌
```

**Protection:** Deduplication check (Line 306-314) prevents duplicates by slot+machine name.

**BUT:** Can still diverge if item has no slot or user picks same item from different machines.

---

### 🔴 DIVERGENCE POINT 3: Dropdown Status vs Completion

**File:** `StockerApp.tsx:1955`

**Current Logic:**
```typescript
<span>Machine {routeState.machines.filter(m => m.status === 'completed').length} of {routeState.totalMachines}</span>
```

**Counts:** Machines where `status === 'completed'`
**Problem:** Machine can have `completedItems === totalItems` but `status === 'in_progress'`

**Scenario:**
```
Machine 1: completedItems=5, totalItems=5, status='completed' ✅
Machine 2: completedItems=5, totalItems=5, status='completed' ✅
Machine 3: completedItems=4, totalItems=4, status='in_progress' ❌
Dropdown: "2 of 5" ❌ (should be "3 of 5")
```

**Root Cause:** Status update happens ONLY on `next_machine` action, not when completedItems reaches totalItems.

---

### 🔴 DIVERGENCE POINT 4: Resume from Stale State

**Scenario:**
```
1. User picks 10 items → IndexedDB: completedItems=10, Database: completed_items=10 ✅
2. F5 refresh (or app restart)
3. Frontend loads from IndexedDB → machines[].completedItems = 10
4. Database still has completed_items = 8 (if writes failed)
5. User says "next" → Frontend: 10 + 2 = 12, Database: 8 + 2 = 10
Result: "12 of 10" or "13 of 12" ❌
```

**This explains:** User's report of "13 of 12 items picked"

---

## NODES BOUNDARY - WHO UPDATES WHAT

### Workflow: `get_next_item` (iykbFj7f9222PF7r)

**Updates:**
- ✅ Database: `machines.completed_items` (atomic increment)
- ✅ Returns: `items_to_increment` for frontend sync

**Response Contract:**
```json
{
  "items_to_increment": 1 or 2,
  "completed_items": <OLD_VALUE>,
  "items_remaining": <COUNT>,
  "total_items": <TOTAL>
}
```

---

### Workflow: `start_machine` (JbKdJuKgGbyvzlF0)

**Updates:**
- ✅ Database: `machines.completed_items` (sets initial count)
- ❌ Does NOT return: `items_to_increment` in response

**Response Contract:**
```json
{
  "item1": { ... },
  "item2": { ... },
  "items_remaining": <COUNT>,
  "direction": "forward" | "reverse"
  // ❌ MISSING: items_to_increment
}
```

**BUG:** Frontend has no way to know how much database incremented!

---

### Frontend: `updateFromTool()` (useStockerSession.ts:191-520)

**Updates:**
- ✅ `completedItems` array (adds picked items)
- ✅ `machines[].completedItems` (increments by `items_to_increment`)
- ✅ `machines[].status` (marks completed on transitions)

**Depends On:**
- ✅ `get_next_item` returns `items_to_increment` ✅
- ❌ `start_machine` returns `items_to_increment` ❌

---

## FLOW BOUNDARY - USER JOURNEYS

### Flow 1: Normal Picking (Working)

```
1. User: "start route" → set_route_sequence
   Database: All machines have completed_items = 0
   Frontend: machines[].completedItems = 0 ✅

2. User: "top" → start_machine
   Database: completed_items = 2 (count=2)
   Frontend: machines[].completedItems = 0 ❌ NOT UPDATED
   Progress Bar: "0 of 12" ❌

3. User: "next" → get_next_item
   Database: completed_items = 4 (2 + 2)
   Frontend: machines[].completedItems = 2 (0 + 2) ❌
   Progress Bar: "2 of 12" ❌ (should be "4 of 12")

4. User: "next" → get_next_item
   Database: completed_items = 6 (4 + 2)
   Frontend: machines[].completedItems = 4 (2 + 2) ❌
   Progress Bar: "4 of 12" ❌ (should be "6 of 12")

5. Continues... Frontend always 2 behind database
```

---

### Flow 2: Machine Completion (Broken)

```
1. Machine has 12 total items
2. User has picked 11 items
   Database: completed_items = 11
   Frontend: machines[].completedItems = 11
   Status: 'in_progress'

3. User: "next" → get_next_item
   Database: completed_items = 12 (11 + 1)
   Workflow detects: completed_items >= total_items
   Returns: action = 'next_machine'

4. Frontend marks machine completed:
   machines[].status = 'completed' ✅
   machines[].completedItems = 12 (11 + 1) ✅

5. Dropdown NOW shows correct count ✅

BUT: If workflow doesn't detect completion correctly, status stays 'in_progress' ❌
```

---

### Flow 3: Resume After F5 (Corrupting Counter)

```
1. User picks 10 items → Database and Frontend both at 10 ✅
2. F5 refresh
3. Frontend loads from IndexedDB: machines[].completedItems = 10
4. BUT Database query fails or returns stale value: completed_items = 8 ❌
5. User: "next" → get_next_item
   Database: 8 + 2 = 10
   Frontend: 10 + 2 = 12
   Result: "12 of 10 items" ❌
```

---

## ERRORS BOUNDARY

### Error 1: Counter Overflow (completedItems > totalItems)

**Symptom:** "13 of 12 items picked"

**Causes:**
1. Resume from stale IndexedDB with higher count than database
2. Frontend increments twice for same workflow call (race condition)
3. start_machine initial increment not tracked, causing offset

**Database Constraint:** SHOULD prevent this, but frontend doesn't enforce!

```sql
CHECK (completed_items <= total_items)  -- Database has this
```

**Frontend:** No validation! Can set `completedItems = 13` when `totalItems = 12`

---

### Error 2: Dropdown Out of Sync

**Symptom:** Shows "2 of 5" when 3 machines complete

**Cause:** Counts `status === 'completed'`, not `completedItems >= totalItems`

**Fix:** Change dropdown logic to count actual completion, not status.

---

### Error 3: Done Card Mismatch

**Symptom:** Done card shows 5 items but user thought 6

**Causes:**
1. Deduplication filtered out item (user thought it was added)
2. Network error caused item not to be added to array
3. 2-pick mode showing 2 items but user counted as 1

---

## BREAKING CHANGES IF WE FIX

### Fix 1: Add `items_to_increment` to `start_machine` Response

**Change:** Workflow returns new field `items_to_increment`

**Impact:**
- ✅ Frontend can now sync counter on start
- ✅ No breaking change (new field is additive)
- ✅ Old frontend ignores it (graceful degradation)

---

### Fix 2: Update `start_machine` Handler in Frontend

**Change:** `useStockerSession.ts:224-271` increments `machines[].completedItems`

**Impact:**
- ✅ Fixes divergence on machine start
- ❌ If workflow doesn't return `items_to_increment`, breaks (old workflow)
- **Mitigation:** Deploy workflow first, then frontend

---

### Fix 3: Change Dropdown to Count Completion, Not Status

**Change:** `StockerApp.tsx:1955` logic

**Impact:**
- ✅ Dropdown now accurate
- ❌ May show "3 of 5" when user expects "2 of 5" if status not updated yet
- **But:** This is MORE correct (shows actual completion)

---

## RECOMMENDED FIX SEQUENCE

### Phase 1: Add Missing Data to Workflow Response

**File:** `/workflows/fixes/start_machine_format_output_FIXED.js`

**Add to response:**
```javascript
output.items_to_increment = itemData.count;  // 1 or 2
```

**Deploy:** Via Synta MCP
**Risk:** LOW (additive change, old frontend ignores)

---

### Phase 2: Update Frontend to Handle start_machine Counter

**File:** `src/hooks/useStockerSession.ts:224-271`

**Add:**
```typescript
if (toolName === 'start_machine') {
  // ... existing code ...

  // NEW: Sync frontend counter with database increment
  if (result.items_to_increment !== undefined) {
    next.machines = prev.machines.map(m =>
      m.id === result.machine_id
        ? { ...m, completedItems: m.completedItems + result.items_to_increment }
        : m
    );
    console.log('[Session] start_machine incremented counter by:', result.items_to_increment);
  } else {
    console.warn('[Session] start_machine missing items_to_increment - counter may diverge');
  }
}
```

**Deploy:** Git push → Cloudflare auto-deploy
**Risk:** MEDIUM (depends on Phase 1 being deployed first)

---

### Phase 3: Fix Dropdown to Count Actual Completion

**File:** `src/pages/StockerApp.tsx:1955`

**Change:**
```typescript
// BEFORE
<span>Machine {routeState.machines.filter(m => m.status === 'completed').length} of {routeState.totalMachines}</span>

// AFTER
<span>Machine {routeState.machines.filter(m => m.completedItems >= m.totalItems).length} of {routeState.totalMachines}</span>
```

**Deploy:** Same as Phase 2 (combined commit)
**Risk:** LOW (improves accuracy)

---

### Phase 4: Add Counter Validation (Safety Check)

**File:** `src/hooks/useStockerSession.ts:316-350`

**Add after counter update:**
```typescript
// Validate counter doesn't overflow
const machine = next.machines.find(m => m.id === prev.currentMachineId);
if (machine && machine.completedItems > machine.totalItems) {
  console.error('[Session] CRITICAL: Counter overflow detected!', {
    machine: machine.name,
    completedItems: machine.completedItems,
    totalItems: machine.totalItems,
    overflow: machine.completedItems - machine.totalItems
  });

  // CLAMP to prevent UI from showing impossible state
  next.machines = next.machines.map(m =>
    m.id === machine.id
      ? { ...m, completedItems: m.totalItems }  // Cap at total
      : m
  );
}
```

**Deploy:** Same commit as Phase 2
**Risk:** LOW (defensive programming, prevents UI corruption)

---

## TESTING REQUIREMENTS

### Test 1: Normal Picking with Counter Validation

```
1. Start route → Verify all counters at 0
2. Start machine (top) with count=2
   → Verify: Progress bar "2 of 12"
   → Verify: Done card "2 items"
   → Verify: Database completed_items = 2
3. Say "next" 5 times (10 items total)
   → Verify: All counters stay in sync
4. Complete machine
   → Verify: Dropdown increments
```

---

### Test 2: F5 Refresh Mid-Route

```
1. Pick 6 items
2. F5 refresh
3. Verify: All counters restore to 6
4. Pick 2 more items
5. Verify: All counters show 8 (not 10, not 6)
```

---

### Test 3: Counter Overflow Protection

```
1. Manually corrupt IndexedDB to set completedItems = 15, totalItems = 12
2. Resume route
3. Say "next"
4. Verify: Counter clamped at 12, not 17
5. Verify: Console error logged
```

---

## SUMMARY

### Root Causes Identified

1. **`start_machine` doesn't return `items_to_increment`** → Frontend can't sync counter
2. **Frontend loads stale IndexedDB on resume** → Counters diverge from database
3. **Dropdown counts status, not completion** → Shows wrong machine count
4. **No overflow protection** → Can show "13 of 12" impossible state

### Fixes Required

1. ✅ Add `items_to_increment` to `start_machine` workflow response
2. ✅ Update frontend to handle `start_machine` counter increment
3. ✅ Fix dropdown to count `completedItems >= totalItems`
4. ✅ Add counter overflow validation and clamping

### Risk Assessment

**Deployment Risk:** MEDIUM
- Requires workflow + frontend changes in sequence
- If deployed out of order, counters still diverge
- Must test thoroughly after each phase

**User Impact:** POSITIVE
- Fixes "13 of 12" impossible state
- Fixes dropdown showing wrong count
- No breaking changes to user experience

---

**NEXT STEPS:** Get user approval for fix sequence, then implement Phase 1 (workflow) first.
