# get_next_item Workflow Testing Checklist

**New Workflow ID:** 3blW1i1poeCelBrI
**Old Workflow ID:** gwmLuqCN37fhQ3Pr
**Status:** NEW WORKFLOW IS INACTIVE - TESTING REQUIRED BEFORE DEPLOYMENT

---

## Pre-Flight Checks

### 1. Verify Edge Function is Deployed

```bash
curl -X POST \
  https://wvtkuposrlvadyeixlke.supabase.co/functions/v1/get-next-item-data \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2dGt1cG9zcmx2YWR5ZWl4bGtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY3MzI3MDUsImV4cCI6MjA4MjMwODcwNX0.C5ramuYlOdexsPc6Q6-19a6PWb1-0jw3IZL_pCnMf9c" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "YOUR_TEST_USER_ID"}'
```

**Expected Response:**
```json
{
  "session": [{ "id": "...", "current_machine_id": "...", ... }],
  "items": [{ "id": "...", "product_name": "...", ... }],
  "machines": [{ "id": "...", "machine_name": "...", ... }]
}
```

**If you get an error:** Edge Function is not deployed. Deploy it first.

---

### 2. Verify You Have an Active Session

Before testing, you need a real active session with data. Here's how to check:

**Option A: Check Supabase directly**

1. Open Supabase dashboard: https://supabase.com/dashboard/project/wvtkuposrlvadyeixlke
2. Go to Table Editor → `sessions`
3. Filter: `status = 'stocking'`
4. Note the `user_id` and `id` of an active session

**Option B: Query via API**

```bash
curl -X GET \
  "https://wvtkuposrlvadyeixlke.supabase.co/rest/v1/sessions?status=eq.stocking&limit=1&select=id,user_id,current_machine_id,current_route_id" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2dGt1cG9zcmx2YWR5ZWl4bGtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY3MzI3MDUsImV4cCI6MjA4MjMwODcwNX0.C5ramuYlOdexsPc6Q6-19a6PWb1-0jw3IZL_pCnMf9c" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2dGt1cG9zcmx2YWR5ZWl4bGtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY3MzI3MDUsImV4cCI6MjA4MjMwODcwNX0.C5ramuYlOdexsPc6Q6-19a6PWb1-0jw3IZL_pCnMf9c"
```

**If you get an empty array:** No active sessions. Start a picking session in the app first.

---

## Testing Steps

### Step 1: Manual Test in n8n UI

1. **Open n8n:** https://visionairy.app.n8n.cloud/
2. **Find the new workflow:**
   - Search for "Stocker Tool: get_next_item (Optimized)"
   - ID: `3blW1i1poeCelBrI`
3. **Open the workflow** (don't activate it yet)
4. **Click "Test Workflow"** (play button in top-right)
5. **The workflow is waiting for webhook trigger...**

---

### Step 2: Trigger the Webhook

**Option A: Using curl**

```bash
curl -X POST \
  https://visionairy.app.n8n.cloud/webhook-test/next-item-optimized \
  -H "Content-Type: application/json" \
  -d '{"user_id": "YOUR_ACTIVE_SESSION_USER_ID"}'
```

Replace `YOUR_ACTIVE_SESSION_USER_ID` with the user_id from Step 2 of Pre-Flight Checks.

**Option B: Using n8n's built-in test**

1. Click on the "Webhook" node
2. Click "Listen for Test Event"
3. Open a new terminal/Postman and send the curl request above
4. n8n will capture the request

---

### Step 3: Verify Each Node Output

In the n8n UI, click on each node to see its output:

#### Node 2: "Call Edge Function"
- **Check:** Response has 3 keys: `session`, `items`, `machines`
- **Check:** `session` is an array with 1 object
- **Check:** `items` is an array with products
- **Check:** `machines` is an array with machines

**Example output:**
```json
{
  "session": [
    {
      "id": "session-uuid",
      "current_machine_id": "machine-uuid",
      "current_item_index": 2,
      "current_route_id": "route-uuid",
      "pick_direction": "forward"
    }
  ],
  "items": [
    { "id": "...", "product_name": "Snickers", "quantity": 5, "sequence": 1, ... }
  ],
  "machines": [
    { "id": "...", "machine_name": "Machine 1", "sequence": 1, ... }
  ]
}
```

---

#### Node 3: "Extract Consolidated Data"
- **Check:** Output has `session`, `items`, `machines` as properties
- **Check:** `session` is an OBJECT (not array) - it's been extracted
- **Check:** `items` is an array
- **Check:** `machines` is an array

**Example output:**
```json
{
  "session": {
    "id": "session-uuid",
    "current_machine_id": "machine-uuid",
    "current_item_index": 2,
    "current_route_id": "route-uuid",
    "pick_direction": "forward"
  },
  "items": [...],
  "machines": [...]
}
```

---

#### Node 4: "Determine Next State"
- **Check:** Output has `action` field
- **Check:** `action` is one of: `next_item`, `next_machine`, `complete`
- **Check:** If `next_item`, check `product_name`, `quantity`, `slot` are present
- **Check:** If `next_machine`, check `next_machine_name`, `next_location` are present

**Example output (next_item):**
```json
{
  "action": "next_item",
  "product_name": "Snickers Bar 1.86oz",
  "quantity": 5,
  "slot": "12",
  "machine_name": "Breakroom Machine",
  "inventory_current": 10,
  "inventory_parlevel": 20,
  "items_remaining": 15,
  "new_item_index": 3,
  "new_machine_id": "machine-uuid",
  "new_route_id": "route-uuid",
  "session_record_id": "session-uuid",
  "machine_complete": false,
  "route_complete": false,
  "session_complete": false
}
```

---

#### Node 5: "Switch Action"
- **Check:** Only ONE output path is taken (next_machine, next_item, or complete)
- **Check:** Data flows to correct branch

---

#### Node 9: "Format Output"
- **Check:** Output has `spoken` field
- **Check:** `spoken` contains the voice response (e.g., "5 Snickers 1.86 ounce")
- **Check:** NO slot number in `spoken` field
- **Check:** `product_parsed` object exists with `name`, `size`, `type`

**Example output:**
```json
{
  "action": "next_item",
  "product_name": "Snickers Bar 1.86oz",
  "quantity": 5,
  "slot": "12",
  "slot_spoken": "slot 12",
  "machine_name": "Breakroom Machine",
  "inventory_current": 10,
  "inventory_parlevel": 20,
  "items_remaining": 15,
  "spoken": "5 Snickers 1.86 ounce",
  "product_parsed": {
    "name": "Snickers",
    "size": "1.86oz",
    "type": "Bar"
  },
  "machine_complete": false,
  "route_complete": false,
  "session_complete": false
}
```

---

### Step 4: Compare with Old Workflow

Now run the OLD workflow with the SAME user_id to verify outputs match.

1. **Find old workflow:** ID `gwmLuqCN37fhQ3Pr`
2. **Click "Test Workflow"**
3. **Trigger with same data:**
   ```bash
   curl -X POST \
     https://visionairy.app.n8n.cloud/webhook-test/next-item \
     -H "Content-Type: application/json" \
     -d '{"user_id": "SAME_USER_ID_AS_BEFORE"}'
   ```

4. **Compare final outputs:**

| Field | Old Workflow | New Workflow | Match? |
|-------|--------------|--------------|--------|
| `action` | __________ | __________ | ☐ |
| `product_name` | __________ | __________ | ☐ |
| `quantity` | __________ | __________ | ☐ |
| `slot` | __________ | __________ | ☐ |
| `machine_name` | __________ | __________ | ☐ |
| `spoken` | __________ | __________ | ☐ |
| `items_remaining` | __________ | __________ | ☐ |
| `new_item_index` | __________ | __________ | ☐ |

**All fields should match EXACTLY.**

---

### Step 5: Test Edge Cases

Test these scenarios to ensure robustness:

#### Test Case 1: First Item in Machine
- **Setup:** Start a new machine (current_item_index = 0)
- **Expected:** Returns first item (sequence = 1)

#### Test Case 2: Last Item in Machine
- **Setup:** At last item (current_item_index = total_items)
- **Expected:** `action = "next_machine"`, not `next_item`

#### Test Case 3: Reverse Direction
- **Setup:** Set `pick_direction = "reverse"` in session
- **Expected:** Returns previous item (sequence decreases)

#### Test Case 4: No Active Session
- **Setup:** Use a user_id with no active session
- **Expected:** Workflow should handle gracefully (error or empty response)

#### Test Case 5: Route Complete
- **Setup:** At last item of last machine
- **Expected:** `action = "complete"`

---

## Success Criteria

Before deploying, ALL of these must be TRUE:

- [ ] Edge Function returns correct data structure
- [ ] Extract Consolidated Data splits response correctly
- [ ] Determine Next State logic works identically to old workflow
- [ ] Format Output generates correct `spoken` field
- [ ] Output matches old workflow exactly (same inputs)
- [ ] No errors in n8n execution logs
- [ ] All 5 edge cases pass
- [ ] Latency is equal or better than old workflow

---

## If Tests PASS

1. **Document results:**
   - Save n8n execution logs (screenshot or export)
   - Note any warnings or anomalies
   - Confirm latency improvement

2. **Prepare for deployment:**
   - Keep old workflow ACTIVE
   - Activate new workflow
   - Update frontend to use new webhook path (next-item-optimized)
   - Monitor for 24-48 hours before deactivating old workflow

3. **Update MEMORY.md:**
   - New workflow ID: 3blW1i1poeCelBrI
   - Status: ACTIVE
   - Performance: X% faster than old workflow
   - Deployment date

---

## If Tests FAIL

1. **Document failure:**
   - Which node failed?
   - What was the error message?
   - What was the input data?
   - How does output differ from old workflow?

2. **Diagnose:**
   - Check Edge Function logs in Supabase
   - Check data extraction logic in "Extract Consolidated Data"
   - Compare with old workflow node-by-node

3. **Fix and re-test:**
   - Update workflow code
   - Re-run all tests
   - Verify fix doesn't break other cases

4. **DO NOT DEPLOY until all tests pass.**

---

## Rollback Plan

If deployed and issues arise:

1. **Immediate:**
   - Deactivate new workflow (3blW1i1poeCelBrI)
   - Verify old workflow is active (gwmLuqCN37fhQ3Pr)
   - Revert frontend to old webhook path (next-item)

2. **Investigate:**
   - Check n8n execution logs for errors
   - Check Edge Function logs
   - Identify mismatch

3. **Fix and re-deploy:**
   - Only after full testing suite passes again

---

## Contact Info

**n8n Dashboard:** https://visionairy.app.n8n.cloud/
**Supabase Dashboard:** https://supabase.com/dashboard/project/wvtkuposrlvadyeixlke
**Frontend:** https://my-stocker-ai.com

---

**REMEMBER: DO NOT ACTIVATE NEW WORKFLOW UNTIL ALL TESTS PASS!**
