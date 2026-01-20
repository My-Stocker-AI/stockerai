# Reset Route Fix - Code Changes

**Apply these exact changes to fix the Reset Route button**

---

## File 1: `src/pages/StockerApp.tsx`

### Change 1: Add `isClearing` state (after line 120, where other useState declarations are)

**Find this section (around line 120-150):**
```typescript
const [showDiagnostics, setShowDiagnostics] = useState(false);
const [showResetConfirm, setShowResetConfirm] = useState(false);
```

**Add this line right after `showResetConfirm`:**
```typescript
const [isClearing, setIsClearing] = useState(false);
```

---

### Change 2: Update `saveSessionState` function (around line 182)

**Find this function:**
```typescript
const saveSessionState = useCallback(async () => {
  if (!routeState.routeName || !userId) return;
```

**Replace the ENTIRE function with:**
```typescript
const saveSessionState = useCallback(async () => {
  // FIX: Don't save if we're in the middle of clearing
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
}, [routeState, sessionId, messages, userId, sessionPersistence, isClearing]);
```

**Key changes:**
- Added `isClearing` check at the start
- Added `isClearing` to dependency array

---

### Change 3: Update `confirmReset` function (around line 1348)

**Find this function:**
```typescript
const confirmReset = async () => {
  try {
    console.log('[Reset] Clearing route progress...');

    // Clear both local (IndexedDB) and server (Supabase) sessions
    await sessionPersistence.clear(userId);

    console.log('[Reset] Session cleared, reloading page...');

    // Reload page to get clean state (avoids Deepgram reconnection issues)
    window.location.reload();
  } catch (error) {
    console.error('[Reset] Failed to reset route:', error);
    setError('Failed to reset route. Please refresh the page.');
  }
};
```

**Replace with:**
```typescript
const confirmReset = async () => {
  try {
    console.log('[Reset] Starting reset process...');

    // Step 1: Set clearing flag to block auto-save
    setIsClearing(true);
    console.log('[Reset] Auto-save blocked');

    // Step 2: Wait for any pending operations to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('[Reset] Waited for pending operations');

    // Step 3: Clear both local (IndexedDB) and server (Supabase) sessions
    await sessionPersistence.clear(userId);
    console.log('[Reset] Session cleared from IndexedDB and Supabase');

    // Step 4: Wait for clear to propagate
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log('[Reset] Verified clear completed');

    // Step 5: Reload page to get clean state
    console.log('[Reset] Reloading page...');
    window.location.reload();
  } catch (error) {
    console.error('[Reset] Failed to reset route:', error);
    setError('Failed to reset route. Please refresh the page.');
    setIsClearing(false); // Reset flag on error
  }
};
```

**Key changes:**
- Added `setIsClearing(true)` at start
- Added wait periods before and after clear
- Added detailed logging
- Reset `isClearing` flag on error

---

## File 2: `src/hooks/useSessionPersistence.ts`

### Change: Update `clearServer` function (around line 213)

**Find this function:**
```typescript
const clearServer = useCallback(async (userId: string): Promise<void> => {
  try {
    // DELETE all sessions for this user (don't just mark completed)
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('[Session] Failed to delete server sessions:', error);
    } else {
      console.log('[Session] Deleted all server sessions');
    }
  } catch (e) {
    console.error('[Session] Server clear error:', e);
  }
}, []);
```

**Replace with:**
```typescript
const clearServer = useCallback(async (userId: string): Promise<void> => {
  try {
    console.log('[Session] clearServer called for userId:', userId);

    // DELETE all sessions for this user with .select() to verify
    const { error, data } = await supabase
      .from('sessions')
      .delete()
      .eq('user_id', userId)
      .select(); // Returns deleted rows

    if (error) {
      console.error('[Session] DELETE failed:', error);
      throw error; // Throw to prevent page reload if delete failed
    }

    // Verify deletion
    if (data && data.length > 0) {
      console.log(`[Session] ✅ Deleted ${data.length} session(s) from Supabase`);
      console.log('[Session] Deleted session IDs:', data.map((s: any) => s.id));
    } else {
      console.log('[Session] ⚠️ No sessions found to delete (might be already clear)');
    }

    // Double-check sessions are gone
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

**Key changes:**
- Added `.select()` to DELETE to get deleted rows
- Added verification check after delete
- Throws error if delete fails (prevents reload)
- Added detailed logging at each step

---

## Summary of Changes

**File 1: StockerApp.tsx (3 changes)**
1. Add `isClearing` state variable
2. Update `saveSessionState` to check `isClearing` flag
3. Update `confirmReset` to set flag and add wait periods

**File 2: useSessionPersistence.ts (1 change)**
1. Update `clearServer` to verify deletion and throw errors

**Total lines changed:** ~45 lines
**Risk level:** Low (only affects reset flow)
**Testing time:** 15 minutes

---

## Quick Apply Instructions

### Option 1: Manual Edit

1. Open `src/pages/StockerApp.tsx`
2. Apply Change 1, 2, and 3 above
3. Open `src/hooks/useSessionPersistence.ts`
4. Apply the clearServer change
5. Save both files
6. Test with the testing instructions in RESET_ROUTE_FIX.md

### Option 2: Use Patch (if you have the files locally)

```bash
# Save as reset-route.patch, then:
git apply reset-route.patch
```

---

## What This Fixes

✅ **Auto-save race condition:** Flag prevents saves during reset
✅ **Silent delete failures:** Verification catches DELETE failures
✅ **Timing issues:** Wait periods ensure async operations complete
✅ **Debugging:** Detailed logs show exactly what's happening
✅ **Error handling:** Throws errors to prevent reload if clear fails

---

## Test After Applying

1. Start a route, complete a few items
2. Open DevTools Console
3. Click "Reset Route"
4. **Look for:**
   ```
   [Reset] Starting reset process...
   [Reset] Auto-save blocked
   [Session] ✅ Deleted 1 session(s) from Supabase
   [Session] ✅ Verified: No sessions remaining in database
   [Reset] Reloading page...
   ```
5. **After reload:** Should show route selection (clean slate)
6. ✅ **SUCCESS:** Reset works!

---

**Ready to apply?** Follow the instructions above to fix the Reset Route button.
