# System Impact Audit: Ready Confirmation Frontend Changes

**Date:** 2026-02-02
**Change:** Frontend changes to support "Ready to go?" confirmation flow
**Scope:** Command recognizer, state management, start_machine auto-call

---

## PROPOSED CHANGE

**Workflow Change (✅ COMPLETED via Synta):**
- skip_current_machine now returns: `spoken: "Machine 2 skipped. On to Machine 3. Ready to go?"`

**Frontend Changes (PENDING):**
1. Detect affirmative responses when `action="next_machine"`
2. Auto-call `start_machine(session.pick_direction)` on affirmative
3. First machine: Ask direction once, save to database via start_machine

---

## STEP 1: SIX-QUESTION BOUNDARY ANALYSIS

### 1. DATA FLOW - What data enters/exits? Format changes?

**Current Flow:**
```
User: "skip"
  ↓
Frontend → skip_current_machine workflow
  ↓
Workflow returns: { action: "next_machine", spoken: "Machine 2 skipped. On to Machine 3. Ready to go?" }
  ↓
Frontend sets pendingMachineTransition
  ↓
AI asks: "Top or bottom?" ❌ OLD BEHAVIOR
  ↓
User says direction → start_machine called
```

**New Flow:**
```
User: "skip"
  ↓
Frontend → skip_current_machine workflow
  ↓
Workflow returns: { action: "next_machine", spoken: "...Ready to go?" }
  ↓
Frontend plays spoken (includes "Ready to go?")
  ↓
User: "yes" / "okay" / "ready"
  ↓
Command recognizer detects affirmative during pendingMachineTransition
  ↓
Frontend reads session.pick_direction from database
  ↓
Frontend calls start_machine(pick_direction)
  ↓
Machine starts with items
```

**Data Format Changes:**
- No changes to workflow output format
- No changes to start_machine input format
- Frontend reads existing `pick_direction` field from session

### 2. CALLERS (Upstream) - Who calls this? What do they expect?

**Components that trigger machine transitions:**

| Component | Current Behavior | New Behavior | Breaking? |
|-----------|------------------|--------------|-----------|
| **skip_current_machine** | Returns action="next_machine" | Same + "Ready to go?" in spoken | ✅ Compatible |
| **get_next_item** | Returns action="next_machine" | Needs same update | ⚠️ TODO |
| **Command recognizer** | Detects "top"/"bottom" during transition | Detects "yes"/"okay"/"ready" | ✅ Additive |

**Breaking Changes:** NONE
- Workflow output format unchanged
- Just adding new spoken text

### 3. CALLEES (Downstream) - What does this call? What does it need?

**start_machine workflow:**
- Input: `{ session_id, user_id, direction, count }`
- `direction` values: "beginning" or "end"
- Maps to database: "forward" or "reverse"

**Database sessions table:**
- `pick_direction` column: TEXT ("forward" or "reverse")
- Already exists ✅
- Already saved by start_machine ✅

**Frontend needs:**
- Read `pick_direction` from session
- Map database values to workflow values:
  - "reverse" → "end"
  - "forward" → "beginning"

### 4. SIDE EFFECTS - Database writes? Emails? API calls?

**Database Operations:**
1. **Read**: Frontend reads session.pick_direction
2. **Write**: start_machine writes pick_direction (already happens)
3. **No new database changes** ✅

**External Calls:**
- start_machine workflow (already being called)
- No new API calls

**State Changes:**
- Clear `pendingMachineTransition` after start_machine succeeds
- Same as current behavior ✅

### 5. STATE DEPENDENCIES - Race conditions? Caches? Locks?

**State Variables:**

| State | Current Use | New Use | Race Risk |
|-------|-------------|---------|-----------|
| `pendingMachineTransition` | Set when action="next_machine" | Same | LOW |
| `session.pick_direction` | Not used | Read for auto-call | LOW |
| `machineTransitionLockRef` | Prevents concurrent transitions | Same | LOW |

**Race Condition Analysis:**
1. User says "yes" rapidly twice → Lock prevents duplicate start_machine calls ✅
2. Direction not set (first machine) → Need to handle NULL pick_direction
3. Session not loaded yet → pick_direction unavailable

**NEW Edge Case:**
- If `pick_direction` is NULL → Cannot auto-call start_machine
- **Solution:** Ask direction first (at first machine start)

### 6. ERROR PROPAGATION - When this fails, what happens?

**Failure Scenarios:**

| Failure | Impact | Mitigation |
|---------|--------|------------|
| **pick_direction is NULL** | Cannot auto-start | Ask direction before first machine |
| **start_machine fails** | User stuck | Clear pendingMachineTransition (already handled) |
| **Session not loaded** | pick_direction unavailable | Wait for session load before auto-call |
| **User says non-affirmative** | Nothing happens | User can try again or say different command |

**Error Handling:**
```typescript
// Check if direction available
if (!session.pick_direction) {
  // First machine - ask direction
  // AI prompts: "Start from top or bottom?"
  return;
}

// Auto-call with saved direction
const direction = session.pick_direction === 'reverse' ? 'end' : 'beginning';
await callTool('start_machine', { direction, ... });
```

---

## STEP 2: AFFECTED COMPONENTS

### Frontend Files

**1. src/hooks/useStockerSession.ts**

**Changes:**
- When `action="next_machine"`, check if `pick_direction` exists
- If exists: Flag for auto-start (don't prompt for direction)
- If NULL: Keep current behavior (AI prompts for direction)

**Impact:** MEDIUM - Core transition logic

---

**2. src/pages/StockerApp.tsx (Command Recognizer)**

**Changes:**
- Detect affirmative responses: "yes", "yeah", "yep", "okay", "ready", "go", "sure"
- When `pendingMachineTransition` is set AND user says affirmative:
  - Read `session.pick_direction`
  - Call `start_machine(mapped_direction)`
- Map database→workflow direction:
  - "reverse" → "end"
  - "forward" → "beginning"

**Impact:** MEDIUM - New command pattern

---

**3. src/hooks/useStockerAI.ts (AI Prompt)**

**Changes:**
- Remove "Ask top or bottom?" instruction for transitions
- Add: "When user says affirmative during transition, start machine"
- First machine: Keep direction question

**Impact:** LOW - Prompt text only

---

### Workflow Files (n8n)

**1. skip_current_machine (ElCSMeguJNxwp0HO)**
- ✅ COMPLETED via Synta
- Format Output updated to include "Ready to go?"

**2. get_next_item (iykbFj7f9222PF7r or other)**
- ⚠️ TODO: Same update needed for normal machine transitions
- When `action="next_machine"`, append "Ready to go?"

---

## STEP 3: REQUIRED ADDITIONAL CHANGES

### 1. First Machine Direction Handling

**Current:** No explicit first machine direction question
**Needed:** Ask direction when starting first machine (pick_direction is NULL)

**Implementation:**
```typescript
// In useStockerSession.ts or AI prompt
if (!session.pick_direction && action === 'next_machine') {
  // First machine - AI asks: "Start from top or bottom?"
  // User responds → Command recognizer calls start_machine(direction)
  // start_machine saves pick_direction to database
}
```

---

### 2. get_next_item Workflow Update

**Action:** Use Synta to update get_next_item Format Output node
**Same change:** Append "Ready to go?" when `action="next_machine"`

---

### 3. Direction Value Mapping

**Database stores:** "forward" or "reverse"
**Workflow expects:** "beginning" or "end"

**Mapping function needed:**
```typescript
function mapDirectionToWorkflow(dbDirection: string): string {
  return dbDirection === 'reverse' ? 'end' : 'beginning';
}
```

---

## STEP 4: TESTING PLAN

### Test 1: First Machine (Direction Setup)
1. Start new route
2. Verify AI asks: "Start from top or bottom?"
3. Say "bottom"
4. Verify start_machine called with direction="end"
5. Verify pick_direction="reverse" saved to database

### Test 2: Skip Transition (Ready Confirmation)
1. Skip machine (with direction already set)
2. Verify spoken: "Machine X skipped. On to Machine Y. Ready to go?"
3. Say "yes"
4. Verify start_machine called with saved direction
5. Verify machine starts with items

### Test 3: Normal Transition (get_next_item)
1. Complete machine (say "next" on last item)
2. Verify spoken: "Machine X complete. On to Machine Y. Ready to go?"
3. Say "okay"
4. Verify start_machine called with saved direction

### Test 4: No Direction Set (Edge Case)
1. Resume old session (pick_direction = NULL)
2. Trigger transition
3. Verify AI asks for direction
4. Say "top"
5. Verify direction saved and machine starts

### Test 5: Non-Affirmative Response
1. Skip machine
2. Hear "Ready to go?"
3. Say "wait" or "hold on"
4. Verify start_machine NOT called
5. Verify user can say "yes" later or give different command

---

## STEP 5: ROLLBACK PLAN

### If Issues Found

**Immediate Rollback:**
```bash
# Revert workflow change
# Use Synta to restore Format Output to previous version

# Revert frontend changes
git revert <commit-hash>
git push origin main
# Cloudflare auto-deploys (2-3 min)
```

**Data Loss Risk:** NONE
- pick_direction column already exists
- No schema changes
- No data migrations

---

## STEP 6: RISK ASSESSMENT

### HIGH RISK: NONE

### MEDIUM RISK

| Risk | Mitigation |
|------|------------|
| **Direction mapping wrong** | Test thoroughly, verify reverse↔end, forward↔beginning |
| **First machine no direction** | Check pick_direction NULL, prompt for direction |
| **Affirmative false positives** | Use specific phrases (yes/okay/ready), avoid common words |

### LOW RISK

| Risk | Mitigation |
|------|------------|
| **User says affirmative too early** | Lock prevents action until pendingMachineTransition set |
| **Session not loaded** | Wait for session load before checking pick_direction |

---

## IMPLEMENTATION PLAN

### Phase 1: Frontend - Affirmative Detection ✅ READY
1. Update command recognizer in StockerApp.tsx
2. Detect "yes/okay/ready" when pendingMachineTransition set
3. Read session.pick_direction
4. Map database→workflow direction
5. Call start_machine(mapped_direction)

### Phase 2: Frontend - First Machine Direction ✅ READY
1. Check if pick_direction is NULL
2. If NULL at transition: AI prompts for direction
3. Command recognizer captures "top"/"bottom"
4. Call start_machine(direction) - saves to database

### Phase 3: Workflow - get_next_item Update ⚠️ TODO
1. Use Synta to update get_next_item Format Output
2. Append "Ready to go?" when action="next_machine"
3. Test normal machine completion flow

### Phase 4: AI Prompt - Update Instructions ✅ READY
1. Remove "ask top or bottom" for transitions
2. Add "affirmative responses start machine"
3. Keep direction question for first machine

### Phase 5: Testing
1. Test all 5 scenarios above
2. Verify direction persistence across resume
3. Verify error handling for NULL direction

---

## APPROVAL REQUIRED

**User must approve:**
- [x] Workflow change completed (skip_current_machine)
- [ ] Frontend changes (command recognizer, direction mapping)
- [ ] get_next_item workflow update (same as skip)
- [ ] First machine direction handling
- [ ] Testing plan

---

## END OF AUDIT
