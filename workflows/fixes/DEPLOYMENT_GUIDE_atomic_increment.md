# DEPLOYMENT GUIDE: Atomic Increment Fix

**Fixes Applied:** Race Condition + Hardcoded API Keys
**Files Modified:** 1 database function, 1 workflow node
**Estimated Time:** 5 minutes
**Risk Level:** LOW (zero breaking changes)

---

## STEP 1: Deploy Database Migration

### 1.1 Open Supabase SQL Editor
1. Go to https://supabase.com/dashboard
2. Select your project: `my-stocker-ai`
3. Click **SQL Editor** in left sidebar

### 1.2 Run Migration
1. Click **New Query**
2. Copy entire contents of:
   ```
   supabase/migrations/20260208_atomic_increment_machine_items.sql
   ```
3. Paste into SQL Editor
4. Click **Run** (or press Ctrl/Cmd + Enter)

### 1.3 Verify Success
You should see:
```
NOTICE: Function created successfully. Ready for workflow integration.
```

If you see an error, **STOP** and share the error message.

---

## STEP 2: Update n8n Workflow

### 2.1 Open Workflow
1. Go to https://visionairy.app.n8n.cloud
2. Open workflow: **"Stocker Tool: get_next_item (Optimized)"**
   - Workflow ID: `iykbFj7f9222PF7r`

### 2.2 Find Node to Update
1. Locate node: **"Increment Completed Items"**
   - It's a Code node
   - Position: Between "Switch Action" and "Merge All Paths"
   - Currently has ~30 lines of code with hardcoded API keys

### 2.3 Replace Node Code
1. Click the **"Increment Completed Items"** node
2. **Select ALL existing code** (Ctrl/Cmd + A)
3. **Delete it**
4. Copy entire contents of:
   ```
   workflows/fixes/get_next_item_increment_completed_items_ATOMIC_FIX.js
   ```
5. Paste into node
6. Click **Execute Node** to test (should succeed if data is available)

### 2.4 Save Workflow
1. Click **Save** button (top right)
2. Verify save succeeded (green checkmark)

### 2.5 Keep Workflow Active
⚠️ **DO NOT deactivate/reactivate** - webhook will break
The workflow is already active, just saved with new code.

---

## STEP 3: Verify Fix

### 3.1 Test Race Condition Protection
**Manual Test (requires voice session):**
1. Start a stocking session
2. Say "next" twice rapidly (as fast as possible)
3. Check progress counter - should increment by 2, not 1

**Database Test (optional):**
```sql
-- Test atomic increment
SELECT * FROM increment_machine_items(
  '<any-machine-id>'::uuid,
  1
);

-- Should return: completed_items, total_items, items_remaining
```

### 3.2 Verify Security Fix
1. Open n8n workflow
2. Open "Increment Completed Items" node
3. Search for "eyJhbGci" (start of JWT token)
4. **Should find ZERO matches** (hardcoded keys removed)

---

## ROLLBACK (if needed)

### If Something Goes Wrong:

**Rollback Database:**
```sql
DROP FUNCTION IF EXISTS increment_machine_items(UUID, INTEGER);
```

**Rollback Workflow:**
1. Open n8n workflow version history
2. Restore previous version (before this change)

---

## VERIFICATION CHECKLIST

- [ ] Migration ran successfully (saw success notice)
- [ ] Function exists: `SELECT * FROM pg_proc WHERE proname = 'increment_machine_items';`
- [ ] Workflow saved successfully (no errors)
- [ ] No hardcoded API keys in node (search for "eyJhbGci")
- [ ] Test "next" command works (single test)
- [ ] (Optional) Test rapid "next" commands (race condition)

---

## WHAT CHANGED?

**Before:**
```javascript
// Read current value
completed_items = 5

// Calculate new value
new_completed_items = 5 + 1 = 6

// Write new value (RACE CONDITION HERE)
PATCH /machines { completed_items: 6 }
```

**After:**
```javascript
// Atomic increment (PostgreSQL locks row)
RPC increment_machine_items(machine_id, increment: 1)

// Returns: { completed_items: 6, total_items: 10, items_remaining: 4 }
```

**Benefits:**
- ✅ Race condition eliminated (atomic operation)
- ✅ Hardcoded API keys removed (security fix)
- ✅ Same behavior (increments by same amount)
- ✅ Same performance (single DB operation)

---

## SUPPORT

If you encounter any issues during deployment:
1. Copy the error message
2. Note which step failed (Step 1, 2, or 3)
3. Share both for troubleshooting
