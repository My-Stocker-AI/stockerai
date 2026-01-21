# Production Bug Fix - January 21, 2026

## Summary

**Bug:** Route gets stuck on last item, or completes prematurely after skipping a machine

**Root Cause:** The `skip_current_machine` workflow was losing the `current_route_id` field when updating the session, causing the database to return no items (because the JOIN failed with NULL route_id).

**Symptoms:**
1. Last item on first machine won't advance to next machine
2. After skipping a machine, only 2 items are called before "route complete"

**Affected Users:** Davy (production run on 2026-01-21)

---

## The Fix (3 Parts)

### Fix 1: Update skip_current_machine Workflow (CRITICAL)

**Workflow:** ElCSMeguJNxwp0HO
**Node to update:** "Prepare Session Update"

**How to apply:**

1. Open n8n at https://visionairy.app.n8n.cloud
2. Navigate to workflows
3. Find "Stocker Tool: skip_current_machine"
4. Click to edit
5. Find the node named "Prepare Session Update" (should be around position 1856, 304)
6. Click on the node
7. In the code editor, **REPLACE the entire code** with this:

```javascript
var data = $input.first().json;
var session = $('Extract Session').first().json;  // FIX: Get session for route_id

var updateData = {
  current_item_index: 1,
  current_route_id: session.current_route_id  // FIX: PRESERVE route_id
};

if (data.next_machine_id) {
  updateData.current_machine_id = data.next_machine_id;
} else {
  updateData.status = 'completed';
}

return [{
  json: {
    session_id: data.session_id,
    update: updateData,
    process_data: data
  }
}];
```

8. Click "Save" (top right)
9. Click "Activate" if the workflow was deactivated

**What changed:** Added one line: `current_route_id: session.current_route_id`

---

### Fix 2: start_machine Workflow (ALREADY CORRECT)

✅ **No action needed!** The start_machine workflow is already preserving `current_route_id` correctly.

---

### Fix 3: Defensive Database Fix (RECOMMENDED)

**Purpose:** Prevent future issues if route_id gets cleared elsewhere

**How to apply:**

1. Open Supabase dashboard at https://supabase.com/dashboard
2. Navigate to your project: my-stocker-ai
3. Click "SQL Editor" in the left sidebar
4. Click "New Query"
5. Copy the entire contents of this file:
   `/home/visionairy/StockerAI/supabase/migrations/20260121_defensive_route_id_fix.sql`
6. Paste into the SQL editor
7. Click "Run" (bottom right)
8. You should see: `✅ DEFENSIVE FIX TEST PASSED: Returns data even with NULL current_route_id`

**What this does:** Makes the database query smart enough to recover even if `current_route_id` is NULL by looking it up from the current machine's route.

---

## Testing the Fix

### Test 1: Normal Flow (Should Work Now)

1. Start a route with multiple machines
2. Pick items on first machine until the last item
3. Say "next"
4. **Expected:** Should ask "Top or bottom?" for next machine
5. Say "top" or "bottom"
6. **Expected:** Should give first item of next machine

### Test 2: Skip Flow (Should Work Now)

1. Start a machine and pick a few items
2. Say "skip machine"
3. Say "yes" to confirm
4. **Expected:** Should ask "Top or bottom?" for next machine
5. Say "top" or "bottom"
6. **Expected:** Should give first item and continue normally (not "route complete" after 2 items)

### Test 3: Full Route (End-to-End)

1. Complete an entire route with 3-4 machines
2. Skip one machine in the middle
3. **Expected:** Should complete all non-skipped machines without getting stuck

---

## Rollback Plan (If Something Goes Wrong)

### Rollback n8n Workflow

1. Open n8n workflow "skip_current_machine"
2. Click the version dropdown (top right)
3. Select the previous version (before today)
4. Click "Restore this version"
5. Click "Activate"

### Rollback Database

The database migration is **safe to leave in place** - it only adds defensive fallback logic and doesn't break existing functionality.

If you really need to remove it:

1. Open Supabase SQL Editor
2. Run this to restore original version:

```sql
-- See /home/visionairy/StockerAI/supabase/migrations/20260119070000_performance_fix_v2_with_tests.sql
-- Copy the original CREATE OR REPLACE FUNCTION from that file
```

---

## Priority

- **Fix 1 (n8n workflow):** CRITICAL - Must do immediately
- **Fix 3 (database):** RECOMMENDED - Insurance policy against future issues
- **Fix 2:** Not needed (already correct)

---

## Technical Details (For Claude)

**Affected Boundaries:**
- DATA: sessions.current_route_id being set to NULL
- NODES: skip_current_machine workflow, get_next_item RPC
- FLOW: Skip → Start Machine → Get Next Item → Empty Results → False Completion
- ERRORS: Silent data loss, false completion signals

**Code Changes:**
- Workflow: ElCSMeguJNxwp0HO node "Prepare Session Update"
- Database: get_next_item_data() RPC function

**Verification:**
- Check n8n execution logs after fix
- Verify session.current_route_id is preserved
- Confirm items array is populated

---

## Questions?

If anything is unclear or if you need help applying these fixes, just ask!
