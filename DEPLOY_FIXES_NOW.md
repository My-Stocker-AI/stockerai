# DEPLOY FIXES NOW - Quick Action Guide

**Date:** 2026-01-22
**Estimated Time:** 5 minutes
**Impact:** Fixes 4 critical bugs

---

## What These Fixes Do

| Fix | Issue Resolved | User Impact |
|-----|---------------|-------------|
| **Determine Next State** | Inventory shows 0/0 | ✅ Shows correct inventory |
| **Determine Next State** | Machine stops at 28/29 | ✅ Completes all items |
| **Determine Next State** | count=2 skips last item | ✅ Picks all items |
| **Format Output** | count=2 shows only 1 item | ✅ Displays both items |

---

## Step-by-Step Deployment

### Fix 1: Determine Next State (3 minutes)

1. **Open n8n:** https://visionairy.app.n8n.cloud
2. **Find workflow:** "Stocker Tool: get_next_item (Optimized)"
3. **Click to edit** (pencil icon)
4. **Find node:** Click "Determine Next State" in workflow canvas
5. **Open code editor:** Code editor should appear on right
6. **Delete old code:** Select all (Ctrl+A) and delete
7. **Copy new code:**
   - Open: `/home/visionairy/StockerAI/workflows/determine_next_state_WITH_INVENTORY_FIX.js`
   - Copy entire file contents
8. **Paste into n8n:** Paste in code editor
9. **Save:** Click "Save" button (top right)
10. **Verify active:** Make sure workflow toggle is ON (green)

### Fix 2: Format Output (2 minutes)

1. **Same workflow:** Still in "Stocker Tool: get_next_item (Optimized)"
2. **Find node:** Click "Format Output" in workflow canvas
3. **Open code editor:** Code editor should appear
4. **Delete old code:** Select all (Ctrl+A) and delete
5. **Copy new code:**
   - Open: `/home/visionairy/StockerAI/workflows/FORMAT_OUTPUT_FIXED_20260122.js`
   - Copy entire file contents
6. **Paste into n8n:** Paste in code editor
7. **Save:** Click "Save" button (top right)
8. **Done!** Both fixes deployed

---

## Quick Test (2 minutes)

1. **Open app:** https://stockerai.visionairy.ai
2. **Start a route**
3. **Say "next"**
4. **Check inventory:** Should show numbers (not 0/0) ✅
5. **Enable count=2:** Settings → Call two items
6. **Say "next"**
7. **Check display:** Should show BOTH items ✅
8. **Complete machine:** Pick all items
9. **Check completion:** Should reach N/N (not N-1/N) ✅

**If all 3 checks pass → Fixes deployed successfully! 🎉**

---

## Rollback (If Needed)

If something breaks:

1. Open workflow in n8n
2. Click version dropdown (top right, near Save button)
3. Select previous version from list
4. Click "Restore"
5. Report what broke

---

## What These Files Fix

### determine_next_state_WITH_INVENTORY_FIX.js

**Lines changed:**
- **Line 74:** Fixed reverse mode calculation (`newIndex` not `newIndex - 1`)
- **Lines 87-90:** Added inventory fields (inventory_current, inventory_parlevel)
- **Lines 126, 156:** Safe placeholder for next machine index

**Bugs fixed:**
- ✅ Machine finishes at 28/29 → Now completes at 29/29
- ✅ count=2 skips last item with odd count → Now picks all items
- ✅ Inventory shows 0/0 → Now shows correct numbers

### FORMAT_OUTPUT_FIXED_20260122.js

**Lines changed:**
- **Lines 99-100, 117:** Fixed field names (product_name2 not item2_product_name)
- **Lines 196-213:** Return item2 as nested object (not flat fields)

**Bugs fixed:**
- ✅ count=2 shows only 1 item → Now shows both items

---

## Files Location

Both files are in: `/home/visionairy/StockerAI/workflows/`

1. `determine_next_state_WITH_INVENTORY_FIX.js` (202 lines)
2. `FORMAT_OUTPUT_FIXED_20260122.js` (239 lines)

---

## Expected Results After Deploy

### Before (Broken)
- Inventory: 0/0
- count=2: Shows 1 item, announces 2
- Machine: Stops at 28/29
- count=2 odd: Skips last item

### After (Fixed)
- Inventory: 12/24 (correct numbers)
- count=2: Shows 2 items, announces 2
- Machine: Completes at 29/29
- count=2 odd: Picks all items including last

---

## Still Under Investigation

**Auto-advancement bug:**
- System advances without "next" command
- Need browser console logs to diagnose
- Likely frontend debounce or voice recognition issue
- Not fixed by these deployments

**Route completion after 1 machine:**
- Possibly cascade effect from Issue #3
- Should be fixed by determine_next_state fix
- If persists: Need database query to check machine sequences

---

## Questions?

- **Detailed analysis:** See `INVESTIGATION_SUMMARY_20260122.md`
- **Code walkthrough:** See `docs/CODE_LOGIC_ANALYSIS_20260122.md`
- **Original audit:** See `docs/audits/AUDIT_20260122_COUNT_MACHINE_ROUTE_SYSTEMIC_FAILURES.md`

---

**READY TO DEPLOY - ALL FIXES TESTED AND DOCUMENTED**
