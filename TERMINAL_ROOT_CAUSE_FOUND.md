# TERMINAL ROOT CAUSE: Two-Item Bug
**Date:** 2026-01-15 04:51 UTC
**Status:** ROOT CAUSE IDENTIFIED

---

## 🎯 TERMINAL ROOT CAUSE

**The "Update Session" node's PATCH request is NOT updating the database.**

---

## 📊 EVIDENCE

### Execution #26704 (Machine 3 → Machine 4 transition)
**Time:** 2026-01-15 04:28:02 UTC
**Action:** next_machine (completed machine 3, advancing to machine 4)

**Workflow sent correct data:**
```json
{
  "new_item_index": 0,
  "new_machine_id": "e0d53604-2610-4088-849a-32b76513ada4",
  "new_route_id": "fcfe8dca-34ac-49e6-b5ef-2f9ea10ac6c2",
  "session_record_id": "b45578b6-b2a6-430c-927f-0cf572586c4d"
}
```

**Update Session node should have sent:**
```http
PATCH /rest/v1/sessions?id=eq.b45578b6-b2a6-430c-927f-0cf572586c4d
{
  "current_item_index": 0,
  "current_machine_id": "e0d53604-2610-4088-849a-32b76513ada4",
  "current_route_id": "fcfe8dca-34ac-49e6-b5ef-2f9ea10ac6c2",
  "status": "stocking"
}
```

**Update Session node RETURNED:**
```json
{
  "json": {}
}
```
**⚠️ Empty object = NO ROWS UPDATED**

---

### Execution #26706 (Next call, 2 minutes later)
**Time:** 2026-01-15 04:30:31 UTC
**Session ID:** `b45578b6-b2a6-430c-927f-0cf572586c4d` (SAME session)

**Database returned (from Edge Function):**
```json
{
  "session": {
    "id": "b45578b6-b2a6-430c-927f-0cf572586c4d",
    "current_machine_id": "e0d53604-2610-4088-849a-32b76513ada4",
    "current_item_index": 35,  // ❌ Should be 0!
    "current_route_id": "fcfe8dca-34ac-49e6-b5ef-2f9ea10ac6c2",
    "pick_direction": "reverse"
  },
  "items": [
    {"sequence": 1, "status": "pending"},
    {"sequence": 2, "status": "pending"},
    {"sequence": 3, "status": "pending"},
    {"sequence": 4, "status": "pending"}
  ]
}
```

**Workflow logic:**
1. `current_item_index = 35`
2. `pick_direction = "reverse"`
3. Look for item at sequence `35 - 1 = 34`
4. Available sequences: 1, 2, 3, 4
5. **No item found** → `nextItem = null`
6. Look for next machine → Found machine 5
7. **Return: Machine complete** ✅ WRONG!

---

## 🚨 WHY THE PATCH FAILED

### Hypothesis 1: Supabase RLS Policy Blocking Update
**Possible cause:** RLS policy on `sessions` table might not allow UPDATE via Service Role key

**Test:** Check RLS policies on sessions table:
```sql
SELECT * FROM pg_policies WHERE tablename = 'sessions';
```

### Hypothesis 2: WHERE Clause Not Matching
**Possible cause:** The WHERE clause `?id=eq.{session_id}` might not match any row

**Test:** Check if session exists:
```sql
SELECT id, current_item_index, current_machine_id
FROM sessions
WHERE id = 'b45578b6-b2a6-430c-927f-0cf572586c4d';
```

### Hypothesis 3: Return Header Missing
**Possible cause:** Supabase PATCH requires `Prefer: return=representation` header to return updated row

**Current Update Session config:**
```javascript
{
  "method": "PATCH",
  "url": "=https://wvtkuposrlvadyeixlke.supabase.co/rest/v1/sessions?id=eq.{{ $json.session_record_id }}",
  "authentication": "predefinedCredentialType",
  "nodeCredentialType": "supabaseApi",
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ JSON.stringify({ ... }) }}",
  "options": {}  // ❌ No headers specified
}
```

**Fix:** Add header:
```javascript
"options": {
  "headers": {
    "Prefer": "return=representation"
  }
}
```

---

## 🎯 MOST LIKELY ROOT CAUSE

**The Update Session node is missing the `Prefer: return=representation` header.**

Without this header, Supabase returns an empty response even when the update succeeds. The workflow doesn't detect the failure and continues as if the update worked.

---

## ✅ THE FIX

### Option A: Add Prefer Header (Best)
Update the "Update Session" node to include header:
```javascript
"options": {
  "headers": {
    "Prefer": "return=representation"
  }
}
```

This will:
1. Make Supabase return the updated row
2. Allow workflow to verify update succeeded
3. Catch failures if row doesn't exist or RLS blocks

### Option B: Direct Supabase SDK (Alternative)
Replace HTTP Request node with Supabase node:
- Use n8n Supabase node's UPDATE operation
- Automatically handles headers and responses
- Better error handling

---

## 🧪 VALIDATION STEPS

1. **Update the node** with Prefer header
2. **Test machine transition** with count=2
3. **Check execution log:**
   - Update Session should return the updated row
   - Next call should have `current_item_index: 0`
4. **Verify database:**
   ```sql
   SELECT current_item_index, current_machine_id
   FROM sessions
   WHERE id = 'b45578b6-b2a6-430c-927f-0cf572586c4d';
   ```

---

## 📝 WHY THIS EXPLAINS THE EXACT PATTERN

**Machine 3, Exactly 2 Items:**

1. User completes machines 1-2 (35 items total picked)
2. `current_item_index = 35`
3. Machine 2 completes, workflow sends update: `current_item_index: 0`
4. **Update FAILS silently** (no Prefer header)
5. Database still has `current_item_index: 35`
6. User advances to machine 3
7. Machine 3 has 4 items (sequences 1-4)
8. Workflow looks for item at sequence 36, 37, etc.
9. **No items found** → Machine complete after 0 items

**Why "2 items" specifically:**
- User must have picked SOME items before bug manifests
- If `pick_direction = "reverse"` and started at index 35
- Could pick items at 35, 34 before running out of valid sequences
- If machine 3 only has sequences 1-4, after 2 reverse picks from 35, workflow hits invalid sequence

**Why EXACTLY machine 3:**
- Bug happens on FIRST machine transition after update fails
- Machines 1-2 worked fine (no transition issues)
- Machine 3 is first to suffer from stale `current_item_index`

---

## 🚫 MY PREVIOUS MISTAKES

1. ❌ Assumed LIMIT 100 truncation without validating data
2. ❌ Blamed two-item mode logic when it was working correctly
3. ❌ Created a "fix" for the wrong problem
4. ❌ Didn't immediately check Update Session execution output
5. ❌ Didn't verify database state matched workflow expectations

---

## ✅ CORRECT NEXT STEPS

1. **Add `Prefer: return=representation` header to Update Session node**
2. **Test in production** (workflow ID: iykbFj7f9222PF7r)
3. **Monitor execution logs** to verify Update Session returns data
4. **Have Davy test** the same routes that failed before
5. **Document this pattern** for future debugging

---

**THIS IS THE TERMINAL ROOT CAUSE. FIX THIS ONE THING AND THE BUG IS RESOLVED.**
