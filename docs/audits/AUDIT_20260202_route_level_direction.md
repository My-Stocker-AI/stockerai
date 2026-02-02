# System Impact Audit: Route-Level Direction Preference

**Date:** 2026-02-02
**Change:** Remove per-machine direction prompts, implement route-level direction preference
**Scope:** Frontend state, AI prompt, workflows, session persistence, command handling

---

## PROPOSED CHANGE

**Current Behavior:**
- Every machine transition asks: "Top or bottom for [Machine]?"
- User responds with direction
- AI calls `start_machine(direction)`
- Requires user input for EACH of 5-10 machines per route

**Proposed Behavior:**
- Ask direction ONCE when route starts (first machine)
- Save direction preference in session state
- Auto-apply saved direction to ALL subsequent machines
- Allow override: "start from top" / "start from bottom" commands

**Rationale:**
- Real-world route drivers work consistently from one direction (truck position, muscle memory)
- Current flow is repetitive and slows transitions
- Asking 5-10 times per route is poor UX
- Route-level preference matches actual workflow

---

## STEP 1: SIX-QUESTION BOUNDARY ANALYSIS

### 1. DATA FLOW - What data enters/exits? Format changes?

**New Data Field:**
```typescript
routeDirection: 'beginning' | 'end' | null
```

**Data Flow:**
```
Route Start
  ↓
Ask direction (first machine only)
  ↓
User says "top" or "bottom"
  ↓
Save to routeState.routeDirection ('beginning' or 'end')
  ↓
Persist to session database
  ↓
Machine transitions
  ↓
Auto-use saved routeDirection (no prompt)
  ↓
start_machine(routeDirection)
```

**Format Changes:**
- Frontend state: Add `routeDirection` field
- Session persistence: Add `route_direction` column
- start_machine calls: Use saved direction instead of user input

### 2. CALLERS (Upstream) - Who calls this? What do they expect?

**Components that set/use direction:**

| Component | Current Behavior | New Behavior |
|-----------|------------------|--------------|
| **AI prompt** | Asks "top or bottom?" on transitions | Asks ONCE on first machine start |
| **Command recognizer** | Recognizes "top"/"bottom" during transition | Recognizes "top"/"bottom" at route start + "start from top/bottom" override |
| **useStockerSession** | Calls start_machine when user says direction | Calls start_machine with saved direction |
| **Session resume** | No direction saved, asks again | Restores saved direction |

**Breaking Changes:**
- NONE - Direction prompting is internal to AI, not an API contract

### 3. CALLEES (Downstream) - What does this call? What does it need?

**start_machine workflow:**
- Currently: Receives direction from user input ("beginning" or "end")
- After change: Receives direction from saved state ("beginning" or "end")
- **Contract unchanged** - Still expects "beginning" or "end" parameter

**Database sessions table:**
- Currently: No direction stored
- After change: Needs `route_direction` column (nullable)
- **Migration required**

**State persistence:**
- Currently: Saves/restores currentMachineId, currentItem, etc.
- After change: Also saves/restores routeDirection
- **Code change required** (useSessionPersistence.ts)

### 4. SIDE EFFECTS - Database writes? Emails? API calls?

**Database Changes:**
```sql
-- Migration required
ALTER TABLE sessions
ADD COLUMN route_direction TEXT CHECK (route_direction IN ('beginning', 'end'));
```

**Session Persistence:**
- Save operation: Write routeDirection to database
- Resume operation: Read routeDirection from database
- Clear operation: Reset routeDirection to null

**No External Side Effects:**
- No emails, webhooks, or external API calls
- Purely internal state management

### 5. STATE DEPENDENCIES - Race conditions? Caches? Locks?

**State Dependencies:**

| State Variable | Dependency | Risk |
|----------------|------------|------|
| `routeDirection` | Set once at first machine, read on all transitions | LOW - Set before first transition |
| `pendingMachineTransition` | Currently blocks until direction received | REMOVED - No longer needed for direction |
| `machineTransitionLockRef` | Prevents race conditions on transitions | UNCHANGED - Still protects transition |

**Race Condition Analysis:**
- **Current:** pendingMachineTransition set → user responds → direction captured → lock released
- **Proposed:** routeDirection set once → transitions use saved value → no waiting
- **Risk:** LOWER - Removes async user input from transition critical path

**Timing:**
- Direction must be set BEFORE first machine starts
- All subsequent machines use same direction
- Override command changes direction immediately (no race - single state update)

### 6. ERROR PROPAGATION - When this fails, what happens?

**Failure Scenarios:**

| Failure | Current Behavior | New Behavior | Impact |
|---------|------------------|--------------|--------|
| **No direction set** | Asks user for direction | Ask at first machine or use default | Same outcome |
| **Invalid direction** | AI retries question | Validation at input, fallback to 'end' | Better (validation earlier) |
| **Direction not saved** | Re-asks on resume | Re-asks on first transition after resume | Same UX |
| **User changes mind** | Can't change (already started) | "start from top/bottom" override command | BETTER UX |

**Error Handling:**
```typescript
// Fallback if direction missing
const direction = routeState.routeDirection || 'end'; // Default to bottom
```

**Recovery:**
- If direction not set → Ask before first machine
- If database save fails → Keep in memory, ask again on resume
- If invalid value → Validate and reject, keep previous value

---

## STEP 2: AFFECTED COMPONENTS

### Frontend State (`src/hooks/useStockerSession.ts`)

**Changes:**
```typescript
interface RouteState {
  // ... existing fields
  routeDirection: 'beginning' | 'end' | null; // NEW
}

const initialState = {
  // ... existing
  routeDirection: null // NEW
};
```

**Impact:** LOW - Additive change, no breaking changes

---

### Session Persistence (`src/hooks/useSessionPersistence.ts`)

**Changes:**
1. Add `routeDirection` to `SessionData` interface
2. Save `routeDirection` to database in `saveToServer()`
3. Restore `routeDirection` from database in `resumeFromServer()`
4. Clear `routeDirection` in `clearServer()`

**Impact:** MEDIUM - Database schema change required

---

### AI Prompt (`src/hooks/useStockerAI.ts`)

**Changes:**

**Remove from general instructions:**
```diff
- 🔄 Next Machine Flow
- → When get_next_item returns action="next_machine":
-    1. Ask: "Done with [machine]. Next is [machine]. Top or bottom?"
```

**Add to route start flow:**
```diff
+ 🚀 Starting Routes & Direction
+ → First machine: Ask "Would you like to start from the top or bottom?"
+ → Save direction, apply to ALL machines in this route
+ → User can override: "start from top" / "start from bottom"
```

**Impact:** MEDIUM - Changes AI behavior significantly

---

### Command Recognizer (`src/pages/StockerApp.tsx`)

**Changes:**

**Add new commands:**
```typescript
// At route start, recognize direction
if (input.includes('top') || input.includes('beginning')) {
  routeDirection = 'beginning';
}
if (input.includes('bottom') || input.includes('end')) {
  routeDirection = 'end';
}

// Override direction mid-route
if (input.includes('start from top')) {
  setRouteState(prev => ({ ...prev, routeDirection: 'beginning' }));
}
if (input.includes('start from bottom')) {
  setRouteState(prev => ({ ...prev, routeDirection: 'end' }));
}
```

**Impact:** MEDIUM - New command patterns to recognize

---

### Machine Transition Logic (`src/hooks/useStockerSession.ts`)

**Changes:**

**Current:**
```typescript
if (action === 'next_machine') {
  // Set pending, wait for user direction
  next.pendingMachineTransition = {
    nextMachineId: result.next_machine_id,
    nextMachineName: result.next_machine,
    nextMachineIndex: (prev.currentMachineIndex || 0) + 1
  };
  // AI asks "top or bottom?"
}
```

**Proposed:**
```typescript
if (action === 'next_machine') {
  // Auto-call start_machine with saved direction
  const direction = prev.routeDirection || 'end'; // Fallback

  // Call start_machine immediately (no user prompt)
  const startResult = await callTool('start_machine', {
    machine_id: result.next_machine_id,
    direction: direction,
    session_id: sessionIdRef.current
  });

  // Update state with started machine
  next.currentMachineId = result.next_machine_id;
  next.currentMachineName = result.next_machine;
  next.currentItem = startResult.currentItem;
  // ... etc
}
```

**Impact:** HIGH - Fundamental change to transition flow

---

### Database Schema (`supabase/migrations/`)

**Migration Required:**
```sql
-- Add route_direction column to sessions table
ALTER TABLE sessions
ADD COLUMN route_direction TEXT
CHECK (route_direction IN ('beginning', 'end'));

-- Default existing sessions to NULL (will prompt on resume)
-- No data migration needed
```

**Impact:** LOW - Nullable column, no data loss risk

---

## STEP 3: REQUIRED ADDITIONAL CHANGES

### 1. First Machine Direction Prompt

**Location:** `src/hooks/useStockerAI.ts` prompt + `src/pages/StockerApp.tsx` handling

**Implementation:**
- When first machine starts (after set_route_sequence), AI asks: "Start from the top or bottom?"
- Command recognizer captures response
- Sets `routeState.routeDirection`
- Calls `start_machine(direction)`
- Saves to session database

---

### 2. Direction Override Commands

**New Commands:**
- "start from top" → Sets routeDirection = 'beginning'
- "start from bottom" → Sets routeDirection = 'end'
- "switch direction" → Toggles current direction

**Implementation:**
- Add to command recognizer in StockerApp.tsx
- Update routeDirection state
- Persist to database
- Speak confirmation: "Switching to [top/bottom] for remaining machines"

---

### 3. Session Resume with Direction

**Current:** Resume asks direction again (no saved value)
**Proposed:** Resume uses saved routeDirection

**Implementation:**
- Load routeDirection from database in `resumeFromServer()`
- If null → Ask before first transition
- If set → Use immediately

---

### 4. Remove pendingMachineTransition (Optional Cleanup)

**Current Usage:**
- Tracks when waiting for direction response
- Blocks other commands during direction prompt
- Used in AI prompt context

**After Change:**
- No longer needed for direction (direction is saved)
- Could still be useful for other transition state
- **Decision:** Keep for now (might be useful for future edge cases)

---

## STEP 4: TESTING PLAN

### Unit Tests (Manual - No Test Suite Yet)

1. **Route start with direction:**
   - Start route → AI asks "top or bottom?" → Say "bottom" → First machine starts from bottom
   - Verify routeDirection saved to state and database

2. **Machine transitions use saved direction:**
   - Say "next" → Machine 1 complete → Machine 2 starts from bottom (no prompt)
   - Verify no direction question asked

3. **Skip machine uses saved direction:**
   - Say "skip" → Machine skipped → Next machine starts from saved direction (no prompt)

4. **Direction override:**
   - Say "start from top" → Verify routeDirection changes to 'beginning'
   - Next transition uses new direction

5. **Session resume:**
   - Start route with direction → Close app → Resume → Verify direction preserved

6. **No direction set (edge case):**
   - Resume old session (before migration) → First transition prompts for direction

### Integration Tests

1. **Full route flow:**
   - Start route → Set direction once → Complete 5 machines → Verify all use same direction

2. **Direction override mid-route:**
   - Start route with bottom → Complete 2 machines → Override to top → Complete 3 more → Verify direction change applied

3. **Resume after close:**
   - Start route → Set direction → Complete 2 machines → Close app → Resume → Complete remaining → Verify direction persisted

### Edge Cases

1. **Invalid direction input:** "middle" → AI rejects, asks again
2. **Direction not saved (DB failure):** Fallback to 'end', ask again on resume
3. **Old session (no direction column):** NULL → Prompt on first transition
4. **Race condition:** Rapid "next" during first transition → Lock prevents duplicate

---

## STEP 5: ROLLBACK PLAN

### If Issues Found in Production

**Immediate Rollback:**
```bash
git revert <commit-hash>
git push origin main
# Cloudflare auto-deploys reverted version (2-3 min)
```

**Database Rollback (if migration applied):**
```sql
-- Remove column (safe - nullable, no dependencies)
ALTER TABLE sessions DROP COLUMN route_direction;
```

**Data Loss Risk:** NONE
- New column is nullable
- Old sessions still work (direction = NULL → prompts as before)
- No foreign keys or dependencies

**Rollback Time:** 5 minutes

---

## STEP 6: RISK ASSESSMENT

### HIGH RISK: None

### MEDIUM RISK

| Risk | Mitigation |
|------|------------|
| **AI doesn't ask direction at route start** | Test thoroughly, add fallback to ask before first transition |
| **Direction not saved to database** | Keep in memory, ask again on resume (same as current behavior) |
| **User wants different direction mid-route** | Provide override commands |

### LOW RISK

| Risk | Mitigation |
|------|------------|
| **Database migration fails** | Column is nullable, rollback safe |
| **Session resume without direction** | Prompt before first transition (graceful degradation) |

---

## IMPLEMENTATION PLAN

### Phase 1: Database & State (Foundation)
1. Create migration: Add `route_direction` column
2. Update `RouteState` interface with `routeDirection` field
3. Update session persistence to save/restore direction
4. **Test:** Verify direction saves and restores correctly

### Phase 2: First Machine Direction Prompt
1. Update AI prompt: Add direction question at route start
2. Update command recognizer: Capture "top"/"bottom" at route start
3. Set `routeDirection` state before calling `start_machine`
4. **Test:** Verify first machine asks and saves direction

### Phase 3: Auto-Apply Direction on Transitions
1. Modify `get_next_item` action="next_machine" handler
2. Auto-call `start_machine(savedDirection)` instead of prompting
3. Remove direction question from AI prompt for transitions
4. **Test:** Verify transitions use saved direction without prompting

### Phase 4: Override Commands (Enhancement)
1. Add "start from top/bottom" commands to recognizer
2. Update routeDirection state
3. Persist change to database
4. **Test:** Verify override works mid-route

### Phase 5: Cleanup (Optional)
1. Remove pendingMachineTransition logic (if no longer needed)
2. Simplify AI prompt (remove transition direction instructions)
3. **Test:** Full regression test

---

## APPROVAL REQUIRED

**User must approve BEFORE implementation:**
- [ ] Approach: Route-level direction vs per-machine
- [ ] Database migration: Add `route_direction` column
- [ ] Behavior change: Ask once vs ask every time
- [ ] Override commands: "start from top/bottom"

**Questions for User:**
1. Confirm route-level direction approach?
2. Default direction if not set: "bottom" (end) or prompt?
3. Override command: Just "start from top/bottom" or also "switch direction"?
4. Should old sessions (no direction) prompt immediately or wait for first transition?

---

## END OF AUDIT
