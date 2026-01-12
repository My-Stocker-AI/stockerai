# Test Workflow Setup - Performance Optimization

**Created:** 2026-01-11 (Session 33)
**Optimization:** Remove Get Routes query (Priority 1)
**Expected Savings:** 148-455ms (300ms average, ~12% faster)

---

## Test Workflow Details

**Name:** `Stocker Tool: get_next_item (TEST - Optimization)`
**ID:** `ahcNhBOSQR4HA3wI`
**Webhook Path:** `/next-item-test`
**Status:** Created (needs manual activation)
**Nodes:** 12 (vs 13 in production)

---

## What Was Changed

### ✅ Optimization Applied

**Removed:** "Get Routes" node
- **Why:** The workflow was querying the routes table on every "next" command just to get `route_name`
- **Why it's safe:** Route name is NOT used in the response for `next_item` actions
- **Impact:** Eliminates one 148-455ms Supabase query

**Updated:** "Merge Query Results" node
- Changed from 3 inputs to 2 inputs
- Now only merges: Get Session + Get Items + Get Machines (no Get Routes)

**Updated:** "Determine Next State" code node
- Hardcoded `completed_route: 'Route'` instead of using routes data
- This field is ONLY used when action = 'complete' (route finished)
- Users will see "Route complete" instead of "Davy's Route complete" (minor UX change)

---

## Activation Instructions

The workflow was created via n8n MCP but needs manual activation:

1. Go to https://visionairy.app.n8n.cloud/workflows
2. Find: "Stocker Tool: get_next_item (TEST - Optimization)"
3. Click the toggle to activate it
4. Verify the webhook path is: `/next-item-test`

---

## Testing Protocol

### Step 1: Temporary Frontend Change

To test the optimized workflow, temporarily point the frontend to the test endpoint:

**File:** `/home/visionairy/StockerAI/src/hooks/useStockerAI.ts`
**Line:** ~49

**Change from:**
```typescript
const WEBHOOK_MAP: Record<string, string> = {
  'get_next_item': '/next-item',
  // ... other tools
};
```

**Change to:**
```typescript
const WEBHOOK_MAP: Record<string, string> = {
  'get_next_item': '/next-item-test',  // ← TEST endpoint
  // ... other tools
};
```

### Step 2: Baseline Measurement

**BEFORE testing optimized version:**

1. Use production endpoint (`/next-item`)
2. Say "next" 10 times in a row
3. Record console timestamps:
   - `[Tools] Calling get_next_item` (start)
   - `[Tools] get_next_item succeeded` (end)
4. Calculate average latency

**Expected baseline:** ~1.5 seconds (workflow execution time)

### Step 3: Test Optimized Version

1. Switch to test endpoint (`/next-item-test`)
2. Refresh browser to load new code
3. Say "next" 10 times in a row
4. Record console timestamps (same as above)
5. Calculate average latency

**Expected optimized:** ~1.2 seconds (300ms faster)

### Step 4: Verify Correctness

**Check that everything still works:**
- [ ] Next item is spoken correctly
- [ ] Item details are correct (product, quantity)
- [ ] Machine transitions work
- [ ] Route completion works
- [ ] UI updates correctly
- [ ] No errors in console

### Step 5: Compare Results

Create a comparison table:

| Metric | Production | Optimized | Improvement |
|--------|-----------|-----------|-------------|
| Avg latency | X.Xs | Y.Ys | -ZZms |
| P95 latency | | | |
| Errors | | | |

### Step 6: Revert

**After testing, switch back to production:**

```typescript
const WEBHOOK_MAP: Record<string, string> = {
  'get_next_item': '/next-item',  // ← Back to production
  // ... other tools
};
```

---

## Expected Execution Flow Comparison

### Production Workflow (13 nodes)

```
Webhook → Get Session → Extract Session
  ├→ Get Items In Machine ──┐
  ├→ Get Machines In Route ─┼→ Merge (3 inputs)
  └→ Get Routes ────────────┘
     ↓
  Determine Next State → Switch → Update Session → Format Output
```

**Parallel queries (3):**
- Get Items: ~300ms
- Get Machines: ~180ms
- Get Routes: ~300ms ← **REMOVED IN TEST**

### Test Workflow (12 nodes)

```
Webhook → Get Session → Extract Session
  ├→ Get Items In Machine ──┐
  └→ Get Machines In Route ─┴→ Merge (2 inputs)
     ↓
  Determine Next State → Switch → Update Session → Format Output
```

**Parallel queries (2):**
- Get Items: ~300ms
- Get Machines: ~180ms

**Savings:** ~300ms (Get Routes query eliminated)

---

## Risk Assessment

**Risk Level:** ⚠️ LOW

**Why it's safe:**
1. ✅ Route name is not used in "next_item" responses (verified in Format Output code)
2. ✅ Only affects route completion message (minor UX change)
3. ✅ All picking logic unchanged (Determine Next State untouched)
4. ✅ Easy rollback (switch webhook back to production)

**Potential Issues:**
- ❓ Route completion message less specific ("Route complete" vs "Davy's Route complete")
- ❓ Edge case: Multiple routes running simultaneously (unlikely in practice)

**Mitigation:**
- If users complain about generic completion message, we can add route_name to session data
- Can always revert to production endpoint in <1 minute

---

## Rollback Procedure

**If test fails:**

1. **Immediate rollback (<1 minute):**
   ```typescript
   // In useStockerAI.ts
   'get_next_item': '/next-item'  // Switch back
   ```
   Refresh browser, done.

2. **Delete test workflow (optional):**
   - Go to n8n workflow list
   - Find "Stocker Tool: get_next_item (TEST - Optimization)"
   - Delete or deactivate

3. **Verify production working:**
   - Say "next" 10 times
   - Check no errors in console

---

## Success Criteria

**Test passes if ALL true:**
- ✅ Average latency reduced by ≥200ms
- ✅ No errors during 10 "next" commands
- ✅ All items spoken correctly
- ✅ Machine transitions work
- ✅ Route completion works
- ✅ User experience feels noticeably faster

**If test passes:** Consider deploying to production by updating production workflow

---

## Next Steps After Testing

**If successful:**
1. Update production workflow `get_next_item` (ID: eBv7SfWF7hsuNGpH) with same optimization
2. Keep test workflow as backup/reference
3. Document results in MEMORY.md
4. Move to next optimization (Reduce Deepgram endpointing)

**If unsuccessful:**
1. Revert to production endpoint
2. Analyze what went wrong
3. Document findings
4. Consider alternative optimizations

---

## Test Environment Variables

**Production Endpoint:**
- Workflow: `eBv7SfWF7hsuNGpH`
- Path: `/next-item`
- Nodes: 13

**Test Endpoint:**
- Workflow: `ahcNhBOSQR4HA3wI`
- Path: `/next-item-test`
- Nodes: 12

**Toggle in code:**
```typescript
// File: src/hooks/useStockerAI.ts
// Line: ~49
'get_next_item': '/next-item-test',  // TEST
'get_next_item': '/next-item',       // PRODUCTION
```

---

## n8n Workflow Comparison

**View in n8n:**
- Production: https://visionairy.app.n8n.cloud/workflow/eBv7SfWF7hsuNGpH
- Test: https://visionairy.app.n8n.cloud/workflow/ahcNhBOSQR4HA3wI

**Visual Difference:**
- Production has "Get Routes" node connected to Merge
- Test has no "Get Routes" node, Merge only has 2 inputs

---

**END OF DOCUMENT**
