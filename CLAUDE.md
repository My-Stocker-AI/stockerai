# Stocker AI – Claude Code Operational Directives
**Location:** /home/visionairy/StockerAI/CLAUDE.md
**Purpose:** Define behavioral contract for Claude Code in Stocker AI workspace
**Last Optimized:** 2026-01-19

<!-- ARCHIVED CONTENT: 20260119_bug_fixes -->
<!-- See: /home/visionairy/.claude-archives/stockerai_CLAUDE_archive_20260119_bug_fixes.md -->

---

# 0. SOURCE OF TRUTH

**MEMORY.md is the primary SOT.** Always read it first for current state, workflow IDs, and pending tasks.

---

# 0.1 XPANSION OS - MANDATORY FOR BOUNDARY-CROSSING CHANGES

**Status:** ACTIVE (See `/home/visionairy/CLAUDE.md` for full documentation)
**Purpose:** Code-enforced verification for boundary-crossing changes

## When to Use Xpansion OS (Mandatory)

| Operation Type | Use Xpansion | Example |
|----------------|--------------|---------|
| **Workflow Activation** | ✅ YES | Activating n8n workflow, changing webhook paths |
| **Database Schema Changes** | ✅ YES | ALTER TABLE, CASCADE rules, RLS policies |
| **API Contract Changes** | ✅ YES | Updating WEBHOOK_MAP, endpoint changes |
| **Multi-boundary Fixes** | ✅ YES | Fix that spans frontend + backend + database |

## How to Use: Bash Approach

**MANDATORY: Create Python script, run via Bash**

```python
#!/usr/bin/env python3
import sys
sys.path.insert(0, '/home/visionairy/Xpansion')
from tools.adapters import SystemAdapter

problem = """[Describe StockerAI issue - workflows, database, API]
ANALYZE FOR: What can break? What data flows?"""

adapter = SystemAdapter()
result = adapter.discover(problem_text=problem)
```

Run: `/home/visionairy/Xpansion/.venv/bin/python analyze_issue.py`

**Full Protocol:** `/home/visionairy/CLAUDE.md` System Impact Audit section

---

# 0.2 MANDATORY SYSTEM IMPACT AUDIT PROTOCOL

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

**Full Protocol:** See `/home/visionairy/CLAUDE.md` or Section 0.2 above

---

# 0.3 Trusted vs Untrusted Sources

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
