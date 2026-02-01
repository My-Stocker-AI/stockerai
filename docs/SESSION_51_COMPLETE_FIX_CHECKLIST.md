# Session 51: Complete System Recovery Checklist

**Date:** 2026-02-01
**Crisis:** Systemic fix deployed incomplete - removed `sessions.current_item_index` column but didn't update all dependent code
**Status:** Layer 1 SQL ready - awaiting deployment

---

## LAYER 1: DATABASE FIX (BLOCKING) ⚠️

### SQL Migration Created
**File:** `supabase/migrations/20260201_remove_current_item_index_from_rpc.sql`

**Action Required:**
1. Open Supabase SQL Editor
2. Copy/paste contents of migration file
3. Execute migration
4. Verify success messages:
   - ✅ "SUCCESS: get_next_item_data updated - current_item_index removed"
   - ✅ "ALL TESTS PASSED - RPC function working correctly"

**What it fixes:**
- Removes `current_item_index` from RPC function RETURNS TABLE
- Removes `current_item_index` from SELECT statement
- Includes automated verification tests

**Expected result:** RPC function executes without "column does not exist" errors

---

## LAYER 2: WORKFLOW FIXES (SYNTA BATCH OPERATIONS)

### Ready After Layer 1 Complete

**6 workflows requiring fixes:**

#### 1. set_route_sequence (46lMRdxTgD1E3WFz)
- [ ] Node: "Update Session Machine" - Remove `current_item_index` from PATCH body

#### 2. skip_current_machine (ElCSMeguJNxwp0HO)
- [ ] Node: "Get Session" - Remove from SELECT
- [ ] Node: "Prepare Session Update" - Delete `current_item_index: 0` line

#### 3. get_next_item (iykbFj7f9222PF7r)
- [ ] Node: "Determine Next State" - Delete unused `currentItemIndex` variable
- [ ] Node: "Update Session" - Remove from PATCH body

#### 4. get_current_status (PD3ErCuxWBWLFXIq)
- [ ] Node: "Get Session" - Remove from SELECT
- [ ] Node: "Extract IDs" - Delete `current_item_index` line
- [ ] Node: "Get Item" - **REQUIRES LOGIC REDESIGN** (uses wrong field)
- [ ] Node: "Format Output" - Use `completed_items` instead of `current_item_index`

#### 5. go_back_to_skipped (rpNfINhjbFCuFrlZ)
- [ ] Node: "Get Session" - Remove from SELECT
- [ ] Node: "Update Session" - Remove from PATCH body

#### 6. switch_route (3G01u7N9REhrC9tn)
- [ ] Node: "Get Current Session" - Remove from SELECT

---

## LAYER 3: VALIDATION & TESTING

### After All Workflow Fixes Applied

**Critical Path Tests:**
1. [ ] Start route (set_route_sequence workflow)
2. [ ] Start machine (start_machine workflow)
3. [ ] Pick items (get_next_item workflow)
4. [ ] Complete machine
5. [ ] Skip machine (skip_current_machine workflow)
6. [ ] Go back to skipped (go_back_to_skipped workflow)
7. [ ] Get status (get_current_status workflow)
8. [ ] Switch route (switch_route workflow)
9. [ ] Complete full route

**Success Criteria:**
- ✅ No "column does not exist" errors
- ✅ Progress tracked via `machines.completed_items`
- ✅ Machines complete at N/N items
- ✅ Routes complete when all machines done

---

## KNOWN SEPARATE ISSUES

### ⚠️ set_route_sequence "ON CONFLICT" Error
**Execution:** 28665
**Error:** "ON CONFLICT DO UPDATE command cannot affect row a second time"
**Status:** Separate bug - not related to current_item_index removal
**Action:** Investigate after main fix complete

---

## EXECUTION TIMELINE

**Estimated time:**
- Layer 1 (SQL): 5 minutes (manual)
- Layer 2 (Workflows): 15-20 minutes (Synta batch operations)
- Layer 3 (Testing): 10-15 minutes
- **Total:** 30-40 minutes

---

## SUCCESS METRICS

**Before fix:**
- ❌ RPC function fails with "column does not exist"
- ❌ Edge Function returns 500 error
- ❌ Cannot start routes
- ❌ Cannot pick items
- ❌ System completely broken

**After fix:**
- ✅ RPC function executes successfully
- ✅ Edge Function returns data
- ✅ Routes start without errors
- ✅ Items pick and increment correctly
- ✅ Machines complete at N/N
- ✅ Routes complete when all machines done
- ✅ System fully operational

---

## LESSONS LEARNED

**What went wrong:**
1. ❌ Deployed database schema change without checking ALL dependent code
2. ❌ Updated only 2 of 9 workflows before migration
3. ❌ No validation step before declaring "systemic fix" complete
4. ❌ Violated System Impact Audit Protocol

**What should have happened:**
1. ✅ Run MECE decomposition FIRST - find ALL code referencing `current_item_index`
2. ✅ Create complete checklist - document every file/workflow/function
3. ✅ Fix ALL code BEFORE running migration
4. ✅ Test thoroughly - validate each layer
5. ✅ Deploy atomically - all changes at once

**Protocol reinforced:**
- **MANDATORY System Impact Audit** before ANY schema change
- **MANDATORY complete code search** for removed columns/fields
- **MANDATORY validation** before declaring fixes complete

---

**NEXT ACTION:** Run Layer 1 SQL migration in Supabase SQL Editor
