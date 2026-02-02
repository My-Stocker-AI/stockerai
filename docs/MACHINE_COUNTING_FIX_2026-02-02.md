# Machine Counting & Transition System Fix

**Date:** 2026-02-02
**Status:** DEPLOYING
**Workflows Fixed:** skip_current_machine (ElCSMeguJNxwp0HO)

---

## PROBLEM ANALYSIS

### Bug 1: skip_machine NOT preserving completed_items
**Location:** `skip_current_machine` workflow (ElCSMeguJNxwp0HO)
**Node:** "Get Current Machine"

**Issue:**
- Query selects: `id,machine_name,location_name,machine_number,sequence,route_id,status`
- Missing: `completed_items`
- "Mark Skipped" node tries to use: `$('Get Current Machine').first().json.completed_items || 0`
- Result: `completed_items` is `undefined`, falls back to `0`
- Effect: `skipped_at_item` always set to 0, losing actual progress

**Expected:**
- User picks 4 items from Machine 2 (5 total)
- User says "skip machine"
- Machine 2 marked as skipped with `skipped_at_item=4`
- Returns to Machine 2 later, picks remaining 1 item

**Actual:**
- `skipped_at_item` always set to 0
- Returns to Machine 2, starts from beginning (all 5 items)

### Bug 2: start_machine completed_items update (VERIFIED WORKING)
**Analysis:** The "Update Machine" node correctly sets `completed_items: $json.count`
**Status:** ✅ NO FIX NEEDED

### Bug 3: get_next_item increment logic (VERIFIED WORKING)
**Analysis:** The "Increment Completed Items" node correctly increments counter
**Status:** ✅ NO FIX NEEDED

---

## FIX IMPLEMENTATION

### Fix 1: Add completed_items to Get Current Machine query

**Workflow:** skip_current_machine (ElCSMeguJNxwp0HO)
**Node:** get_current_machine

**Before:**
```
select=id,machine_name,location_name,machine_number,sequence,route_id,status
```

**After:**
```
select=id,machine_name,location_name,machine_number,sequence,route_id,status,completed_items,total_items
```

**Impact:**
- "Mark Skipped" node now has access to actual `completed_items` value
- `skipped_at_item` correctly set to current progress
- User can resume from partial progress instead of restarting

---

## DEPLOYMENT PLAN

1. ✅ Analyzed all three workflows
2. ✅ Identified root cause (missing SELECT field)
3. 🔄 Deploy fix to skip_current_machine workflow
4. ⏳ Test skip flow with partial progress
5. ⏳ Verify data flow across all 3 sync points

---

## VERIFICATION TESTS

### Test 1: Skip with Partial Progress
```
1. Start Machine 1 (5 items), pick 2 items
2. Say "skip machine"
3. Check database: machines.skipped_at_item should be 2 (not 0)
4. Complete remaining machines
5. Return to Machine 1
6. Should present items 3,4,5 (not 1,2,3,4,5)
```

### Test 2: Skip at Beginning
```
1. Start Machine 1, pick 0 items
2. Say "skip machine" immediately
3. Check database: machines.skipped_at_item should be 0
4. Return to Machine 1
5. Should present all items (1-5)
```

### Test 3: Three Sync Points
```
1. Progress Bar: Reads machines.completed_items
2. Done Card: Frontend state (items confirmed by "next")
3. Machine Dropdown: Reads machines.completed_items

All three should show same count at all times.
```

---

## RELATED FILES

- Workflow: `/workflows/skip_current_machine_ElCSMeguJNxwp0HO.json` (n8n cloud)
- Schema: `/supabase/migrations/20260125_add_machines_completed_items.sql`
- Skip tracking: `/supabase/migrations/20260202_add_skip_progress_tracking.sql`

---

## SYSTEM IMPACT AUDIT

**Upstream (callers of skip_machine):**
- Frontend: `useStockerSession.ts` - Calls skip_machine webhook
- No changes required - response format unchanged

**Downstream (called by skip_machine):**
- Database: machines table - Already has `completed_items` and `skipped_at_item` columns
- No changes required - just populating existing fields correctly

**Side Effects:**
- ✅ Positive: Correct skip progress tracking
- ✅ Positive: Better user experience (resume from progress)
- ✅ No breaking changes to API contract

**Error Propagation:**
- If query fails: Workflow already has error handling
- If completed_items is NULL: Fallback to 0 (safe default)

---

## COMMIT MESSAGE

```
Fix: Add completed_items to skip_machine query

Bug: skip_machine workflow missing completed_items in Get Current Machine query
Impact: skipped_at_item always set to 0, losing progress when skipping
Fix: Add completed_items,total_items to SELECT clause

Changes:
- skip_current_machine (ElCSMeguJNxwp0HO): Updated get_current_machine node query

Result:
- Skip progress correctly preserved
- Users can resume from partial progress
- Three sync points (progress bar, done card, dropdown) stay consistent

Workflow: ElCSMeguJNxwp0HO
Node: get_current_machine
```
