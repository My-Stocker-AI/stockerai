# StockerAI Systematic Bug Discovery
**Date:** 2026-01-17
**Method:** XF-style manual MECE analysis
**Goal:** Identify ALL potential bug boundaries, then assess fix risk

---

## PHASE 1: BUG BOUNDARY DISCOVERY

**Central Question:** Where could bugs exist in the StockerAI system?

### Discovered Boundaries (MECE)

#### 1. STATE SYNCHRONIZATION
**Question:** Where can state diverge between systems?

**Elements:**
- **Frontend state vs Session DB** - React state updated but DB write fails
- **Session DB vs Workflow state** - Workflow reads stale session data
- **Workflow execution vs DB commit** - Workflow completes but update fails
- **Cache vs DB** - Item cache shows wrong data vs database truth
- **AI conversation history vs session state** - Chat context out of sync with actual progress
- **Multiple tabs/devices** - User opens same session in two places
- **Optimistic UI updates** - UI shows "done" before backend confirms

**Potential Bugs:**
- Item marked complete in UI but not in DB → re-shown on refresh
- Machine status says "pending" but user already completed it
- AI thinks user is on item 10 but DB says item 15
- Two devices move to different items simultaneously

---

#### 2. SEQUENCE/INDEX CONFUSION
**Question:** Where can position tracking break?

**Elements:**
- **Sequence (1-based) vs Index (0-based)** - Off-by-one errors
- **Route-level index vs Machine-level index** - Index carries across machines
- **Forward vs Reverse mode calculations** - Wrong direction arithmetic
- **Empty machine handling** - Machine has 0 items, what's the index?
- **Skipped items within machine** - Item 5 skipped, does sequence stay consistent?
- **Two-item mode index jumps** - Showing 2 items, index should advance by 2 not 1
- **Database sequence vs Workflow sequence** - Schema change breaks sequence numbering

**Potential Bugs:**
- Reverse mode looks for sequence=-1 (doesn't exist)
- Forward mode skips item (sequence 5→7, missing 6)
- Two-item mode shows items 10,11 but only advances index by 1
- Machine switch doesn't reset index to 0/max

---

#### 3. VOICE RECOGNITION AMBIGUITY
**Question:** Where can speech be misinterpreted?

**Elements:**
- **Similar-sounding commands** - "next" vs "text", "skip" vs "skipped"
- **Numbers vs Commands** - "five" (quantity confirmation vs slot number vs route number)
- **Route names** - "North" vs "New North" vs "North Campus"
- **Partial matches** - User says "South" but routes are "Southwest" and "Southeast"
- **Background noise** - Machine beeps interpreted as command
- **Context-dependent meaning** - "done" (item done vs machine done vs route done)
- **Negations** - "Don't skip" heard as "skip"
- **Multi-word commands** - "Skip this machine" heard as "Skip" + "This" + "Machine" separately

**Potential Bugs:**
- User says "next" but AI hears "text" → no action
- User confirms quantity "5" but AI thinks it's a command
- User says route name but AI picks wrong route
- Background noise triggers accidental skip

---

#### 4. WORKFLOW EXECUTION FAILURES
**Question:** Where can n8n workflows fail silently or incorrectly?

**Elements:**
- **Database query returns 0 rows** - No items for machine, what happens?
- **Edge Function timeout** - 10s limit, complex route times out
- **Supabase RLS policy blocks** - User doesn't have access, query fails
- **Null/undefined field handling** - Optional field missing breaks code
- **Network retry logic** - Request fails, does it retry or fail permanently?
- **Webhook response timeout** - Frontend waits 30s, workflow takes 45s
- **Concurrent executions** - Two "next" commands fired 100ms apart
- **Code node syntax errors** - Workflow updates introduce JS errors

**Potential Bugs:**
- Machine has no items → workflow crashes vs returns empty
- Edge Function times out → user sees "loading" forever
- RLS blocks query → workflow fails but no error shown to user
- Missing field → workflow returns partial data
- Double-tap "next" → two items marked complete instead of one

---

#### 5. MACHINE STATE TRANSITIONS
**Question:** Where can machine status become inconsistent?

**Elements:**
- **Pending → In Progress transition** - When does this fire?
- **In Progress → Completed transition** - Last item triggers this
- **In Progress → Skipped transition** - User skips, but items were already done
- **Skipped → In Progress (return)** - Coming back to skipped machine
- **Completed machine with skipped items** - Machine marked "done" but items left
- **No items to pick** - Machine status when all items already stocked
- **Partially completed machine** - User did 10 of 50 items, what's the status?

**Potential Bugs:**
- Machine marked "completed" but still has 20 items
- Skipped machine never gets returned to
- Machine shows "pending" after user already started it
- Two machines both show "in_progress" simultaneously

---

#### 6. TWO-ITEM MODE EDGE CASES
**Question:** Where does count=2 mode break?

**Elements:**
- **Only 1 item remaining** - Show 2 items but only 1 exists
- **Last item on machine** - count=2 but only 1 item, then transition to next machine
- **item2 null handling** - Second item doesn't exist, UI shows "null x undefined"
- **Reverse mode with count=2** - Decrement by 2 not 1
- **Undo with count=2** - User undoes, which item comes back (both? just first?)
- **Skip machine with count=2** - Are both items marked complete?
- **item2 different machine** - Edge case: item1 on machine A, item2 wraps to machine B?

**Potential Bugs:**
- Shows "2 items" but only 1 exists → "null" spoken
- Reverse mode shows items 10,9 but index only decrements by 1
- Undo brings back wrong item
- Last 2 items shown but only 1 gets marked complete

---

#### 7. ROUTE COMPLETION LOGIC
**Question:** Where can route end prematurely or never end?

**Elements:**
- **All machines completed** - Route should end
- **All machines skipped** - Is route "complete" or "abandoned"?
- **Last machine with 0 items** - Route ends before starting last machine
- **Skipped machines remain** - Route "completes" but skipped machines not visited
- **Route progress calculation** - Shows "100% complete" but items remain
- **Session state on completion** - Does session get cleared or preserved?
- **Multiple routes on same day** - Completing route A affects route B?

**Potential Bugs:**
- Route ends early (premature completion)
- Route never ends (infinite loop)
- Route marked "100%" but skipped machines not handled
- Completing one route resets progress on another route

---

#### 8. DATA TYPE MISMATCHES
**Question:** Where can type coercion break logic?

**Elements:**
- **String vs Number** - sequence "10" vs 10
- **Null vs Undefined vs 0** - items_remaining undefined vs 0 vs null
- **Boolean string** - "true" string vs true boolean
- **Date formats** - "2026-01-17" vs "01/17/2026" vs timestamp
- **Array vs Single value** - expecting [item1, item2] but get item1
- **Empty string vs Null** - slot "" vs null
- **Float vs Int** - quantity 5.0 vs 5

**Potential Bugs:**
- Sequence comparison "10" < "2" (string comparison)
- items_remaining=0 treated as "no data" instead of "zero items left"
- Date mismatch causes route not found
- AI expects array but gets single item → crashes

---

#### 9. PERMISSION & ACCESS CONTROL
**Question:** Where can unauthorized access or data leaks occur?

**Elements:**
- **RLS policy gaps** - User sees other user's routes
- **Session hijacking** - Two users share session_id
- **API key exposure** - OpenAI key leaked in frontend
- **Cross-user data bleed** - User A's items shown to User B
- **Deleted user access** - User deleted but session persists
- **Admin vs User permissions** - Regular user accesses admin functions
- **Rate limiting** - User spams API, no throttling

**Potential Bugs:**
- User sees routes for other users
- Two users work on same route simultaneously → data corruption
- API abuse drains credits
- Deleted user still has active session

---

#### 10. CACHE INVALIDATION
**Question:** Where can cached data become stale?

**Elements:**
- **Item cache expires** - Cached items don't match DB
- **Route list cache** - User adds route but doesn't see it
- **Session cache** - Stale session data after update
- **AI conversation cache** - Old context affects new responses
- **Service worker cache** - PWA shows old version of app
- **CDN cache** - Updated workflow not reflected in frontend
- **Browser cache** - Hard refresh required to see changes

**Potential Bugs:**
- User completes items but cache shows them as pending
- Route list doesn't update after adding new route
- AI responds based on stale context
- App shows old UI after deployment

---

## PHASE 2: RISK ASSESSMENT (Next Step)

For each boundary, assess:

| Boundary | Impact (1-5) | Likelihood (1-5) | Fix Complexity (1-5) | Fix Risk (1-5) | Priority Score |
|----------|-------------|------------------|---------------------|----------------|----------------|
| STATE SYNCHRONIZATION | ? | ? | ? | ? | ? |
| SEQUENCE/INDEX CONFUSION | ? | ? | ? | ? | ? |
| VOICE RECOGNITION AMBIGUITY | ? | ? | ? | ? | ? |
| ... | ... | ... | ... | ... | ... |

**Scoring:**
- **Impact:** 1=Cosmetic, 5=Data loss/corruption
- **Likelihood:** 1=Rare edge case, 5=Happens often
- **Fix Complexity:** 1=1-line change, 5=Architectural refactor
- **Fix Risk:** 1=Safe isolated change, 5=Could break multiple features

**Priority Score = Impact × Likelihood**

---

## PHASE 3: IMPLEMENTATION PLAN (After Assessment)

Based on priority scores:
1. High priority, low risk → Fix immediately
2. High priority, high risk → Fix with extensive testing
3. Low priority, low risk → Fix if time permits
4. Low priority, high risk → Document, don't fix

---

**STATUS:** Phase 1 complete (10 boundaries discovered)
**NEXT:** Fill in risk assessment matrix for each boundary
