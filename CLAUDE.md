# Stocker AI – Claude Code Operational Directives
**Location:** /home/visionairy/StockerAI/CLAUDE.md
**Purpose:** Define behavioral contract for Claude Code when operating in the Stocker AI workspace.
**Last Optimized:** 2026-01-15

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

## How to Use: Bash Approach (MCP Broken)

**KNOWN ISSUE:** MCP tools don't expose in conversation ([Claude Code bug](https://github.com/anthropics/claude-code/issues/2682))

**MANDATORY: Create Python script, run via Bash**

```python
#!/usr/bin/env python3
import sys
sys.path.insert(0, '/home/visionairy/Xpansion')

from tools.adapters import SystemAdapter  # or IntentAdapter

problem = """
[Describe the StockerAI issue - workflows, database, API, etc.]

ANALYZE FOR:
- What can break?
- What data flows?
"""

adapter = SystemAdapter()
result = adapter.discover(problem_text=problem)

# Results auto-print and auto-log to Vib8 Supabase
```

**Run:**
```bash
/home/visionairy/Xpansion/.venv/bin/python analyze_issue.py
```

**Full Documentation:** See `/home/visionairy/CLAUDE.md` Session 39 for complete protocol

---

# 0.2 MANDATORY SYSTEM IMPACT AUDIT PROTOCOL

**Status:** ACTIVE (2026-01-18)
**Purpose:** Prevent breaking changes from affecting production systems
**Enforcement:** ZERO TOLERANCE - Session terminates on violation

## THE RULE

**BEFORE making ANY change to:**
- Code (frontend, backend, Edge Functions)
- Database schema (tables, columns, constraints, RLS, triggers)
- n8n workflows (nodes, connections, webhooks)
- API contracts (endpoints, request/response formats)
- Shared types (TypeScript interfaces used across boundaries)
- Environment variables
- External integrations (Stripe, Deepgram, OpenAI, etc.)

**YOU MUST perform a System Impact Audit to discover:**
1. What will break upstream (dependencies, callers, data sources)
2. What will break downstream (consumers, integrations, side effects)
3. What additional changes are required to facilitate the intended change
4. What tests are needed to verify no negative impact

**NO EXCEPTIONS. Zero tolerance.**

---

## SCOPE: What Requires an Audit

| Change Type | Requires Audit | Example |
|-------------|----------------|---------|
| **Edge Function** | ✅ YES | Adding parameter to invite-team-member |
| **Database Schema** | ✅ YES | Adding column, changing type, RLS policy |
| **n8n Workflow** | ✅ YES | Adding node, changing webhook path, modifying code |
| **API Contract** | ✅ YES | Changing WEBHOOK_MAP, adding field to response |
| **Frontend State** | ✅ YES | Changing Redux/Context structure, localStorage schema |
| **Shared Types** | ✅ YES | Modifying TypeScript interface used by >1 file |
| **Environment Variable** | ✅ YES | Adding, removing, or renaming env vars |

**IF you're unsure whether a change requires audit:** It does. Run the audit.

---

## AUDIT EXECUTION PROTOCOL

### Step 1: Ask the 6 Questions

For EVERY change, answer ALL 6 questions:

#### 1. DATA FLOW
- **Question:** What data enters this component? What data exits?
- **Discover:**
  - Input schema (fields, types, required vs optional)
  - Output schema (what consumers expect)
  - Format changes (JSON → array, snake_case → camelCase, etc.)

#### 2. CALLERS (Upstream)
- **Question:** Who calls this? What do they expect?
- **Discover:**
  - Frontend components making API calls
  - Other Edge Functions invoking this one
  - n8n workflows triggering this webhook
  - Cron jobs or scheduled tasks
  - External services (Stripe webhooks, etc.)

#### 3. CALLEES (Downstream)
- **Question:** What does this component call? What does it need from them?
- **Discover:**
  - Database queries (what tables, what fields)
  - External APIs (Stripe, OpenAI, Deepgram)
  - Other Edge Functions
  - n8n workflows
  - File storage (Supabase Storage)

#### 4. SIDE EFFECTS
- **Question:** What non-return-value actions does this take?
- **Discover:**
  - Database writes (INSERT, UPDATE, DELETE)
  - Email sends (Supabase Auth invites)
  - External API calls with side effects (Stripe charges)
  - Cache invalidations
  - Event triggers

#### 5. STATE DEPENDENCIES
- **Question:** What shared state does this rely on or modify?
- **Discover:**
  - Database tables (race conditions if concurrent access)
  - Redis/cache (stale data issues)
  - Frontend global state (Redux, Context, localStorage)
  - Session state (Supabase Auth)
  - File locks or mutexes

#### 6. ERROR PROPAGATION
- **Question:** When this fails, what happens?
- **Discover:**
  - Does caller handle errors gracefully?
  - Are partial states possible? (user created but email fails)
  - Can this leave inconsistent data?
  - Is rollback needed?

---

### Step 2: Document Findings

Create audit document: `/docs/audits/AUDIT_[DATE]_[CHANGE_NAME].md`

**Template:**
```markdown
# System Impact Audit: [Change Description]

**Date:** YYYY-MM-DD
**Author:** [Your identifier]
**Scope:** [Edge Function | Database | Workflow | API | etc.]

---

## Proposed Change

[Describe what you want to change and why]

---

## Boundary Analysis

### UPSTREAM (Callers)

**Component A:**
- Current expectation: [what it expects now]
- Impact: ✅ Unaffected | ⚠️ Needs update | ❌ Will break
- Required change: [if impact is not green]

**Component B:**
- [repeat for each caller]

### DOWNSTREAM (Called by this)

**Service A:**
- Current contract: [what this provides now]
- Impact: ✅ Unaffected | ⚠️ Needs update | ❌ Will break
- Required change: [if impact is not green]

### SIDE EFFECTS

**Database:**
- Tables affected: [list]
- Write operations: [INSERT/UPDATE/DELETE]
- Triggers affected: [if any]

**Email:**
- Templates affected: [if any]
- Recipient logic: [if changed]

**Billing:**
- Stripe operations: [if any]
- Proration handling: [if relevant]

### STATE DEPENDENCIES

**Concurrency risks:**
- [race conditions identified]
- Mitigation: [locks, transactions, optimistic locking]

**Cache invalidation:**
- [what caches need clearing]

### DATA CONTRACTS

**Input Schema (Before):**
```json
{
  "field1": "type",
  "field2": "type"
}
```

**Input Schema (After):**
```json
{
  "field1": "type",
  "field2": "type",  // ← unchanged
  "field3": "type"   // ← NEW (optional? required?)
}
```

**Output Schema (Before):**
[same format]

**Output Schema (After):**
[same format]

**Breaking changes:**
- [list any backwards-incompatible changes]

---

## Required Additional Changes

1. **File A:** [what needs to change]
   - Location: [file path]
   - Change: [specific modification]
   - Reason: [why this is needed]

2. **File B:** [repeat]

---

## Testing Plan

1. **Unit Tests:**
   - Test A: [what it validates]
   - Test B: [what it validates]

2. **Integration Tests:**
   - Test C: [end-to-end scenario]

3. **Manual Testing:**
   - Step 1: [user action]
   - Expected: [what should happen]

---

## Rollback Plan

**If this change breaks production:**

1. Revert commit: `git revert [hash]`
2. Redeploy: [specific deployment steps]
3. Database rollback: [if schema changed]
4. Cache clear: [if needed]

**Data Recovery:**
- [how to restore data if corruption occurs]

---

## Risk Assessment

**Severity:** LOW | MEDIUM | HIGH | CRITICAL
**Likelihood:** LOW | MEDIUM | HIGH

**Justification:**
[Why you rated it this way]

**Mitigation:**
[Steps taken to reduce risk]

---

## Approval

- [ ] All 6 audit questions answered
- [ ] All callers identified and impact assessed
- [ ] All callees identified and dependencies verified
- [ ] Side effects documented
- [ ] State dependencies analyzed
- [ ] Error propagation mapped
- [ ] Testing plan created
- [ ] Rollback plan documented

**Audit Complete:** YYYY-MM-DD
**Proceed with implementation:** YES | NO
```

---

### Step 3: Get Approval

Before making ANY code changes:

1. Save audit document to `/docs/audits/`
2. Present to user:
   - "System Impact Audit complete for [change]"
   - "Identified [N] upstream callers, [M] downstream dependencies"
   - "Required additional changes: [list]"
   - "Risk assessment: [severity/likelihood]"
   - "Proceed? YES/NO"
3. Wait for explicit user approval

---

### Step 4: Implement with Traceability

When implementing the change:

**Git commit message format:**
```
[Component] Brief change description

System Impact Audit: /docs/audits/AUDIT_YYYY-MM-DD_[name].md

Changes:
- Primary change: [what you intended]
- Dependency fix: [what else you had to change]
- Test addition: [what tests you added]

Affected boundaries:
- Upstream: [list]
- Downstream: [list]
- Side effects: [list]

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

---

## XF-ASSISTED AUDIT (Recommended for Complex Changes)

For changes affecting 3+ boundaries, use Xpansion Framework to automate discovery:

```python
#!/usr/bin/env python3
"""
System Impact Audit: [Change Description]
"""
import sys
sys.path.insert(0, '/home/visionairy/Xpansion')

from tools.adapters import SystemAdapter

problem = """
StockerAI change: [Describe what you want to change]

Current system:
- [Describe current implementation]

Proposed change:
- [Describe new implementation]

ANALYZE FOR IMPACT:
- What components call this?
- What does this call?
- What data contracts exist?
- What can break?
- What side effects exist?
"""

adapter = SystemAdapter()
result = adapter.discover(problem_text=problem)

# Print results
print("=" * 80)
print("SYSTEM IMPACT AUDIT - XF DISCOVERY")
print("=" * 80)
print()
for boundary_name, boundary in result.boundaries.items():
    print(f"### {boundary_name}")
    print(f"Question: {boundary.question}")
    print(f"Elements: {len(boundary.elements)}")
    for elem in boundary.elements:
        print(f"  - {elem.name}: {elem.description}")
    print()

print(f"Iterations: {result.metadata.total_iterations}")
print(f"MECE Validation: {result.validation.passed}")
print(f"Discovery ID: {result.metadata.discovery_id}")
```

Run:
```bash
/home/visionairy/Xpansion/.venv/bin/python /tmp/audit_[change_name].py
```

XF will discover:
- DATA boundary (input/output schemas)
- NODES boundary (callers and callees)
- FLOW boundary (execution paths)
- ERRORS boundary (failure modes)

Use XF output to populate audit document.

---

## VIOLATION CONSEQUENCES

**If you make a change WITHOUT completing the audit:**

1. **Session Terminates Immediately**
   - No further work allowed
   - User must restart session

2. **Rollback Required**
   - Revert all changes
   - Restore previous state
   - Document what was attempted

3. **Incident Report Required**
   - What change was attempted
   - Why audit was skipped
   - What broke (if deployed)
   - How it was fixed

4. **Post-Mortem**
   - Add to "Never Do This Again" section
   - Update audit protocol if gap found
   - Share learning in Xpansion database

---

## EXAMPLES

### ✅ CORRECT: Adding Phone Number Field to Profiles

**Audit Questions:**

1. **DATA FLOW:**
   - Input: Add optional `phone_number: string | null` to profiles insert/update
   - Output: Include in profile queries
   - Format: E.164 format (e.g., "+12025551234")

2. **CALLERS (Upstream):**
   - `/src/pages/dashboard/Team.tsx` - Add phone input to invite form
   - `/supabase/functions/invite-team-member/index.ts` - Accept phone_number param
   - Edge Function: No existing callers affected (new optional field)

3. **CALLEES (Downstream):**
   - Database: Add `phone_number TEXT NULL` column to profiles table
   - No external APIs affected

4. **SIDE EFFECTS:**
   - Database migration required
   - No email template changes
   - No billing impact

5. **STATE DEPENDENCIES:**
   - No race conditions (column nullable)
   - No cache invalidation needed

6. **ERROR PROPAGATION:**
   - Invalid format: Frontend validation + database constraint
   - Null handling: Existing null checks sufficient

**Required Additional Changes:**
1. Database migration: `ALTER TABLE profiles ADD COLUMN phone_number TEXT NULL;`
2. Frontend form: Add phone input with E.164 validation
3. Edge Function: Add phone_number to insert/upsert
4. TypeScript type: Update Profile interface

**Risk:** LOW - Optional field, backwards compatible

**Approved:** Proceed

---

### ❌ WRONG: Changing driver_count from integer to text

**What was attempted:**
"Let's change accounts.driver_count to TEXT so we can store '5 drivers' instead of just 5"

**Why this violates the protocol:**

**Missing Audit Questions:**

1. **CALLERS:** Who reads driver_count?
   - ❌ MISSED: Billing.tsx does math: `count * getPricePerDriver(count)`
   - ❌ MISSED: update-subscription-quantity counts with `.filter().length` (returns number)
   - ❌ MISSED: Stripe API expects `quantity: number`

2. **DOWNSTREAM:** What breaks?
   - ❌ MISSED: Stripe subscription update will fail (expects integer)
   - ❌ MISSED: Price calculation will fail (can't multiply string)
   - ❌ MISSED: Comparison operators (`count <= 5`) will break

3. **SIDE EFFECTS:**
   - ❌ MISSED: All existing subscriptions have integer quantities
   - ❌ MISSED: Data migration needed for existing accounts
   - ❌ MISSED: Stripe webhooks send integers, will fail validation

**Impact if deployed:**
- All billing operations break
- Existing customers can't add/remove drivers
- Stripe webhook processing fails
- Data inconsistency between Stripe and database

**Correct approach:**
1. Run audit FIRST
2. Discover all callers expect integer
3. Realize display formatting should be frontend-only
4. Keep database as integer, format in UI: `{count} driver${count !== 1 ? 's' : ''}`

---

## GIT INTEGRATION

**Before committing any code:**

1. Audit document must exist in `/docs/audits/`
2. Commit message must reference audit
3. All required additional changes must be included in same commit/PR

**Pre-commit hook** (recommended):
```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check if audit reference exists in commit message
if ! git log -1 --pretty=%B | grep -q "System Impact Audit:"; then
  echo "ERROR: Commit message must reference System Impact Audit"
  echo "Format: System Impact Audit: /docs/audits/AUDIT_YYYY-MM-DD_[name].md"
  exit 1
fi
```

---

## WHEN IN DOUBT

**If you're unsure whether a change needs an audit:**

- It does. Run the audit.
- Better to over-audit than under-audit.
- 10 minutes of prevention > 10 hours of production debugging.

**If audit reveals too many dependencies:**

- Good. You discovered complexity before breaking things.
- Propose simpler approach.
- Or accept that comprehensive change is needed.

**If user pushes back on audit requirement:**

- Explain what could break.
- Show examples from history.
- Offer to run XF-assisted audit to speed it up.

---

# 0.3 Trusted vs Untrusted Sources

**BBRD VIOLATION:** Trusting static documentation when live data is authoritative.

### ALWAYS Query Live Data For:

| Source | How to Query |
|--------|--------------|
| **Database schema** | Query `information_schema` via Supabase SQL |
| **n8n workflow structure** | Use `n8n_get_workflow` MCP tool |
| **n8n executions** | Use `n8n_executions` MCP tool |
| **Frontend state** | Read actual source files |
| **API responses** | Test actual endpoints |

### Can Trust (With Verification):

- **MEMORY.md** - Manually maintained, verify each session start
- **PRD** - Stable requirements, reverify on major changes
- **Code comments** - Usually accurate, verify when behavior contradicts

### NEVER Trust:

- Static schema files (query live database instead)
- README "architecture" sections (read actual code)
- Old commit messages (check current HEAD)
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
| Hosting | Cloudflare Pages (auto-deploy from main branch) |
| Domain | my-stocker-ai.com |

## 1.3 Key Requirements

- **Latency:** <2 seconds end-to-end (speech → response)
- **Accuracy:** 99% on common commands
- **Reliability:** 100% state persistence, zero data loss
- **Session:** 6+ hour continuous operation

## 1.4 Current Build Status

**Stable State:** Commit `90036c3` (Jan 13 evening)
**Status:** ✅ All Session 37-39 fixes included
**Known Issues:** Third machine bug (route completes early - under investigation)

See `CURRENT_BUILD_STATUS.md` for full details.

---

# 2. n8n OPERATIONAL RULES

## 2.1 Code Node Syntax – Allowed

```javascript
data.field || 'default'
data.field ? data.field.sub : null
for (var i = 0; i < items.length; i++)
```

## 2.2 Code Node Syntax – Forbidden

```javascript
data?.field           // No optional chaining
data ?? 'default'     // No nullish coalescing
require()             // No imports
fetch()               // Use HTTP Request node
console.log()         // Use return instead
```

## 2.3 Expression Syntax – Allowed

```javascript
{{ $json.field }}
{{ $json.field || 'default' }}
{{ $('Node Name').item.json.field }}
```

## 2.4 Expression Syntax – Forbidden

```javascript
{{ $json?.field }}              // No optional chaining
{{ $json.field ?? 'default' }}  // No nullish coalescing
```

## 2.5 n8n MCP Tools – MANDATORY MODES

| Tool | REQUIRED Mode | Why |
|------|---------------|-----|
| `n8n_get_workflow` | `mode: "structure"` | Full mode returns 50KB+ |
| `n8n_executions` | `mode: "preview"` or `mode: "error"` | Default returns all node data |

## 2.6 n8n Workflow Safety Rules

**Status:** ACTIVE (Known bugs in n8n MCP as of 2026-01-15)
**Purpose:** Prevent production corruption from n8n MCP issues

### Known Issues

| # | Issue | Impact |
|---|-------|--------|
| 1 | Deleting workflow before testing new one | Production downtime, lost reference |
| 2 | Created workflows with webhooks don't auto-activate | Webhook unregistered, tool calls fail |
| 3 | Partial update corrupts JS Code node content | Syntax errors, execution failures |
| 4 | IF/Switch/Merge node connections corrupt on creation | Wrong branches, broken flow logic |

### RULE 1: Never Delete Before Testing (CRITICAL)

**CORRECT workflow:**
```
1. Create new workflow with version suffix (e.g., "workflow_name_v2")
2. Place in StockerAI folder immediately
3. Test thoroughly (webhook, execution, output)
4. Activate new workflow
5. ARCHIVE (not delete) old workflow
6. Rename new workflow if needed
```

**Exception:** NONE.

### RULE 2: Webhook Activation Verification (CRITICAL)

After creating ANY workflow with webhook trigger:

1. Get workflow status: `n8n_get_workflow({id: "workflow_id", mode: "minimal"})`
2. Test webhook: `curl -X POST "https://visionairy.app.n8n.cloud/webhook/[path]"`
3. If webhook doesn't respond → **Notify user to manually re-register webhook**

### RULE 3: JS Code Node Changes – Copy/Paste Method (CRITICAL)

**If change affects ONLY ONE JS Code node:**
- Create a .js file for user to copy/paste into n8n UI
- NEVER use partial update (known to corrupt syntax)

**If change affects MULTIPLE nodes:**
- Ask user preference: manual copy/paste, delete+create, or step-by-step instructions

### RULE 4: IF/Switch/Merge Node Connection Verification (CRITICAL)

When creating workflow with branching nodes:
1. After creation, verify connections: `n8n_get_workflow({id: "workflow_id", mode: "structure"})`
2. **Always notify user to verify connections manually in n8n UI**

## 2.7 n8n Workflow Organization

**Folder:** All Stocker AI workflows MUST be in `StockerAI` folder (under Personal project)

**Naming Convention:**
- Voice tools: `Stocker Tool: <command_name>`
- Backend services: `Stocker - <service_name>`
- Auth/infrastructure: `Stocker <system_name>`

**Lifecycle:** Create with version suffix → Test → Archive old → Rename new

### Current Active Workflows (2026-01-15)

| Workflow Name | ID | Webhook Path | Status |
|---------------|-----|--------------|--------|
| get_next_item | gwmLuqCN37fhQ3Pr | /next-item | ⚠️ ARCHIVED |
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

**DEPRECATED:**
- Invite Team Member (TxrJyFmG4yNazEEF) - Replaced by Edge Function (see `N8N_WORKFLOW_DEPRECATION_NOTICE.md`)

---

# 3. COMMUNICATION RULES

**The user is NOT a traditional developer.**

When giving instructions:
- **Never assume** technical knowledge
- **Always explain** where to click, what to look for
- **Use step-by-step** numbered instructions
- **Include visual descriptions** (e.g., "the gear icon in top-right")
- **Explain jargon** on first use (e.g., "Console - hidden panel showing errors")
- **Provide context** for why each step matters

**Example of GOOD instruction:**
> 1. Open Chrome on your phone/laptop
> 2. Go to my-stocker-ai.com
> 3. Press F12 (or right-click → "Inspect")
> 4. A panel opens on side/bottom
> 5. Click "Console" tab at top
> 6. Look for red text - that's an error
> 7. Tell me what the red text says

---

# 4. SESSION PROTOCOL

## 4.1 Session Start

Before ANY action:
1. Read `/home/visionairy/StockerAI/MEMORY.md`
2. Check current status and pending tasks
3. Review recent changes

## 4.2 Session End

Update `/home/visionairy/StockerAI/MEMORY.md` with:
1. What was done
2. What now works
3. What is broken
4. What remains pending
5. Decisions made

## 4.3 Git Workflow - AUTO-PUSH APPROVED CHANGES

**MANDATORY:** After completing ANY code changes, immediately commit and push to GitHub.

### When to Commit & Push
- After completing a feature or fix
- After making any file modifications
- After user approves or tests changes
- **IMMEDIATELY** - don't wait for user to ask

### Exception
ONLY skip git push if:
- User explicitly says "don't push yet"
- Changes are experimental/debugging only
- User asks to review before pushing

**User should NEVER have to ask "did you push this?"** - the answer should always be YES.

---

# 5. TROUBLESHOOTING PROTOCOL

## 5.1 Boundary & Branch Discovery (MANDATORY)

**Before attempting ANY fix:** Apply systematic BBRD approach. NO exceptions.

### The Stocker Data Flow Boundaries

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────┐    ┌─────────┐
│ PDF Upload  │ →  │   Database   │ →  │ n8n Workflows│ →  │   AI    │ →  │   TTS   │
│ (Parser)    │    │  (Supabase)  │    │ (Tool calls) │    │ (Groq)  │    │(OpenAI) │
└─────────────┘    └──────────────┘    └─────────────┘    └─────────┘    └─────────┘
```

### MANDATORY Debugging Protocol

1. **Identify Which Boundary Failed** - Trace data flow from source to symptom
2. **Verify the Contract at That Boundary** - What did upstream OUTPUT vs downstream EXPECT?
3. **Check for Upstream Contamination** - Broken contract at N may be caused by N-1
4. **Validate Fix Propagation** - Trace FORWARD after fix to confirm no new breaks

**Example: "AI only said '5 Snickers'"**

**WRONG:** "Let me check the AI prompt and add more instructions"

**RIGHT:**
1. Boundary trace: User heard incomplete → TTS spoke it → AI generated it → Workflow returned it
2. Check Workflow output: Does it have `spoken` field?
3. Check AI behavior: Did AI use `spoken` or generate own?
4. Find first break: If workflow missing `spoken`, fix there
5. Validate downstream: Confirm TTS receives complete text

## 5.2 n8n Root Cause Boundaries

| # | Boundary | What It Covers |
|---|----------|----------------|
| 1 | WORKFLOW | Structure, flow logic, trigger configuration |
| 2 | NODE | Individual node config, parameters, credentials |
| 3 | DATA | Data flowing between nodes, schema, types |
| 4 | CODE | Code nodes, expressions, function logic |
| 5 | CONNECTION | External service connections, API credentials |
| 6 | EXECUTION | Timing, concurrency, rate limits, timeouts |
| 7 | ENVIRONMENT | n8n instance, env vars, version |
| 8 | DATABASE | Supabase queries, RLS policies, schema |
| 9 | API | Backend endpoints, request/response handling |
| 10 | FRONTEND | UI/client-side, state, API calls |

## 5.3 Symptom → Boundary Quick Reference

```
SYMPTOM                                    → START WITH
─────────────────────────────────────────────────────────
Workflow never triggers                    → WORKFLOW, EXECUTION
Workflow stops at specific node            → NODE, DATA
"undefined" or "null" errors               → DATA, CODE
Authentication/permission errors           → CONNECTION, DATABASE
Timeout errors                             → EXECUTION, CONNECTION
Wrong results (no error)                   → DATA, CODE, WORKFLOW
Intermittent failures                      → EXECUTION, CONNECTION, ENVIRONMENT
Works manually, fails scheduled            → EXECUTION, ENVIRONMENT
UI doesn't update                          → FRONTEND → trace to API → n8n
Database queries fail                      → DATABASE, CONNECTION
```

## 5.4 Terminal Criteria

A root cause is TERMINAL when ALL are true:

| Criterion | Test |
|-----------|------|
| SPECIFIC | Points to exact node, line, field, or configuration |
| REPRODUCIBLE | Can trigger symptom by manipulating this cause |
| SINGULAR | Fixing this ONE thing resolves symptom |
| VERIFIABLE | Can confirm fix with specific test |

## 5.5 Fix Specification Template

Before implementing any fix:

```
FIX SPECIFICATION
=================
Root Cause:     [Terminal statement from discovery]
Boundary:       [Which of the 10 boundaries]
Evidence:       [How you confirmed this is the cause]
Fix:            [Exact change to make]
Files/Nodes:    [Specific locations]
Test:           [How to verify fix works]
Rollback:       [How to undo if fix breaks something else]
```

## 5.6 Systematic Testing Protocol

**MANDATORY:** After ANY significant change, run systematic tests.

### When to Test

| Trigger | What to Test |
|---------|-------------|
| New workflow created | Execution logs, error handling, cascade effects |
| Database schema change | Foreign key cascades, RLS policies, orphaned data |
| Frontend state change | UI transitions, error recovery, concurrency |
| AI prompt modification | Tool calling, response variation, context memory |
| API endpoint change | Request/response format, timeout handling, errors |

### Test Files

All tests in `/tests/` directory:
- `database_cascade_tests.sql` - FK cascades, orphan checks
- `workflow_behavior_tests.md` - Timeouts, concurrency, errors
- `ai_voice_recognition_tests.md` - One-word responses, phonetics

### Testing Workflow (BBRD-Aligned)

```
1. IDENTIFY BOUNDARIES AFFECTED
2. QUERY LIVE STATE (PRE-TEST)
3. EXECUTE CHANGE
4. QUERY LIVE STATE (POST-TEST)
5. CROSS-BOUNDARY VERIFICATION
6. DOCUMENT RESULTS
```

---

# 6. MCP SERVERS

## n8n-mcp Server (CRITICAL FOR TROUBLESHOOTING)

**Location:** `.mcp.json` in project root

**What it does:** Direct access to n8n workflow executions for debugging

**When to use:**
- **FIRST** when troubleshooting workflow/backend errors
- Check n8n executions BEFORE deploying console logging
- Investigate webhook timeouts, 500 errors, tool failures

**Key Tools:**
- `n8n_executions({action: 'list'})` - List recent workflow runs
- `n8n_executions({action: 'get', executionId})` - Get detailed logs
- `n8n_get_workflow({workflowId})` - Get workflow configuration

**Setup:** Already configured. Restart Claude Code session to load.

---

# 7. AUTOMATED MEMORY EXTRACTION

**MANDATORY TRIGGER:** When context remaining ≤ 10,000 tokens (5% of 200K)

### Execution Sequence

1. **STOP ALL OTHER WORK**
2. **ANNOUNCE TRIGGER** - "Memory preservation protocol triggered at X tokens remaining"
3. **EXTRACT FROM CURRENT CONVERSATION:**
   - Problems & solutions
   - Positive discoveries (what worked well)
   - System knowledge (workflow IDs, data flows)
   - Meta-learning (what approaches were effective)
4. **DETERMINE TARGET DOCUMENT** - Update this CLAUDE.md or MEMORY.md
5. **UPDATE DOCUMENTATION** - Add fixes, patterns, IDs with timestamps
6. **COMMIT TO GIT** - With structured commit message
7. **REPORT TO USER** - Summary of what was preserved

### What to Preserve

- Critical bugs and root causes
- Fixes applied and results
- "Never do this again" lessons
- Efficient approaches that saved time
- Workflow IDs created/modified/deleted
- Edge cases and handling
- What questions led to breakthroughs

### What NOT to Preserve

- Routine operations without issues
- Temporary debugging output
- User's personal information
- Conversational pleasantries
- Things already documented

---

# 8. DEPLOYMENT & INFRASTRUCTURE

## 8.1 Deployment Process

**Automated (Frontend):**
- GitHub push to `main` branch → Auto-deploys to Cloudflare Pages
- URL: https://stocker-ai.pages.dev
- Typically completes within 2-3 minutes

**Manual Steps Required:**
1. **SQL Migrations**: Must be run manually in Supabase SQL Editor
   - Location: `supabase/migrations/*.sql`
   - Process: Copy SQL → Paste in Supabase Dashboard → Execute

2. **n8n Workflow Updates**: Must be updated manually in n8n UI
   - Location: `workflows/*.js` (code to paste into Code nodes)
   - Process: Copy JS → Open workflow → Find Code node → Paste → Save

**Testing Deployment:**
- Check Cloudflare Pages dashboard for build status
- Verify: https://stocker-ai.pages.dev loads correctly
- Test affected functionality in production

---

# 9. CRITICAL BUGS FIXED

## 9.1 Session 42 Fixes (2026-01-17)

**Commit:** c29f9f8
**Status:** ✅ Deployed and awaiting user testing

### Bug 1: Progress Not Saving When App Closes

**Symptom:** User completes items, app crashes/closes, progress lost when reopened

**Root Cause:** `saveSessionState()` called asynchronously but doesn't complete before app terminates

**Solution (Two-Layer Fix):**

1. **beforeunload Listener** (`StockerApp.tsx:796-815`)
   - Forces save to complete before browser closes
   - Catches: crashes, tab close, browser close, navigation

2. **Retry Logic** (`useSessionPersistence.ts:saveLocal()` lines 55-83)
   - 3 retry attempts with exponential backoff (100ms, 200ms, 300ms)
   - Alerts user if all retries fail

**Files Modified:**
- `src/pages/StockerApp.tsx`
- `src/hooks/useSessionPersistence.ts`

**Test:**
1. Complete several items
2. Close browser tab immediately
3. Reopen app
4. ✓ Progress should be preserved

---

### Bug 2: Duplicate "Next" Command → Route Completes Prematurely

**Symptom:** User says "next", thinks app didn't hear, says "next" again (~1-2 seconds apart). Route ends unexpectedly.

**Root Cause:** Race condition - both commands read same `current_item_index` from DB, both increment, second thinks route is complete.

**Race Condition Timeline:**
```
Time    Request 1              Request 2
0ms     Read index=57
1000ms  Increment to 58        Read index=57 (stale!)
1100ms  Find item 58           Increment to 58
1200ms  Update DB to 58        Find no item (thinks route done)
1300ms                          Return "route complete" ❌
```

**Solution (Two-Layer Fix):**

1. **Frontend Debouncing** (`useStockerAI.ts:229-231, 609-621`)
   - Ignores duplicate commands within 1.5 seconds
   - Prevents double-submission at source

2. **Database Optimistic Locking** (`supabase/migrations/20260117_concurrent_session_update.sql`)
   - SQL function `update_session_with_lock()`
   - Checks `current_item_index` matches expected value before updating
   - Rejects update if index changed (concurrent modification detected)

**Files Modified:**
- `src/hooks/useStockerAI.ts`
- `supabase/migrations/20260117_concurrent_session_update.sql` (manual SQL)
- `workflows/determine_next_state_CONCURRENT_FIX.js` (manual n8n update)

**Test:**
1. Say "next"
2. Immediately say "next" again (within 1 second)
3. ✓ Second command ignored with console message
4. ✓ Route does NOT complete prematurely

---

### Bug 3: Voice Not Restarting After Stop Button

**Symptom:** User clicks Stop → Voice stops. User clicks Continue OR says "Hey Stocker" → Nothing happens. Voice dead until page refresh.

**Root Cause:** Incomplete state cleanup in `stopListening()` and incomplete reset in `startListening()`
- `reconnectTimeoutRef` not cleared → pending reconnect interferes
- `reconnectAttemptsRef` not reset → thinks it's in retry backoff
- `isConnectedRef` not properly reset

**Solution:**

**Enhanced stopListening() cleanup:** (`useVoice.ts:793-845`)
- Clear `reconnectTimeoutRef`
- Reset `reconnectAttemptsRef` to 0
- Reset `isConnectedRef` and `setIsDeepgramConnected(false)`
- Detailed console logging for debugging

**Robust startListening() reset:** (`useVoice.ts:730-741`)
- Explicitly reset ALL state flags at start
- Clear any pending reconnect timeouts
- Reset connection attempts
- Set `setIsDeepgramConnected(true)` on success

**Files Modified:**
- `src/hooks/useVoice.ts`

**Test:**
1. Start voice session (should see "Wake lock acquired")
2. Click Stop button (should see cleanup logs)
3. Click Continue OR say "Hey Stocker continue"
4. ✓ Voice should restart with detailed connection logs

---

## 9.2 Console Logging for Production Debugging

All bug fixes include detailed console logging:

**Bug 1 logs:**
- `[Stocker] Progress saved before close`
- `[Stocker] Failed to save before close: [error]`
- `[Session] Local save successful (attempt N)`
- `[Session] Local save failed (attempt N/3): [error]`

**Bug 2 logs:**
- `[Tools] Ignoring duplicate [command] command (Xms since last)`

**Bug 3 logs:**
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

## 9.3 Race Condition Pattern (Reusable)

**Pattern Identified:** Concurrent updates to shared database state

**Generic Solution:**
1. **Frontend debouncing** - Prevent rapid duplicate requests
2. **Optimistic locking** - Database verifies expected state before update

**SQL Pattern:**
```sql
CREATE FUNCTION update_with_lock(
  expected_value TYPE,
  new_value TYPE
) RETURNS TABLE(success BOOLEAN, message TEXT)
AS $$
DECLARE current_value TYPE;
BEGIN
  SELECT value INTO current_value FROM table WHERE id = target;

  IF current_value != expected_value THEN
    RETURN QUERY SELECT FALSE, 'Concurrent update detected';
    RETURN;
  END IF;

  UPDATE table SET value = new_value
  WHERE id = target AND value = expected_value;

  RETURN QUERY SELECT TRUE, 'Success';
END;
$$;
```

**Frontend Pattern:**
```typescript
const lastCommandRef = useRef<{ name: string; timestamp: number } | null>(null);
const DEBOUNCE_MS = 1500;

// In command handler:
const now = Date.now();
if (lastCommandRef.current?.name === commandName &&
    now - lastCommandRef.current.timestamp < DEBOUNCE_MS) {
  console.warn(`Ignoring duplicate ${commandName}`);
  return;
}
lastCommandRef.current = { name: commandName, timestamp: now };
```

**When to Use:**
- Any command that can be triggered multiple times rapidly
- Database updates based on previous state reads
- Multi-step operations where state can change between steps

---

# 10. PENDING SECURITY & PERFORMANCE ISSUES

**Status:** Discovered in Session 42 Phase 1 verification, deferred for future implementation

## 10.1 CRITICAL: No Row Level Security (RLS)

**Severity:** CRITICAL (Priority 10)
**Impact:** Any authenticated user can read/modify other users' data

**Affected Tables:**
- `routes`
- `machines`
- `items`
- `sessions`

**Required Fix:** Implement RLS policies for user isolation
**Reference:** See `PHASE_1_VERIFICATION_FINDINGS.md` for policy templates

---

## 10.2 No Rate Limiting

**Severity:** HIGH (Priority 8)
**Impact:** API endpoints vulnerable to abuse, DoS

**Affected:**
- Edge Functions
- n8n webhooks

**Required Fix:** Implement rate limiting at Edge Function level

---

## 10.3 Voice Recognition Tuning

**Severity:** MEDIUM (Priority 12)
**Impact:** Occasional misrecognition of commands

**Required Fix:** Command-specific tuning, phonetic aliases

---

**END OF FILE**
