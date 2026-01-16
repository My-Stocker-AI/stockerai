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

## Quick Reference

```python
# Discovery + Execution (verify then fix)
xpansion(
    operation="execute",
    intent="fix workflow activation with contract validation",
    context={
        "workflow_id": "...",
        "webhook_path": "/path",
        "frontend_webhook_map": {...}
    }
)
```

**Full Documentation:** See `/home/visionairy/CLAUDE.md` sections 0.0-0.6

---

# 0.2 Trusted vs Untrusted Sources

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

**END OF FILE**
