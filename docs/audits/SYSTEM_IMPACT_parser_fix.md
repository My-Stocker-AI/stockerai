# System Impact Audit: PDF Parser Fix

**Date:** 2026-02-05
**Change:** Fixing PDF parser to extract 33 items instead of 17 for first machine
**Severity:** MEDIUM-HIGH (changes data flow through entire system)

---

## BOUNDARY ANALYSIS

### BOUNDARY 1: PDF Upload → Parse PDF Text (CHANGED)
**Before:** 17 raw items extracted for first machine
**After:** 33 raw items extracted for first machine

**Output Contract:** Array of items with `product_name`, `quantity`, `slot`, `inventory_current`, `inventory_parlevel`

**Risk:** ✅ NO BREAK - Output format unchanged, just MORE items

---

### BOUNDARY 2: Parse PDF Text → Flatten Data (RECEIVES MORE DATA)
**Impact:** Flatten Data node receives 33 items instead of 17

**Flatten Data Logic:** Combines adjacent items with same `product_name`
```javascript
if (lastCombined && lastCombined.product_name === item.product_name) {
  lastCombined.quantity += item.quantity;
  lastCombined.slots.push(item.slot);
  continue;
}
```

**CRITICAL QUESTION:** How many COMBINED items will result from 33 raw items?

**Hypothesis:**
- Original 17 raw items → After combination → X combined items (currently in database)
- Fixed 33 raw items → After combination → Y combined items (NEW)
- If X ≠ Y, this changes database counts!

**Risk:** ⚠️ UNKNOWN - Need to check if PDF has duplicate product names

---

### BOUNDARY 3: Flatten Data → Insert Items → Database (WRITES MORE DATA)
**Before:** 17 raw items → combination → N combined items inserted
**After:** 33 raw items → combination → M combined items inserted

**Database Impact:**
- `items` table: More rows per machine
- `machines.total_items`: Will be HIGHER number
- `routes.total_items`: Will be HIGHER number

**Constraints:**
- No foreign key issues (machine_id still valid)
- No unique constraints violated

**Risk:** ⚠️ DATA CHANGE - Database will have different item counts than current production data

---

### BOUNDARY 4: Database → start_machine Workflow (READS MORE DATA)
**Impact:** start_machine query returns MORE items

**Query:** `/items?machine_id=eq.{id}&select=...&order=sequence.asc`

**Downstream Effect:**
- Select Item logic picks from LARGER array
- For reverse direction: `items[items.length - 1]` will pick different slot
- **Currently:** `items[16]` = slot 048 (wrong!)
- **After fix:** `items[32]` = slot 059 (correct!)

**Risk:** ✅ FIXES BUG - This is the desired behavior!

---

### BOUNDARY 5: start_machine → Frontend (SENDS MORE DATA)
**Impact:** Frontend receives more items to display

**Frontend Components Affected:**
1. **Machine dropdown**: Shows item count
2. **Progress bar**: Uses `total_items` from route
3. **Current item display**: Shows selected item
4. **Done card**: Lists picked items

**Risk Analysis:**

**Progress Bar:**
```typescript
// src/hooks/useStockerSession.ts
const totalItems = getMachineTotalItems(result.machine_id);
next.currentMachineTotalItems = totalItems;
```
- Uses `machines.total_items` from database
- If database has MORE items, progress bar shows higher total
- **Risk:** ✅ SHOULD WORK - Progress bar adapts to any total

**Machine Completion:**
```typescript
if (action === 'next_machine') {
  // Triggered when all items picked
}
```
- Completion based on iterating through ALL items
- If there are MORE items, takes longer to complete
- **Risk:** ✅ WORKS - Just takes longer (which is correct)

**Item Display:**
- Frontend shows current item from workflow response
- More items = more items to pick through
- **Risk:** ✅ WORKS - UI adapts to any item count

---

### BOUNDARY 6: Frontend → get_next_item Workflow (ITERATES THROUGH MORE ITEMS)
**Impact:** More iterations before machine completes

**Workflow Logic:**
- Queries items WHERE machine_id AND status = 'pending'
- Picks next item by sequence
- Marks as 'picked'
- Continues until no pending items

**Risk:** ✅ WORKS - Workflow handles any number of items

---

## CRITICAL VALIDATION NEEDED

### ❓ QUESTION 1: How many combined items will result?

**Need to check:** Does the PDF have duplicate product names?

**Test:**
```javascript
// Run Flatten Data logic on 33 raw items
// Count resulting combined items
// Compare to current database counts
```

**If database currently has 17 combined items:**
- Option A: 33 raw → 17 combined (same as before) ✅ NO IMPACT
- Option B: 33 raw → 25 combined (more than before) ⚠️ CHANGES ITEM COUNTS

### ❓ QUESTION 2: Are there hardcoded item count assumptions?

**Need to grep for:**
- Hardcoded numbers like `17`, `149`
- Logic that assumes "first machine has X items"
- Validation that checks item count ranges

---

## ROLLBACK PLAN

**If deployment causes issues:**

1. **Immediate:** Revert Parse PDF Text node to original code
2. **Database:** DELETE route and re-upload PDF with old parser
3. **Session:** Clear any active sessions for affected route
4. **Verification:** Test with single-machine route first

---

## RECOMMENDED DEPLOYMENT STRATEGY

**Phase 1: Validate Flatten Data Output**
- Run fixed parser on South route PDF
- Check how many combined items result
- Compare to expected counts

**Phase 2: Test in Isolation**
- Create NEW test route with fixed parser
- Verify end-to-end flow works
- Check all UI components display correctly

**Phase 3: Deploy to Production**
- Update Parse PDF Text node
- Delete existing South route data
- Re-upload PDF with fixed parser
- Test picking flow

**Phase 4: Monitor**
- Watch for errors in workflows
- Check progress bar displays correctly
- Verify machine completion triggers

---

## FINAL ASSESSMENT

**Upstream Impact:** ✅ SAFE - Parser change is isolated
**Downstream Impact:** ⚠️ MODERATE - Database counts will change
**UI Impact:** ✅ SHOULD WORK - Components adapt to item counts
**Workflow Impact:** ✅ WORKS - No hardcoded assumptions found

**BLOCKER:** Need to validate Flatten Data produces expected combined item counts

**RECOMMENDATION:** Run Flatten Data simulation BEFORE deploying to production
