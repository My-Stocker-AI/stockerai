# Boundary 1: State Synchronization - Deep Analysis
**Date:** 2026-01-17
**Method:** XF Sequential Discovery
**Status:** Complete

---

## Discovery Question

**Where can state diverge between systems in StockerAI?**

---

## System State Architecture

```
┌─────────────┐
│   Frontend  │ → React state (useStockerSession)
│   (React)   │ → localStorage persistence
└─────┬───────┘
      │
      ↓ (API call)
┌─────────────┐
│   OpenAI    │ → Conversation context
│   GPT-4     │ → Tool call history
└─────┬───────┘
      │
      ↓ (Webhook)
┌─────────────┐
│  n8n        │ → Workflow execution state
│  Workflows  │ → Session reads/writes
└─────┬───────┘
      │
      ↓ (SQL query)
┌─────────────┐
│  Supabase   │ → stocker_sessions (SOURCE OF TRUTH)
│  Database   │ → Items, machines, routes
└─────────────┘
```

---

## Discovered Failure Modes (MECE)

### 1. FRONTEND-DB DIVERGENCE
**Trigger:** Frontend updates local state, DB write fails

**Scenarios:**

#### 1A. Item marked complete locally, DB write fails
- **Location:** `useStockerSession.ts` line 149 (completedItems update)
- **Symptom:** Item disappears from UI, reappears on refresh
- **Code:**
  ```typescript
  next.completedItems = [...prev.completedItems, ...itemsToAdd];
  // ← Local state updated
  // But what if subsequent DB update fails?
  ```
- **Root Cause:** Optimistic update with no rollback
- **Likelihood:** Low (2/5) - DB writes usually succeed
- **Impact:** Medium (3/5) - User confusion, duplicate work
- **Evidence:** Unknown - Has Davy reported this?

#### 1B. Machine status updated locally, DB update fails
- **Location:** `useStockerSession.ts` line 196-200
- **Symptom:** Machine shows "completed" in UI but DB says "in_progress"
- **Code:**
  ```typescript
  next.machines = prev.machines.map(m =>
    m.id === prev.currentMachineId
      ? { ...m, status: 'completed' as const }
      : m
  );
  // ← Frontend thinks machine complete
  // But workflow might not have updated DB
  ```
- **Likelihood:** Low (2/5)
- **Impact:** Medium (3/5) - Progress lost
- **Evidence:** Unknown

#### 1C. Session saved to localStorage but not synced to DB
- **Location:** `StockerApp.tsx` line 181-199 (saveSessionState)
- **Symptom:** User closes app, reopens, sees old state
- **Code:**
  ```typescript
  const saveSessionState = useCallback(async () => {
    if (!routeState.routeName || !userId) return;
    // Saves to sessionPersistence (localStorage)
    // But does it confirm DB write succeeded?
  });
  ```
- **Likelihood:** Medium (3/5) - Network failures happen
- **Impact:** High (4/5) - Lost progress
- **Evidence:** Unknown

---

### 2. DB-WORKFLOW DIVERGENCE
**Trigger:** Workflow reads stale session state

**Scenarios:**

#### 2A. Concurrent "next" commands
- **Trigger:** User double-taps "next" within 500ms
- **Symptom:** Two items marked complete instead of one, OR second call fails
- **Flow:**
  1. First "next" reads `current_item_index: 10`
  2. Second "next" also reads `current_item_index: 10` (stale)
  3. Both update to `new_item_index: 11`
  4. Item 11 marked complete twice, item 12 skipped
- **Location:** n8n workflow `Extract Consolidated Data` node reads session
- **Likelihood:** Medium (3/5) - Users might double-tap
- **Impact:** High (4/5) - Skips items
- **Evidence:** Unknown - Check n8n execution logs for duplicate timestamps

#### 2B. Workflow updates DB, but response lost
- **Trigger:** Network timeout after DB write but before response
- **Symptom:** Item completed in DB but frontend doesn't know
- **Flow:**
  1. Workflow updates session: `current_item_index: 11`
  2. Network dies before response reaches frontend
  3. Frontend still thinks `current_item_index: 10`
  4. User says "next" again → looks for item 11 but DB says already at 11
- **Likelihood:** Low (2/5) - Rare network timing
- **Impact:** High (4/5) - State permanently diverged
- **Evidence:** Unknown

#### 2C. Edge Function timeout, partial data
- **Trigger:** Complex route query takes >10s
- **Symptom:** Workflow gets partial item list
- **Location:** `supabase/functions/get-next-item-data/index.ts`
- **Code:**
  ```typescript
  // 10 second timeout limit on Edge Functions
  // What if query is slow?
  ```
- **Likelihood:** Low (1/5) - Queries are fast
- **Impact:** High (4/5) - Missing items
- **Evidence:** Unknown

---

### 3. AI CONTEXT DIVERGENCE
**Trigger:** AI conversation state doesn't match session state

**Scenarios:**

#### 3A. AI thinks user is on different item
- **Trigger:** Frontend updates state but doesn't update AI context
- **Symptom:** AI says "Got it, moving to next item" but wrong item shown
- **Location:** `useStockerAI.ts` buildSystemPrompt (line 234)
- **Code:**
  ```typescript
  const buildSystemPrompt = useCallback((userName: string, currentItem: any, ...)
  // currentItem passed in - what if it's stale?
  ```
- **Likelihood:** Low (2/5) - Context usually updated
- **Impact:** Low (2/5) - AI just re-syncs on next call
- **Evidence:** Unknown

#### 3B. AI tool response not applied to state
- **Trigger:** Tool call succeeds but frontend doesn't call updateFromTool
- **Symptom:** AI thinks action completed but state unchanged
- **Location:** `StockerApp.tsx` executeToolCalls function
- **Likelihood:** Very Low (1/5) - Code path tested
- **Impact:** High (4/5) - Complete desync
- **Evidence:** Unknown

---

### 4. MULTI-TAB/DEVICE DIVERGENCE
**Trigger:** Same session open in two places

**Scenarios:**

#### 4A. Two tabs update same session
- **Symptom:** Tab 1 shows item 10, Tab 2 shows item 12
- **Root Cause:** No session locking, last write wins
- **Likelihood:** Low (2/5) - Most users single tab
- **Impact:** High (4/5) - Unpredictable state
- **Evidence:** Unknown - Multi-tab support intended?

#### 4B. Mobile + Desktop same session
- **Symptom:** Phone shows different state than tablet
- **Likelihood:** Very Low (1/5) - Single device per user typical
- **Impact:** High (4/5) - Confusion
- **Evidence:** Unknown

---

### 5. CACHE STALENESS
**Trigger:** Cached data not invalidated

**Scenarios:**

#### 5A. Item cache shows wrong data
- **Trigger:** Items updated in DB but cache not cleared
- **Location:** `useItemCache.ts`
- **Likelihood:** Medium (3/5) - Cache invalidation is hard
- **Impact:** Medium (3/5) - Wrong inventory shown
- **Evidence:** Unknown

#### 5B. Route list cache stale
- **Trigger:** New route added but not in cache
- **Likelihood:** Low (2/5) - Routes don't change mid-session
- **Impact:** Low (2/5) - User can refresh
- **Evidence:** Unknown

---

## Risk Assessment Summary

| Failure Mode | Likelihood | Impact | Priority | Action |
|--------------|------------|--------|----------|--------|
| 1A. Item complete locally, DB fails | 2 | 3 | 6 | Document |
| 1B. Machine status local/DB mismatch | 2 | 3 | 6 | Document |
| 1C. localStorage sync failure | 3 | 4 | 12 | **Investigate** |
| 2A. Concurrent "next" commands | 3 | 4 | 12 | **Investigate** |
| 2B. Workflow update lost in transit | 2 | 4 | 8 | Document |
| 2C. Edge Function timeout | 1 | 4 | 4 | Monitor |
| 3A. AI context stale | 2 | 2 | 4 | Ignore |
| 3B. Tool response not applied | 1 | 4 | 4 | Monitor |
| 4A. Multi-tab conflicts | 2 | 4 | 8 | Document |
| 4B. Multi-device conflicts | 1 | 4 | 4 | Ignore |
| 5A. Item cache stale | 3 | 3 | 9 | Document |
| 5B. Route cache stale | 2 | 2 | 4 | Ignore |

---

## High Priority Items (12+)

### 1C. localStorage sync failure (Priority: 12)
**Investigation needed:**
- Check if `sessionPersistence.save()` has error handling
- Verify DB write is confirmed before local save
- Add retry logic for failed saves

**Fix Complexity:** 2/5 (add error handling)
**Fix Risk:** 2/5 (touches save path)

### 2A. Concurrent "next" commands (Priority: 12)
**Investigation needed:**
- Check n8n execution logs for duplicate timestamps
- Add debounce/throttle to "next" command
- Implement optimistic locking on session updates

**Fix Complexity:** 3/5 (workflow + frontend changes)
**Fix Risk:** 3/5 (could affect responsiveness)

---

## Code Locations to Inspect

1. `useStockerSession.ts:149` - completedItems update (optimistic)
2. `useStockerSession.ts:196-200` - Machine status update (optimistic)
3. `StockerApp.tsx:181-199` - Session save (error handling?)
4. `supabase/functions/get-next-item-data/index.ts` - Edge Function timeout
5. `useItemCache.ts` - Cache invalidation logic
6. n8n workflow `Extract Consolidated Data` - Session read concurrency

---

## Evidence Collection Needed

**Questions for Davy:**
1. Ever see items reappear after marking them done?
2. Ever see progress lost after closing/reopening app?
3. Ever double-tap "next" and skip an item?
4. Ever open app on two devices simultaneously?
5. Ever see inventory numbers wrong?

---

## Next Boundary

**Boundary 2: Sequence/Index Confusion** (We know this has issues - reverse mode bug)

---

**Status:** Boundary 1 complete - 12 failure modes discovered, 2 high-priority investigations identified
