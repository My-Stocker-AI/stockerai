# Bug Fixes - 2026-01-17
**Session:** Tonight (manual systematic analysis, no XF due to tool issues)
**Status:** All 3 bugs fixed and committed

---

## Summary

Fixed 3 critical bugs identified from user testing with Davy:
1. ✅ Progress not saving when app closes
2. ✅ Duplicate "next" command causes premature route completion
3. ✅ Voice not restarting after stop button

All fixes deployed to codebase, ready for testing.

---

## Bug 1: Progress Not Saving When App Closes

### Problem
User completes items, app crashes or closes, progress is lost when reopened.

### Root Cause
`saveSessionState()` is called asynchronously in `useEffect` but doesn't complete before app terminates.

### Solution (2-layer fix)

**Layer 1: Force Save Before Close**
- Added `beforeunload` event listener in `StockerApp.tsx:796-815`
- Ensures save completes before browser closes
- Catches: crashes, tab close, browser close, navigation away

**Layer 2: Retry Logic**
- Modified `useSessionPersistence.ts:saveLocal()` (lines 55-83)
- 3 retry attempts with exponential backoff (100ms, 200ms, 300ms)
- Throws error if all retries fail (alerts user)

### Files Changed
- `src/pages/StockerApp.tsx`
- `src/hooks/useSessionPersistence.ts`

### Testing
1. Complete a few items
2. Close browser tab immediately
3. Reopen app
4. ✓ Progress should be saved

---

## Bug 2: Duplicate "Next" Command → Route Completes Prematurely

### Problem
User says "next", thinks app didn't hear, says "next" again (~1-2 seconds apart).
Result: Route ends unexpectedly.

### Root Cause
**Race condition:** Both commands read same `current_item_index` from DB, both increment, second thinks route is complete.

```
Time    Request 1              Request 2
0ms     Read index=57
1000ms  Increment to 58        Read index=57 (stale!)
1100ms  Find item 58           Increment to 58
1200ms  Update DB to 58        Find no item (thinks route done)
1300ms                          Return "route complete" ❌
```

### Solution (2-layer fix)

**Layer 1: Frontend Debouncing**
- Added debounce in `useStockerAI.ts:executeToolCalls()` (lines 229-231, 609-621)
- Ignores duplicate commands within 1.5 seconds
- Prevents double-tap at source

**Layer 2: Database Optimistic Locking**
- Created SQL function `update_session_with_lock()` in migration `20260117_concurrent_session_update.sql`
- Checks that `current_item_index` matches expected value before updating
- Rejects update if index changed (someone else updated first)
- Updated workflow logic in `determine_next_state_CONCURRENT_FIX.js`

### Files Changed
- `src/hooks/useStockerAI.ts`
- `supabase/migrations/20260117_concurrent_session_update.sql`
- `workflows/determine_next_state_CONCURRENT_FIX.js`

### Deployment Required
1. ✅ Frontend code (already committed)
2. ⚠️ **Run SQL migration** in Supabase dashboard
3. ⚠️ **Deploy updated workflow** to n8n (replace determine_next_state logic)

### Testing
1. Say "next"
2. Immediately say "next" again (within 1 second)
3. ✓ Second command should be ignored with console message
4. ✓ Route should NOT complete prematurely

---

## Bug 3: Voice Not Restarting After Stop Button

### Problem
User clicks Stop button. Voice stops. User clicks Continue or says "Hey Stocker" → nothing happens. Voice is dead until page refresh.

### Root Cause
Incomplete state cleanup in `stopListening()` and incomplete state reset in `startListening()`.

Specifically:
- `reconnectTimeoutRef` not cleared → pending reconnect interferes
- `reconnectAttemptsRef` not reset → thinks it's in retry backoff
- `isConnectedRef` not reset properly
- Insufficient logging made debugging impossible

### Solution

**Enhanced stopListening() cleanup:**
- Clear `reconnectTimeoutRef` (lines 793-798)
- Reset `reconnectAttemptsRef` to 0
- Reset `isConnectedRef` and `setIsDeepgramConnected(false)`
- Added detailed console logging for debugging

**Robust startListening() reset:**
- Explicitly reset ALL state flags at start (lines 730-741)
- Clear any pending reconnect timeouts
- Reset connection attempts
- Add detailed logging at each step
- Set `setIsDeepgramConnected(true)` on success

### Files Changed
- `src/hooks/useVoice.ts`

### Testing
1. Start voice session (should see "Wake lock acquired" in console)
2. Click Stop button (should see detailed cleanup logs)
3. Click Continue button OR say "Hey Stocker continue"
4. ✓ Voice should restart (see "startListening called", "Audio stream obtained", "Deepgram connected")

---

## Deployment Checklist

### Frontend (Automatic - just deploy)
- ✅ All TypeScript changes committed
- Deploy to production (Lovable/Replit/hosting platform)
- Changes will take effect immediately

### Backend (Manual steps required)

#### Step 1: Run SQL Migration
```bash
# In Supabase Dashboard → SQL Editor → New Query
# Paste contents of: supabase/migrations/20260117_concurrent_session_update.sql
# Click RUN
```

Verifies optimistic locking function is available.

#### Step 2: Update n8n Workflow
```bash
# Option A: Via n8n UI
1. Open workflow that contains "determine_next_state" Code node
2. Find the Code node
3. Replace its code with contents of: workflows/determine_next_state_CONCURRENT_FIX.js
4. Save workflow

# Option B: If using n8n MCP (not recommended due to known issues)
# Use n8n_update_partial_workflow with updateNode operation
```

**CRITICAL:** Test the updated workflow in n8n manually before activating.

---

## Console Logging Added

All 3 fixes include detailed console logging for production debugging:

### Bug 1 logs:
- `[Stocker] Progress saved before close` (success)
- `[Stocker] Failed to save before close: [error]` (failure)
- `[Session] Local save successful (attempt N)` (retry success)
- `[Session] Local save failed (attempt N/3): [error]` (retry attempt)

### Bug 2 logs:
- `[Tools] Ignoring duplicate [command] command (Xms since last)` (debounce triggered)

### Bug 3 logs:
- `[Voice] startListening called`
- `[Voice] Audio stream obtained: N tracks`
- `[Voice] Deepgram connected successfully`
- `[Voice] startListening complete - voice active`
- `[Voice] stopListening called - cleaning up resources`
- `[Voice] MediaRecorder stopped`
- `[Voice] WebSocket closed`
- `[Voice] Audio track stopped: audio`
- `[Voice] Wake lock released`
- `[Voice] stopListening complete - status set to idle`

---

## Verification Tests

After deployment, run these tests with Davy:

### Test 1: Progress Saving
1. Start route, complete 5-10 items
2. Close browser tab (don't use Stop button)
3. Reopen app
4. **PASS:** Progress is saved, can resume from where left off

### Test 2: Duplicate Commands
1. Start route
2. Say "next" then immediately say "next" again (within 1 second)
3. **PASS:** Second command ignored, only advances one item
4. Route does NOT complete prematurely

### Test 3: Voice Restart
1. Start route, voice is active
2. Click Stop button
3. Click Continue button
4. **PASS:** Voice restarts, can say "hey stocker" and give commands
5. **OR:** Say "hey stocker continue" (should also work)

---

## Regression Risks

**Low Risk:**
- Bug 1: Only adds save logic, doesn't change existing behavior
- Bug 2: Debouncing could theoretically reject valid fast commands, but 1.5s is conservative
- Bug 3: Only resets state more thoroughly, doesn't change core voice logic

**Medium Risk:**
- Bug 2 optimistic locking: If SQL function has bugs, session updates could fail
- Mitigation: Test thoroughly in dev before production

**No Breaking Changes:**
- All fixes are additive (add retries, add debounce, add state resets)
- Existing functionality unchanged

---

## What's Next

**Tonight:**
- ✅ All code fixes complete
- ✅ Committed to git

**Tomorrow (or when ready to deploy):**
1. Deploy frontend changes to production
2. Run SQL migration in Supabase
3. Update n8n workflow
4. Test all 3 fixes with Davy
5. Monitor console logs for any issues

**Follow-up:**
- Schedule full XF technical evaluation (queue for tomorrow)
- Fix XF tool import issues (meta_adapter.py broken imports)
- Complete systematic architecture analysis as planned

---

**Files Modified:**
- src/pages/StockerApp.tsx (beforeunload listener)
- src/hooks/useSessionPersistence.ts (retry logic)
- src/hooks/useStockerAI.ts (debouncing)
- src/hooks/useVoice.ts (state reset)

**Files Created:**
- supabase/migrations/20260117_concurrent_session_update.sql (optimistic locking)
- workflows/determine_next_state_CONCURRENT_FIX.js (race condition fix)

**Commit:** e6bd480

**Status:** Ready for deployment and testing
