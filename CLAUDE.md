# Stocker AI – Claude Code Operational Directives
**Location:** /home/visionairy/StockerAI/CLAUDE.md
**Purpose:** Define behavioral contract for Claude Code when operating in the Stocker AI workspace.

---

# 0. SOURCE OF TRUTH

**MEMORY.md is the primary SOT.** Always read it first.

| Document | Purpose |
|----------|---------|
| `MEMORY.md` | Current state, IDs, credentials, next steps |
| `CLAUDE.md` | This file - operational rules for Claude |
| `docs/STOCKER_PRD_v1.md` | Product requirements (stable) |

## 0.1 Trusted vs Untrusted Sources

**BBRD VIOLATION:** Trusting static documentation when live data is authoritative.

### ALWAYS Query Live Data For:

| Source | Why | How to Query |
|--------|-----|--------------|
| **Database schema** | Schema files get outdated | Query `information_schema` via Supabase SQL |
| **n8n workflow structure** | Workflows change frequently | Use `n8n_get_workflow` MCP tool |
| **n8n executions** | Only live data shows what happened | Use `n8n_executions` MCP tool |
| **Frontend state** | Code changes, docs don't | Read actual source files |
| **API responses** | Specs drift from reality | Test actual endpoints |

### Can Trust (With Verification):

| Source | Why | When to Reverify |
|--------|-----|------------------|
| **MEMORY.md** | Manually maintained, current session | Each session start |
| **PRD** | Stable requirements doc | Major feature changes |
| **Code comments** | Usually accurate, linted | When behavior contradicts |

### NEVER Trust:

| Source | Why | What to Do Instead |
|--------|-----|-------------------|
| **Static schema files** | Get out of sync with production | Query live database |
| **README "architecture" sections** | Aspirational, not actual | Read actual code |
| **Old commit messages** | Code evolved since then | Check current HEAD |
| **Assumptions** | Just wrong | Verify with live data |

### BBRD Protocol for Database Questions:

1. **NEVER assume schema from files** - Query `information_schema`
2. **NEVER assume relationships** - Query foreign keys directly
3. **NEVER assume RLS policies** - Test actual access
4. **NEVER assume indexes exist** - Query `pg_indexes`

### Example: Checking Delete Cascade

**WRONG (violates BBRD):**
```
Read database/supabase_schema.sql
See: routes CASCADE to machines
Assume: This is production reality
```

**RIGHT (BBRD compliant):**
```sql
-- Query actual foreign key constraints
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON rc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'machines';
```

---

# 0.5 BBRD ENFORCEMENT PROTOCOL

**Status:** ACTIVE (Session 28 implementation)
**Purpose:** Prevent boundary violations through systematic enforcement, not just documentation

## 0.5.1 The Problem

BBRD violations occur because:
1. No mechanism forces boundary detection before implementation
2. "Do it" requests bypass BBRD entirely
3. Cross-boundary changes feel like simple parameter changes

**Failure Pattern:** User says "do it" → AI implements immediately → Error → Fix → Error → Fix...

**Root Cause:** BBRD is REACTIVE (analyze after failure), not PROACTIVE (prevent failure)

## 0.5.2 Automatic Boundary Change Detection

**MANDATORY:** Before executing these high-risk actions, output boundary detection analysis:

| Action Type | Examples | Why High-Risk |
|-------------|----------|---------------|
| **API Integration Changes** | Switching APIs, endpoint changes, new integrations | Different contracts (tool formats, auth, schemas) |
| **Database Schema Modifications** | ALTER TABLE, cascade changes, RLS edits | Cascades affect multiple boundaries |
| **n8n Workflow Updates** | Credential changes, HTTP node modifications | Workflows bridge 3+ boundaries |
| **Data Format Transformations** | Schema changes, field renaming, type conversions | Upstream/downstream expects specific formats |

**Detection Output Template:**

```
🚨 BOUNDARY CHANGE DETECTED

Boundary Type: [API | DATABASE | WORKFLOW | DATA_FORMAT]
Specific Change: [Description]

Upstream Contract:
  - Component: [What sends data]
  - Current Format: [Schema/structure]
  - Verification: [✓ Tested | ❌ Not Tested]

Downstream Contract:
  - Component: [What receives data]
  - Expected Format: [Schema/structure]
  - Verification: [✓ Tested | ❌ Not Tested]

Risk Level: [LOW | MEDIUM | HIGH | CRITICAL]

❓ USER CHOICE REQUIRED:
1. Verify Contracts First (recommended - enter plan mode)
2. Accept Risk (implement now, user responsible for failures)

Which do you choose?
```

## 0.5.3 The Three Gates

Every boundary change MUST pass through these gates:

**GATE 1: BOUNDARY DETECTION** (Automatic)
- Identify what's changing
- Map upstream/downstream contracts
- Assess cross-boundary impact

**GATE 2: CONTRACT VERIFICATION** (If user chooses "Verify First")
- Query live data (not assumptions)
- Test input → transformation → output
- Identify mismatches

**GATE 3: ISOLATED TESTING** (If verification passes)
- Test in isolation
- Verify no unintended side effects
- Document rollback procedure

**ONLY AFTER passing all 3 gates → IMPLEMENT**

## 0.5.4 User Risk Acceptance

Users can skip gates by explicitly accepting risk:

**When user says "do it" to a boundary change:**

```
🚨 BOUNDARY CHANGE DETECTED
[Full detection output]

❓ This requires boundary verification. Choose:
1. Verify Contracts First (recommended)
2. Accept Risk & Implement Now (I am responsible for failures)
```

**If user chooses "Accept Risk":**

1. Document in MEMORY.md:
```
## Risk Acceptance Log
Date: [timestamp]
Change: [description]
Boundaries Affected: [list]
User Choice: Accept Risk (skip verification)
```

2. Output warning:
```
⚠️ RISK ACCEPTED - Implementing without boundary verification

IMPORTANT:
- If errors occur, they are expected (boundaries not verified)
- Fixes may require multiple iterations
- Rollback procedure: [how to undo]

Proceeding with implementation...
```

## 0.5.5 Detection Triggers

**File Patterns:**
- `**/src/hooks/use*API.ts` → API boundary
- `**/database/*.sql` → Database boundary
- `**workers/*.js` → API boundary (Cloudflare Worker)
- n8n workflow modifications → Workflow boundary

**User Keywords:**
- "switch to", "migrate", "change API" → API boundary (CRITICAL)
- "alter schema", "cascade delete" → Database boundary (CRITICAL)
- "update workflow", "change credentials" → Workflow boundary (HIGH)

**Tool Usage:**
- `n8n_update_workflow` with credential/HTTP changes → Workflow boundary
- `Edit` on `*API*.ts` files → API boundary
- `Bash` with SQL commands → Database boundary

## 0.5.6 Integration with Existing Sections

**Section 0.1 Updates:**
- Add to "Can Trust": Live contract verification results (from GATE 2)
- Add to "NEVER Trust": Assumed API contracts

**Section 5.7 Updates:**
- Fix Specification MUST include: "BBRD Gates Passed: [1, 2, 3] OR Risk Accepted: [YES]"

**Section 5.8 Reference:**
- Systematic Testing Protocol IS Gate 3 of BBRD Enforcement

---

# ⚠️ HIGHEST PRIORITY: BOUNDARY & BRANCH DISCOVERY FOR ALL FIXES

**MANDATORY:** Before attempting ANY fix or debugging, apply this systematic approach. NO exceptions.

## Why This Matters

Symptomatic fixes (chasing individual errors) create cascading problems. Systematic analysis finds ROOT CAUSES.

## The Stocker Data Flow Boundaries

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────┐    ┌─────────┐
│ PDF Upload  │ →  │   Database   │ →  │ n8n Workflows│ →  │   AI    │ →  │   TTS   │
│ (Parser)    │    │  (Supabase)  │    │ (Tool calls) │    │ (Groq)  │    │(OpenAI) │
└─────────────┘    └──────────────┘    └─────────────┘    └─────────┘    └─────────┘
```

## Boundary Contracts (What Each Component Expects)

| Boundary | Input Contract | Output Contract |
|----------|----------------|-----------------|
| PDF Parser | Parlevel PDF format | items with sequence 1,2,3... in PDF order |
| Database | Valid foreign keys, sequences | Ordered data via `order=sequence.asc` |
| Workflows | session_id, user_id | JSON with `spoken` field for fast path |
| AI (Groq) | Messages + tool definitions | Tool calls OR use `spoken` field verbatim |
| TTS | Text string | Audio playback |

## MANDATORY Debugging Protocol

### Step 1: Identify Which Boundary Failed
- Don't guess. Trace the data flow from source to symptom.
- Ask: "Where did the data FIRST become wrong?"

### Step 2: Verify the Contract at That Boundary
- What did the upstream component OUTPUT?
- What did the downstream component EXPECT?
- Where is the mismatch?

### Step 3: Check for Upstream Contamination
- A broken contract at boundary N may be CAUSED by boundary N-1
- Always trace backward before fixing forward

### Step 4: Validate Fix Propagation
- After fixing, trace FORWARD through all downstream boundaries
- Confirm the fix didn't break a different contract

## Example: "AI only said '5 Snickers'"

**WRONG approach:** "Let me check the AI prompt and add more instructions"

**RIGHT approach:**
1. **Boundary trace:** User heard incomplete response → TTS spoke it → AI generated it → Workflow returned it
2. **Check Workflow output:** Does it have `spoken` field? What's in it?
3. **Check AI behavior:** Did AI use `spoken` field or generate its own?
4. **Find first break:** If workflow missing `spoken`, fix there. If AI ignoring it, fix prompt.
5. **Validate downstream:** After fix, confirm TTS receives complete text.

## Red Flags That Indicate Symptomatic (Bad) Debugging

- Looking at only ONE execution without context
- Making a fix without understanding WHY the bug exists
- Adding code without removing the root cause
- "Let me just try this and see if it works"
- Fixing symptoms in component N when the cause is in component N-1

---

# 0.6 MANDATORY XF USAGE PROTOCOL

**Status:** ACTIVE (Session 37 implementation)
**Purpose:** Enforce proactive Xpansion usage for boundary-crossing changes

## 0.6.1 When to Use XF (Automatic Triggers)

| Change Type | XF Tool | Example | Why Mandatory |
|-------------|---------|---------|---------------|
| **Workflow Activation** | `xpansion_system` | Activating n8n workflow, changing webhook path | Frontend-backend contract verification |
| **Database Schema** | `xpansion_system` | ALTER TABLE, CASCADE changes, RLS policies | Multi-boundary impact analysis |
| **API Changes** | `xpansion_system` | Editing WEBHOOK_MAP, endpoint modifications | Contract validation across boundaries |
| **New Feature** | `xpansion_intent` | Adding 2-item mode, environmental detection | Requirements decomposition |
| **Bug Investigation** | `xpansion_system` | "Next command freezes", systematic failures | Root cause discovery |
| **Process Design** | `xpansion_process` | Testing protocol, deployment workflow | Step validation |

## 0.6.2 Mandatory Usage Protocol

**BEFORE making boundary-crossing changes:**

```
1. DETECT: Identify change type (see triggers above)
2. CALL XF: Use appropriate tool
   - xpansion_system for technical analysis
   - xpansion_intent for requirements
   - xpansion_process for workflows
3. ANALYZE: Review XF output for boundary violations
4. FIX CONTRACTS: Update mismatched contracts FIRST
5. IMPLEMENT: Apply change after contracts validated
6. VERIFY: Test that change worked
```

**Example (Workflow Activation):**
```
User: "Activate the new get_next_item workflow"

Step 1 - DETECT:
This is workflow activation (triggers xpansion_system)

Step 2 - CALL XF:
Call xpansion_system with:
"Activating n8n workflow get_next_item with webhook /next-item-optimized.
Frontend WEBHOOK_MAP currently has get_next_item: '/next-item'.
Need to verify frontend-backend contract."

Step 3 - ANALYZE:
XF discovers:
- DATA boundary: Webhook path mismatch
- NODES boundary: Frontend expects /next-item
- FLOW boundary: Will cause 404 on webhook call
- ERRORS boundary: App will freeze on retry loop

Step 4 - FIX CONTRACTS:
Update frontend WEBHOOK_MAP BEFORE activating workflow

Step 5 - IMPLEMENT:
Activate workflow after frontend updated

Step 6 - VERIFY:
Test webhook responds correctly
```

## 0.6.3 Enforcement

**How You Know I Skipped XF:**
- I made a change that affected multiple boundaries
- I didn't call xpansion_* tool first
- Change broke contract (symptom appeared in different boundary)

**What to Do:**
1. Call me out: "Why didn't you use XF first?"
2. I must then:
   - Call XF retroactively
   - Analyze what went wrong
   - Fix root cause (not just symptom)
   - Document pattern in MEMORY.md

## 0.6.4 XF Output Format

**I must report XF findings before implementing:**

```
🔍 XF ANALYSIS COMPLETE

Boundaries Discovered:
- DATA: [what data flows]
- NODES: [what components process]
- FLOW: [how it flows]
- ERRORS: [failure points]

Contract Violations Found: [number]
1. [Specific mismatch with boundary context]
2. [Specific mismatch with boundary context]

Recommendation: [What to fix before proceeding]

Proceeding with implementation: [YES/NO + reason]
```

**If I skip this report:** You know I didn't actually use XF

## 0.6.5 Exceptions (When XF Not Required)

- Read-only operations (querying database, reading files)
- Documentation updates (MEMORY.md, comments)
- Single-file changes with no external contracts
- Trivial bug fixes (typos, obvious errors)

**When in doubt:** Use XF. Over-use is better than under-use.

---

# 1. PROJECT IDENTITY

## 1.1 Product Definition

**Stocker** is a voice-guided warehouse pre-kitting system for vending machine route preparation.

**Target User:** Solo vending machine operator preparing daily route bins at 4AM
**Core Value:** Complete hands-free stocking - zero screen interaction required

**PRD:** `/docs/STOCKER_PRD_v1.md`

## 1.2 Technical Stack (Current)

| Component | Technology |
|-----------|------------|
| Frontend | PWA (HTML/JS) |
| STT | Web Speech API (browser) |
| AI | OpenAI GPT-4o-mini via n8n proxy |
| TTS | OpenAI TTS via n8n proxy |
| Backend | n8n Cloud (8 workflows) |
| Database | Supabase (PostgreSQL) - migrating from Airtable |
| Auth | Supabase Auth (email + password) |
| Hosting | www.my-stocker-ai.com |

## 1.3 Key Requirements

- **Latency:** <2 seconds end-to-end (speech → response)
- **Accuracy:** 99% on common commands
- **Reliability:** 100% state persistence, zero data loss
- **Session:** 6+ hour continuous operation

## 1.4 Project Structure

```
/home/visionairy/StockerAI/
├── CLAUDE.md           # This file - operational rules
├── MEMORY.md           # SOT - current state, IDs, next steps
├── docs/
│   └── STOCKER_PRD_v1.md
├── database/
│   └── supabase_schema.sql
├── pwa/
│   ├── index.html      # Voice interface
│   ├── upload.html     # PDF upload
│   ├── sw.js           # Service worker
│   └── manifest.json
└── scripts/
```

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

## 2.6 n8n Workflow Management – CRITICAL SAFETY RULES

**Status:** ACTIVE (Session 36 - learned from production incidents)
**Purpose:** Prevent known n8n MCP issues from causing production failures

### Known n8n MCP Issues (As of 2026-01-12)

The following issues with n8n MCP tools cause **production corruption**:

| # | Issue | Impact | Status |
|---|-------|--------|--------|
| 1 | Deleting workflow before testing new one | Production downtime, lost reference | ACTIVE BUG |
| 2 | Created workflows with webhooks don't auto-activate | Webhook unregistered, tool calls fail | ACTIVE BUG |
| 3 | Partial update corrupts JS Code node content | Syntax errors, extra braces, execution failures | ACTIVE BUG |
| 4 | IF/Switch/Merge node connections corrupt on creation | Wrong branches, broken flow logic | ACTIVE BUG |

### MANDATORY Monitoring Protocol

**Check for resolution every other day:**
1. Search n8n MCP GitHub issues, documentation, release notes
2. Test known failures in development environment
3. Update this section when any issue is resolved
4. Document new safe workflows when fixes are confirmed

**Last checked:** 2026-01-12
**Next check:** 2026-01-14

### RULE 1: Never Delete Before Testing (CRITICAL)

**WRONG workflow:**
```
1. Delete old workflow
2. Create new workflow
3. Test new workflow ← IF THIS FAILS, production is broken
```

**CORRECT workflow:**
```
1. Create new workflow with different name (e.g., "workflow_name_v2")
2. Test new workflow thoroughly
3. Verify webhook responds, execution succeeds, output correct
4. ONLY AFTER CONFIRMED WORKING → delete old workflow
5. Rename new workflow if needed
```

**Rationale:**
- If creation fails → old workflow still works
- If creation succeeds but has bugs → old workflow is reference
- Zero downtime deployment possible
- Easy rollback if needed

**Exception:** NONE. This rule has NO exceptions.

### RULE 2: Webhook Activation Verification (CRITICAL)

**After creating ANY workflow with webhook trigger:**

1. **Get workflow status:**
   ```
   n8n_get_workflow({id: "workflow_id", mode: "minimal"})
   ```

2. **Check if active:**
   - If `active: true` → Test webhook with curl
   - If `active: false` → Notify user

3. **Test webhook responds:**
   ```bash
   curl -X POST "https://visionairy.app.n8n.cloud/webhook/[path]" \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```

4. **If webhook doesn't respond (404, timeout, etc.):**
   ```
   ⚠️ WEBHOOK NOT REGISTERED

   The workflow was created but the webhook is not active.

   REQUIRED ACTION:
   1. Go to n8n: https://visionairy.app.n8n.cloud
   2. Open workflow: [workflow_name] (ID: [workflow_id])
   3. Click on the Webhook node
   4. Click "Delete" on the webhook node
   5. Press Cmd/Ctrl+Z to undo (this re-registers the webhook)
   6. Click "Save" button
   7. Toggle workflow to ACTIVE

   Let me know when you've done this and I'll test again.
   ```

**Rationale:** Webhook registration is unreliable via API. Manual intervention prevents production failures.

### RULE 3: JS Code Node Changes – Copy/Paste Method (CRITICAL)

**If change affects ONLY ONE JS Code node:**

1. **Create a .js file for copy/paste:**
   ```
   I've created the updated code in a file you can copy/paste.

   File: /home/visionairy/StockerAI/workflows/[node_name]_update.js

   STEPS:
   1. Open that file in VS Code
   2. Copy the entire contents (Ctrl+A, Ctrl+C)
   3. Go to n8n workflow: [workflow_name]
   4. Open the "[Node Name]" Code node
   5. Delete all existing code
   6. Paste the new code (Ctrl+V)
   7. Click "Save"
   8. Test the workflow
   ```

2. **NEVER use partial update for JS Code nodes** - known to corrupt syntax

**If change affects MULTIPLE nodes:**

1. **Ask user preference:**
   ```
   This change affects [N] nodes: [list node names]

   OPTIONS:
   1. Create [N] separate .js files for manual copy/paste (safest)
   2. Delete old workflow + create new workflow (requires testing)
   3. Provide step-by-step manual edit instructions

   Which do you prefer?
   ```

**Rationale:** Partial updates have corrupted workflows in production. Copy/paste is 100% reliable.

### RULE 4: IF/Switch/Merge Node Connection Verification (CRITICAL)

**When creating workflow with IF, Switch, or Merge nodes:**

1. **After creation, analyze structure:**
   ```
   n8n_get_workflow({id: "workflow_id", mode: "structure"})
   ```

2. **Verify connections for each branching node:**
   - IF node: Verify `true` and `false` branches connect to correct downstream nodes
   - Switch node: Verify each case connects to correct downstream node
   - Merge node: Verify `chooseBranch` vs `combine` mode, verify all inputs connected

3. **If any connection looks wrong:**
   ```
   ⚠️ POSSIBLE CONNECTION ISSUE DETECTED

   The [Node Type] node "[Node Name]" may have incorrect connections.

   EXPECTED:
   - [Branch/Case] → [Expected Node]

   ACTUAL:
   - [Branch/Case] → [Actual Node]

   REQUIRED ACTION:
   1. Go to n8n workflow: [workflow_name]
   2. Click on "[Node Name]" node
   3. Verify connections:
      - [Specific connection to check]
      - [Specific connection to check]
   4. If incorrect, drag connection to correct node
   5. Save workflow

   Let me know when verified and I'll proceed with testing.
   ```

4. **For Switch/IF nodes, notify on creation:**
   ```
   ✅ Workflow created with IF/Switch node

   PLEASE VERIFY CONNECTIONS:
   1. Open workflow: [workflow_name] in n8n
   2. Click on "[Node Name]" IF/Switch node
   3. Confirm branches connect correctly:
      - [Branch 1] → [Node Name]
      - [Branch 2] → [Node Name]
   4. If connections are wrong, manually reconnect

   Reply "connections verified" when done.
   ```

**Rationale:** API-created branch nodes have unreliable connection logic. Manual verification prevents logic errors.

### Integration with Existing Rules

**Section 0.5.3 (Three Gates):**
- GATE 3 (Isolated Testing) now includes: "Verify no workflow corruption per Section 2.6"

**Section 5.7 (Fix Specification):**
- Rollback MUST include: "Restore old workflow ID if new one fails"

**Section 5.8 (Systematic Testing):**
- New workflow creation triggers: "Webhook verification, branch connection verification"

## 2.7 n8n Workflow Organization – MANDATORY STRUCTURE

**Status:** ACTIVE (Session 36 - user requirement)
**Purpose:** Prevent workflow chaos, enable easy maintenance

### Folder Structure (n8n Cloud)

All Stocker AI workflows MUST be in the **StockerAI folder** (under Personal project):

```
Personal/
└── StockerAI/
    ├── Stocker Tool: get_next_item
    ├── Stocker Tool: get_next_item (Optimized)
    ├── Stocker Tool: start_machine
    ├── Stocker Tool: skip_current_machine
    ├── Stocker Tool: switch_route
    ├── Stocker Tool: get_routes_for_date
    ├── Stocker Tool: set_route_sequence
    ├── Stocker Tool: go_back_to_skipped
    ├── Stocker Tool: update_session_state
    ├── Stocker Tool: delete_route
    ├── Stocker Tool: get_current_status
    ├── Stocker - PDF Upload
    ├── Stocker: Invite Team Member
    └── Stocker Auth
```

### Workflow Lifecycle - Create, Test, Archive

**WRONG workflow (old way):**
```
1. Create new workflow in Personal (root)
2. Delete old workflow
3. Move new workflow to StockerAI folder
```

**CORRECT workflow (new way):**
```
1. Create new workflow with version suffix (e.g., "get_next_item_v2")
2. Place in StockerAI folder immediately
3. Test thoroughly (webhook, execution, output)
4. Verify it works correctly
5. Activate new workflow
6. ARCHIVE (not delete) old workflow
7. Rename new workflow (remove version suffix if desired)
```

### Why Archive Instead of Delete

**Benefits:**
- **Rollback:** Instant restore if new version fails
- **Reference:** Compare behavior between versions
- **Audit trail:** Track what changed and when
- **Zero risk:** Old workflow available if needed

**How to Archive:**
1. In n8n, open the workflow
2. Click the "..." menu (top right)
3. Select "Archive"
4. Workflow disappears from active list but remains accessible

### Workflow Naming Convention

| Type | Format | Example |
|------|--------|---------|
| Voice tools | `Stocker Tool: <command_name>` | `Stocker Tool: get_next_item` |
| Optimized versions | `Stocker Tool: <command> (Optimized)` | `Stocker Tool: get_next_item (Optimized)` |
| Backend services | `Stocker - <service_name>` | `Stocker - PDF Upload` |
| Auth/infrastructure | `Stocker <system_name>` | `Stocker Auth` |

### Current Active Stocker Workflows (2026-01-12)

| Workflow Name | ID | Webhook Path | Status | Location |
|---------------|-----|--------------|--------|----------|
| get_next_item | gwmLuqCN37fhQ3Pr | /next-item | ⚠️ ARCHIVED | StockerAI |
| get_next_item (Optimized) | iykbFj7f9222PF7r | /next-item-optimized | ⏸️ INACTIVE (testing) | StockerAI |
| start_machine | JbKdJuKgGbyvzlF0 | /start-machine | ✅ ACTIVE | StockerAI |
| skip_current_machine | ElCSMeguJNxwp0HO | /skip-machine | ✅ ACTIVE | StockerAI |
| switch_route | 3G01u7N9REhrC9tn | /switch-route | ✅ ACTIVE | StockerAI |
| get_routes_for_date | 4XS07THe1uGak7rk | /get-routes | ✅ ACTIVE | StockerAI |
| set_route_sequence | 46lMRdxTgD1E3WFz | /set-sequence | ✅ ACTIVE | StockerAI |
| go_back_to_skipped | rpNfINhjbFCuFrlZ | /back-to-skipped | ✅ ACTIVE | StockerAI |
| update_session_state | ueDSi9SDBZ5jMwpO | /update-session | ✅ ACTIVE | StockerAI |
| delete_route | zmgTBX1w1rc5bOpO | /delete-route | ✅ ACTIVE | StockerAI |
| get_current_status | PD3ErCuxWBWLFXIq | /current-status | ✅ ACTIVE | StockerAI |
| PDF Upload | 7kO6o1wASKvbhc2U | /upload | ✅ ACTIVE | StockerAI |
| Invite Team Member | TxrJyFmG4yNazEEF | /invite-member | ✅ ACTIVE | StockerAI |
| Stocker Auth | cw0ERwaa1VXJ2Jah | /auth | ✅ ACTIVE | StockerAI |

### Integration with RULE 1

**Before (RULE 1 original):**
```
1. Create new workflow with different name
2. Test thoroughly
3. Delete old workflow ← WRONG
```

**After (RULE 1 updated with 2.7):**
```
1. Create new workflow in StockerAI folder with version suffix
2. Test thoroughly (webhook, execution, output)
3. Activate new workflow
4. Archive (not delete) old workflow ← CORRECT
5. Rename new workflow if needed
```

---

# 3. COMMUNICATION RULES

**The user is NOT a traditional developer or coder.**

When giving instructions:
- **Never assume** knowledge of coding, web development, terminals, or technical concepts
- **Always explain** where to click, what to look for, and what success/failure looks like
- **Use step-by-step** numbered instructions with specific details
- **Include screenshots descriptions** when referring to UI elements (e.g., "the gear icon in the top-right corner")
- **Explain jargon** the first time it's used (e.g., "the Console - this is a hidden panel in your browser where error messages appear")
- **Provide context** for why each step matters

Example of BAD instruction:
> "Check the console for errors"

Example of GOOD instruction:
> 1. Open Chrome on your phone/laptop
> 2. Go to my-stocker-ai.com
> 3. Press F12 on your keyboard (or right-click anywhere → "Inspect")
> 4. A panel will open on the side or bottom of your screen
> 5. Click the tab that says "Console" at the top of this panel
> 6. Look for any red text - that's an error message
> 7. Tell me what the red text says

---

# 4. SESSION PROTOCOL

## 4.1 Session Start

Before ANY action:
1. Read `/home/visionairy/StockerAI/MEMORY.md`
2. Check current status and pending tasks
3. Review any recent changes

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
- After making any file modifications (frontend, backend, config)
- After user approves or tests changes
- **IMMEDIATELY** - don't wait for user to ask

### Commit Protocol
1. Stage changed files: `git add <files>`
2. Commit with descriptive message (include context of what changed)
3. Push to origin: `git push`
4. Confirm push succeeded

### Exception
ONLY skip git push if:
- User explicitly says "don't push yet"
- Changes are experimental/debugging only
- User asks to review before pushing

### Example Flow
```bash
# After editing MyRoutes.tsx
git add src/pages/dashboard/MyRoutes.tsx
git commit -m "Add delete route button with confirmation dialog"
git push
```

**User should NEVER have to ask "did you push this?"** - the answer should always be YES.

---

# 5. n8n WORKFLOW TROUBLESHOOTING PROTOCOL

When encountering errors in n8n workflows specifically, use these 10 MECE boundaries:

## 5.1 n8n Root Cause Boundaries

| # | Boundary | What It Covers |
|---|----------|----------------|
| 1 | WORKFLOW | Structure, flow logic, trigger configuration |
| 2 | NODE | Individual node configuration, parameters, credentials |
| 3 | DATA | Data flowing between nodes, schema, types |
| 4 | CODE | Code nodes, expressions, function logic |
| 5 | CONNECTION | External service connections, API credentials |
| 6 | EXECUTION | Timing, concurrency, rate limits, timeouts |
| 7 | ENVIRONMENT | n8n instance, env vars, version |
| 8 | DATABASE | Supabase queries, RLS policies, schema |
| 9 | API | Backend endpoints, request/response handling |
| 10 | FRONTEND | UI/client-side, state, API calls |

## 5.2 Cross-Boundary Diagnosis (CRITICAL)

**Symptoms often appear in a different boundary than their root cause.**

### Frontend Symptom → Backend Cause Flow

```
FRONTEND SYMPTOM           TRACE PATH                      LIKELY ROOT CAUSE
─────────────────────────────────────────────────────────────────────────────
UI shows stale data      → API response → n8n workflow   → DATABASE query or WORKFLOW logic
Button does nothing      → API call fails → n8n webhook  → NODE config or CONNECTION
Spinner never stops      → API timeout → n8n execution   → EXECUTION timeout or CODE infinite loop
Wrong data displayed     → API returns wrong data        → DATA transformation in n8n CODE node
"Undefined" in UI        → API returns null field        → NODE mapping or DATA schema mismatch
Auth error in UI         → API 401 → n8n → Supabase     → CONNECTION credentials or DATABASE RLS
```

### The Trace Protocol

1. **Observe symptom in FRONTEND**
2. **Check browser Network tab** - What did the API actually return?
3. **Check n8n execution** - What did the workflow produce?
4. **Trace backward node by node** - Where did the data FIRST become wrong?
5. **Fix at SOURCE, not symptom**

### Example: "UI shows wrong item count"

```
WRONG: Add logic in frontend to recalculate count
RIGHT:
  1. Check API response - is count wrong there? YES
  2. Check n8n workflow - is count wrong at output node? YES
  3. Check upstream nodes - which node produces wrong count?
  4. Found: Code node has off-by-one error in loop
  5. Fix: Correct loop logic in n8n Code node
```

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
| REPRODUCIBLE | Can trigger the symptom by manipulating this cause |
| SINGULAR | Fixing this ONE thing resolves the symptom |
| VERIFIABLE | Can confirm fix with specific test |

**Non-Terminal signals (keep drilling):**
- "Something is wrong with the workflow"
- "The data might be bad"
- "There could be a connection issue"

## 5.5 n8n Expression Debugging

```javascript
// In n8n expressions, debug with:
{{ $json }}           // See full input data
{{ $input.all() }}    // See all input items
{{ $node["NodeName"].json }}  // See specific node output
{{ $execution.id }}   // Get execution ID for logs
```

## 5.6 Common n8n Gotchas

1. **Items vs Item**: Most nodes output array of items, Code node must return array
2. **Binary vs JSON**: File data is in binary, not json
3. **Expression context**: `$json` only works in node parameter fields, not Code nodes
4. **Credentials scope**: Some credentials only work in specific nodes
5. **Webhook paths**: Must be unique, include workflow ID if duplicating

## 5.7 Fix Specification Template

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

## 5.8 Systematic Testing Protocol (BBRD-Compliant)

**MANDATORY:** After ANY significant change, run systematic tests to verify behavior.

### When to Test

| Trigger | What to Test |
|---------|-------------|
| New workflow created | Execution logs, error handling, cascade effects |
| Database schema change | Foreign key cascades, RLS policies, orphaned data |
| Frontend state change | UI transitions, error recovery, concurrency |
| AI prompt modification | Tool calling, response variation, context memory |
| API endpoint change | Request/response format, timeout handling, errors |

### Test File Locations

All tests are in `/tests/` directory:

| File | Purpose |
|------|---------|
| `database_cascade_tests.sql` | Verify FK cascades, check orphans, pre/post delete |
| `workflow_behavior_tests.md` | Switch route, concurrency, timeouts, partial failures |
| `ai_voice_recognition_tests.md` | One-word responses, phonetics, fast path, UI sync |

### Testing Workflow (BBRD-Aligned)

```
1. IDENTIFY BOUNDARIES AFFECTED
   - Which of the 10 boundaries does this change touch?
   - What downstream boundaries could be impacted?

2. QUERY LIVE STATE (PRE-TEST)
   - Database: Run pre-test queries to capture current state
   - n8n: Check existing execution logs for baseline
   - Frontend: Document current UI behavior

3. EXECUTE CHANGE
   - Apply fix/feature
   - Deploy to production (or staging)

4. QUERY LIVE STATE (POST-TEST)
   - Database: Run post-test queries, compare to pre-test
   - n8n: Check new execution logs for errors
   - Frontend: Verify UI behavior changed as expected

5. CROSS-BOUNDARY VERIFICATION
   - Check each downstream boundary
   - Verify no unintended side effects
   - Test error cases (not just happy path)

6. DOCUMENT RESULTS
   - Record test date, results, any anomalies
   - Update MEMORY.md with new known behaviors
```

### Test Execution Examples

#### Example 1: Testing Delete Cascade

```sql
-- PRE-TEST: Capture state
SELECT COUNT(*) FROM machines WHERE route_id = '<ROUTE_ID>';
SELECT COUNT(*) FROM items WHERE machine_id IN (
  SELECT id FROM machines WHERE route_id = '<ROUTE_ID>'
);
SELECT COUNT(*) FROM sessions WHERE current_route_id = '<ROUTE_ID>';

-- EXECUTE: Delete route via UI

-- POST-TEST: Verify cascade
-- Should be 0, 0, 0 or SET NULL
SELECT COUNT(*) FROM machines WHERE route_id = '<ROUTE_ID>';
SELECT COUNT(*) FROM items WHERE machine_id IN (
  SELECT id FROM machines WHERE route_id = '<ROUTE_ID>'
);
SELECT COUNT(*) FROM sessions WHERE current_route_id = '<ROUTE_ID>';
```

#### Example 2: Testing AI One-Word Responses

```
PRE-TEST: Note current AI behavior
- "top" → AI asks "Did you mean top or bottom?"

EXECUTE: Update system prompt with one-word handling

POST-TEST: Verify AI behavior changed
- "top" → AI calls start_machine(direction="beginning")
- Check n8n execution log for tool call
- NO clarification question asked
```

#### Example 3: Testing Workflow Timeout

```
PRE-TEST: Normal execution time
- get_next_item workflow: ~500ms average

EXECUTE: Add artificial delay in workflow (for testing)

POST-TEST: Verify timeout handling
- Frontend shows timeout error after 30s
- UI not stuck in "thinking" state
- User can retry operation
- Database state not corrupted
```

### Red Flags During Testing

| Observation | Likely Issue | Action |
|-------------|--------------|--------|
| Post-test query returns unexpected data | Database boundary failure | Trace back to SQL/RLS |
| n8n execution missing | Webhook not registered | Check workflow active, webhookId |
| Frontend stuck after test | UI state boundary failure | Check error recovery logic |
| AI behaves differently than expected | Prompt boundary failure | Check system prompt, context |
| Timeout but DB changed | Partial failure | Add transaction or idempotency |

### Test Documentation Template

```
TEST: [Name of test]
DATE: [YYYY-MM-DD HH:MM]
BOUNDARIES TESTED: [List of 10 boundaries affected]
PRE-TEST STATE: [Captured queries/logs]
CHANGE APPLIED: [What was changed]
POST-TEST STATE: [Results of verification]
RESULT: [PASS/FAIL]
ANOMALIES: [Unexpected behaviors observed]
FOLLOW-UP: [Any additional testing needed]
```

### Integration with Fix Specification

The "Test" field in Fix Specification (5.7) should reference specific tests from `/tests/`:

```
Test: Run database_cascade_tests.sql TEST 5 after deletion
      Verify workflow_behavior_tests.md TEST 1 passes
      Check ai_voice_recognition_tests.md TEST 2 scenarios A-D
```

### Continuous Testing Mindset

- **Before deploying:** Run affected tests
- **After deploying:** Re-run affected tests in production
- **Weekly:** Run full test suite end-to-end
- **After incident:** Add regression test for that scenario

**Tests are not optional. Tests prevent regressions. Tests embody BBRD principles.**

---

**END OF FILE**
