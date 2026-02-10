# Session 62: n8n to Python Migration Planning

**Date:** 2026-02-10
**Status:** In Progress - Planning Phase

## Context

User reported production bug: n8n workflow "get_next_item" failing with error:
```
this.getCredentials is not a function [line 19]
```

## What We Fixed (Phase 1 - Completed ✅)

### 1. Created Atomic RPC Function
**File:** `supabase/migrations/20260210_atomic_get_next_item_and_increment.sql`

- Combined read + calculate + increment in single database transaction
- Uses `FOR UPDATE` lock to prevent race conditions
- Eliminates TOCTOU vulnerability
- 280 lines of PL/pgSQL porting all n8n "Determine Next State" logic

### 2. Updated Edge Function
**File:** `supabase/functions/get-next-item-data/index.ts`

- Now calls `get_next_item_and_increment` RPC instead of old `get_next_item_data`
- Accepts `count` parameter
- Simplified response (no restructuring needed)
- **Deployed ✅**

### 3. Simplified n8n Workflow
**Workflow ID:** iykbFj7f9222PF7r

**Before:** 10 nodes
- Webhook → Call Edge Function → Extract Consolidated Data → Determine Next State → Switch Action → Increment Completed Items (BROKEN) → Merge → Update Session → Format Output

**After:** 4 nodes
- Webhook → Call Edge Function → Update Session → Format Output

**Deleted nodes:**
- ❌ Extract Consolidated Data (not needed)
- ❌ Determine Next State (logic moved to RPC)
- ❌ Increment Completed Items (broken node with this.getCredentials)
- ❌ Switch Action (not needed)
- ❌ Add First Item to Machine (not needed)
- ❌ Merge All Paths (not needed)

**Deployed via Synta MCP ✅**

### 4. Git Committed & Pushed
**Commit:** 38904f5
**Pushed to:** main (Cloudflare auto-deploying)

---

## Strategic Discussion: Complete Migration to Python

### User Question
"Couldn't we build a complete Python replacement and just adjust the frontend to access one flow over the other and keep n8n as backup?"

### Proposed Approach: Parallel Systems + Switch

**Architecture:**
```
Frontend (environment variable controls backend)
    ↓
[n8n workflows] ← Current (backup)
    OR
[Python Edge Functions] ← New (primary)
    ↓
Database (same for both)
```

**Benefits:**
1. ✅ Zero downtime - test fully before switching
2. ✅ Instant rollback - just flip environment variable
3. ✅ Complete validation - prove 100% feature parity
4. ✅ No partial state - not "some in Python, some in n8n"
5. ✅ n8n stays as backup

---

## Complete Migration Plan (5 Phases)

### Phase 1: Complete Documentation (Today - 2-3 hours)

**Goal:** Document EVERYTHING so nothing is missed

**Approach:** Use **Ralph Wiggum iterative loop** + **Synta MCP** + **Opus model**

**Why Ralph Wiggum:**
- ✅ Well-defined task: Document all 11 workflows completely
- ✅ Clear success criteria: All contracts, logic, edge cases captured
- ✅ Requires iteration: Query, extract, validate, check gaps
- ✅ Self-correcting: Each iteration builds on previous, sees previous work

**Why Opus:**
- ✅ Complex multi-system analysis (4 layers)
- ✅ Critical requirement: "ensure nothing is missed"
- ✅ User has $50 extra usage enabled (promotion deadline: Feb 16, 2026)
- Cost: ~$5-10 for complete analysis (well within budget)

**What Gets Documented:**

**LAYER 1 - FRONTEND:**
- `src/hooks/useStockerAI.ts` - All API calls
- `src/hooks/useStockerSession.ts` - Session management
- `src/hooks/useVoice.ts` - Voice commands
- All WEBHOOK_MAP entries
- All data contracts frontend expects

**LAYER 2 - N8N WORKFLOWS (11 active):**
1. get_next_item (Optimized) - iykbFj7f9222PF7r
2. start_machine - JbKdJuKgGbyvzlF0
3. skip_current_machine - ElCSMeguJNxwp0HO
4. set_route_sequence - 46lMRdxTgD1E3WFz
5. go_back_to_skipped - rpNfINhjbFCuFrlZ
6. get_routes_for_date - 4XS07THe1uGak7rk
7. delete_route - zmgTBX1w1rc5bOpO
8. update_session_state - ueDSi9SDBZ5jMwpO
9. PDF Upload - 7kO6o1wASKvbhc2U
10. Stocker Auth - cw0ERwaa1VXJ2Jah
11. [One more to identify]

For each workflow:
- Complete structure via Synta MCP
- All inputs, outputs, logic
- All Code nodes, HTTP requests, Switch/Merge/IF logic
- All error handling
- Parsing rules (product names, TTS fixes, slot formatting)
- Edge cases from CLAUDE.md incidents

**LAYER 3 - EDGE FUNCTIONS:**
- List all in `supabase/functions/`
- Identify which called by n8n vs frontend
- Document what each does
- Determine keep vs replace

**LAYER 4 - DATABASE:**
- All RPCs (especially new get_next_item_and_increment)
- Key tables and schemas
- Data contracts

**OUTPUT:** `/home/visionairy/StockerAI/docs/N8N_TO_PYTHON_MIGRATION_SPEC.md`

**Completion Promise:** `<promise>COMPLETE SYSTEM ANALYSIS</promise>`

---

### Phase 2: Build Python API (2-3 days)

**Structure:**
```
supabase/functions/stocker-api-python/
├── main.py              # FastAPI app
├── routes/
│   ├── next_item.py     # get_next_item logic
│   ├── machine.py       # start/skip machine
│   ├── route.py         # route management
│   └── upload.py        # PDF upload
├── services/
│   ├── formatting.py    # TTS formatting
│   ├── parsing.py       # Product parsing
│   └── database.py      # Supabase calls
├── tests/
│   ├── test_next_item.py
│   ├── test_machine.py
│   └── test_formatting.py
└── requirements.txt
```

**All 11 workflows → Python endpoints:**
```python
@app.post("/api/get-next-item")
@app.post("/api/start-machine")
@app.post("/api/skip-machine")
@app.post("/api/set-route-sequence")
@app.post("/api/go-back-to-skipped")
@app.post("/api/get-current-status")
@app.post("/api/switch-route")
@app.post("/api/get-routes")
@app.post("/api/delete-route")
@app.post("/api/update-session")
@app.post("/api/auth")
@app.post("/api/upload-pdf")
```

**Each endpoint:**
- Uses SAME database RPCs (already exist)
- Produces IDENTICAL output to n8n
- Has unit tests proving equivalence
- Proper error handling

---

### Phase 3: Frontend Switch (1 day)

**Add to `.env`:**
```bash
VITE_API_BACKEND=n8n  # or 'python'
```

**Update `src/config/api.ts`:**
```typescript
const API_BACKENDS = {
  n8n: {
    baseUrl: 'https://visionairy.app.n8n.cloud/webhook',
    endpoints: {
      getNextItem: '/next-item-optimized',
      startMachine: '/start-machine',
      // ... current paths
    }
  },
  python: {
    baseUrl: 'https://wvtkuposrlvadyeixlke.supabase.co/functions/v1/stocker-api-python',
    endpoints: {
      getNextItem: '/api/get-next-item',
      startMachine: '/api/start-machine',
      // ... new paths
    }
  }
};

export const API = API_BACKENDS[import.meta.env.VITE_API_BACKEND || 'n8n'];
```

---

### Phase 4: Validation (1 day)

**Automated Tests:**
```python
def test_get_next_item_matches_n8n():
    """Python endpoint returns same data as n8n webhook"""
    n8n_result = requests.post(N8N_ENDPOINT, json=test_input)
    python_result = requests.post(PYTHON_ENDPOINT, json=test_input)
    assert n8n_result.json() == python_result.json()
```

**Manual Testing:**
- Complete full route with Python API
- Test all voice commands
- Verify identical behavior

---

### Phase 5: Production Cutover (5 minutes)

**Switch:**
```bash
VITE_API_BACKEND=python
git commit -m "Switch to Python API"
git push
```

**Rollback (if needed):**
```bash
VITE_API_BACKEND=n8n
git commit -m "Rollback to n8n"
git push
```

**n8n stays running** - don't delete, just switches backend

---

## Why Python is Better Than n8n (Evidence-Based)

### User's Pain Points from CLAUDE.md

1. **Machine Transition Bug (2026-01-23):** 2 hours, 6 wrong fixes
   - Solution: `git diff` to working version
   - n8n debugging tools didn't help

2. **this.getCredentials Bug (2026-02-10):** Wasted hours
   - Error shouldn't exist - n8n Code nodes don't support method
   - No way to know this without hitting production

3. **Progress Bar Bug (2026-01-25):** Stale closure, 3 partial fixes
   - `useCallback([])` captured stale state
   - No debugger to catch this

**Pattern:** Git history solved it every time, not n8n tools

### What n8n Costs

**Debugging:**
- ❌ No debugger (just console.log)
- ❌ No meaningful stack traces
- ❌ Can't set breakpoints
- ❌ Execution shows "0 items" but node ran (confusing)

**Maintenance:**
- ❌ Changes not in git (manual export)
- ❌ Can't code review in GitHub
- ❌ No way to write tests
- ❌ Ancient JavaScript (no ES6+, no `?.`, no `??`)

**Control:**
- ❌ Logic split across 3 systems
- ❌ "Simple" 4-node workflow hides complexity
- ❌ Can't import libraries or share code
- ❌ Version control is awkward

### What Python Gives

**Debugging:**
- ✅ Set breakpoints in VS Code
- ✅ See variables at every step
- ✅ Proper stack traces
- ✅ Unit tests: `pytest test_get_next_item.py`

**Maintenance:**
- ✅ Everything in git
- ✅ Code review in GitHub
- ✅ Type hints catch bugs before deployment
- ✅ Import libraries, share code

**Control:**
- ✅ Single source of truth
- ✅ CI/CD pipeline
- ✅ Rollback is `git revert` (instant)
- ✅ No detective work

---

## XF (Xpansion) Attempt - FAILED

**Tried to use XF for MECE analysis to ensure completeness**

**Error:**
```
ModuleNotFoundError: No module named 'core'
```

XF has broken imports - tool itself has installation issue.

**Alternative:** Manual systematic analysis achieves same goal (MECE validation through structured approach)

---

## Current Status

**Completed:**
- ✅ Fixed immediate production bug (this.getCredentials)
- ✅ Deployed atomic RPC + simplified workflow
- ✅ Validated approach with user
- ✅ Planned complete migration strategy

**Next Action:**
- ⏳ Waiting for user to verify Opus usage status
- ⏳ Then run Ralph Wiggum loop with Opus for complete documentation

**Blocking:**
- User checking if $50 extra Opus usage is enabled
- URL to check: https://platform.claude.com/settings/limits
- Promotion deadline: February 16, 2026

---

## Key Decisions Made

1. **Parallel systems approach** (not incremental migration)
2. **Complete documentation first** (Ralph Wiggum + Opus)
3. **Frontend switch via environment variable** (instant rollback)
4. **Keep n8n as backup** (don't delete)
5. **Use Opus for documentation** (critical analysis, user has budget)

---

## Files Changed This Session

1. `supabase/migrations/20260210_atomic_get_next_item_and_increment.sql` - NEW
2. `supabase/functions/get-next-item-data/index.ts` - MODIFIED
3. n8n workflow iykbFj7f9222PF7r - MODIFIED (via Synta MCP)

**Git Commit:** 38904f5
**Pushed:** main branch
**Deployed:** Cloudflare Pages (auto-deploy)

---

## Sources

- [Claude Opus 4.6 $50 Credit Promotion](https://ai-minor.com/blog/en/2026-02-06-1770372865838-claude_opus_4_6_extra_usage_promo/)
- [How to Check Usage Limits](https://medium.com/@Gunratna/what-does-more-usage-in-claude-4-5-limits-actually-mean-explained-for-opus-sonnet-haiku-720535b70d55)
- [XDA: Claude $50 Free Credits](https://www.xda-developers.com/psa-claude-users-can-claim-50-in-free-credits-to-try-opus-46/)
