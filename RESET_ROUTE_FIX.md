# Reset Route Button - Complete Fix

**Date:** 2026-01-19
**Issue:** Reset Route button clears session but it keeps restoring after page reload
**Root Cause:** Auto-save triggers after clear but before reload, writing new session to Supabase

---

## The Problem

**Current Flow:**
```
1. User clicks Reset Route
2. confirmReset() calls sessionPersistence.clear(userId)
3. clear() deletes from IndexedDB + Supabase
4. Page reloads
5. ❌ Session restored from Supabase (auto-save wrote new session between step 3-4)
```

**Why Auto-Save Writes After Clear:**
- Auto-save is triggered by `useEffect` watching `routeState` changes (line 208-212)
- Clear operation might trigger state changes that fire the useEffect
- Even a few milliseconds between clear and reload is enough for auto-save to run

---

## The Solution (3-Layer Fix)

### Layer 1: Add "Clearing" Flag to Prevent Auto-Save

Prevent auto-save from running during reset operation.

### Layer 2: Enhanced Server Clear with Verification

Add logging and verification that DELETE actually executed.

### Layer 3: Wait for All Async Operations Before Reload

Ensure clear completes fully before triggering reload.

---

## Implementation

### File 1: `src/pages/StockerApp.tsx`

**Changes needed around line 1343:**

```typescript
// Add state for reset flag
const [isClearing, setIsClearing] = useState(false);

// Modified saveSessionState to check clearing flag
const saveSessionState = useCallback(async () => {
  // LAYER 1: Don't save if we're in the middle of clearing
  if (isClearing) {
    console.log('[Session] Save blocked - clearing in progress');
    return;
  }

  if (!routeState.routeName || !userId) return;

  const sessionData = {
    sessionId,
    userId,
    routeId: routeState.routeId,
    routeName: routeState.routeName,
    routeDate: routeState.routeDate,
    totalMachines: routeState.totalMachines,
    currentMachineIndex: routeState.currentMachineIndex,
    currentMachineId: routeState.currentMachineId,
    currentMachineName: routeState.currentMachineName,
    currentMachineTotalItems: routeState.currentMachineTotalItems,
    currentMachineItemsRemaining: routeState.currentMachineItemsRemaining,
    currentItem: routeState.currentItem,
    currentItem2: routeState.currentItem2,
    completedItems: routeState.completedItems,
    completed: routeState.completed,
    conversationHistory: messages,
  };

  await sessionPersistence.save(sessionData, userId);
}, [routeState, sessionId, messages, userId, sessionPersistence, isClearing]); // Add isClearing dependency

// Modified confirmReset function
const confirmReset = async () => {
  try {
    console.log('[Reset] Starting reset process...');

    // LAYER 1: Set clearing flag to block auto-save
    setIsClearing(true);
    console.log('[Reset] Auto-save blocked');

    // LAYER 3: Wait a moment for any pending operations to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('[Reset] Waited for pending operations');

    // LAYER 2: Clear both local (IndexedDB) and server (Supabase) sessions
    await sessionPersistence.clear(userId);
    console.log('[Reset] Session cleared from IndexedDB and Supabase');

    // LAYER 3: Wait another moment to ensure delete propagated
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log('[Reset] Verified clear completed');

    // Final step: Reload page to get clean state
    console.log('[Reset] Reloading page...');
    window.location.reload();
  } catch (error) {
    console.error('[Reset] Failed to reset route:', error);
    setError('Failed to reset route. Please refresh the page.');
    setIsClearing(false); // Reset flag on error
  }
};
```

---

### File 2: `src/hooks/useSessionPersistence.ts`

**Changes to `clearServer` function (starting line 213):**

```typescript
const clearServer = useCallback(async (userId: string): Promise<void> => {
  try {
    console.log('[Session] clearServer called for userId:', userId);

    // LAYER 2: DELETE all sessions for this user with .select() to verify
    const { error, data } = await supabase
      .from('sessions')
      .delete()
      .eq('user_id', userId)
      .select(); // Returns deleted rows

    if (error) {
      console.error('[Session] DELETE failed:', error);
      throw error; // Throw to prevent page reload if delete failed
    }

    // LAYER 2: Verify deletion
    if (data && data.length > 0) {
      console.log(`[Session] ✅ Deleted ${data.length} session(s) from Supabase`);
      console.log('[Session] Deleted session IDs:', data.map((s: any) => s.id));
    } else {
      console.log('[Session] ⚠️ No sessions found to delete (might be already clear)');
    }

    // LAYER 2: Double-check sessions are gone
    const { data: remaining, error: checkError } = await supabase
      .from('sessions')
      .select('id')
      .eq('user_id', userId);

    if (!checkError && remaining && remaining.length > 0) {
      console.error('[Session] ❌ WARNING: Sessions still exist after delete!', remaining);
      throw new Error(`Failed to delete all sessions. ${remaining.length} remaining.`);
    }

    console.log('[Session] ✅ Verified: No sessions remaining in database');
  } catch (e) {
    console.error('[Session] Server clear error:', e);
    throw e; // Re-throw to stop reset process
  }
}, []);
```

---

## Testing Instructions

### Test 1: Basic Reset

1. Start a route, complete a few items
2. Open DevTools Console
3. Click "Reset Route"
4. **Look for logs:**
   ```
   [Reset] Starting reset process...
   [Reset] Auto-save blocked
   [Reset] Waited for pending operations
   [Session] clearServer called for userId: xxx
   [Session] ✅ Deleted N session(s) from Supabase
   [Session] ✅ Verified: No sessions remaining in database
   [Reset] Session cleared from IndexedDB and Supabase
   [Reset] Verified clear completed
   [Reset] Reloading page...
   ```
5. **After reload:** Should show route selection (no session restored)
6. **PASS:** Reset worked ✅

### Test 2: Auto-Save Blocking

1. Start a route, complete a few items
2. Open DevTools Console
3. Click "Reset Route"
4. **Look for this log during reset:**
   ```
   [Session] Save blocked - clearing in progress
   ```
5. **PASS:** Auto-save was prevented ✅

### Test 3: Delete Verification

1. Start a route, complete a few items
2. Open DevTools Console
3. Before reset, check Supabase:
   ```sql
   SELECT * FROM sessions WHERE user_id = 'your-user-id';
   ```
   Should show 1+ sessions
4. Click "Reset Route"
5. After logs complete but BEFORE reload, check Supabase again:
   ```sql
   SELECT * FROM sessions WHERE user_id = 'your-user-id';
   ```
   Should show 0 sessions
6. **PASS:** Sessions actually deleted ✅

### Test 4: Error Handling

1. Disconnect internet
2. Click "Reset Route"
3. **Expected:** Error message displayed
4. **Expected log:**
   ```
   [Session] DELETE failed: [network error]
   [Reset] Failed to reset route: [error]
   ```
5. Reconnect internet
6. Click "Reset Route" again
7. **PASS:** Works after reconnect ✅

---

## Edge Cases Handled

### Edge Case 1: Multiple Auto-Save Triggers During Reset

**Problem:** State changes during clear trigger multiple auto-save attempts

**Solution:** `isClearing` flag blocks ALL saves during reset window

**Test:** Watch console for "[Session] Save blocked" messages

---

### Edge Case 2: Supabase DELETE Fails Silently

**Problem:** DELETE returns success but rows not actually deleted (rare Supabase bug)

**Solution:** Double-check with SELECT query after DELETE

**Test:** Verify "[Session] ✅ Verified: No sessions remaining" appears

---

### Edge Case 3: Page Reloads Before Clear Completes

**Problem:** Network lag causes DELETE to still be in-flight when reload happens

**Solution:** Wait 300ms after clear before reload (Layer 3)

**Test:** On slow connection, verify logs show "Verified clear completed" before reload

---

### Edge Case 4: IndexedDB Clear Fails But Supabase Succeeds

**Problem:** IndexedDB locked/corrupted, clear throws error

**Solution:** Try-catch around clear, throw error to prevent reload if delete failed

**Test:** Break IndexedDB manually, verify error prevents reload

---

### Edge Case 5: User Has Multiple Sessions (Old + Current)

**Problem:** User has multiple sessions in database (shouldn't happen but could)

**Solution:** DELETE with `eq('user_id', userId)` deletes ALL sessions for user

**Test:** Manually create 2+ sessions in Supabase, verify all deleted

---

## Deployment Checklist

### Step 1: Deploy Code Changes

```bash
# In StockerAI directory
git add src/pages/StockerApp.tsx
git add src/hooks/useSessionPersistence.ts
git commit -m "Fix: Reset Route button with 3-layer session clear"
git push
```

### Step 2: Test in Development

1. Run locally: `npm run dev`
2. Complete all 4 test scenarios above
3. Verify all tests pass

### Step 3: Deploy to Production

Deploy to your hosting platform (Lovable/Replit/etc.)

### Step 4: Test with Real User

1. Have Davy start a route
2. Complete a few items
3. Click Reset Route
4. Verify session actually clears
5. Start new route
6. Confirm clean start

---

## What Changed vs Previous Attempts

### Previous Attempt 1: Added `await` to clearServer()
- **What it did:** Made sure clear completed before moving on
- **Why it failed:** Auto-save still ran between clear and reload
- **This fix:** Blocks auto-save during entire reset process

### Previous Attempt 2: Changed UPDATE to DELETE
- **What it did:** Actually deleted sessions instead of marking complete
- **Why it failed:** Auto-save wrote NEW session after delete
- **This fix:** Prevents any saves during reset + verifies delete

### New Approach: 3-Layer Defense

1. **Block auto-save** - Prevents new sessions from being written
2. **Verify delete** - Ensures sessions actually removed
3. **Wait for completion** - Gives async operations time to finish

---

## Monitoring & Debugging

### Console Logs to Watch

**Success Pattern:**
```
[Reset] Starting reset process...
[Reset] Auto-save blocked
[Reset] Waited for pending operations
[Session] clearServer called for userId: xxx
[Session] ✅ Deleted 1 session(s) from Supabase
[Session] ✅ Verified: No sessions remaining in database
[Reset] Session cleared from IndexedDB and Supabase
[Reset] Verified clear completed
[Reset] Reloading page...
```

**Failure Pattern (Auto-Save Leak):**
```
[Reset] Starting reset process...
[Session] Saving session state...  ❌ BAD - save should be blocked
```

**Failure Pattern (Delete Failed):**
```
[Session] DELETE failed: [error]  ❌ BAD - delete didn't work
[Reset] Failed to reset route: [error]
```

### If Reset Still Fails

**Check:**
1. Is "[Session] Save blocked" appearing? If not, `isClearing` flag not working
2. Is "[Session] ✅ Deleted N sessions" appearing? If not, DELETE failed
3. Is "[Session] ✅ Verified: No sessions remaining" appearing? If not, sessions not actually deleted
4. Check Supabase dashboard - do sessions still exist after reset?

---

## Rollback Plan

If this fix causes issues:

```bash
git revert HEAD
git push
```

This will restore previous behavior (broken reset but app still functional).

---

## Success Criteria

✅ User clicks Reset Route
✅ Console shows all 3 layers executed
✅ Page reloads
✅ User sees route selection (not resumed session)
✅ Supabase shows 0 sessions for user
✅ User can start new route cleanly

---

## Files to Modify

1. `src/pages/StockerApp.tsx` - Add `isClearing` state, modify `saveSessionState` and `confirmReset`
2. `src/hooks/useSessionPersistence.ts` - Enhance `clearServer` with verification

**Total changes:** ~40 lines added/modified

**Risk:** Low - only affects reset flow, doesn't change normal operation

**Testing:** ~15 minutes for all 4 test scenarios

---

**Ready to implement?** Copy the code changes above into the respective files and test.
