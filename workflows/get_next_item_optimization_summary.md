# get_next_item Workflow Optimization Summary

**Date:** 2026-01-11
**Original Workflow ID:** gwmLuqCN37fhQ3Pr
**New Workflow ID:** 3blW1i1poeCelBrI
**Status:** Created (INACTIVE) - Ready for testing

---

## Optimization Goal

Replace 3 separate HTTP queries to Supabase with 1 Edge Function call to reduce latency and improve performance.

---

## Architecture Changes

### OLD WORKFLOW (12 nodes, 3 HTTP queries)

```
1. Webhook
2. Get Session (HTTP to Supabase REST API)
3. Extract Session (Code)
4. Get Items In Machine (HTTP to Supabase REST API)
5. Get Machines In Route (HTTP to Supabase REST API)
6. Merge Query Results (Merge node - combines 3 parallel queries)
7. Determine Next State (Code - picking logic)
8. Switch Action (Switch)
9. Add First Item to Machine (Code)
10. Merge All Paths (Merge)
11. Update Session (HTTP)
12. Format Output (Code)
```

**3 parallel HTTP queries:**
- Get Session: `GET /rest/v1/sessions?user_id=eq.X&status=eq.stocking`
- Get Items: `GET /rest/v1/items?machine_id=eq.X&order=sequence.asc`
- Get Machines: `GET /rest/v1/machines?route_id=eq.X&order=sequence.asc`

---

### NEW WORKFLOW (9 nodes, 1 HTTP query)

```
1. Webhook
2. Call Edge Function (HTTP to Supabase Edge Function)
3. Extract Consolidated Data (Code - splits Edge Function response)
4. Determine Next State (Code - same picking logic, updated references)
5. Switch Action (Switch - same)
6. Add First Item to Machine (Code - same)
7. Merge All Paths (Merge - same)
8. Update Session (HTTP - same)
9. Format Output (Code - same)
```

**1 HTTP query:**
- Call Edge Function: `POST /functions/v1/get-next-item-data` with `{ user_id: X }`

---

## Edge Function Contract

**Endpoint:** `https://wvtkuposrlvadyeixlke.supabase.co/functions/v1/get-next-item-data`

**Request:**
```json
{
  "user_id": "uuid-string"
}
```

**Response:**
```json
{
  "session": [
    {
      "id": "session-id",
      "current_machine_id": "machine-id",
      "current_item_index": 0,
      "current_route_id": "route-id",
      "pick_direction": "forward"
    }
  ],
  "items": [
    {
      "id": "item-id",
      "product_name": "Product Name",
      "quantity": 5,
      "slot": "1",
      "sequence": 1,
      "status": "pending",
      "inventory_current": 10,
      "inventory_parlevel": 20
    }
  ],
  "machines": [
    {
      "id": "machine-id",
      "machine_name": "Machine 1",
      "location_name": "Location A",
      "machine_number": 1,
      "sequence": 1,
      "status": "pending"
    }
  ]
}
```

---

## Code Changes

### New Node: "Extract Consolidated Data"

**Purpose:** Replaces "Extract Session" and "Merge Query Results"

**Code:**
```javascript
// Extract consolidated data from Edge Function response
// Edge Function returns: { session: [...], items: [...], machines: [...] }

var data = $input.first().json;

if (!data || !data.session || !Array.isArray(data.session) || data.session.length === 0) {
  throw new Error('No active session found');
}

var session = data.session[0];
var items = data.items || [];
var machines = data.machines || [];

// Store all three datasets in a single output item
// This mimics what the old Merge Query Results node did
return [{
  json: {
    session: session,
    items: items,
    machines: machines
  }
}];
```

---

### Updated Node: "Determine Next State"

**Change:** References `Extract Consolidated Data` instead of 3 separate nodes

**Before:**
```javascript
var session = $('Extract Session').first().json;
var itemsRaw = $('Get Items In Machine').all();
var machinesRaw = $('Get Machines In Route').all();
// ... convert to arrays
```

**After:**
```javascript
var consolidated = $('Extract Consolidated Data').first().json;
var session = consolidated.session;
var items = consolidated.items;
var machines = consolidated.machines;
// ... rest of logic unchanged
```

---

## Performance Impact

### Latency Reduction

**Old workflow:**
- Webhook → Get Session: ~100-200ms
- Extract Session → Get Items + Get Machines (parallel): ~100-200ms
- Merge → Determine Next State: ~50ms
- **Total data fetch: ~250-450ms**

**New workflow:**
- Webhook → Call Edge Function: ~150-250ms (single round-trip)
- Extract Consolidated Data → Determine Next State: ~50ms
- **Total data fetch: ~200-300ms**

**Expected improvement:** 50-150ms faster (20-30% reduction in data fetch time)

---

## Validation Results

**Workflow ID:** 3blW1i1poeCelBrI
**Status:** Created successfully, currently INACTIVE

**Validation Summary:**
- Total Nodes: 9
- Valid Connections: 11
- Invalid Connections: 0
- Expressions Validated: 6
- Errors: 1 (false positive about Format Output)
- Warnings: 20 (mostly outdated typeVersions, not critical)

**Critical Error:**
- Format Output: "Cannot return primitive values directly" - FALSE POSITIVE (code returns array with json object)

**Non-Critical Warnings:**
- Outdated typeVersions (2.0 → 2.1, 4.2 → 4.3, etc.) - not a functional issue
- Missing error handling - can be added if needed
- Code nodes can throw errors - expected behavior, handled by n8n

---

## Testing Plan

### 1. Pre-Deployment Verification

**Check Edge Function is deployed:**
```bash
curl -X POST https://wvtkuposrlvadyeixlke.supabase.co/functions/v1/get-next-item-data \
  -H "Authorization: Bearer SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test-user-id"}'
```

**Expected response:** `{ session: [...], items: [...], machines: [...] }` or empty arrays

---

### 2. n8n Manual Test Execution

**Steps:**
1. Open new workflow in n8n UI: ID `3blW1i1poeCelBrI`
2. Click "Test Workflow" (don't activate yet)
3. Trigger webhook with test data:
   ```json
   {
     "user_id": "real-user-id-with-active-session"
   }
   ```
4. Verify each node output:
   - Call Edge Function: Check response has session, items, machines
   - Extract Consolidated Data: Check data is split correctly
   - Determine Next State: Check action is correct (next_item, next_machine, or complete)
   - Format Output: Check spoken field is populated

---

### 3. Compare with Old Workflow

**Run both workflows with same input:**
1. Old workflow (gwmLuqCN37fhQ3Pr)
2. New workflow (3blW1i1poeCelBrI)

**Compare outputs:**
- Same `action`?
- Same `product_name`, `quantity`, `slot`?
- Same `machine_name`?
- Same `spoken` field?
- Same `items_remaining`?

**If outputs match:** New workflow is functionally identical, just faster

---

### 4. Load Testing (Optional)

**Test concurrent requests:**
- Send 10 simultaneous webhook requests
- Verify all return correct data
- Check Edge Function handles load (should be faster than 3 separate queries)

---

## Deployment Steps (WHEN READY)

**DO NOT DEPLOY YET - Testing required first**

1. **Backup old workflow:**
   ```
   Old workflow ID: gwmLuqCN37fhQ3Pr
   Keep it ACTIVE until new workflow is tested
   ```

2. **Activate new workflow:**
   - Set `active: true` on workflow `3blW1i1poeCelBrI`
   - Verify webhook path is `next-item-optimized` (different from old)

3. **Update frontend to use new webhook:**
   - Change API endpoint from `next-item` to `next-item-optimized`
   - Deploy frontend change

4. **Monitor new workflow:**
   - Check n8n executions for errors
   - Verify latency improvement
   - Confirm data accuracy

5. **Deactivate old workflow:**
   - After 24-48 hours of successful new workflow operation
   - Keep old workflow for rollback if needed

---

## Rollback Plan

**If new workflow fails:**

1. **Immediate:**
   - Deactivate new workflow (`3blW1i1poeCelBrI`)
   - Ensure old workflow is active (`gwmLuqCN37fhQ3Pr`)
   - Revert frontend to old webhook path (`next-item`)

2. **Diagnosis:**
   - Check n8n execution logs for new workflow
   - Check Edge Function logs in Supabase
   - Identify mismatch between old and new data

3. **Fix:**
   - Update Edge Function or workflow as needed
   - Re-test before redeploying

---

## Key Differences Summary

| Aspect | Old Workflow | New Workflow |
|--------|--------------|--------------|
| Total Nodes | 12 | 9 |
| HTTP Queries | 3 (parallel) | 1 (Edge Function) |
| Data Fetch Time | 250-450ms | 200-300ms |
| Webhook Path | `next-item` | `next-item-optimized` |
| Picking Logic | Unchanged | Unchanged |
| Output Format | Unchanged | Unchanged |
| Active Status | ACTIVE | INACTIVE (testing) |

---

## Success Criteria

- [ ] Edge Function returns correct data for all test cases
- [ ] New workflow output matches old workflow output exactly
- [ ] Latency reduced by 20-30%
- [ ] No errors in n8n execution logs
- [ ] Frontend receives same data structure
- [ ] Voice picking works identically to before

---

## Notes

- **NO changes to picking logic** - Only data fetching optimized
- **NO changes to output format** - Frontend compatibility maintained
- **Webhook path is different** - Allows A/B testing and easy rollback
- **Edge Function is already deployed** - Ready to use
- **Old workflow preserved** - Can switch back instantly if needed

---

**Next Step:** Test the new workflow manually in n8n UI before activating.
