# StockerAI Data Contracts
**Status:** DRAFT - Contract Definition Phase
**Created:** 2026-01-25
**Purpose:** Define immutable data contracts across all system boundaries

---

## Overview

This document defines the **immutable contracts** that govern data flow across:
- Database schema (PostgreSQL/Supabase)
- n8n workflows (10+ workflows)
- Frontend state (React/TypeScript)
- AI integration (OpenAI via n8n)

**Core Principle:** Separate immutable structure from mutable state.

---

## 1. CORE DATA MODEL

### 1.1 Route (Immutable Structure)

```typescript
interface Route {
  // IMMUTABLE - Set once at creation, never changes
  id: string;                    // UUID
  user_id: string;              // UUID
  route_name: string;           // "Downtown Route"
  delivery_date: Date;          // 2026-01-26
  total_machines: number;       // 5 (count of machines array)
  total_items: number;          // 25 (sum of all machine.total_items)
  created_at: timestamp;

  // MUTABLE - Changes during execution
  status?: 'active' | 'completed' | 'archived';
}
```

**Contract Rules:**
- ✅ `total_machines` MUST equal count of machines in machines table
- ✅ `total_items` MUST equal sum of all machines[].total_items
- ✅ These fields NEVER change after route creation
- ❌ NEVER decrement counters when skipping machines
- ❌ NEVER modify structure (add/remove machines) after creation

---

### 1.2 Machine (Immutable Structure + Mutable State)

```typescript
interface Machine {
  // IMMUTABLE - Set once at creation, never changes
  id: string;                    // UUID
  route_id: string;             // Foreign key
  machine_name: string;         // "TEST Machine 1"
  machine_number: number;       // 101
  location_name: string;        // "TEST Location"
  sequence: number;             // 1, 2, 3, 4, 5
  total_items: number;          // 5 (count of items for this machine)
  created_at: timestamp;

  // MUTABLE - Changes during execution
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  completed_items: number;      // 0→5 (increments as items picked)
  skipped_at_item?: number;     // If skipped mid-machine, record position
}
```

**Contract Rules:**
- ✅ `total_items` MUST equal count of items in items table for this machine_id
- ✅ `total_items` NEVER changes (even if machine skipped)
- ✅ `completed_items` starts at 0, increments per item picked (max = total_items)
- ✅ `completed_items` NEVER decrements
- ✅ `completed_items` NEVER carries over to next machine (each machine independent)
- ❌ NEVER modify total_items after creation
- ❌ NEVER reset completed_items when skipping (preserve count)

---

### 1.3 Item (Immutable)

```typescript
interface Item {
  // IMMUTABLE - Set once at creation, never changes
  id: string;                    // UUID
  machine_id: string;           // Foreign key
  product_name: string;         // "TEST Item 1 (Machine 1)"
  quantity: number;             // 6
  slot: string;                 // "1" or "1-2"
  sequence: number;             // 1, 2, 3, 4, 5
  inventory_current: number;    // 0
  inventory_parlevel: number;   // 10
  created_at: timestamp;

  // NO MUTABLE FIELDS
  // Items are never modified after creation
}
```

**Contract Rules:**
- ✅ Items are COMPLETELY immutable
- ✅ Each item belongs to exactly ONE machine
- ✅ Item count per machine NEVER changes
- ❌ NEVER delete items
- ❌ NEVER modify any item fields

---

### 1.4 Session State (Mutable)

```typescript
interface SessionState {
  // Session identity
  session_id: string;           // UUID
  user_id: string;              // UUID
  route_id: string;             // Current route

  // Current position (mutable)
  current_machine_id: string;   // Which machine currently on
  current_machine_index: number; // 1-based: 1, 2, 3, 4, 5
  current_item_index: number;   // Within current machine: 1-5

  // Aggregate counters (derived, not stored)
  // These are COMPUTED, not persisted:
  total_items_picked: number;   // Sum of all machines[].completed_items

  // State flags
  completed: boolean;           // Route finished?
  created_at: timestamp;
  updated_at: timestamp;
}
```

**Contract Rules:**
- ✅ Session tracks POSITION, not structure
- ✅ `current_machine_id` MUST always exist in route's machines
- ✅ `current_item_index` resets to 1 when moving to new machine
- ❌ NEVER store aggregate counters in session (derive from machines[])
- ❌ NEVER persist "completed_items" in session (stored in machines table)

---

## 2. DATA FLOW BOUNDARIES

### 2.1 Database → n8n Workflows

**Contract:** Workflows MUST read immutable structure, ONLY update mutable state

```sql
-- ALLOWED: Read immutable structure
SELECT id, machine_name, total_items FROM machines WHERE route_id = $1;

-- ALLOWED: Update mutable state
UPDATE machines SET completed_items = completed_items + 1 WHERE id = $1;
UPDATE machines SET status = 'skipped' WHERE id = $1;

-- FORBIDDEN: Modify immutable structure
UPDATE machines SET total_items = X WHERE id = $1;  -- ❌ NEVER
DELETE FROM machines WHERE id = $1;                 -- ❌ NEVER
```

---

### 2.2 n8n Workflows → Frontend

**Contract:** Workflows MUST return complete data contracts, frontend MUST NOT derive/mutate

```typescript
// WORKFLOW OUTPUT CONTRACT (all workflows MUST conform)
interface WorkflowOutput {
  // Action type (tells frontend what to do)
  action: 'machine_ready' | 'item_ready' | 'next_machine' | 'route_complete';

  // Machine context (if action involves machine)
  machine_id?: string;
  machine_name?: string;
  machine_total_items?: number;      // Immutable structure
  machine_completed_items?: number;  // Mutable state

  // Item data (if action involves item)
  product_name?: string;
  quantity?: number;
  slot?: string;
  items_remaining?: number;          // Items left on THIS machine

  // Voice output (frontend MUST use this, not generate own)
  spoken: string;                    // "TEST Machine 1 skipped. On to TEST Machine 2."
  display_text?: string;             // Optional: Different text for screen

  // Route progress (optional)
  route_complete?: boolean;
}
```

**Contract Rules:**
- ✅ Workflow OWNS the spoken text - frontend NEVER generates its own
- ✅ Workflow provides ALL data needed for UI updates
- ✅ Frontend NEVER derives counters (uses workflow-provided values)
- ❌ Frontend NEVER modifies machine_total_items
- ❌ Frontend NEVER calculates items_remaining from other values

---

### 2.3 Frontend State Management

**Contract:** Frontend MUST maintain per-machine isolation

```typescript
interface FrontendRouteState {
  routeId: string;
  routeName: string;

  // Machine list (from set_route_sequence)
  machines: Array<{
    id: string;
    name: string;
    totalItems: number;      // IMMUTABLE - from workflow
    completedItems: number;  // MUTABLE - updated per machine
    status: MachineStatus;
  }>;

  // Current position
  currentMachineId: string;
  currentMachineIndex: number;

  // Per-machine completed items (ISOLATED)
  // Each machine's completedItems is independent

  // Aggregate completed items list (for "done" card)
  completedItems: Array<{
    product: string;
    quantity: number;
    slot: string;
    machineName: string;    // MUST track which machine
  }>;
}
```

**Contract Rules:**
- ✅ Each machine has INDEPENDENT completedItems counter
- ✅ When transitioning machine, new machine starts with completedItems = 0
- ✅ completedItems array tracks ALL items with machine attribution
- ❌ NEVER carry over completedItems count to next machine
- ❌ NEVER use global item index (use per-machine index)

---

## 3. BOUNDARY VALIDATION POINTS

### 3.1 Workflow Output Validation

**Location:** Before workflow returns to frontend

```javascript
// Every workflow MUST validate before return
function validateWorkflowOutput(output) {
  // Required fields based on action
  if (output.action === 'next_machine') {
    assert(output.machine_id, 'machine_id required');
    assert(output.machine_name, 'machine_name required');
    assert(output.spoken, 'spoken text required');
  }

  // Immutable fields never null/undefined
  if (output.machine_total_items !== undefined) {
    assert(output.machine_total_items > 0, 'machine_total_items must be > 0');
  }

  // Counters never negative
  if (output.machine_completed_items !== undefined) {
    assert(output.machine_completed_items >= 0, 'completed_items cannot be negative');
  }

  return output;
}
```

---

### 3.2 Frontend State Update Validation

**Location:** Inside setRouteState callback

```typescript
// Validate BEFORE applying state update
function validateMachineTransition(prev: RouteState, next: RouteState) {
  // Machine totalItems never changes
  for (const machine of next.machines) {
    const prevMachine = prev.machines.find(m => m.id === machine.id);
    if (prevMachine) {
      assert(
        machine.totalItems === prevMachine.totalItems,
        `Machine ${machine.name} totalItems changed: ${prevMachine.totalItems} → ${machine.totalItems}`
      );
    }
  }

  // New machine starts with completedItems = 0 (unless resuming)
  if (next.currentMachineId !== prev.currentMachineId) {
    const newMachine = next.machines.find(m => m.id === next.currentMachineId);
    if (newMachine && newMachine.status === 'pending') {
      assert(
        newMachine.completedItems === 0,
        `New machine ${newMachine.name} should start with completedItems = 0, got ${newMachine.completedItems}`
      );
    }
  }
}
```

---

## 4. WORKFLOW CONTRACTS

### 4.1 set_route_sequence

**Purpose:** Initialize route, return machine list with structure

**Input:**
```typescript
{
  user_id: string;
  route_id: string;
  date: string;
}
```

**Output Contract:**
```typescript
{
  action: 'machine_ready';
  route_name: string;
  date: string;
  total_machines: number;      // Count of machines array
  total_items_in_route: number; // Sum of all machine.totalItems
  machine_id: string;          // First machine
  machine_name: string;
  machine_number: number;
  total_items_in_machine: number;
  machines: Array<{            // Complete machine list
    id: string;
    name: string;
    sequence: number;
    totalItems: number;        // IMMUTABLE
    completedItems: number;    // Always 0 at route start
    status: 'pending';
  }>;
  spoken: string;
}
```

**Contract Rules:**
- ✅ MUST return complete machines array with totalItems for each
- ✅ All machines start with completedItems = 0, status = 'pending'
- ✅ total_machines MUST equal machines.length
- ✅ total_items_in_route MUST equal sum of machines[].totalItems

---

### 4.2 start_machine

**Purpose:** Start picking items on a machine (top or bottom)

**Input:**
```typescript
{
  session_id: string;
  machine_id: string;
  direction: 'beginning' | 'end'; // top or bottom
}
```

**Output Contract:**
```typescript
{
  action: 'item_ready';
  machine_id: string;
  machine_name: string;
  items_remaining: number;     // Items left on THIS machine (5, then 4, 3, 2, 1)
  item1: {
    product_name: string;
    quantity: number;
    slot: string;
    slot_spoken: string;
  };
  item2?: { ... };             // Optional second item (2-pick mode)
  spoken: string;
  display_text: string;
}
```

**Contract Rules:**
- ✅ items_remaining is COUNT of items LEFT on THIS machine (not global)
- ✅ items_remaining starts at machine.total_items, decrements each pick
- ✅ NEVER return items_remaining from another machine
- ❌ NEVER modify machine.total_items

---

### 4.3 get_next_item

**Purpose:** Get next item on current machine OR transition to next machine

**Input:**
```typescript
{
  session_id: string;
  machine_id: string;
  current_item_index: number;  // Per-machine index
}
```

**Output Contract (if more items):**
```typescript
{
  action: 'item_ready';
  machine_id: string;
  items_remaining: number;     // Items LEFT on THIS machine
  item1: { ... };
  item2?: { ... };
  spoken: string;
}
```

**Output Contract (if machine complete):**
```typescript
{
  action: 'next_machine';
  completed_machine: string;   // Machine just finished
  next_machine_id: string;
  next_machine: string;
  next_machine_number: number;
  next_location: string;
  spoken: string;              // "TEST Machine 1 complete. Next is TEST Machine 2..."
}
```

**Contract Rules:**
- ✅ items_remaining is ONLY for current machine
- ✅ When machine complete, return action='next_machine' with NEW machine data
- ✅ spoken text MUST say "complete" (not "skipped")
- ❌ NEVER mix data from old machine and new machine in same response

---

### 4.4 skip_current_machine

**Purpose:** Skip current machine, move to next

**Input:**
```typescript
{
  session_id: string;
  machine_id: string;
  current_item_index: number;
}
```

**Output Contract:**
```typescript
{
  action: 'next_machine';      // OR 'route_complete' if last machine
  skipped_machine: string;     // Machine just skipped
  next_machine_id?: string;    // Only if more machines
  next_machine?: string;
  next_machine_number?: number;
  next_location?: string;
  route_complete: boolean;
  spoken: string;              // "TEST Machine 1 skipped. On to TEST Machine 2."
}
```

**Contract Rules:**
- ✅ spoken text MUST say "skipped" (not "complete")
- ✅ MUST set machine.status = 'skipped' in database
- ✅ MUST preserve machine.completed_items count (don't reset)
- ✅ If last machine, return action='route_complete'
- ❌ NEVER say "complete" when machine was skipped

---

## 5. CURRENT VIOLATIONS

### 5.1 Bug: Skip says "complete" instead of "skipped"

**Location:** AI prompt generation (frontend)

**Violation:** Frontend AI is generating its own text instead of using workflow's spoken field

**Fix Required:**
- Frontend MUST use workflow.spoken text verbatim
- Remove AI text generation for workflow responses
- AI should only generate text for status queries, not workflow actions

---

### 5.2 Bug: Machine 2 shows "2/5" instead of "0/5"

**Location:** Frontend state management (useStockerSession.ts)

**Violation:** completedItems counter not being reset/isolated per machine

**Root Cause:** Frontend tracks global completedItems array but uses it to derive per-machine count

**Fix Required:**
- Track completedItems per machine in machines[] array
- When starting new machine, use machine.completedItems from array
- Reset completed items counter display when machine changes

---

### 5.3 Bug: Machine finishes after 3 items (should be 5)

**Location:** Frontend completion logic

**Violation:** Using global item count instead of per-machine count

**Root Cause:**
- Machine 1: picked 2 items, skipped
- Machine 2: picked 3 items
- Frontend thinks: 2 + 3 = 5 = machine.totalItems → complete
- Should think: Machine 2 completedItems = 3, totalItems = 5 → 2 remaining

**Fix Required:**
- Use machine.completedItems for per-machine progress
- Compare machine.completedItems to machine.totalItems (not global count)
- Display: machine.completedItems / machine.totalItems

---

## 6. FIX CHECKLIST

### Phase 1: Contract Enforcement (Infrastructure)

- [ ] Add contract validation functions (workflow output, state updates)
- [ ] Create TypeScript interfaces matching contracts
- [ ] Add runtime assertions at boundary crossing points
- [ ] Document contracts in code comments

### Phase 2: Workflow Fixes

- [ ] **skip_current_machine:** Verify spoken text says "skipped" not "complete"
- [ ] **get_next_item:** Verify spoken text says "complete" when machine done
- [ ] **start_machine:** Verify items_remaining is per-machine count
- [ ] **get_next_item:** Verify items_remaining decrements correctly
- [ ] All workflows: Verify totalItems never modified

### Phase 3: Frontend Fixes

- [ ] **useStockerSession:** Track completedItems per machine in machines[] array
- [ ] **useStockerSession:** Reset display when machine changes
- [ ] **useStockerAI:** Use workflow.spoken text verbatim (no generation)
- [ ] **StockerApp progress bar:** Use machine.completedItems / machine.totalItems
- [ ] **StockerApp done card:** Show all items with machine attribution

### Phase 4: Database Validation

- [ ] Add CHECK constraint: machines.completed_items <= machines.total_items
- [ ] Add CHECK constraint: machines.completed_items >= 0
- [ ] Add trigger: Prevent total_items modification after creation
- [ ] Add trigger: Prevent machines deletion after route started

### Phase 5: Testing

- [ ] Test route with 5 machines, 5 items each
- [ ] Test skip machine at start (0 items picked)
- [ ] Test skip machine mid-way (2 items picked)
- [ ] Test complete machine normally (all 5 items)
- [ ] Test progress bar displays correctly
- [ ] Test done card shows items from all machines
- [ ] Test machine dropdown shows correct counts

---

## 7. VALIDATION LAYER PSEUDOCODE

```typescript
// At workflow → frontend boundary
function receiveWorkflowOutput(output: any): WorkflowOutput {
  // Validate contract
  validateWorkflowContract(output);

  // Return typed, validated output
  return output as WorkflowOutput;
}

// At frontend state update
function updateRouteState(prev: RouteState, update: Partial<RouteState>): RouteState {
  const next = { ...prev, ...update };

  // Validate immutable fields unchanged
  validateImmutableContracts(prev, next);

  // Validate per-machine isolation
  validateMachineIsolation(next);

  return next;
}

// At workflow query → database
function queryMachineItems(machineId: string) {
  const result = db.query('SELECT * FROM machines WHERE id = $1', [machineId]);

  // Validate result matches contract
  assert(result.total_items > 0, 'total_items must be > 0');
  assert(result.completed_items >= 0, 'completed_items cannot be negative');
  assert(result.completed_items <= result.total_items, 'completed > total');

  return result;
}
```

---

## 8. SUCCESS CRITERIA

**Contracts are successfully enforced when:**

1. ✅ Machine totalItems NEVER changes after creation
2. ✅ Machine completedItems is ISOLATED per machine (no cross-contamination)
3. ✅ Skip says "skipped", complete says "complete" (correct text)
4. ✅ Progress bar shows per-machine progress (X/Y)
5. ✅ Done card shows ALL items from ALL machines with attribution
6. ✅ Route can be skipped/completed/resumed without counter corruption
7. ✅ Validation catches contract violations before they cause bugs

---

**END OF CONTRACT DEFINITION**

Next steps:
1. Review this document
2. Approve contracts
3. Implement validation layer
4. Fix violations systematically
5. Test thoroughly
