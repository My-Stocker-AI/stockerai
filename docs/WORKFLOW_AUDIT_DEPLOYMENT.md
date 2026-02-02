# Workflow Audit Fixes - Deployment Guide

**Date:** 2026-02-01
**Status:** Ready for deployment

---

## Summary

All 6 critical and high-priority issues from the workflow audit have been fixed:

✅ **CASCADE DELETE verified** - No action needed
✅ **Skip validation added** - Deployed to n8n
✅ **Route error handling fixed** - Deployed to n8n
✅ **Optimistic locking added** - Deployed to n8n
✅ **Performance optimization** - Edge Function created (needs deployment)
✅ **Transaction safety** - Edge Function created (needs deployment)

---

## Quick Fixes (Already Deployed) ✅

### 1. CASCADE DELETE Configuration
**Status:** ✅ Verified - No changes needed

Database already has proper CASCADE DELETE:
```sql
routes (deleted) → machines (CASCADE) → items (CASCADE)
```

### 2. Skip Validation
**Workflow:** skip_current_machine (ElCSMeguJNxwp0HO)
**Status:** ✅ Deployed

**Change:** Added validation in "Prepare Skip Update" node
```javascript
if (machine.status === 'skipped') {
  throw new Error('Machine already skipped. Say "go back" to resume.');
}
```

**Impact:** Prevents skipping already-skipped machines

### 3. Route Error Handling
**Workflow:** set_route_sequence (46lMRdxTgD1E3WFz)
**Status:** ✅ Deployed

**Change:** Added "Check Route Found" IF node after "Find Route"
- TRUE branch (error exists) → Return error immediately
- FALSE branch (no error) → Continue to Pause Other Sessions

**Impact:** Prevents creating broken sessions when route not found

### 4. Optimistic Locking
**Workflow:** get_next_item (iykbFj7f9222PF7r)
**Status:** ✅ Deployed

**Change:** Modified "Update Session" node URL
```
OLD: ?id=eq.{{ $json.session_record_id }}
NEW: ?id=eq.{{ $json.session_record_id }}&current_item_index=eq.{{ $json.expected_index }}
```

**Impact:** Prevents race conditions when user rapidly fires "next" commands

---

## Edge Functions (Need Deployment) ⏸️

### 5. Performance Optimization: get-next-item-atomic

**File:** `supabase/functions/get-next-item-atomic/index.ts`

**Purpose:** Consolidate Edge Function + n8n workflow into single atomic function

**Performance:**
- Current: 1200-1800ms (6-8 database queries)
- Target: 400-600ms (2-3 queries with optimistic locking)

**Deployment Steps:**

```bash
# 1. Deploy Edge Function
cd /home/visionairy/StockerAI
supabase functions deploy get-next-item-atomic

# 2. Test the function
curl -X POST https://wvtkuposrlvadyeixlke.supabase.co/functions/v1/get-next-item-atomic \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "YOUR_USER_ID", "count": 1}'

# 3. Update frontend to call new endpoint
# Change: WEBHOOK_MAP.get_next_item
# From: https://visionairy.app.n8n.cloud/webhook/next-item-optimized
# To: https://wvtkuposrlvadyeixlke.supabase.co/functions/v1/get-next-item-atomic

# 4. Deploy frontend changes

# 5. Verify in production

# 6. Archive old n8n workflow (don't delete yet)
```

**Rollback Plan:**
```bash
# Revert frontend WEBHOOK_MAP to old n8n endpoint
# Old workflow is still active
```

---

### 6. Transaction Safety: switch-route-atomic

**File:** `supabase/functions/switch-route-atomic/index.ts`

**Purpose:** Wrap reset operations in transaction with rollback capability

**Safety:**
- Validates target route exists BEFORE any resets
- Atomic reset (machines → items)
- Manual rollback on failure
- Prevents data corruption

**Deployment Steps:**

```bash
# 1. Deploy Edge Function
cd /home/visionairy/StockerAI
supabase functions deploy switch-route-atomic

# 2. Test the function
curl -X POST https://wvtkuposrlvadyeixlke.supabase.co/functions/v1/switch-route-atomic \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_ID",
    "target_route": "Monday",
    "preserve_progress": false
  }'

# 3. Update frontend to call new endpoint
# Change: WEBHOOK_MAP.switch_route
# From: https://visionairy.app.n8n.cloud/webhook/switch-route
# To: https://wvtkuposrlvadyeixlke.supabase.co/functions/v1/switch-route-atomic

# 4. Deploy frontend changes

# 5. Verify in production

# 6. Archive old n8n workflow (don't delete yet)
```

**Rollback Plan:**
```bash
# Revert frontend WEBHOOK_MAP to old n8n endpoint
# Old workflow is still active
```

---

## Frontend Changes Required

**File:** `src/lib/constants.ts` (or wherever WEBHOOK_MAP is defined)

```typescript
// BEFORE
export const WEBHOOK_MAP = {
  get_next_item: 'https://visionairy.app.n8n.cloud/webhook/next-item-optimized',
  switch_route: 'https://visionairy.app.n8n.cloud/webhook/switch-route',
  // ... other endpoints
};

// AFTER
export const WEBHOOK_MAP = {
  get_next_item: 'https://wvtkuposrlvadyeixlke.supabase.co/functions/v1/get-next-item-atomic',
  switch_route: 'https://wvtkuposrlvadyeixlke.supabase.co/functions/v1/switch-route-atomic',
  // ... other endpoints
};
```

---

## Testing Checklist

### Quick Fixes (n8n workflows)

- [ ] **Skip validation:**
  - Start route, skip machine, try to skip same machine again
  - Should error: "Machine already skipped. Say 'go back' to resume."

- [ ] **Route error handling:**
  - Try to start non-existent route
  - Should return error immediately, not create broken session

- [ ] **Optimistic locking:**
  - Rapidly fire "next" command 5+ times
  - Should handle gracefully without divergence

### Edge Functions

- [ ] **get-next-item-atomic:**
  - Get next item (normal flow)
  - Get 2 items (count=2)
  - Complete machine → transition to next machine
  - Complete route → route_complete=true
  - Measure latency: Should be 400-600ms

- [ ] **switch-route-atomic:**
  - Switch route with preserve_progress=true
  - Switch route with preserve_progress=false
  - Try to switch to non-existent route → Should error before any resets
  - Verify machines reset when preserve_progress=false

---

## Performance Metrics (Expected)

| Workflow | Before | After | Improvement |
|----------|--------|-------|-------------|
| get_next_item | 1200-1800ms | 400-600ms | 50-70% faster |
| switch_route | 2000-3000ms | 1000-1500ms | 40-50% faster |

---

## Monitoring

After deployment, track:

1. **Error rates** - Should not increase
2. **Latency** - Should decrease significantly
3. **Concurrent operation failures** - Should be rare (optimistic locking)
4. **Data integrity** - No orphaned records, no state corruption

---

## Rollback Plan

### Edge Functions
1. Revert frontend WEBHOOK_MAP to old n8n endpoints
2. Deploy frontend
3. Old n8n workflows still active and functional

### n8n Workflows
1. Use n8n UI to revert workflow to previous version
2. Test workflow execution
3. Verify frontend compatibility

---

## Success Criteria

✅ All quick fixes deployed and tested
✅ Edge Functions deployed
✅ Frontend updated to call Edge Functions
✅ Performance targets met (400-600ms for get_next_item)
✅ No increase in error rates
✅ No data corruption
✅ Optimistic locking prevents race conditions

---

**Next Steps:**
1. Deploy Edge Functions to Supabase
2. Update frontend WEBHOOK_MAP
3. Test in production
4. Monitor metrics for 24-48 hours
5. Archive old n8n workflows after confidence established
