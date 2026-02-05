# System Impact Analysis: South Route Item Filtering Bug

**Date:** 2026-02-04
**Severity:** CRITICAL - Production data loss, workflow broken
**Reporter:** Davy Dupon
**Route:** South (UUID: 7c5dcee7-ac56-4797-8331-dde8087c0514)

---

## INCIDENT SUMMARY

**Expected Behavior:**
- PDF Upload: 8 machines, ~240 items total
- First machine (SH Regional Lab): ~40 items from slots 010-059
- Picking direction "reverse" (bottom-up): Should start at slot 059

**Actual Behavior:**
- PDF Upload: 149 items created successfully ✅
- First machine returned: Only 17 items ❌
- Starting slot: 048 instead of 059 ❌
- Second machine: Only 21 items, also started at 048 ❌

**Impact:**
- 60% of items missing from machine view
- Wrong starting position (jumped 10+ items)
- Fatal flaw for production use

---

## DATA FLOW BOUNDARIES

### BOUNDARY 1: PDF Upload → Database (✅ WORKING)

**Evidence:**
- Execution 29151: PDF Upload workflow
- Route created with 149 total items
- Route table confirms: `total_items: 149`
- **Status: SUCCESS** - Data was persisted correctly

### BOUNDARY 2: Database → start_machine Get Items Query (❌ BROKEN)

**Evidence from Execution 29160:**
```
Route: 7c5dcee7-ac56-4797-8331-dde8087c0514
Machine: SH - Regional Lab
Direction: reverse
Get Items Output: 17 items (should be ~40)
Selected Item: slot 048 (should be 059)
```

**Evidence from Execution 29165:**
```
Route: 7c5dcee7-ac56-4797-8331-dde8087c0514
Machine: SH - B5 Dual
Direction: reverse
Get Items Output: 21 items (should be ~40)
Selected Item: slot 048 (should be bottom slot)
```

**Pattern:** Consistent 40-60% data loss across machines

### BOUNDARY 3: Select Item Logic (❌ BROKEN)

**Evidence:**
- Both executions started at slot 048
- Direction was "reverse" (should pick from bottom)
- PDF shows slot 059 as last item for first machine
- Logic consistently picks 048 regardless of machine

---

## ROOT CAUSE HYPOTHESES

### Hypothesis 1: Get Items Query Has WHERE Filter

**Likely causes:**
1. Status filter excluding "pending" items
2. Incorrect machine_id join/filter
3. Quantity > 0 filter removing items
4. Date/time range filter

**Test:** Check Get Items node query for WHERE clauses

### Hypothesis 2: Get Items Query Missing ORDER BY or LIMIT

**Likely causes:**
1. Missing ORDER BY slot_number → returns arbitrary subset
2. LIMIT 20 hardcoded → caps results
3. Pagination logic only returning first page

**Test:** Check for LIMIT clause in query

### Hypothesis 3: Select Item Logic Hardcoded to slot 048

**Likely causes:**
1. Logic ignores direction parameter
2. Hardcoded fallback to slot 048
3. Sorting logic inverted (picks first instead of last)
4. Slot comparison logic broken (string vs number)

**Test:** Check Select Item code node logic

### Hypothesis 4: Items Never Inserted (Filtered During Upload)

**Countered by evidence:**
- Route table shows `total_items: 149` ✅
- User confirmed "Davy specifically said there were 149 items" ✅
- This hypothesis is DISPROVEN

---

## INVESTIGATION REQUIRED

### Step 1: Examine Get Items Node Query

**Location:** Workflow JbKdJuKgGbyvzlF0 (start_machine)

**Need to check:**
```sql
-- What's the actual query?
SELECT * FROM items
WHERE machine_id = ?
  AND status = ?  -- <-- Could be filtering out items
  AND quantity_to_add > 0  -- <-- Could be removing items
ORDER BY slot_number  -- <-- Is this present?
LIMIT 20  -- <-- Is there a limit?
```

### Step 2: Examine Select Item Node Logic

**Location:** Workflow JbKdJuKgGbyvzlF0 (start_machine)

**Need to check:**
```javascript
// What's the selection logic?
if (direction === 'reverse') {
  // Should select LAST item (highest slot number)
  selectedItem = items[items.length - 1];  // Correct
  // OR
  selectedItem = items[0];  // Wrong - picks first
}
```

### Step 3: Verify Database State

**Query to run:**
```sql
-- Get first machine items
SELECT machine_id, COUNT(*) as item_count
FROM items
WHERE route_id = '7c5dcee7-ac56-4797-8331-dde8087c0514'
GROUP BY machine_id;

-- Get first machine slot details
SELECT slot_number, product_name, status, quantity_to_add
FROM items
WHERE machine_id = 'ce73897a-759e-4c75-bfc7-59b7dc282976'
ORDER BY slot_number;
```

---

## AFFECTED SYSTEMS

### Upstream (before Get Items)
- ✅ PDF Upload workflow - Working correctly
- ✅ Database insertion - All 149 items persisted
- ✅ Route metadata - Correct machine count and item totals

### This System (start_machine workflow)
- ❌ Get Items node - Returning partial results
- ❌ Select Item node - Choosing wrong starting slot
- ✅ Format Output - Works correctly with whatever it receives

### Downstream (after Select Item)
- ⚠️ Frontend display - Shows incomplete item list
- ⚠️ get_next_item workflow - Will skip items
- ⚠️ Machine completion logic - May complete prematurely
- ⚠️ Route completion - Will report incorrect totals

---

## NEXT ACTIONS

1. **Extract Get Items query from workflow JbKdJuKgGbyvzlF0**
2. **Extract Select Item logic from workflow JbKdJuKgGbyvzlF0**
3. **Query live database** to confirm all 40+ items exist for first machine
4. **Compare** query results vs execution results vs database state
5. **Identify** exact WHERE clause or logic error causing filtering
6. **Fix** and deploy corrected workflow
7. **Test** with South route to verify all 40 items appear and start at 059

---

## SYSTEMIC IMPLICATIONS

**If this is a query filter bug:**
- ALL routes affected (not just South)
- Data loss on every machine
- May explain other "items missing" reports

**If this is a Select Item bug:**
- Wrong starting position on ALL routes
- Affects both forward and reverse picking
- May cause items to be skipped permanently

**Production Impact:**
- Route drivers cannot complete routes accurately
- Inventory counts will be incorrect
- System cannot be trusted for production use

**User Trust Impact:**
- "Fatal flaw and far from the bulletproof we have to have"
- Requires immediate fix before further deployment

---

## ROOT CAUSE ANALYSIS - COMPLETE

### Investigation Results (using Synta MCP)

**PDF Upload Workflow (7kO6o1wASKvbhc2U):**
- Prepare Items node creates items with: `product_name`, `quantity`, `slot`, `sequence`, `status`, `inventory_current`, `inventory_parlevel`
- Inserts to `/items` table via Supabase REST API
- Sets `sequence: i + 1` for each item (1-indexed)
- Route total_items: 149 ✅ (user confirmed)

**start_machine Workflow (JbKdJuKgGbyvzlF0):**
- Get Items node query:
  ```
  /items?machine_id=eq.{{ machine_id }}
  &select=id,product_name,quantity,slot,sequence,inventory_current,inventory_parlevel
  &order=sequence.asc
  ```
- NO filters (no LIMIT, no WHERE status, no pagination)
- Should return ALL items for machine
- **ACTUALLY RETURNS:** 17 items (exec 29160), 21 items (exec 29165) ❌

- Select Item node logic (CORRECT):
  ```javascript
  if (pick_direction === 'reverse') {
    selectedItem = items[items.length - 1];  // Picks LAST item in array
  }
  ```
- With only 17 items returned, `items[16]` is NOT the bottom slot
- Logic is correct but receives incomplete data ❌

### SYSTEMIC ROOT CAUSE

**Query returns partial data - likely causes:**

1. **RLS Policy Filtering (CRITICAL - HIGH PROBABILITY)**
   - CLAUDE.md documents: "No Row Level Security (RLS)" on items table
   - But table may have IMPLICIT RLS from Supabase defaults
   - RLS can silently filter results based on auth context
   - **Test:** Query items table directly with SERVICE_ROLE_KEY

2. **HTTP Request Node Result Truncation (MEDIUM PROBABILITY)**
   - n8n HTTP Request node may have default item limit
   - Check node settings for `limit` or `maxResults` parameter
   - Supabase REST API defaults to 1000 rows (should be sufficient)

3. **Sequence NULL Values (LOW PROBABILITY)**
   - Items exist but have NULL sequence
   - Query `ORDER BY sequence.asc` may skip NULLs
   - **Test:** Query items without ORDER BY clause

4. **Wrong machine_id in Query (UNLIKELY)**
   - Extract Session provides correct machine_id from session table
   - But worth verifying execution data shows correct UUID

---

## THE FIX

### Option 1: Disable RLS on items Table (IMMEDIATE FIX)

```sql
-- In Supabase SQL Editor
ALTER TABLE items DISABLE ROW LEVEL SECURITY;
```

**Pros:** Immediate fix, no code changes
**Cons:** Security risk if multi-tenant (CLAUDE.md says single-tenant only currently)

### Option 2: Add Explicit RLS Policy for Service Access

```sql
-- Allow service role full access
CREATE POLICY "Service role full access" ON items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Pros:** Secure, allows workflows to access all items
**Cons:** Requires RLS understanding, must test thoroughly

### Option 3: Use Edge Function Instead of HTTP Request

Create Supabase Edge Function that bypasses RLS:
```typescript
// supabase/functions/get-machine-items/index.ts
import { createClient } from '@supabase/supabase-js'

Deno.serve(async (req) => {
  const { machine_id } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // Bypasses RLS
  )

  const { data, error } = await supabase
    .from('items')
    .select('id,product_name,quantity,slot,sequence,inventory_current,inventory_parlevel')
    .eq('machine_id', machine_id)
    .order('sequence', { ascending: true })

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

**Pros:** Most secure, explicit service role usage
**Cons:** Requires deployment, more complex

---

## RECOMMENDED ACTION

**STEP 1: Verify RLS is the cause**
```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'items';

-- Check existing policies
SELECT * FROM pg_policies WHERE tablename = 'items';

-- Test query with RLS disabled context
SET ROLE service_role;
SELECT COUNT(*) FROM items WHERE machine_id = 'ce73897a-759e-4c75-bfc7-59b7dc282976';
```

**STEP 2: Apply appropriate fix**
- If RLS is OFF and count is correct → investigate n8n HTTP Request limits
- If RLS is ON and blocking → Apply Option 1 (disable) or Option 2 (policy)
- If neither RLS nor HTTP limits → investigate sequence NULL values

**STEP 3: Test with South route**
- Re-run start_machine for first machine
- Verify all 40+ items returned
- Verify slot 059 selected as starting point for reverse direction

---

## ROOT CAUSE CONFIRMED - PDF PARSER BUG

**Date:** 2026-02-05
**Investigation Method:** Synta MCP workflow analysis + execution data analysis

### THE SMOKING GUN

**Analyzed execution 29151 (Prepare Items node output):**
- Total items created: **149** ✅
- First machine items: **17** ❌ (should be ~40 per PDF)
- First machine slots: 010, 012, 014, 016, 018, 022, 024, 026, 029, 031, 032, 033, 035, 037, 038, 039, 048

**PDF shows first machine (Asset 54 - SH Regional Lab) should have:**
- Slots 010-059 (~40 items)
- Last item: slot 059 "Coke Bottle 20 oz"

**Prepare Items created:**
- Slots ending at 048 (17 items only)
- Missing slots: 049-059 (~23 items dropped)

### ROOT CAUSE

**The PDF parser (Parse PDF Text node) is dropping items during extraction.**

**Evidence:**
1. Database has EXACTLY what Prepare Items created (all 149 items inserted successfully)
2. Prepare Items only created 17 items for first machine
3. PDF shows ~40 items for first machine
4. **The bug is NOT in:**
   - RLS (all items inserted successfully)
   - Bulk insert limits (all 149 items inserted at same microsecond)
   - Item combination logic (happens AFTER parsing)
5. **The bug IS in:**
   - Parse PDF Text node regex pattern failing to match certain item rows
   - Or validation logic rejecting valid items

### CRITICAL FINDING

Looking at the Parse PDF Text node code (line 70):

```javascript
var itemRowPattern = /^\s*(0?\d{1,3}|[A-Z]\d{1,2}|Drink Cooler[\d-]+|Fresh Food[\d-]+|Snack Rack[\s-]*(?:Small)?[\d-]+)\s+(.+)\s+(\d+)\s+(\d+)\s*\/\s*(\d+)\s+([\d.]+)\s+None\s*$/;
```

**This regex requires:**
- Slot number at start
- Product name in middle
- Pattern ending with: `{qty} {current}/{parlevel} {price} None`
- **MUST end with "None"** ← This is the likely killer

**If PDF has ANY formatting variation on the "None" column, items get dropped.**

**Validation logic (line 82-87):**
```javascript
if (/[a-zA-Z]/.test(productName) &&
    quantity > 0 &&
    productName.length > 2 &&
    productName.length < 150) {
```

**This could reject items if:**
- Product name extraction bleeds into adjacent columns (too long)
- Whitespace issues cause length validation to fail
- Regex capture groups misalign and put numbers into productName

### THE FIX

**Need to:**
1. Get the ACTUAL PDF text for first machine section (slots 010-059)
2. Compare regex matches vs expected items
3. Identify which items fail to match and WHY
4. Fix regex pattern or validation logic
5. Test with South route PDF to confirm all ~40 items parse

**This is NOT a "fix and hope" situation - need to see the actual text that's failing to match.**

---

## ACTUAL PDF TEXT ANALYSIS (2026-02-05)

**Extracted PDF text from execution 29151 for first machine:**

**Items that WERE parsed (slots 010-048):**
```
010 Fritos Original LSS 2 oz 3 6 / 9 1.50 None
012 Sun Chips Harvest Cheddar 1.5 oz 9 0 / 9 1.50 None
...
048 Premier Protein Shake Chocolate 11 oz 2 6 / 8 3.00 None
```
Format: `{SLOT} {PRODUCT} {QTY} {CURRENT} / {PARLEVEL} {PRICE} None` (SINGLE LINE)

**Items that were DROPPED (slots 049-059):**
```
049
Red Bull Sugar Free Can 8.4 oz - Can
6 2 / 8 2.75 None

050
Coke Bottle 20 oz - Bottle
4 2 / 6 2.00 None

053
Diet Pepsi Bottle 20 oz - Bottle
6 0 / 6 2.00 None
```
Format: Slot number on LINE 1, product name on LINE 2, data on LINE 3 (MULTI-LINE)

**ROOT CAUSE:**

The regex pattern expects SINGLE-LINE format:
```javascript
var itemRowPattern = /^\s*(SLOT)\s+(PRODUCT)\s+(QTY)\s+(CURRENT)\s*\/\s*(PARLEVEL)\s+(PRICE)\s+None\s*$/;
```

But PDF has TWO formats:
1. Single-line (slots 010-048): ✅ MATCHED
2. Multi-line (slots 049-059): ❌ NOT MATCHED

**THE FIX:**

Need state machine parser that handles both formats:
- Detect standalone slot number line
- Capture product name (may span multiple lines)
- Match final data line with qty/inventory/price/None
- Combine slot + product + data into single item

Fixed parser code saved to: `/tmp/parse_pdf_text_FIXED.js`

---

**STATUS:** Root cause diagnosed - multi-line item format not handled. Fix created, awaiting Ralph loop validation per user request.
