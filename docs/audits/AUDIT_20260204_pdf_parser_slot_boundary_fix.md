# System Impact Audit: PDF Parser Slot Boundary Fix

**Date:** 2026-02-04
**Change:** Fix PDF parser to use line-based parsing instead of normalized text
**Severity:** CRITICAL
**Execution:** 29015 (2026-02-04 03:45:30)

---

## Problem Statement

User (Davey) uploaded route PDF via mobile (iPhone), execution 29015 succeeded, but 23 items were inserted with malformed names:

**Examples of corrupted data:**
- Slot 2: "19 / 24 0.25 None 3 Crush Orange Can 12 oz - Can" (should be "Diet Pepsi Can 12 oz - Can")
- Slot 6: "/ 24 0.25 None 6 A&W Root Beer Can 12 oz - Can" (partial corruption)
- Slot 9: "10 14 / 24 0.25 None 7 Dr. Pepper Can 12 oz - Can" (includes next slot data)
- Slot 11: "12 oz - Can" (severely truncated)
- Slot 12: "oz - Can" (severely truncated)

**Impact:** User cannot use voice commands to pick items because product names are unintelligible.

---

## Root Cause Analysis

### Boundary Discovery

**DATA:**
- Input: PDF text (extracted via n8n extractFromFile node)
- Processing: Text normalization (`replace(/\n/g, ' ').replace(/\s+/g, ' ')`)
- Slot detection: Regex patterns to find slot numbers in normalized text
- Content extraction: `substring(slotStartIndex, nextSlotIndex)`

**NODES:**
1. Extract PDF Text (n8n extractFromFile)
2. Parse PDF Text (JavaScript Code node) ← **FAILURE HERE**
3. Flatten Data
4. Prepare Items
5. Insert Items (Supabase)

**FLOW:**
```
PDF → Extract Text → Normalize whitespace → Find slots via regex →
Extract slotContent → Parse patterns A/B/C → Insert into DB
```

**ERRORS:**
- Slot boundary regex (`nextSlotPattern`) fails to find next slot correctly
- When `nextSlotMatch` is null, `nextSlotIndex` defaults to `content.length`
- This causes `slotContent` to include data from multiple adjacent rows
- Pattern C matches partial data and stores malformed `afterNone` as product name

### Specific Failure Case

**PDF row for slot 5:**
```
5   Diet Pepsi Can 12 oz - Can   18   6 / 24   0.25   None
```

**After normalization:**
```
5 Diet Pepsi Can 12 oz - Can 18 6 / 24 0.25 None 6 A&W Root Beer...
```

**Slot detection:**
- Slot 5 pattern matches at position X
- Next slot pattern (slot 6) FAILS to match
- `nextSlotIndex` = content.length (end of entire machine section)
- `slotContent` = "Diet Pepsi Can 12 oz - Can 18 6 / 24 0.25 None 6 A&W Root Beer Can..."

**Pattern C execution:**
- `noneIndex` = finds first "None"
- `beforeNone` = "Diet Pepsi Can 12 oz - Can 18 6 / 24 0.25"
- `afterNone` = "6 A&W Root Beer Can 12 oz - Can 10 14 / 24 0.25" (WRONG!)
- `numbersMatch` fails because "Diet Pepsi..." doesn't match `^\d+ \d+ / \d+`
- Pattern C skips this item
- But somehow database shows slot 5 with wrong data

**Actual issue:** The regex patterns are partially matching, extracting substrings incorrectly.

---

## Solution: Line-Based Parsing

### Approach

**OLD (BROKEN):**
1. Normalize entire section text (remove newlines, collapse whitespace)
2. Find slots via regex in normalized text
3. Extract substring between slots
4. Try patterns A/B/C to parse

**NEW (FIXED):**
1. Split section into lines BEFORE normalization
2. For each line, use single regex pattern that matches entire row structure:
   ```
   SLOT   PRODUCT_NAME   QTY   CURRENT / PARLEVEL   PRICE   None
   ```
3. Extract all fields from single match (no substring extraction)
4. Validate and insert

### Pattern

```javascript
var itemRowPattern = /^\s*(0?\d{1,3}|[A-Z]\d{1,2}|Drink Cooler[\d-]+|Fresh Food[\d-]+|Snack Rack[\s-]*(?:Small)?[\d-]+)\s+(.+)\s+(\d+)\s+(\d+)\s*\/\s*(\d+)\s+([\d.]+)\s+None\s*$/;
```

**Capture groups:**
1. Slot number
2. Product name (everything between slot and quantity)
3. Quantity
4. Inventory current
5. Inventory parlevel
6. Price

### Benefits

1. ✅ Line structure preserved - no cross-row contamination
2. ✅ Single pattern - no complex fallback logic
3. ✅ All fields captured in one match - no substring errors
4. ✅ Validation built-in - regex must match entire line structure

---

## Impact Analysis

### Upstream (Callers)

**Who calls PDF Upload:**
- Frontend: UploadRouteForm.tsx (user uploads PDF)

**What they expect:**
- HTTP 200 response with `{ success: true, machines: N, items: M }`
- Items inserted into database with correct product names

**Impact:** ✅ No changes to upstream contract - response format unchanged

### Downstream (Callees)

**What PDF Upload calls:**
- Supabase Insert Items endpoint
- Expects: `{ product_name: string, quantity: number, slot: string, ... }`

**Impact:** ✅ No changes to downstream contract - still sends same fields

**What uses the inserted data:**
- `start_machine` workflow - reads items from database
- `get_next_item` workflow - reads items from database
- Frontend: StockerApp displays item names via voice + UI

**Impact:**
- ✅ POSITIVE - Product names now correct, voice commands work
- ⚠️ EXISTING DATA - User's current route (execution 29015) has corrupted data

### Side Effects

1. **Database:** Existing routes with corrupted names remain corrupted
2. **User Experience:** User must re-upload PDF to get correct data
3. **Workflow:** No changes to n8n workflow structure, just code replacement

### Error Propagation

**If parsing fails:**
- Old: Partial matches store malformed data ❌
- New: Line doesn't match pattern → skipped (item count lower but no corruption) ✅

**Logging:**
- Added console.log for skipped items with reason
- Added warning if 0 items parsed from non-empty section
- Added sample line output for debugging

---

## Required Changes

### Files to Modify

**1. n8n Workflow: PDF Upload (ID: 7kO6o1wASKvbhc2U)**
- Node: "Parse PDF Text"
- Action: Replace JavaScript code with new parsing logic
- File: `/home/visionairy/StockerAI/workflows/fixes/PARSE_PDF_TEXT_SLOT_BOUNDARY_FIX.js`

### Database Cleanup

**Option 1: Delete corrupted route**
```sql
DELETE FROM routes
WHERE id IN (
  SELECT id FROM routes
  WHERE route_name = 'North'
  AND delivery_date = '2026-02-03'
  AND created_at > '2026-02-04 03:00:00'
);
```

**Option 2: User re-uploads PDF**
- Workflow has "Delete Existing Route" node
- Re-upload will automatically delete old route and insert new one

**Recommendation:** Ask user to re-upload PDF after fix is deployed

---

## Testing Plan

### Validation Steps

1. **Deploy fix to n8n workflow**
   - Copy code from PARSE_PDF_TEXT_SLOT_BOUNDARY_FIX.js
   - Paste into "Parse PDF Text" node
   - Save workflow

2. **Test with sample PDF**
   - Use the same PDF user uploaded (saved at Pics/365ffef8...pdf)
   - Upload via frontend
   - Check n8n execution logs for warnings

3. **Verify database**
   ```sql
   SELECT slot, product_name, quantity
   FROM items
   WHERE machine_id IN (
     SELECT id FROM machines
     WHERE route_id = (
       SELECT id FROM routes
       WHERE route_name = 'North'
       AND delivery_date = '2026-02-03'
       ORDER BY created_at DESC
       LIMIT 1
     )
   )
   ORDER BY sequence
   LIMIT 20;
   ```

4. **Expected results**
   - Slot 1: "Pepsi Can 12 oz - Can" ✅
   - Slot 5: "Diet Pepsi Can 12 oz - Can" ✅ (not "Crush Orange")
   - Slot 7: "Dr. Pepper Can 12 oz - Can" ✅
   - Slot 11: "Sprite Can 12 oz - Can" ✅ (not "12 oz - Can")
   - No items with "/" or "None" in product name ✅

5. **Voice command test**
   - Start route
   - Verify AI can correctly speak item names
   - Verify user can say "next" and get correct items

---

## Rollback Plan

**If fix fails:**

1. **Revert n8n code node**
   - Find previous version in n8n version history
   - Or use original code from workflow export

2. **Original code location**
   - Stored in n8n workflow history
   - Can also retrieve via `n8n_get_workflow` MCP tool

3. **No database rollback needed**
   - Fix only affects NEW uploads
   - Existing data remains unchanged

---

## Risk Assessment

**Severity:** CRITICAL
**Probability:** HIGH (user testing confirms issue)
**Blast Radius:** All PDF uploads
**Rollback Difficulty:** EASY (code-only change, no schema)

**Mitigation:**
- Test with exact same PDF user uploaded
- Compare output item count (should be same or higher, not lower)
- Check for any items with "None" or "/" in product_name (indicates parsing failure)

---

## Deployment Checklist

- [ ] Code review: Verify regex pattern matches PDF structure
- [ ] Deploy to n8n: Replace Parse PDF Text node code
- [ ] Test with user's PDF: Upload Pics/365ffef8...pdf
- [ ] Verify item count: Should be ~100-120 items total (check execution summary)
- [ ] Verify item names: Spot-check first 20 items for correctness
- [ ] User re-upload: Ask Davey to re-upload PDF to get clean data
- [ ] Monitor: Check next 3 PDF uploads for any parsing warnings

---

## Lessons Learned

1. **Text normalization breaks structure** - Removing newlines made slot boundaries ambiguous
2. **Regex boundary detection is fragile** - Finding "next slot" in normalized text failed
3. **Line-based parsing is robust** - Each line is self-contained, no cross-contamination
4. **Validation is critical** - Should have caught malformed names before database insert
5. **Logging is essential** - Need to log parsing failures for debugging

---

**Audit complete. Ready for deployment.**
