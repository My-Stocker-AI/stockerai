# System Impact Audit: Count/Machine/Route Systemic Failures

**Date:** 2026-01-22
**Auditor:** Claude Sonnet 4.5
**Authority:** MANDATORY SYSTEM IMPACT AUDIT PROTOCOL

---

## Reported Issues (User)

1. **Inventory count showing 0/0** in pick cards for both items
2. **Only announcing 1 item** when count=2 is active (user says it's broken, but n8n logs show 2 items sent)
3. **Machine finished at 28/29 items** - Off by 1 error, didn't pick last item
4. **Route finished after 1 machine** instead of continuing to next machine (7 total)
5. **Total picked count is wrong**

---

## THE 6 AUDIT QUESTIONS

### 1. DATA FLOW - What data enters/exits? What format? What if it changes?

**ENTRY POINTS:**
- User says "next" → Frontend → n8n webhook
- Session state: `count` setting (1 or 2), `current_item_index`, `current_machine_id`, `current_route_id`
- Database: `route_items` table (products, quantities, slots, sequence)
- Database: `session_state` table (progress tracking)

**DATA TRANSFORMATIONS:**
1. `get_next_item` workflow:
   - Input: `session_id`, `count` setting
   - Determine Next State: Calculates next item(s), inventory, remaining items
   - Format Output: Constructs voice text, display text
   - Update Session State: Writes new `item_index`, `machine_id`, `route_id`
   - Output: Voice announcement + UI data

2. `start_machine` workflow:
   - Input: `session_id`, `machine_id`
   - Select Item: Gets first item(s) based on `count` and `pick_direction`
   - Format Output: Constructs initial announcement
   - Update Session State: Sets initial `item_index`
   - Output: First item announcement

**EXIT POINTS:**
- Voice announcement (TTS)
- UI display (product cards, progress bar, inventory counts)
- Database updates (session_state tracking)

**CRITICAL FORMATS:**
```javascript
// Determine Next State output
{
  action: "next_item" | "next_machine" | "complete",
  product_name: string,
  quantity: number,
  slot: string,
  product_name2: string | null,  // When count=2
  quantity2: number | null,
  slot2: string | null,
  inventory_current: number,
  inventory_parlevel: number,
  items_remaining: number,
  new_item_index: number,
  new_machine_id: uuid,
  machine_complete: boolean,
  route_complete: boolean
}
```

### 2. CALLERS (Upstream) - Who calls this? What do they expect?

**CALLERS:**
1. **Frontend (Next button)** → `get_next_item` webhook
   - Expects: Voice text, display text, progress updates
   - Depends on: Accurate `items_remaining`, correct `action` (next_item vs next_machine vs complete)

2. **Frontend (Start machine)** → `start_machine` webhook
   - Expects: First item(s) announcement, initial progress state
   - Depends on: Correct `pick_direction`, proper `count` handling

3. **Frontend (Settings toggle)** → Updates `count` in session state
   - Expects: Next call to `get_next_item` respects new `count` setting
   - Depends on: Session state persistence

**EXPECTATIONS BROKEN:**
- ❌ Inventory counts showing 0/0 (Frontend expects `inventory_current` and `inventory_parlevel`)
- ❌ Machine finishes early (Frontend expects `machine_complete=false` until all items picked)
- ❌ Route finishes after 1 machine (Frontend expects `action=next_machine` not `action=complete`)

### 3. CALLEES (Downstream) - What does this call? What does it need?

**CALLEES:**
1. **Supabase RPC: `get_session_state`**
   - Needs: `session_id`
   - Returns: Current progress state
   - Used by: All workflows

2. **Supabase RPC: `update_session_state`**
   - Needs: `session_id`, `new_item_index`, `new_machine_id`, `new_route_id`, `expected_index` (optimistic lock)
   - Updates: Progress tracking
   - Used by: `get_next_item`, `start_machine`

3. **Supabase Query: `route_items`**
   - Needs: `machine_id`, `route_id`
   - Returns: All items for current machine
   - Used by: `start_machine` (Select Item node), `get_next_item` (Determine Next State)

4. **Supabase Query: `machines`**
   - Needs: `route_id`, `current_machine_sequence`
   - Returns: Next machine in route
   - Used by: `get_next_item` (when machine complete)

5. **Supabase Query: `skipped_machines`**
   - Needs: `session_id`, `route_id`
   - Returns: Machines marked as skipped
   - Used by: `get_next_item` (route completion logic)

**DEPENDENCIES BROKEN:**
- ❌ `items_remaining` calculation wrong → Machine finishes early
- ❌ `machine_complete` logic wrong → Triggers route completion too early
- ❌ `inventory_current` not passed → Shows 0/0 in UI

### 4. SIDE EFFECTS - Database writes? Emails? API calls?

**DATABASE WRITES:**
1. `session_state` table:
   - `item_index` updated on every "next"
   - `machine_id` updated on machine transition
   - `route_id` updated on route transition
   - `status` updated on completion

2. `skipped_machines` table:
   - Written when user says "skip"
   - Read when checking for pending machines

**EXTERNAL CALLS:**
- None (no emails, no external APIs)

**SIDE EFFECTS BROKEN:**
- ❌ `item_index` incremented incorrectly → Off by 1 errors
- ❌ `machine_complete` set prematurely → Route logic breaks

### 5. STATE DEPENDENCIES - Race conditions? Caches? Locks?

**STATE TRACKING:**
- `session_state.item_index` - Current position in items list
- `session_state.machine_id` - Current machine
- `session_state.route_id` - Current route
- `session_state.count` - Number of items to announce (1 or 2)

**RACE CONDITIONS:**
- ✅ Fixed: Optimistic locking on `item_index` (recent commit 6a51a9d)
- ❌ Potential: `count` setting change mid-route (not currently handled)

**CACHE ISSUES:**
- Frontend localStorage for `count` setting
- Session state in database
- If out of sync → Mismatched behavior

### 6. ERROR PROPAGATION - When this fails, what happens?

**FAILURE MODES:**

1. **Wrong `items_remaining` calculation**
   - Triggers: `machine_complete=true` too early
   - Cascades: Route completion logic runs prematurely
   - Result: Route ends after 1 machine

2. **Missing `inventory_current`/`inventory_parlevel`**
   - Triggers: Format Output doesn't include inventory fields
   - Cascades: Frontend displays 0/0
   - Result: User sees incorrect inventory

3. **Wrong `action` decision (next_item vs next_machine vs complete)**
   - Triggers: Machine completion logic wrong
   - Cascades: Frontend thinks route is done
   - Result: User can't continue picking

4. **Index off by 1**
   - Triggers: Reverse mode calculation wrong OR count=2 index increment wrong
   - Cascades: Last item never reached OR skips items
   - Result: Machine finishes at 28/29 instead of 29/29

---

## BOUNDARY ANALYSIS

### UPSTREAM BOUNDARIES (What Feeds This System)

1. **User Input**
   - "next" command
   - "top" or "bottom" (pick direction)
   - Settings toggle (count=1 or count=2)

2. **Database State**
   - `route_items` (product catalog)
   - `session_state` (current progress)
   - `machines` (route configuration)

### DOWNSTREAM BOUNDARIES (What This System Affects)

1. **User Experience**
   - Voice announcements
   - Visual display (product cards, progress bar)
   - Route completion feedback

2. **Database State**
   - Progress tracking (`session_state`)
   - Completion status
   - Skip history

### SIDE EFFECT BOUNDARIES

1. **Session State Mutations**
   - Every "next" updates index
   - Machine transitions update machine_id
   - Route transitions update route_id

2. **UI State**
   - Progress bar rendering
   - Inventory display
   - Completion screens

---

## ROOT CAUSE HYPOTHESES

### Issue 1: Inventory Count 0/0

**Hypothesis:** Format Output node doesn't include `inventory_current` and `inventory_parlevel` in output

**Evidence Needed:**
- Check Format Output node code
- Check n8n execution logs for these fields
- Check what Determine Next State outputs

### Issue 2: Only 1 Item Announced (count=2)

**Hypothesis A:** Frontend localStorage `count` setting not syncing with session state
**Hypothesis B:** Format Output receives `product_name2=null` when it should have value
**Hypothesis C:** TTS only reads first item (frontend bug)

**Evidence Needed:**
- Check n8n execution logs for `product_name2` field
- Check frontend localStorage
- Check audio playback logic

### Issue 3: Machine Finished 28/29

**Hypothesis:** `items_remaining` calculation wrong in reverse mode OR off-by-1 in count=2 mode

**Evidence Needed:**
- Check Determine Next State `items_remaining` calculation
- Check what triggers `machine_complete=true`
- Compare forward vs reverse mode logic

### Issue 4: Route Finished After 1 Machine

**Hypothesis:** Machine completion logic incorrectly triggers route completion

**Evidence Needed:**
- Check logic that decides `action=complete` vs `action=next_machine`
- Check if `skipped_machines` logic interfering
- Check if `next_machine` query returning null prematurely

### Issue 5: Total Picked Count Wrong

**Hypothesis:** Related to #3 - if machine finishes early, total count will be wrong

---

## REQUIRED ADDITIONAL CHANGES

*(To be filled after evidence gathering)*

---

## TESTING PLAN

1. **Test inventory display**
   - Start route, say "next"
   - Verify UI shows correct `inventory_current` and `inventory_parlevel`

2. **Test count=2 announcement**
   - Set count=2 in settings
   - Say "next" with 2+ items remaining
   - Verify voice announces BOTH items
   - Verify UI shows BOTH items

3. **Test machine completion**
   - Complete all items in machine (forward mode)
   - Complete all items in machine (reverse mode)
   - Verify announces "next_machine" not "complete"

4. **Test route completion**
   - Complete all 7 machines
   - Verify route completion only after last machine

5. **Test total count accuracy**
   - Track items picked throughout route
   - Verify total matches route_items count

---

## ROLLBACK PLAN

If fixes break existing functionality:

1. Revert to commit: `fd73e3d` (last known stable state)
2. Document what broke
3. Create hotfix branch
4. Re-apply fixes incrementally with testing

---

## RISK ASSESSMENT

**Severity:** CRITICAL - Core workflow broken, unusable in production

**Complexity:** HIGH - Multiple interrelated issues, state management, index arithmetic

**Blast Radius:**
- Affects: All routes, all machines, all users
- Does not affect: Database integrity, authentication, other workflows

**Confidence in Fix:** MEDIUM (need evidence gathering first)

---

## NEXT STEPS

1. ✅ Create this audit document
2. ⏳ Gather evidence for each hypothesis
3. ⏳ Identify root causes with certainty
4. ⏳ Design fixes in correct order
5. ⏳ Implement with verification
6. ⏳ Test systematically
7. ⏳ Deploy with rollback plan ready

---

**Status:** AUDIT IN PROGRESS - Evidence gathering phase
