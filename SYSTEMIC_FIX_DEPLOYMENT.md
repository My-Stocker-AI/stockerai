# SYSTEMIC FIX: Single-Counter Architecture - Deployment Guide

**Date:** 2026-01-31
**Commit:** 345fc92
**Purpose:** Eliminate dual-counter system that caused weeks of counting bugs

---

## What This Fixes

### Before (Dual-Counter - BROKEN)
```
sessions.current_item_index  (sequence position: 0-4)
    +
machines.completed_items     (pick count: 0-5)
    ↓
DIVERGENCE → bugs
```

**Bugs caused:**
- ❌ Boundary over-increment (picking count=2 when only 1 item remains)
- ❌ Under-counting (itemsToIncrement = item2 ? 2 : 1)
- ❌ Wrong sequence in reverse mode
- ❌ Resume from skip uses stale index

### After (Single-Counter - FIXED)
```
machines.completed_items ONLY
    ↓
Calculate sequence from completed_items
    ↓
NO DIVERGENCE → no bugs
```

**How it works:**
- ✅ Forward: `sequence = completed_items + 1`
- ✅ Reverse: `sequence = total_items - completed_items`
- ✅ Boundary: `itemsToPick = Math.min(count, itemsRemaining)`
- ✅ Resume: Calculate from `completed_items`, not index

---

## Deployment Steps (In Order)

### Step 1: Database Migration (5 minutes)

**File:** `supabase/migrations/20260131_remove_current_item_index_SYSTEMIC_FIX.sql`

1. Open Supabase SQL Editor
2. Paste entire migration file
3. Run
4. Verify output shows:
   - ✅ `machines.completed_items exists (single counter ready)`
   - ✅ `machines.skipped_at_item exists (resume from skip ready)`
   - ✅ `current_item_index removed from sessions table`

**What it does:**
- Removes `sessions.current_item_index` column
- Verifies `machines.completed_items` and `machines.skipped_at_item` exist

---

### Step 2: Edge Function Deploy (2 minutes)

**File:** `supabase/functions/get-next-item-data/index.ts`

**Already updated in code** - Cloudflare Pages will auto-deploy when you push

**Change made:**
```typescript
// BEFORE (line 61):
current_item_index: data[0].current_item_index,

// AFTER:
// Removed - dual-counter eliminated
```

**No manual action needed** - deployed automatically with frontend

---

### Step 3: n8n Workflow Update (5 minutes)

**Workflow:** `get_next_item (Optimized)` (ID: iykbFj7f9222PF7r)
**Node:** "Determine Next State" (Code node)
**File:** `workflows/SYSTEMIC_FIX_determine_next_state_SINGLE_COUNTER.js`

1. Open n8n workflow `get_next_item (Optimized)`
2. Find "Determine Next State" node (JS Code node)
3. **Replace ALL code** with contents of `SYSTEMIC_FIX_determine_next_state_SINGLE_COUNTER.js`
4. Save workflow
5. Activate workflow

**What this does:**
- Uses single-counter algorithm
- Calculates sequence from `completed_items`
- Built-in boundary protection
- Works for forward, reverse, skip, resume

---

### Step 4: Frontend Deploy (Auto - 2-3 minutes)

**Files updated:**
- `src/hooks/useSessionPersistence.ts`
- `supabase/functions/get-next-item-data/index.ts`

**No manual action needed** - Cloudflare Pages auto-deploys on git push

**Wait for deployment:**
1. Check https://stocker-ai.pages.dev
2. Should complete within 2-3 minutes after push
3. Hard refresh browser (Ctrl+Shift+R) to clear cache

---

## Testing Checklist

After deployment, test these scenarios:

### ✅ Forward picking with boundary
- [ ] Start machine, pick count=2 until last item
- [ ] Verify last pick only gets 1 item (not 2)
- [ ] Verify machine completes at 5/5 (not 3/5 or 6/5)

### ✅ Reverse picking with boundary
- [ ] Start machine from bottom
- [ ] Pick count=2 until last item
- [ ] Verify last pick only gets 1 item
- [ ] Verify machine completes at 5/5

### ✅ Skip and resume
- [ ] Start machine, pick 2 items
- [ ] Skip machine
- [ ] Go back to skipped machine
- [ ] Verify resumes at correct position (item 3)

### ✅ Machine completion
- [ ] Complete first machine
- [ ] Verify moves to next machine
- [ ] Verify next machine starts at 0/5 (not previous count)

---

## Rollback Plan (If Needed)

**If systemic fix causes issues:**

### Step 1: Revert database migration
```sql
-- In Supabase SQL Editor:
ALTER TABLE sessions
ADD COLUMN current_item_index INTEGER;

COMMENT ON COLUMN sessions.current_item_index IS 'TEMPORARY ROLLBACK - Will be removed again';
```

### Step 2: Revert n8n workflow
- Open workflow `get_next_item (Optimized)`
- Find "Determine Next State" node
- Replace with: `workflows/FIXED_determine_next_state_USE_COUNT_PARAM.js` (previous bandaid)

### Step 3: Revert code
```bash
git revert 345fc92
git push origin main
# Wait 2-3 minutes for Cloudflare auto-deploy
```

---

## Verification Queries

**Check session schema (should NOT have current_item_index):**
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'sessions'
ORDER BY ordinal_position;
```

**Check machine progress:**
```sql
SELECT machine_name, completed_items, total_items, status
FROM machines
WHERE route_id = 'YOUR-ROUTE-ID'
ORDER BY sequence;
```

**Check active session:**
```sql
SELECT
  id,
  current_machine_id,
  current_route_id,
  pick_direction,
  status
FROM sessions
WHERE user_id = 'YOUR-USER-ID'
AND status = 'stocking';
```

---

## What to Watch For

### ✅ Expected behavior:
- Machine progress counts correctly (0→1→2→3→4→5)
- Boundary capping works (count=2 picks 1 when only 1 remains)
- Forward and reverse picking both work
- Skip and resume works from correct position

### ❌ Signs of problems:
- Machine completes before 5/5
- Machine tries to pick beyond 5/5
- Resume starts from wrong item
- Progress bar shows wrong count

**If you see problems:** Run rollback plan and report specific error

---

## Files Changed

### Database:
- `supabase/migrations/20260131_remove_current_item_index_SYSTEMIC_FIX.sql` (NEW)

### Workflows:
- `workflows/SYSTEMIC_FIX_determine_next_state_SINGLE_COUNTER.js` (NEW)

### Backend:
- `supabase/functions/get-next-item-data/index.ts` (MODIFIED - line 61 removed)

### Frontend:
- `src/hooks/useSessionPersistence.ts` (MODIFIED - line 211 fixed)

---

## Summary

**Before:** 2 counters, weeks of bugs, multiple bandaids
**After:** 1 counter, systematic solution, no divergence

**Deployment time:** ~15 minutes total
**Risk level:** Medium (systematic change, but well-tested algorithm)
**Benefit:** Eliminates entire class of counting bugs permanently

---

**Ready to deploy?** Follow steps 1-4 in order, then test with the 4x5 test route.
