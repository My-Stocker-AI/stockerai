# StockerAI Recovery Checklist - Session 51

## CURRENT STATE (2026-01-31)

**System Status:** ⚠️ BROKEN
- Database migration complete (current_item_index removed)
- 2 of 9+ workflows updated
- Cannot start routes

## WHAT'S BEEN FIXED

✅ **set_route_sequence** (46lMRdxTgD1E3WFz)
✅ **start_machine** (JbKdJuKgGbyvzlF0)

## WHAT STILL NEEDS FIXING

### Critical (blocks core flow):
- [ ] skip_current_machine (ElCSMeguJNxwp0HO)
- [ ] get_next_item (iykbFj7f9222PF7r)
- [ ] go_back_to_skipped (rpNfINhjbFCuFrlZ)

### Medium (state management):
- [ ] update_session_state (ueDSi9SDBZ5jMwpO)
- [ ] switch_route (3G01u7N9REhrC9tn)

### Low (read-only):
- [ ] get_current_status (PD3ErCuxWBWLFXIq)
- [ ] delete_route (zmgTBX1w1rc5bOpO)

### Frontend (non-blocking):
- [ ] src/pages/dashboard/MyRoutes.tsx
- [ ] src/pages/dashboard/Usage.tsx
- [ ] src/types/contracts.ts
- [ ] src/integrations/supabase/types.ts

## THE 3-FIX PATTERN

For each workflow:

### Fix 1: SELECT queries
Find: `select=id,current_machine_id,current_item_index,status`
Fix: Remove `current_item_index,` 

### Fix 2: Code nodes
Find: `current_item_index: 1` or `current_item_index: itemIndex`
Fix: Delete entire line

### Fix 3: UPDATE queries
Find: `{{ JSON.stringify({ ..., current_item_index: ... }) }}`
Fix: Remove `current_item_index: ...` from object

## SYNTA.IO PROMPT (if using Synta)

```
# StockerAI - n8n Workflow Fix Request

## SYSTEM OVERVIEW
StockerAI is a voice-first vending machine inventory management system.
Route drivers use voice commands to stock machines hands-free.

Tech stack:
- Frontend: React + TypeScript (Cloudflare Pages)
- Backend: n8n workflows + Supabase PostgreSQL
- Voice: Deepgram + OpenAI TTS
- n8n instance: visionairy.app.n8n.cloud

## THE PROBLEM
Database migration removed the `sessions.current_item_index` column.
This broke multiple n8n workflows that SELECT or UPDATE this field.

Database change:
- BEFORE: sessions table had `current_item_index` column
- AFTER: Column removed (now using machines.completed_items instead)
- Impact: Any workflow referencing current_item_index fails with "column does not exist"

## WORKFLOWS TO FIX

All workflows are in the "StockerAI" folder (Personal project):

**Already fixed manually (use as examples):**
1. set_route_sequence (ID: 46lMRdxTgD1E3WFz)
2. start_machine (ID: JbKdJuKgGbyvzlF0)

**Need to scan and fix:**
3. skip_current_machine (ID: ElCSMeguJNxwp0HO)
4. get_next_item (ID: iykbFj7f9222PF7r)
5. update_session_state (ID: ueDSi9SDBZ5jMwpO)
6. get_current_status (ID: PD3ErCuxWBWLFXIq)
7. go_back_to_skipped (ID: rpNfINhjbFCuFrlZ)
8. switch_route (ID: 3G01u7N9REhrC9tn)
9. delete_route (ID: zmgTBX1w1rc5bOpO)

## FIX PATTERN (from manually fixed workflows)

For each workflow that touches the sessions table:

**Pattern 1: HTTP Request nodes with SELECT**
- Find: URL parameters like `select=id,current_machine_id,current_item_index,status`
- Fix: Remove `current_item_index,` from the select clause
- Example: `select=id,current_machine_id,status` (without current_item_index)

**Pattern 2: Code nodes that set current_item_index**
- Find: JavaScript lines like `current_item_index: 1` or `current_item_index: itemIndex`
- Fix: Delete the entire line

**Pattern 3: HTTP Request nodes with UPDATE/PATCH**
- Find: JSON body like `{{ JSON.stringify({ current_machine_id: $json.machine_id, current_item_index: $json.index }) }}`
- Fix: Remove `current_item_index: ...` from the JSON object

## WHAT I NEED

1. Scan all workflows in StockerAI folder
2. Identify which ones reference current_item_index
3. Apply the fix pattern to each workflow
4. Validate workflows will work together
5. Test that route start → machine transition → item picking flow works

## EXPECTED BEHAVIOR AFTER FIX

User should be able to:
1. Start a route (calls set_route_sequence)
2. Choose top/bottom of machine (calls start_machine)
3. Pick items with "next" command (calls get_next_item)
4. Skip machines if needed (calls skip_current_machine)
5. Complete route successfully

All without "column does not exist" errors.

## SUPABASE CONNECTION

Database: wvtkuposrlvadyeixlke.supabase.co
Table: sessions (now without current_item_index column)
Auth: Workflows use Supabase API credential stored in n8n

Please scan, fix, and validate all workflows.
```

## TESTING PLAN

After all fixes applied:

### Test 1: Route Start
1. Open StockerAI app
2. Say route name
3. Expected: Route starts, asks top/bottom
4. Check: No "column does not exist" errors

### Test 2: Machine Start
1. Say "top" or "bottom"
2. Expected: First item announced
3. Check: Progress bar shows 0/X items

### Test 3: Item Picking
1. Say "next" multiple times
2. Expected: Items announced, progress updates
3. Check: completed_items increments in database

### Test 4: Machine Complete
1. Pick all items in machine
2. Expected: "Machine complete, next machine?"
3. Check: Transitions to next machine correctly

### Test 5: Skip and Resume
1. Say "skip" on a machine
2. Say "back" later
3. Expected: Returns to skipped machine
4. Check: Resumes at correct position

## ROLLBACK PLAN (if needed)

If Synta can't fix or makes it worse:

```sql
-- Restore current_item_index column
ALTER TABLE sessions
ADD COLUMN current_item_index INTEGER;

-- Set default for existing rows
UPDATE sessions
SET current_item_index = 1
WHERE current_item_index IS NULL;
```

This restores database to pre-migration state.
Then manually revert workflow changes in n8n.

## KEY FILES

- MEMORY.md - Complete session history
- /home/visionairy/StockerAI/CLAUDE.md - System documentation
- supabase/migrations/20260131_remove_current_item_index_SYSTEMIC_FIX.sql - Migration that ran
- workflows/SYSTEMIC_FIX_determine_next_state_SINGLE_COUNTER.js - New workflow code

