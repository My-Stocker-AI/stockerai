# Fix: Update Session Node - Add Prefer Header

**Date:** 2026-01-16
**Workflow:** `Stocker Tool: get_next_item (Optimized)` (ID: `iykbFj7f9222PF7r`)
**Terminal Root Cause:** Missing `Prefer: return=representation` header causes silent update failures

---

## Problem Statement

When Davy reaches the **third machine** on a route:
1. First "next" command shows items 1 and 2 correctly
2. Second "next" command declares "Route finished" prematurely
3. Skipped machines are forgotten

**Root Cause:** Update Session HTTP request doesn't include `Prefer: return=representation` header, causing Supabase to return empty response even when update succeeds. The workflow doesn't detect the failure, leaving `current_item_index` at stale value. On next call, Edge Function queries with wrong index and returns empty items array.

---

## Evidence

**Execution Logs:**
- Execution 26745 (2026-01-15 04:33:12): Call Edge Function returned 0 items
- Execution 26744 (2026-01-15 04:33:07): Call Edge Function returned 0 items
- Both executions status: SUCCESS (no error thrown)

**Comparative Analysis:**
- `start_machine` workflow (ID: `JbKdJuKgGbyvzlF0`) **HAS** the Prefer header → works correctly
- `get_next_item (Optimized)` workflow **MISSING** the Prefer header → fails silently

---

## The Fix

### Current Configuration (BROKEN)

**Node:** Update Session
**Current Parameters:**
```json
{
  "method": "PATCH",
  "url": "=https://wvtkuposrlvadyeixlke.supabase.co/rest/v1/sessions?id=eq.{{ $json.session_record_id }}",
  "authentication": "predefinedCredentialType",
  "nodeCredentialType": "supabaseApi",
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ JSON.stringify({ current_item_index: $json.new_item_index, current_machine_id: $json.new_machine_id, current_route_id: $json.new_route_id, status: $json.new_status || 'stocking' }) }}",
  "options": {}
}
```

**Problem:** No `sendHeaders` or `headerParameters` configured.

### Fixed Configuration (CORRECT)

**Add these parameters:**
```json
{
  "sendHeaders": true,
  "headerParameters": {
    "parameters": [
      {
        "name": "Prefer",
        "value": "return=representation"
      }
    ]
  }
}
```

---

## Implementation Steps (RECOMMENDED: Manual)

1. Open n8n: https://visionairy.app.n8n.cloud
2. Navigate to workflow: **Stocker Tool: get_next_item (Optimized)**
3. Click on the **Update Session** HTTP Request node
4. Scroll down to **Headers** section
5. Toggle **Send Headers** to ON
6. Click **Add Header**
7. Set:
   - Name: `Prefer`
   - Value: `return=representation`
8. Click **Save**
9. Test the workflow

---

## Validation Tests

After applying fix, test these scenarios:

### Test 1: Normal Flow on Machine 3
1. Start a route with 5 machines
2. Complete machines 1 and 2
3. On machine 3, say "next" to get items 1-2
4. Say "next" again → Should get items 3-4, NOT "route finished"

### Test 2: Skip and Return
1. Start a route
2. Skip machines 1 and 2
3. Start machine 3
4. Complete all items on machine 3
5. Should return to machine 1 (skipped), NOT declare route finished

### Test 3: Session Persistence
Query database before and after "next" command:
```sql
SELECT current_item_index, current_machine_id, updated_at
FROM sessions
WHERE user_id = '365ffef8-d9b5-45fd-b58e-ff828fe96148'
  AND status = 'stocking';
```

`current_item_index` should increment after each "next" command.

---

## Success Criteria

✅ Fix is complete when ALL are true:

1. Update Session node has `Prefer: return=representation` header
2. Test 1 passes: Machine 3 shows items 3-4 after saying "next" twice
3. Test 2 passes: After completing machine 3, returns to skipped machines
4. Database query shows `current_item_index` incrementing correctly
5. No "Route finished" message until all machines actually complete

---

**Status:** Ready for implementation
**Estimated Time:** 5 minutes (manual)
**Risk:** LOW (same fix already working in start_machine workflow)
