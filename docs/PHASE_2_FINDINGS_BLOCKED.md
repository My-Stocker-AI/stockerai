# Phase 2: Workflow Fixes - BLOCKED

**Date:** 2026-01-25
**Status:** ⚠️ BLOCKED - Foundational schema missing
**Discovery:** machines.completed_items column does not exist

---

## CRITICAL DISCOVERY

**Phase 1 defined contracts assuming `machines.completed_items` exists as PRIMARY source of truth.**

**Reality: This column does NOT exist in the database.**

---

## Evidence

### 1. Database Schema Search

**Searched:**
- All migration files (`supabase/migrations/*.sql`)
- All workflow files (`workflows/*.js`)
- Execution logs from n8n

**Result:** NO references to `machines.completed_items` column

### 2. Current System Implementation

**Actual implementation uses:**
```sql
-- Session tracks position only
sessions.current_item_index  -- Position within current machine (1, 2, 3...)

-- Progress calculated by counting items
SELECT COUNT(*) FROM items
WHERE machine_id = $current_machine
AND sequence > $current_item_index;  -- Items remaining
```

**Contract specification requires:**
```sql
-- Per-machine persistent counter
machines.completed_items  -- 0 → total_items (ISOLATED per machine)

-- Progress tracked in database
UPDATE machines
SET completed_items = completed_items + 1
WHERE id = $machine_id;
```

### 3. Contract Document References

**DATA_CONTRACTS.md explicitly states:**
- Line 155: "UPDATE machines SET completed_items = completed_items + 1"
- Line 677: "Database `machines.completed_items` - PRIMARY source of truth"
- Line 716: "✅ Database machines.completed_items is ALWAYS source of truth"
- Phase 4 checklist: "Add CHECK constraint: machines.completed_items <= machines.total_items"

**All of these assume the column exists - it doesn't.**

---

## Root Cause of Reported Bugs

### Bug #1: Skip says "complete" instead of "skipped"
**Status:** NOT a database issue
**Location:** Frontend AI text generation (Phase 3)
**Workflow already correct:** Verified execution 28286 outputs "skipped"

### Bug #2: Machine 2 shows "2/5" instead of "0/5"
**Status:** ✅ CONFIRMED - Caused by missing machines.completed_items
**Current behavior:**
- Frontend uses global `completedItems[]` array (all items across all machines)
- Displays `completedItems.length` as "items completed" for current machine
- When switching to Machine 2, array has 2 items from Machine 1 → shows "2/5"

**Required fix:**
- ADD machines.completed_items column
- Track per-machine counts in database
- Frontend queries machines.completed_items for each machine

### Bug #3: Machine finishes after 3 items (should be 5)
**Status:** ✅ CONFIRMED - Caused by missing machines.completed_items
**Current behavior:**
- System uses `items WHERE sequence > current_item_index` to determine "items remaining"
- If calculation error or index corruption → wrong count

**Required fix:**
- ADD machines.completed_items column
- Workflow checks: `if completed_items >= total_items` → machine complete
- Deterministic completion (count up to total, not derive from items table)

---

## Phase 2 Task Results

| Task | Status | Finding |
|------|--------|---------|
| #1: skip_current_machine spoken text | ✅ PASS | Workflow outputs "skipped" correctly |
| #2: skip preserves completed_items | ❌ BLOCKED | Column doesn't exist |
| #3: get_next_item per-machine count | ❌ BLOCKED | Uses derived count, not persistent |
| #4: start_machine per-machine count | ✅ PASS | Correctly uses total_items |

**Conclusion:** 2/4 tasks pass, 2/4 blocked by missing database schema

---

## Impact on Validation Infrastructure

**Phase 1 validation is checking for violations of contracts that aren't implemented.**

**Example:**
```typescript
// contractValidation.ts validates this:
if (machine.completedItems > machine.totalItems) {
  errors.push(new ContractViolationError(...));
}

// But machines.completedItems doesn't exist in database!
// Frontend has to derive it from items array (unreliable)
```

**Result:** Validation catches frontend derivation errors, but can't enforce database-level integrity.

---

## Required Fix: Database Schema Migration

### Add machines.completed_items Column

**Migration SQL:**
```sql
-- Add completed_items column to machines table
ALTER TABLE machines
ADD COLUMN IF NOT EXISTS completed_items INTEGER NOT NULL DEFAULT 0;

-- Add constraints (Phase 4)
ALTER TABLE machines
ADD CONSTRAINT completed_items_non_negative CHECK (completed_items >= 0);

ALTER TABLE machines
ADD CONSTRAINT completed_items_within_total CHECK (completed_items <= total_items);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_machines_completed_items
ON machines(completed_items);

-- Add trigger to prevent total_items modification
CREATE OR REPLACE FUNCTION prevent_total_items_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.total_items IS DISTINCT FROM NEW.total_items THEN
    RAISE EXCEPTION 'total_items is immutable (cannot be changed after creation)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_total_items_immutable
BEFORE UPDATE ON machines
FOR EACH ROW
EXECUTE FUNCTION prevent_total_items_change();
```

### Update Workflows to Track completed_items

**Required changes:**
1. **get_next_item:** After item picked → `UPDATE machines SET completed_items = completed_items + 1`
2. **skip_current_machine:** Set `skipped_at_item = completed_items` when status='skipped'
3. **start_machine:** Query `completed_items` from database (not assume 0)
4. **go_back_to_skipped:** Resume from `completed_items` instead of resetting to 1
5. **set_route_sequence:** Initialize all machines with `completed_items = 0`

### Update Frontend to Use completed_items

**Required changes:**
1. **useStockerSession:** Query `machines.completed_items` from database on resume
2. **StockerApp progress:** Display `machine.completedItems / machine.totalItems`
3. **useStockerAI:** Remove derivation from `completedItems[]` array
4. **Machine transition:** Trust database `completed_items`, not frontend calculation

---

## Recommended Phase Order (REVISED)

### Phase 1: Contract Validation Infrastructure ✅ COMPLETE
- Type definitions
- Validation functions
- Integration at boundaries
- **Result:** Infrastructure in place, but validating unimplemented contracts

### ⚠️ Phase 4 FIRST: Database Schema Migration
- ADD machines.completed_items column
- ADD constraints (non-negative, <= total_items)
- ADD trigger (prevent total_items modification)
- **Why first:** Workflows and frontend depend on this column

### Phase 2: Workflow Fixes (UNBLOCKED after Phase 4)
- Update get_next_item: Increment completed_items
- Update skip_current_machine: Save skipped_at_item
- Update start_machine: Query completed_items
- Update go_back_to_skipped: Resume from completed_items
- Update set_route_sequence: Initialize completed_items = 0

### Phase 3: Frontend Fixes (UNBLOCKED after Phase 4)
- useStockerSession: Track per-machine completed_items
- StockerApp progress: Use machine.completedItems
- useStockerAI: Use workflow.spoken verbatim
- Remove derived calculations

### Phase 5: Testing
- Comprehensive validation across all scenarios
- Verify contracts enforced at all boundaries

---

## Decision Required

**Option A: Implement Phase 4 First (Recommended)**
- Add machines.completed_items column
- Update workflows to use it
- Update frontend to query it
- **Result:** Contracts fully implemented, validation works correctly

**Option B: Revise Contracts to Match Current System**
- Remove completed_items from contracts
- Accept current_item_index + derivation approach
- Update validation to match reality
- **Result:** Validation works, but bugs remain unfixed

**Option C: Hybrid Approach**
- Keep contracts as-is (aspirational)
- Document gap between contracts and implementation
- Fix bugs without implementing full contracts
- **Result:** Pragmatic short-term, but tech debt persists

---

## Recommendation

**Proceed with Option A: Implement Phase 4 First**

**Rationale:**
- Bugs #2 and #3 CANNOT be fixed without machines.completed_items
- Phase 1 validation is already in place (expecting this field)
- Migration is straightforward (single column + constraints)
- Unblocks both Phase 2 (workflows) and Phase 3 (frontend)

**Estimated Effort:**
- Database migration: 30 minutes (write SQL, test, deploy)
- Workflow updates: 2-3 hours (5 workflows × ~30 min each)
- Frontend updates: 1-2 hours (query + display changes)
- Testing: 1 hour (verify all scenarios)

**Total: 4-6 hours to fully implement contracts**

---

## Next Steps

1. **Get user approval** for Option A (Phase 4 first)
2. **Create migration SQL** with column + constraints + trigger
3. **Test migration** on test route (ID: 69676322-6abf-41e3-b364-bb64c72402b9)
4. **Update workflows** to track completed_items
5. **Update frontend** to query completed_items
6. **Run Phase 5 testing** to verify contracts enforced

---

**END OF FINDINGS**
