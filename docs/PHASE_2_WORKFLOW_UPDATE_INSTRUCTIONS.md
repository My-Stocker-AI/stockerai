# Phase 2: Workflow Updates - Implementation Guide

**Date:** 2026-01-25
**Status:** Ready for implementation
**Workflow:** get_next_item (Optimized) - ID: iykbFj7f9222PF7r

---

## What We're Fixing

**Problem:** System uses derived counts from items table instead of persistent `machines.completed_items`

**Solution:** Update workflow to use `completed_items` from database

**Impact:**
- ✅ Fixes Bug #2: Machine 2 won't show "2/5" anymore (each machine has independent counter)
- ✅ Fixes Bug #3: Machine won't finish early (completion check: completed_items >= total_items)
- ✅ Enables skip preservation (can resume from where left off)

---

## Step-by-Step Instructions

### STEP 1: Update "Determine Next State" Node

**File:** `/workflows/determine_next_state_USE_COMPLETED_ITEMS.js`

1. Open n8n workflow: **get_next_item (Optimized)**
2. Open node: **"Determine Next State"**
3. **Replace ALL code** with content from file above
4. Click "Save"

**What changed:**
- Now reads `machines.completed_items` from consolidated data
- Calculates `items_remaining = total_items - completed_items` (per-machine)
- Checks completion: `if (completed_items >= total_items)` (deterministic)
- Returns `items_to_increment` (1 or 2 for count=2 mode)

---

### STEP 2: Add "Increment Completed Items" Node

**Reference:** `/workflows/INCREMENT_COMPLETED_ITEMS_NODE.md`

**Position in workflow:**
```
Switch Action (output 1)
  → [NEW] Increment Completed Items
  → Merge All Paths (input 1)
```

**Node configuration:**

1. **Add new HTTP Request node:**
   - Drag "HTTP Request" onto canvas
   - Name: `Increment Completed Items`
   - Position: Between "Switch Action" and "Merge All Paths"

2. **Reconnect nodes:**
   - **Disconnect:** "Switch Action" output 1 → "Merge All Paths"
   - **Connect:** "Switch Action" output 1 → "Increment Completed Items"
   - **Connect:** "Increment Completed Items" → "Merge All Paths" input 1

3. **Configure HTTP Request:**
   - **Method:** PATCH
   - **URL:**
     ```
     https://jgaglhywjrhfofbpbwxe.supabase.co/rest/v1/machines?id=eq.{{ $json.new_machine_id }}
     ```
   - **Authentication:** Use existing Supabase credential
   - **Send Body:** Yes (JSON)
   - **Body (JSON):**
     ```json
     {
       "completed_items": "={{ $json.completed_items + $json.items_to_increment }}"
     }
     ```
   - **Headers:**
     - `Content-Type`: `application/json`
     - `Prefer`: `return=representation`

4. **Click "Save"**

---

### STEP 3: Verify Workflow Structure

**Final flow should be:**

```
Webhook
  → Call Edge Function
  → Extract Consolidated Data
  → Determine Next State  [UPDATED CODE]
  → Switch Action
      ├─ (output 0: next_machine) → Add First Item to Machine → Merge (input 0)
      ├─ (output 1: next_item)    → [NEW] Increment Completed Items → Merge (input 1)
      ├─ (output 2: complete)     → Merge (input 2)
      └─ (output 3: default)      → Merge (input 2)
  → Merge All Paths
  → Update Session
  → Format Output
```

**Verify:**
- ✅ "Determine Next State" has new code
- ✅ "Increment Completed Items" node exists
- ✅ Connections are correct
- ✅ All paths merge before "Update Session"

---

### STEP 4: Update "Extract Consolidated Data" Node

**CRITICAL:** The consolidated data query must include `completed_items` and `skipped_at_item`

**Current query** (in Call Edge Function):
```sql
SELECT
  m.id,
  m.machine_name,
  m.sequence,
  m.total_items,
  m.status
FROM machines m
```

**Updated query:**
```sql
SELECT
  m.id,
  m.machine_name,
  m.sequence,
  m.total_items,
  m.completed_items,  -- ADDED
  m.skipped_at_item,  -- ADDED
  m.status
FROM machines m
```

**Where to update:**
1. Open node: **"Call Edge Function"**
2. This node calls the Supabase Edge Function
3. The Edge Function uses RPC: `get_next_item_data()`

**Actually, we need to update the RPC function in Supabase:**

File: `/supabase/migrations/20260125_update_get_next_item_data_rpc.sql`

```sql
-- Update get_next_item_data RPC to include completed_items and skipped_at_item
CREATE OR REPLACE FUNCTION get_next_item_data(p_user_id UUID)
RETURNS TABLE (
  -- Session fields
  session_id UUID,
  session_key TEXT,
  user_id UUID,
  current_route_id UUID,
  current_machine_id UUID,
  current_item_index INTEGER,
  status TEXT,
  pick_direction TEXT,
  session_created_at TIMESTAMPTZ,
  session_updated_at TIMESTAMPTZ,

  -- Machine fields
  machine_id UUID,
  route_id UUID,
  machine_name TEXT,
  machine_number INTEGER,
  location_name TEXT,
  machine_sequence INTEGER,
  machine_status TEXT,
  machine_total_items INTEGER,
  machine_completed_items INTEGER,      -- ADDED
  machine_skipped_at_item INTEGER,      -- ADDED

  -- Item fields
  item_id UUID,
  product_name TEXT,
  quantity INTEGER,
  slot TEXT,
  item_sequence INTEGER,
  item_status TEXT,
  inventory_current INTEGER,
  inventory_parlevel INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Session data
    s.id AS session_id,
    s.session_key,
    s.user_id,
    s.current_route_id,
    s.current_machine_id,
    s.current_item_index,
    s.status,
    s.pick_direction,
    s.created_at AS session_created_at,
    s.updated_at AS session_updated_at,

    -- Machine data
    m.id AS machine_id,
    m.route_id,
    m.machine_name,
    m.machine_number,
    m.location_name,
    m.sequence AS machine_sequence,
    m.status AS machine_status,
    m.total_items AS machine_total_items,
    m.completed_items AS machine_completed_items,    -- ADDED
    m.skipped_at_item AS machine_skipped_at_item,    -- ADDED

    -- Item data
    i.id AS item_id,
    i.product_name,
    i.quantity,
    i.slot,
    i.sequence AS item_sequence,
    i.status AS item_status,
    i.inventory_current,
    i.inventory_parlevel
  FROM sessions s
  LEFT JOIN machines m ON m.route_id = s.current_route_id
  LEFT JOIN items i ON i.machine_id = m.id
  WHERE s.user_id = p_user_id
    AND s.status = 'stocking'
  ORDER BY s.created_at DESC, m.sequence ASC, i.sequence ASC
  LIMIT 100;
END;
$$;
```

**Run this in Supabase SQL Editor** before testing workflow.

---

## Testing Procedure

### Test 1: Fresh Machine (No Items Picked)

1. Start test route
2. Say "next" for first item
3. **Check database:**
   ```sql
   SELECT machine_name, completed_items, total_items
   FROM machines
   WHERE route_id = '69676322-6abf-41e3-b364-bb64c72402b9';
   ```
4. **Expected:** completed_items = 1
5. Say "next" 4 more times
6. **Expected:** completed_items = 5
7. Machine should complete and move to next

### Test 2: Machine Completion

1. Continue with Machine 2
2. Pick all 5 items
3. **Expected:**
   - completed_items increments: 0 → 1 → 2 → 3 → 4 → 5
   - When completed_items = 5 → action='next_machine'

### Test 3: Count=2 Mode

1. Enable count=2 in settings
2. Say "next"
3. **Expected:**
   - Hear 2 items announced
   - completed_items increments by 2 (e.g., 0 → 2)

### Test 4: Skip Machine Mid-Way

1. Pick 2 items on Machine 3
2. Say "skip"
3. **Check database:**
   ```sql
   SELECT machine_name, status, completed_items, skipped_at_item
   FROM machines
   WHERE id = '<machine_3_id>';
   ```
4. **Expected:**
   - status = 'skipped'
   - completed_items = 2
   - skipped_at_item = 2 (auto-saved by trigger)

---

## Rollback Plan

If something breaks:

1. **Revert "Determine Next State" code:**
   - Use previous version: `determine_next_state_WITH_INVENTORY_FIX.js`

2. **Remove "Increment Completed Items" node:**
   - Delete the node
   - Reconnect "Switch Action" directly to "Merge All Paths"

3. **Workflow will work as before** (but bugs won't be fixed)

---

## Success Criteria

✅ **Workflow updates complete when:**
1. Determine Next State uses `machines.completed_items`
2. Increment Completed Items node exists and is wired correctly
3. RPC function returns completed_items field
4. Test 1-4 all pass
5. No errors in n8n execution logs

---

## Next Steps After This

**Once get_next_item works:**
1. Update skip_current_machine (Task #2)
2. Update start_machine (Task #3)
3. Update go_back_to_skipped (Task #4)
4. Update set_route_sequence (Task #5)
5. Update frontend (Phase 3)
6. Test everything (Phase 5)

---

**Questions or issues?** Check n8n execution logs and database state.
