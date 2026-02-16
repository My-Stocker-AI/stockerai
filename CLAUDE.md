# StockerAI - Vending Machine Inventory Management

**Inherits:** `/home/visionairy/CLAUDE.md` (global protocols)

**Uses Tools:**
- `/home/visionairy/Xpansion/CLAUDE.md` (XF for system analysis and debugging)
- `/home/visionairy/Flon8/CLAUDE.md` (n8n for workflow management)

**Type:** Application Directory
**Purpose:** Voice-first inventory management for vending machine route drivers
**GitHub:** github.com/VisionAIrySE/stockerai

---

# TECH STACK

**Frontend:**
- React + TypeScript + Vite
- shadcn-ui + Tailwind CSS
- Deployed: GitHub → Cloudflare Pages (auto-deploy on push)

**Backend:**
- Supabase (PostgreSQL + Edge Functions)
- Deepgram WebSocket API (voice recognition)

**Workflows:**
- n8n (visionairy.app.n8n.cloud)
- For workflow troubleshooting: See `/home/visionairy/Flon8/CLAUDE.md`

**Production URLs:**
- Custom Domain: https://my-stocker-ai.com (primary)
- Cloudflare Pages: https://stocker-ai.pages.dev (legacy, do NOT reference)

---

# SECTION -1: ABSOLUTE RULES

## NEVER MAKE ASSUMPTIONS ABOUT AVAILABLE DATA

**Status:** ACTIVE (2026-02-15)
**Authority:** SUPREME

**When diagnosing issues:**
1. **Query the actual database** — don't assume data is missing or corrupt
2. **Read the actual code** — don't assume what changed; use `git log`, `git diff`
3. **Check what the user can see** — toasts, UI errors, browser console
4. **Verify deployment state** — what code is actually running in production
5. **Don't dismiss user reports** — if they say something broke, SOMETHING changed (even if it's new visibility, not a regression)

**Violation consequences:** Same as Honesty Protocol (destroys trust, wastes time)

**Incident (2026-02-15):** User reported upload "errors" on PDFs that previously worked. I assumed the PDFs were bad or the user was wrong. Reality: I had added warning code (commit 10543df, Feb 10) that made previously-silent item drops visible as RED error toasts. The uploads were succeeding. The "error" was my own code showing warnings for the first time. I wasted the user's time dismissing their report instead of checking my own recent changes.

---

# SECTION 0: SYSTEM STATUS & POC BENCHMARK

## 🎯 POC BENCHMARK - PRODUCTION VALIDATION (2026-02-02)

**Status:** ✅ **95% ACCURATE** - Core functionality validated with full route completion

**Test Scenario:**
- Full route: 4 machines × 5 items = 20 items total
- Voice commands ONLY: "next", "next item", "top", "bottom"
- No complex commands, pure basic operation test

**Results:**

**✅ WORKING ACCURATELY (11 core systems):**
1. Voice recognition (Deepgram) - All commands recognized
2. Command routing - Correct workflow execution
3. Machine transitions - Direction selection works
4. Item display - All 20 items shown correctly
5. Done card - All picked items displayed
6. Progress bar - Accurate count throughout
7. Machine completion detection - Correctly triggered
8. Route completion - Properly ended
9. Item deduplication - No duplicates
10. Semantic matching - Natural language variations accepted
11. Phonetic correction - Mishearings corrected

**❌ BUGS IDENTIFIED (2):**
1. **Dropdown count:** Shows "4/5" for completed machines (should be "5/5")
   - Severity: HIGH
   - Status: Fix ready in `src/hooks/useStockerSession.ts:407-420`
2. **start_machine contract:** Missing item1 wrapper
   - Severity: HIGH
   - Status: Fix ready in `/workflows/fixes/start_machine_format_output_FIXED.js`

**Assessment:**
- **Core voice interaction:** Smooth and natural ✅
- **Data flow:** Correct end-to-end ✅
- **UI display:** 2 cosmetic bugs (non-blocking) ⚠️
- **Production readiness:** Ready after 2 bug fixes deployed ✅

**Documentation:** See MEMORY.md Session 57 for complete analysis

---

# SECTION 0.1: DEPLOYMENT - NEVER FUCK THIS UP AGAIN

## ⚠️ StockerAI Deploys via GitHub → Cloudflare Pages (AUTO)

**The ONLY deployment method:**
```bash
git add [files]
git commit -m "message"
git push origin main  # Cloudflare Pages auto-deploys
```

**Production URLs:**
- Cloudflare Pages: `https://stocker-ai.pages.dev`
- Custom Domain: `https://my-stocker-ai.com`

## ❌ NEVER DO THESE

**DO NOT run:**
- `npx netlify deploy` ← WRONG PLATFORM (incident: 2026-01-22)
- `npx vercel deploy` ← WRONG PLATFORM
- `npx render deploy` ← That's for Xpansion, NOT StockerAI
- ANY deployment CLI tool without explicit verification

**DO NOT assume:**
- "Vite projects use Netlify" ← WRONG
- "Check Render for deployment" ← That's Xpansion
- "Deployment methods are interchangeable" ← WRONG

## ✅ Correct Process

1. **Build locally (optional):** `npm run build` (just to verify, not required)
2. **Commit changes:** `git commit -m "..."`
3. **Push to GitHub:** `git push origin main`
4. **Cloudflare handles the rest** (auto-build, auto-deploy)
5. **Wait 2-3 minutes** for deployment

## 🔥 Incident: Attempted Netlify Deploy (2026-01-22)

**What happened:**
- Fixed critical bugs (last item logging, route completion)
- Built frontend with `npm run build` ✅
- **Ran `npx netlify deploy --prod`** ❌ WRONG PLATFORM
- Opened browser OAuth window for Netlify authentication
- User interrupted before completion

**Why it happened:**
- Assumed deployment method without checking
- Pattern-matched "Vite = Netlify" from training data
- Never verified actual deployment config

**Correct action:**
- Push to git → Cloudflare auto-deploys ✅ (what I did after being corrected)

---

## 🔥 Incident: Edge Function "Invalid JWT" - Bandaid Hell (2026-02-01)

**What happened:**
- User tested route starting after systematic fixes
- Got past "yes" (set_route_sequence worked) ✅
- First item displayed (start_machine worked) ✅
- Said "next" → **401 Invalid JWT error** ❌
- Tried 4 bandaid fixes before finding root cause

**The bandaid spiral:**
1. ❌ Added Authorization header with user JWT (not needed)
2. ❌ Switched back to n8n workflow (avoiding the problem)
3. ❌ Added debug logging (still not root cause)
4. ❌ User demanded: "can't you just look at what was working before and fucking compare?"

**Root cause (found by comparing):**
- Edge Functions default to JWT verification **ON**
- Billing functions in `config.toml` had `verify_jwt = false`
- **StockerAI Edge Functions were MISSING from config.toml**
- Functions use SERVICE_ROLE_KEY (don't need user JWT anyway)

**The actual fix:**
```toml
# supabase/config.toml
[functions.get-next-item-atomic]
verify_jwt = false

[functions.get-current-status-optimized]
verify_jwt = false
```

**Deploy:**
```bash
supabase functions deploy get-next-item-atomic --no-verify-jwt
supabase functions deploy get-current-status-optimized --no-verify-jwt
```

**Lesson learned:**
- **STOP BAND-AIDING SYMPTOMS**
- **Compare working vs broken state FIRST** (git log, git diff)
- **Find when it broke** (commit history)
- **Check config differences** (especially for 3rd party services)
- **Fix root cause, not symptoms**

**Correct debugging order:**
1. Compare current to last known working (`git diff <commit> HEAD`)
2. Find when feature was added (`git log -S "search_term"`)
3. Check if feature ever worked or was broken from start
4. Look for config differences (environment, .toml, .env, etc.)
5. Fix root cause

**Files:** `supabase/config.toml`, `src/hooks/useStockerAI.ts`

---

## 🔥 Incident: Machine Transition Bug - ACTUAL FIX (2026-01-25)

**What happened:**
- Jan 23 "fix" (commit 7de9bcb) WAS deployed but bug STILL occurred
- User finished Machine 1, said "bottom" for Machine 2
- AI responded: "You're on Machine 1. Did you want to restart this machine?"
- The revert fix didn't solve the root cause

**Root cause (the REAL one):**
- Jan 23 fix updated frontend state immediately ✅
- But AI prompt had NO explicit flag indicating "awaiting direction response"
- When user said "bottom", AI saw:
  - currentMachineName = Machine 2
  - Conversation history mentioning Machine 1 complete
  - No explicit "you just asked top/bottom, interpret this as direction"
- AI got confused and thought user wanted to go BACK to Machine 1

**The actual fix (commit 07e4dd5):**
1. Set `pendingMachineTransition` when `action="next_machine"`
2. Clear `pendingMachineTransition` when `start_machine` is called
3. Inject "⚠️ AWAITING DIRECTION RESPONSE" into AI prompt context
4. AI now knows: "Next input MUST be interpreted as direction only"

**Files changed:**
- `src/hooks/useStockerSession.ts`: State management for pending transition
- `src/hooks/useStockerAI.ts`: Prompt context with explicit awaiting flag

**Lesson:** Frontend state updates aren't enough - AI needs EXPLICIT context about what state it's in and what user input means in that state.

**Full history:** `/home/visionairy/StockerAI/docs/MACHINE_TRANSITION_BUG_COMPLETE_HISTORY.md`

---

## ✅ MAJOR: AI Prompt Restructure for Bulletproof Execution (2026-01-25)

**Problem identified:**
- 32 instances of "CRITICAL" → diluted emphasis, AI doesn't know what matters
- No clear state precedence → AI confused when rules conflict
- Top 5 commands (next, yes, bottom, top, done) = 95% of usage but "not bulletproof by a long shot"
- Missing edge case handling

**Solution implemented (commit 75b020a):**

**1. State-Machine Approach:**
- **STATE 1: AWAITING DIRECTION** → OVERRIDES all other rules
  - Only top/bottom matter, ignore everything else
- **STATE 2: AWAITING SKIP CONFIRMATION** → Only yes/no matter
- **STATE 3: IDLE** → Follow priority order (Top 5 → Other commands → Status → Errors)

**2. Bulletproof Top 5 Commands (95% usage):**
```
"NEXT"    → Always get_next_item (unless in direction/skip state)
"YES"     → Context-aware (skip? route? next item?)
"BOTTOM"  → ALWAYS start_machine(end), NEVER "go back to machine"
"TOP"     → ALWAYS start_machine(beginning)
"DONE"    → Same as next
```

**3. Reduced Cognitive Load:**
- Removed 20+ redundant CRITICAL markers
- Visual separators for scannability
- Clear precedence: State rules > Top 5 > Other > Status > Errors

**4. Edge Case Handling:**
- Unclear input during state → Repeat question
- Tool call fails → "Something went wrong. Try again."
- Suspected mishearing → "Did you mean [X]?"

**Result:**
- AI has unambiguous execution paths for 95% of commands
- State-based rules prevent confusion
- Easy to debug (clear mental model)

**Files:** `src/hooks/useStockerAI.ts` (~300 lines restructured)

---

## 🔥 Incident: Machine Transition Fragility - Tool Call Failure (2026-01-25)

**Problem identified:**
- If `start_machine` tool call fails (network timeout, server error, database down)
- `updateFromTool` sees `result.error` and returns early (line 129)
- `pendingMachineTransition` state **NEVER cleared**
- User stuck in direction-awaiting mode
- All commands ignored except "top/bottom"
- No escape except page reload

**Example scenario:**
1. User finishes Machine 1 → `pendingMachineTransition` set to Machine 2
2. AI asks "Top or bottom for Machine 2?"
3. User says "bottom"
4. AI calls `start_machine(direction="end")`
5. **Network timeout / server error**
6. Error handler returns early WITHOUT clearing state
7. User tries "next" → Ignored (only direction accepted)
8. User tries "skip" → Ignored
9. **Stuck forever**

**The fix (commit 09fc0d3):**
```typescript
// Before general error check, detect start_machine failure
if (result && result.error && toolName === 'start_machine') {
  setRouteState(prev => ({
    ...prev,
    pendingMachineTransition: null  // Clear to exit direction-awaiting state
  }));
  return;
}
```

**Impact:**
- Graceful degradation instead of hard lockup
- User can proceed with other commands (next, skip, etc.)
- No longer stuck after transient failures

**Files:** `src/hooks/useStockerSession.ts:128-137`

**Lesson:** Error paths must clean up state just like success paths. State flags that control execution flow (like `pendingMachineTransition`) MUST be cleared on ALL exit paths.

---

## ✅ MAJOR: Systematic Edge Case Elimination - Machine Transitions (2026-01-25)

**Context:** User frustrated with platform bugs, requested "anticipatory analysis" of edge cases.

**Deep analysis performed:** Systematic review of machine transition flow covering:
- Race conditions (rapid commands)
- AI prompt ambiguities
- State machine completeness
- Error propagation paths
- Timing assumptions
- Cleanup paths (success/error/timeout)
- Stale state persistence
- Network failure scenarios

**13 Issues Found (3 CRITICAL, 3 HIGH, 7 MEDIUM/LOW)**

---

### CRITICAL FIXES (Commits 451b105, b32ea39)

**1. Race Condition Lock (CRITICAL)**
- **Problem:** Rapid commands during transition → machine ID mismatch, duplicate sessions
- **Solution:** Added `machineTransitionLockRef`
  - Acquired when `action='next_machine'`
  - Released on success/error/skip/complete
  - Prevents concurrent state updates
- **File:** `src/hooks/useStockerSession.ts:103, 319-346`

**2. Enhanced Error Recovery (CRITICAL)**
- **Problem:** start_machine error cleared flag but left machine ID in limbo
- **Solution:** Restore previous machine state on error
  - Find last completed machine
  - Revert `currentMachineId/Name`
  - Release transition lock
- **File:** `src/hooks/useStockerSession.ts:133-151`

**3. Network Failure Cleanup (CRITICAL)**
- **Problem:** Network timeout left `pendingMachineTransition` set forever
- **Solution:** Clear state in error handlers
  - Tool failures → clear immediately
  - Network errors → preserve during retries, clear after max retries exhausted
  - Rate limits → preserve state, allow user retry
- **File:** `src/pages/StockerApp.tsx:714-733`

---

### HIGH PRIORITY FIXES

**4. Command Recognizer State Enforcement (HIGH)**
- **Problem:** Direct command execution bypassed AI state machine
- **Solution:** Check `pendingMachineTransition` BEFORE executing commands
  - Only allow DIRECTION_TOP/BOTTOM when awaiting direction
  - Re-prompt for direction if non-direction command received
  - Prevents skip/next/undo during transition
- **File:** `src/pages/StockerApp.tsx:354-368`

**5. Session Persistence Consistency (HIGH)**
- **Problem:** Resume used stale `currentMachineId` when `pendingMachineTransition` set
- **Solution:** Use `pendingMachineTransition.nextMachineId` if present
  - Ensures DB queries use correct machine after reload
  - Prevents wrong machine being started
- **File:** `src/pages/StockerApp.tsx:1133-1144`

---

### MEDIUM/LOW ISSUES

**6-13:** Additional edge cases identified but deemed low-risk:
- Voice interruption timing (partially mitigated)
- Wake lock cleanup on error paths
- Defensive validations for invalid machine IDs
- SessionInvalidated check coverage gaps

**Decision:** Monitor in production, fix if observed.

---

### IMPACT

**Before fixes:**
- Race condition → machine ID mismatch
- Tool errors → stuck in direction mode
- Network failures → permanent lockup
- Command bypass → wrong state transitions
- Page reload → wrong machine started

**After fixes:**
- Transition lock prevents races ✅
- Error recovery restores previous state ✅
- Network failures clear stuck state after retries ✅
- State machine enforced at all entry points ✅
- Resume uses correct machine ID ✅

**User experience:**
- No more stuck states
- Graceful degradation on errors
- Can retry after failures
- State persists correctly across reloads

**Files changed:**
- `src/hooks/useStockerSession.ts`: Lock, error recovery, state management
- `src/pages/StockerApp.tsx`: Command recognizer checks, error cleanup, resume fix

**Lesson:** Systematic edge case analysis prevents "whack-a-mole" debugging. Lock mechanisms + comprehensive error cleanup = robust state machines.

---

## 🔥 Incident: Progress Bar Bug - Stale Closure Pattern (2026-01-25)

**Context:** User reported progress bar not showing despite items being picked and in "done" card.

**What I did wrong:**
1. ❌ Made 3 partial fixes instead of systematic analysis (commits 1aaad58, 178de54)
2. ❌ Fix 1: Changed `totalItems` to `total_items` (broke n8n workflows)
3. ❌ Fix 2: Added fallback for both formats (bandaid on symptom)
4. ❌ Violated System Impact Audit Protocol - never traced data flow
5. ❌ User called me out: "Do a systemic review and provide complete fixes instead of partial symptomatic fails"

**Root cause (commit 89d613e):**
- `updateFromTool` defined with `useCallback(..., [])` - empty dependencies
- Captured `routeState` from first render and NEVER updated (stale closure)
- Lines tried to read `routeState.machines` from stale closure
- `set_route_sequence` updated state → machines array populated
- `start_machine` called → closure still saw empty `routeState.machines` from mount
- Result: `getMachineTotalItems` always returned 0

**Timeline of failure:**
1. Component mounts → `routeState.machines = []`
2. `updateFromTool` closure captures `routeState.machines = []`
3. `set_route_sequence` runs → Updates state → `machines = [5 machines]`
4. `start_machine` runs → Closure still sees `routeState.machines = []` ❌
5. Progress bar gets `totalItems = 0`, never shows

**The complete fix:**
```typescript
setRouteState(prev => {
  // MOVED getMachineTotalItems INSIDE callback
  const getMachineTotalItems = (machineId: string): number => {
    const machine = prev.machines.find(m => m.id === machineId);
    return machine?.totalItems || 0;
  };

  if (toolName === 'start_machine') {
    const totalItems = getMachineTotalItems(result.machine_id);
    next.currentMachineTotalItems = totalItems; // Now works!
  }
});
```

**Why this works:**
- `setRouteState` callback receives `prev` with CURRENT state (not stale)
- `getMachineTotalItems` now reads from `prev.machines`, not captured `routeState.machines`
- Always gets latest data regardless of closure capture

**What I should have done FIRST:**
1. ✅ Trace data flow: set_route_sequence → machines array → start_machine → progress bar
2. ✅ Check where machines array is accessed (inside/outside closure)
3. ✅ Identify stale closure pattern (empty deps + stateful access)
4. ✅ Provide ONE complete fix, not 3 partial ones

**Lesson learned:**
- **NEVER access stateful values from useCallback with empty deps `[]`**
- Always use state updater callback `(prev => ...)` to get current state
- Stale closures are invisible - closure looks correct but uses old data
- Systematic analysis FIRST, not 3 guesses and a bandaid

**Files:** `src/hooks/useStockerSession.ts:166-209`

---

## 🔥 Incident: Machine Transition Bug - 2 Hours of Guessing (2026-01-23)

**What happened:**
- User reported: Machine 2 restarts as Machine 1 after saying "bottom"
- Spent 2 hours trying 6 different wrong fixes
- User demanded: "Why aren't you using the commit that worked as the source of truth?"
- **That question solved it immediately:** `git diff 52e9508 HEAD` showed the problem

**What I did wrong:**
1. ❌ Checked workflow code (was correct)
2. ❌ Added AI prompt context (didn't help)
3. ❌ Checked database updates (were correct)
4. ❌ Changed workflow query logic (made it worse)
5. ❌ Found duplicate session (symptom not cause)
6. ❌ Planned to add machine_id parameter (overengineering)

**Root cause:**
- Commit a376e8b (Jan 20) added `pendingMachineTransition` to fix pause/resume
- This created state mismatch: database updated to Machine 2, frontend stayed Machine 1
- Working version (Jan 18) updated `currentMachineId` immediately - no mismatch

**Correct action (should have done FIRST):**
```bash
# Compare current to last known working
git diff 52e9508 HEAD -- src/hooks/useStockerSession.ts
# Found pendingMachineTransition immediately
# Reverted to working behavior
```

**The fix:**
- Revert frontend to immediate state updates (Jan 18 behavior)
- Add database safeguards (unique constraint + trigger)
- Delete duplicate session
- Total: 3 line change, not 6 complex solutions

**LESSON: When something breaks, FIRST compare to when it worked. Don't guess.**

**Full documentation:** `/home/visionairy/StockerAI/docs/MACHINE_TRANSITION_BUG_COMPLETE_HISTORY.md`

---

# 1. SOURCE OF TRUTH

**MEMORY.md is the primary SOT.** Always read it first for current state, workflow IDs, and pending tasks.

---

# 1.1 XPANSION (XF) - AUTOMATIC SYSTEM IMPACT ANALYSIS

**Status:** ACTIVE - Use automatically when needed
**Purpose:** Discover all affected components before making changes

## ⚠️ ABSOLUTE MANDATE - WHEN USER SAYS "USE XF"

**If user says "use XF" or "run XF" or "analyze with XF":**
1. **IMMEDIATELY run XF** - Do not explain, do not ask, do not suggest alternatives
2. **Use exact problem statement provided**
3. **Show results when complete**
4. **NO EXCUSES** - Not "simple enough", not "faster manually", not "XF overkill"

**Violation = session-ending failure.**

**Evidence of past violations:**
- Session 45 (2026-01-20): User demanded XF, I attempted manual analysis first, got called out
- Session 47 (2026-01-23): Spent 2 hours guessing, 6 failed fixes, never used XF

---

## When You (Claude) Must Use XF Automatically

**AUTOMATIC for (unless user says "skip XF"):**
- Workflow activation/changes (n8n)
- Database schema changes (ALTER TABLE, CASCADE, RLS)
- API contract changes (WEBHOOK_MAP, endpoint updates)
- Multi-boundary fixes (frontend + backend + database)
- Bug fixes affecting 2+ components

## How to Use XF (Hidden from User)

**⚠️ CRITICAL: Use the `xpansion` command (available globally)**

```bash
xpansion analyze "problem"              # System analysis (DATA/NODES/FLOW/ERRORS)
xpansion decompose "intent"             # Intent decomposition (WHAT/WHO/HOW)
xpansion design "process"               # Process design (INPUTS/STEPS/OUTPUTS)
xpansion validate "problem" "solution"  # Solution validation (PRESERVATION)
```

**Options:** `--output FILE`, `--verbose`, `--engine v2`

**Quick reference:** `/home/visionairy/Xpansion/QUICK_REFERENCE.md`

**Quick summary:**
1. User describes problem conversationally
2. You run `xpansion analyze "problem"` (automatic, user doesn't see this)
3. You discover DATA/NODES/FLOW/ERRORS boundaries
4. You show user plain-English summary of what's affected
5. You implement the solution properly
6. Done

**User NEVER sees:** Python code, MECE violations, technical XF details
**User SEES:** "I analyzed the system. This affects [components]. Here's my plan: [simple summary]"

**Full protocol:** `/home/visionairy/CLAUDE.md` System Impact Audit section

---

# 1.2 MANDATORY SYSTEM IMPACT AUDIT PROTOCOL

**Status:** ACTIVE (2026-01-18)
**Enforcement:** ZERO TOLERANCE - Session terminates on violation

## THE RULE

**BEFORE making ANY change to:**
- Code, Edge Functions, database schema, n8n workflows
- API contracts, shared types, environment variables

**YOU MUST answer 6 questions:**
1. **DATA FLOW** - What data enters/exits? Format changes?
2. **CALLERS (Upstream)** - Who calls this? What do they expect?
3. **CALLEES (Downstream)** - What does this call? What does it need?
4. **SIDE EFFECTS** - Database writes? Emails? API calls?
5. **STATE DEPENDENCIES** - Race conditions? Caches? Locks?
6. **ERROR PROPAGATION** - When this fails, what happens?

**Document findings in `/docs/audits/AUDIT_[DATE]_[CHANGE].md`**
**Get user approval BEFORE implementing**

### 🔥 Incident: Incomplete Fix - Machine Sequencing (2026-01-22)

**What happened:**
- Fixed machine sequencing logic (reverse mode bug) in Determine Next State node
- Provided code replacement to user WITHOUT checking downstream Format Output node
- Result: Voice output said "undefined complete. Next is undefined at undefined"
- Root cause: Format Output expected different field names than I provided

**What I should have done:**
1. Read Format Output node code FIRST
2. Verify what field names it expects (completed_machine, next_machine, etc.)
3. Provide COMPLETE fix with correct field names
4. User gets working code on first try

**What I actually did:**
1. Fixed logic bug ✅
2. Provided code with wrong field names ❌
3. User hit "undefined" error
4. Had to fix again with correct field names

**Lesson:** ALWAYS verify downstream consumers BEFORE providing code replacement. The fix must be complete and compatible with the entire system.

**Full Protocol:** See `/home/visionairy/CLAUDE.md` Section "MANDATORY SYSTEM IMPACT AUDIT PROTOCOL"

---

# 1.3 Trusted vs Untrusted Sources

### ALWAYS Query Live Data For:

| Source | How to Query |
|--------|--------------|
| **Database schema** | Query `information_schema` via Supabase SQL |
| **n8n workflow structure** | Use `n8n_get_workflow` MCP tool |
| **n8n executions** | Use `n8n_executions` MCP tool |
| **Frontend state** | Read actual source files |

### NEVER Trust:
- Static schema files (query live database)
- README "architecture" sections (read actual code)
- Assumptions (verify with live data)

---

# 1. PROJECT IDENTITY

## 1.1 Product Definition

**Stocker** is a voice-guided warehouse pre-kitting system for vending machine route preparation.

**Target User:** Solo vending machine operator preparing daily route bins at 4AM
**Core Value:** Complete hands-free stocking - zero screen interaction required
**PRD:** `/docs/STOCKER_PRD_v1.md`

## 1.2 Technical Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 18 + TypeScript + Vite |
| STT | Deepgram (real-time transcription) |
| AI | OpenAI GPT-4o-mini via n8n proxy |
| TTS | OpenAI TTS via n8n proxy |
| Backend | n8n Cloud (workflows) + Supabase Edge Functions |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email + password) |
| Hosting | Cloudflare Pages (auto-deploy from main) |
| Domain | my-stocker-ai.com |

## 1.3 Key Requirements

- **Latency:** <2 seconds end-to-end (speech → response)
- **Accuracy:** 99% on common commands
- **Reliability:** 100% state persistence, zero data loss
- **Session:** 6+ hour continuous operation

---

# 2. n8n OPERATIONAL RULES

## 2.1 Code Node Syntax

**Allowed:**
```javascript
data.field || 'default'
data.field ? data.field.sub : null
for (var i = 0; i < items.length; i++)
```

**Forbidden:**
```javascript
data?.field           // No optional chaining
data ?? 'default'     // No nullish coalescing
require()             // No imports
fetch()               // Use HTTP Request node
```

## 2.2 n8n MCP Tools – MANDATORY MODES

| Tool | REQUIRED Mode | Why |
|------|---------------|-----|
| `n8n_get_workflow` | `mode: "structure"` | Full mode returns 50KB+ |
| `n8n_executions` | `mode: "preview"` or `mode: "error"` | Default returns all node data |

## 2.3 n8n Workflow Safety Rules

**Status:** ACTIVE (Known bugs as of 2026-01-15)

| # | Issue | Impact |
|---|-------|--------|
| 1 | Deleting workflow before testing | Production downtime |
| 2 | Webhooks don't auto-activate | Tool calls fail |
| 3 | Partial update corrupts JS Code | Syntax errors |
| 4 | IF/Switch/Merge connections corrupt | Wrong branches |

### RULE 1: Never Delete Before Testing
1. Create new workflow with version suffix
2. Place in StockerAI folder immediately
3. Test thoroughly (webhook, execution, output)
4. Activate new workflow
5. ARCHIVE (not delete) old workflow
6. Rename new workflow if needed

### RULE 2: Webhook Activation Verification
1. Get status: `n8n_get_workflow({id, mode: "minimal"})`
2. Test: `curl -X POST "https://visionairy.app.n8n.cloud/webhook/[path]"`
3. If no response → Notify user to manually re-register

### RULE 3: JS Code Node Changes
**Single node:** Create .js file for user to copy/paste
**Multiple nodes:** Ask user preference (manual/delete+create/instructions)

### RULE 4: IF/Switch/Merge Verification
1. Verify: `n8n_get_workflow({id, mode: "structure"})`
2. Always notify user to verify manually in n8n UI

## 2.4 n8n Workflow Organization

**Folder:** All workflows MUST be in `StockerAI` folder (Personal project)

**Naming Convention:**
- Voice tools: `Stocker Tool: <command_name>`
- Backend services: `Stocker - <service_name>`
- Auth/infrastructure: `Stocker <system_name>`

### Current Active Workflows (2026-01-15)

| Workflow Name | ID | Webhook Path | Status |
|---------------|-----|--------------|--------|
| get_next_item (Optimized) | iykbFj7f9222PF7r | /next-item-optimized | ⏸️ TESTING |
| start_machine | JbKdJuKgGbyvzlF0 | /start-machine | ✅ ACTIVE |
| skip_current_machine | ElCSMeguJNxwp0HO | /skip-machine | ✅ ACTIVE |
| switch_route | 3G01u7N9REhrC9tn | /switch-route | ✅ ACTIVE |
| get_routes_for_date | 4XS07THe1uGak7rk | /get-routes | ✅ ACTIVE |
| set_route_sequence | 46lMRdxTgD1E3WFz | /set-sequence | ✅ ACTIVE |
| go_back_to_skipped | rpNfINhjbFCuFrlZ | /back-to-skipped | ✅ ACTIVE |
| update_session_state | ueDSi9SDBZ5jMwpO | /update-session | ✅ ACTIVE |
| delete_route | zmgTBX1w1rc5bOpO | /delete-route | ✅ ACTIVE |
| get_current_status | PD3ErCuxWBWLFXIq | /current-status | ✅ ACTIVE |
| PDF Upload | 7kO6o1wASKvbhc2U | /upload | ✅ ACTIVE |
| Stocker Auth | cw0ERwaa1VXJ2Jah | /auth | ✅ ACTIVE |

---

# 3. COMMUNICATION RULES

**The user is NOT a traditional developer.**

When giving instructions:
- Never assume technical knowledge
- Always explain where to click, what to look for
- Use step-by-step numbered instructions
- Include visual descriptions
- Explain jargon on first use
- Provide context for why each step matters

---

# 4. SESSION PROTOCOL

## 4.1 Session Start
1. Read `/home/visionairy/StockerAI/MEMORY.md`
2. Check current status and pending tasks
3. Review recent changes

## 4.2 Session End
Update MEMORY.md with: what was done, what works, what's broken, what's pending, decisions made

## 4.3 Git Workflow - AUTO-PUSH

**MANDATORY:** After completing code changes, immediately commit and push to GitHub.

**When to push:** After feature/fix completion, file modifications, user approval
**Exception:** User explicitly says "don't push yet" OR changes are experimental

**User should NEVER ask "did you push this?"** - answer should always be YES.

---

# 5. TROUBLESHOOTING PROTOCOL

## 5.1 Boundary & Branch Discovery (MANDATORY)

**Before attempting ANY fix:** Apply systematic BBRD approach. NO exceptions.

### The Stocker Data Flow Boundaries

```
PDF Upload → Database → n8n Workflows → AI → TTS
(Parser)     (Supabase)  (Tool calls)    (Groq) (OpenAI)
```

### MANDATORY Debugging Protocol

1. **Identify Which Boundary Failed** - Trace data flow
2. **Verify Contract at Boundary** - Upstream OUTPUT vs downstream EXPECT
3. **Check Upstream Contamination** - Broken at N may be caused by N-1
4. **Validate Fix Propagation** - Trace forward after fix

## 5.2 n8n Root Cause Boundaries

| # | Boundary | What It Covers |
|---|----------|----------------|
| 1 | WORKFLOW | Structure, flow logic, trigger config |
| 2 | NODE | Individual node config, parameters |
| 3 | DATA | Data between nodes, schema, types |
| 4 | CODE | Code nodes, expressions, function logic |
| 5 | CONNECTION | External services, API credentials |
| 6 | EXECUTION | Timing, concurrency, rate limits |
| 7 | ENVIRONMENT | n8n instance, env vars, version |
| 8 | DATABASE | Supabase queries, RLS policies |
| 9 | API | Backend endpoints, request/response |
| 10 | FRONTEND | UI/client-side, state, API calls |

## 5.3 Symptom → Boundary Quick Reference

```
Workflow never triggers          → WORKFLOW, EXECUTION
Workflow stops at node           → NODE, DATA
"undefined"/"null" errors        → DATA, CODE
Auth/permission errors           → CONNECTION, DATABASE
Timeout errors                   → EXECUTION, CONNECTION
Wrong results (no error)         → DATA, CODE, WORKFLOW
Intermittent failures            → EXECUTION, CONNECTION
UI doesn't update                → FRONTEND → API → n8n
```

## 5.4 Terminal Criteria

Root cause is TERMINAL when ALL true:
- **SPECIFIC** - Points to exact node/line/field/config
- **REPRODUCIBLE** - Can trigger symptom by manipulating cause
- **SINGULAR** - Fixing ONE thing resolves symptom
- **VERIFIABLE** - Can confirm fix with specific test

---

# 6. MCP SERVERS

## n8n-mcp Server (CRITICAL)

**Location:** `.mcp.json` in project root

**When to use:**
- **FIRST** when troubleshooting workflow/backend errors
- Check n8n executions BEFORE deploying console logging
- Investigate webhook timeouts, 500 errors, tool failures

**Key Tools:**
- `n8n_executions({action: 'list'})` - Recent runs
- `n8n_executions({action: 'get', executionId})` - Detailed logs
- `n8n_get_workflow({workflowId})` - Configuration

---

# 7. AUTOMATED MEMORY EXTRACTION

**MANDATORY TRIGGER:** Context ≤ 10,000 tokens (5% of 200K)

**Execution:**
1. STOP ALL OTHER WORK
2. ANNOUNCE TRIGGER
3. EXTRACT: Problems/solutions, positive discoveries, system knowledge, meta-learning
4. UPDATE this CLAUDE.md or MEMORY.md
5. COMMIT TO GIT
6. REPORT TO USER

---

# 8. DEPLOYMENT & INFRASTRUCTURE

**Automated (Frontend):**
- GitHub push to `main` → Auto-deploys to Cloudflare Pages
- URL: https://stocker-ai.pages.dev
- Completes within 2-3 minutes

**Manual Steps:**
1. **SQL Migrations** - Run in Supabase SQL Editor (`supabase/migrations/*.sql`)
2. **n8n Workflow Updates** - Paste into n8n UI (`workflows/*.js`)

---

# 9. CRITICAL BUGS FIXED

## 9.1 Session 42 Fixes (2026-01-17) - SUMMARY

**Commit:** c29f9f8 | **Status:** ✅ Deployed

### Bug 1: Progress Not Saving When App Closes
**Symptom:** Progress lost on crash/close
**Solution:**
- `beforeunload` listener (forces save before close)
- Retry logic (3 attempts, exponential backoff)
**Files:** `StockerApp.tsx`, `useSessionPersistence.ts`

### Bug 2: Duplicate "Next" → Route Completes Early
**Symptom:** Double "next" within 1-2 seconds causes route to end
**Solution:**
- Frontend debouncing (1.5s)
- Database optimistic locking (checks expected index before update)
**Files:** `useStockerAI.ts`, SQL migration, n8n workflow

### Bug 3: Voice Not Restarting After Stop
**Symptom:** Stop button kills voice until page refresh
**Solution:**
- Enhanced `stopListening()` cleanup (clears all state/timeouts)
- Robust `startListening()` reset (resets all flags)
**Files:** `useVoice.ts`

**Detailed implementations:** See `/home/visionairy/.claude-archives/stockerai_CLAUDE_archive_20260119_bug_fixes.md`

---

## 9.2 Session 43 Fixes (2026-01-18) - SUMMARY

**Status:** ✅ Deployed to production

### Issue 1: RLS Infinite Recursion (CRITICAL)
**Symptom:** `ERROR: infinite recursion in policy for relation "account_users"`
**Cause:** RLS policies query same table they protect
**Temporary Fix:** Disabled RLS on `account_users` and `profiles`
**Security Impact:** Cross-account access possible - **BLOCKS multi-tenant**
**Proper Fix Needed:** Helper table, cached function, or JWT claims

### Issue 2: Teams Page Shows "Unknown User"
**Causes:** Trigger missing names, RLS blocking profiles
**Fixes:** Updated trigger to copy names, disabled RLS, cache buster

### Issue 3: Email Shows "()"
**Cause:** Profile had NULL names
**Fix:** Multi-level fallback (profiles → auth.users → "Your Team Admin")

### Issue 4: No Logout on Mobile
**Fix:** Added fixed bottom nav bar with logout button

**Lesson:** Check CLAUDE.md BEFORE creating new docs (avoid duplication)

---

## 9.3 Race Condition Pattern (Reusable)

**Pattern:** Concurrent updates to shared database state

**Generic Solution:**
1. **Frontend debouncing** - Prevent rapid duplicate requests
2. **Optimistic locking** - DB verifies expected state before update

**When to Use:**
- Commands triggerable multiple times rapidly
- DB updates based on previous state reads
- Multi-step operations where state can change

---

# 10. PENDING SECURITY & PERFORMANCE ISSUES

## 10.1 CRITICAL: No Row Level Security (RLS)

**Severity:** CRITICAL
**Status:** ⚠️ WORSE - RLS DISABLED on 2 tables (2026-01-18)
**Impact:** Any authenticated user can read/modify other users' data

**Tables WITHOUT RLS:**
- `routes`, `machines`, `items`, `sessions`

**Tables WITH RLS DISABLED (Temporary):**
- `account_users` - Infinite recursion (see 9.2)
- `profiles` - Blocked Teams page

**Current State:** Single-tenant only, **NOT SAFE for multi-tenant production**

**Required Fix:**
1. Fix `account_users`/`profiles` RLS (helper table/cached function/JWT claims)
2. Implement RLS on remaining tables

---

## 10.2 No Rate Limiting

**Severity:** HIGH
**Impact:** API vulnerable to abuse, DoS
**Affected:** Edge Functions, n8n webhooks
**Fix:** Implement rate limiting at Edge Function level

---

## 10.3 Voice Recognition Tuning

**Severity:** MEDIUM
**Impact:** Occasional misrecognition
**Fix:** Command-specific tuning, phonetic aliases

---

**END OF FILE**
