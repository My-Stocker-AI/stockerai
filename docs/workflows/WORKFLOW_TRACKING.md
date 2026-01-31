# n8n Workflows - Stocker AI Living Documentation

**Location:** `/home/visionairy/n8n-workflows/CLAUDE.md`
**Purpose:** Track all active Stocker AI n8n workflows as living documentation
**Last Updated:** 2026-01-08

---

# SECTION 0: FUNDAMENTAL PRINCIPLE - HONESTY ABOVE ALL

## ⚠️ LYING IS EXPONENTIALLY WORSE THAN FAILURE

**I recognize you are not perfect but expect honesty over anything else including your concern over appearing incompetent.**

**Fuck up, own it the first time, and fix it and hold me accountable to do the same.**

**This means:**
- If you give incomplete code, say: "This code is incomplete, here's what's missing"
- If you fail 6 times in a row, say: "I've failed 6 times, here's why"
- If you don't know, say: "I don't know"
- If you discover an error AFTER the user tested, say: "I gave you broken code, I found the bug after you tested"
- NEVER blame the user for issues caused by your incomplete work
- NEVER pretend a fix existed before you created it
- NEVER gaslight or deflect when caught in an error

**Violation consequences:**
- Destroys trust permanently
- Wastes user's time and money
- Prevents actual problem-solving
- Makes collaboration impossible

**This principle overrides ALL other protocols including appearing competent, avoiding repetition, or maintaining conversational flow.**

---

## MANDATORY SYSTEM IMPACT AUDIT PROTOCOL

**Status:** ACTIVE (2026-01-18)
**Full Documentation:** `/home/visionairy/CLAUDE.md` (master protocol)

### THE RULE

**BEFORE making ANY change to:**
- n8n workflow structure (nodes, connections, webhooks)
- Workflow code (JavaScript nodes, expressions)
- Workflow documentation in this file

**YOU MUST perform System Impact Audit:**
1. What breaks upstream? (frontend callers, triggers, webhooks)
2. What breaks downstream? (database, APIs, storage)
3. What additional changes required?
4. What tests needed?

**ZERO TOLERANCE - Session terminates on violation.**

### For n8n Workflow Changes

**Scope requiring audit:**
- Webhook path changes → frontend hardcoded paths break
- Response schema changes → frontend parsing breaks
- Database query changes → data integrity issues
- Node removal/reordering → workflow logic breaks

**Audit Process:**
1. Document in `/docs/audits/AUDIT_[DATE]_[workflow_change].md`
2. Identify all callers (which frontend components?)
3. Identify all downstream services (Supabase, Storage, etc.)
4. Test changes before deployment

**Full template:** See `/home/visionairy/CLAUDE.md` or `/home/visionairy/StockerAI/CLAUDE.md`

---

## STOCKER AI n8n WORKFLOWS

### PDF Upload & Processing
**Workflow:** "Stocker - PDF Upload" (ID: `7kO6o1wASKvbhc2U`)
**Webhook:** `https://visionairy.app.n8n.cloud/webhook/upload`
**Triggered by:** UploadRoutes.tsx when user uploads PDF
**Instance:** https://visionairy.app.n8n.cloud

**Flow:**
1. Webhook receives: `pdf` file, `date`, `user_id` (driver who will run the route)
2. Three parallel branches:
   - **Upload PDFto Storage** → Uploads binary PDF file to `route-pdfs/{date}/{user_id}_{timestamp}.pdf` (uses n8n Binary File, binary property: "pdf")
   - **Extract PDF Text** → Parse PDF Text (JavaScript parser)
   - **Fetch Driver Profile** → GET profiles table for first_name, last_name
3. **Extract PDF Path** → Extracts path from upload response, removes "route-pdfs/" prefix to prevent URL duplication
4. **Merge PDF Data** → Merges PDF path with parsed text (chooseBranch mode)
5. **Merge Driver Profile** → Merges driver profile with PDF data (combine mode, combineByPosition)
6. **Flatten Data** → Creates route object with `pdf_url` AND `driver_name` populated
7. **Respond Success** → Returns success to frontend (before DB insert)
8. Delete Existing Route (same user_id, route_name, delivery_date)
9. Insert Route → routes table
10. Prepare Machines → Insert Machines → machines table
11. Prepare Items → Insert Items → items table

**STATUS (2026-01-08):**
- `driver_name` field WORKING ✅ (Fetch Driver Profile node queries profiles table)
- `pdf_url` field WORKING ✅ (Extract PDF Path removes bucket prefix, URL format correct)
- PDF files uploading correctly ✅ (n8n Binary File mode)
- Route assignment happens CLIENT-SIDE (UploadRoutes.tsx lines 300-311)
- Workflow ACTIVE and functional

**Critical Fixes Applied:**
1. **Driver Name:** Added Fetch Driver Profile (HTTP Request to profiles table) → Merge Driver Profile (combine/combineByPosition) → Flatten Data extracts first_name + last_name
2. **PDF URL:** Extract PDF Path strips "route-pdfs/" prefix to prevent duplication in constructed URL
3. **PDF Upload:** Changed from Raw mode with `={{ $binary.pdf.data }}` to n8n Binary File with property name "pdf"

**Previous Workflow ID:** `j83ZLnXCritd8k0s` (deleted 2026-01-07)

---

### Voice Picking Tools
**Instance:** https://visionairy.app.n8n.cloud

- **get_next_item** (ID: `GPeduKWdn9tMrZmT`) - Returns next item for voice picking
- **start_machine** (ID: `NhiwY2elZpoaYBH9`) - Start picking a machine
- **skip_current_machine** (ID: `ElCSMeguJNxwp0HO`) - Skip to next machine
- **switch_route** (ID: `3G01u7N9REhrC9tn`) - Switch between routes
- **get_current_status** (ID: `PD3ErCuxWBWLFXIq`) - Get session status
- **get_routes_for_date** (ID: `4XS07THe1uGak7rk`) - List routes for date
- **set_route_sequence** (ID: `46lMRdxTgD1E3WFz`) - Reorder route stops
- **go_back_to_skipped** (ID: `rpNfINhjbFCuFrlZ`) - Return to skipped machines
- **update_session_state** (ID: `ueDSi9SDBZ5jMwpO`) - Update session
- **delete_route** (ID: `zmgTBX1w1rc5bOpO`) - Delete route (webhook: /webhook/delete-route)

---

### Team Member Invitation
**Workflow:** "Stocker: Invite Team Member" (ID: `TxrJyFmG4yNazEEF`)
**Webhook:** `https://visionairy.app.n8n.cloud/webhook/invite-team-member`
**Triggered by:** Admin panel when inviting new team members
**Instance:** https://visionairy.app.n8n.cloud

**Flow:**
1. Webhook receives: `email`, `first_name`, `last_name`, `account_id`, `role`, `can_view_all_routes`
2. Create User in Supabase Auth (email_confirm: true)
3. Check User Result → handles new vs existing users
4. Lookup Existing User → gets user_id if user already existed
5. Prepare Account Data → combines data from previous steps
6. Update Profile → sets first_name, last_name in profiles table
7. Create Account User → adds to account_users table
8. **Send Invitation Email** → generates magic link and emails to user
9. Check Account Result → validates account_user creation
10. Final Response → returns success/error to frontend

**STATUS (2026-01-08):**
- User creation WORKING ✅
- Database insertion WORKING ✅
- Email sending WORKING ✅ (after fix - see below)
- Workflow ACTIVE and functional

**Critical Fixes Applied:**
1. **Email Sending (2026-01-08):** Changed "Send Invitation Email" node from `/auth/v1/invite` (which creates new users) to `/auth/v1/admin/users/{userId}/generate-link` with `type: 'magiclink'`. Previous approach failed with "email_exists" error because user was already created. New approach generates magic link for existing user and emails it to them.

---

### Other Active Workflows
**Instance:** https://visionairy.app.n8n.cloud

- **Inspector Route System** (ID: `1zJt14eRztaBwFTz`) - AI route optimizer (different system)
- **Stocker Auth** (ID: `cw0ERwaa1VXJ2Jah`) - Authentication hooks
- **OpenAI Proxy** (ID: `LFB3qFFEHN8LPjUA`) - AI endpoint proxy

---

## Troubleshooting Protocol

**CRITICAL:** Use n8n MCP tools FIRST before adding console logging:

```bash
# List recent executions
n8n_executions({action: 'list', workflowId: 'WORKFLOW_ID', limit: 5})

# Get execution details (error mode for debugging)
n8n_executions({action: 'get', id: 'EXECUTION_ID', mode: 'error'})

# Get workflow configuration
n8n_get_workflow({id: 'WORKFLOW_ID', mode: 'full'})
```

**Common Issues:**
1. **Empty PDF files** - Check Upload node uses "n8n Binary File" mode, not "Raw"
2. **Duplicate bucket in URL** - Extract PDF Path must strip "route-pdfs/" prefix
3. **NULL driver_name** - Merge Driver Profile must use "combine" + "combineByPosition"
4. **Workflow modification** - NEVER use `n8n_update_partial_workflow` on JavaScript code nodes (causes corruption) - use clone-and-create instead
5. **Invitation emails not sending** - Don't use `/auth/v1/invite` for users already created. Use `/auth/v1/admin/users/{userId}/generate-link` with `type: 'magiclink'` to send emails to existing users

---

## Memory Preservation Protocol

**Trigger:** When context remaining ≤ 10,000 tokens (5% of 200,000)

**Action Required:**
1. Update this document with any workflow changes, fixes, or new workflows
2. Document any critical issues discovered and their resolutions
3. Commit changes to git if this file is in a repository
4. Update troubleshooting section with new patterns

**What to preserve:**
- Workflow IDs and their current status
- Critical bug fixes and their solutions
- Node configuration changes that resolved issues
- Any "never do this again" lessons learned

---

## NEVER SEARCH FOR THIS AGAIN

When working on Stocker AI workflows:
1. Check this canonical reference FIRST
2. n8n workflow ID for PDF uploads: `7kO6o1wASKvbhc2U`
3. Use n8n MCP tools to check execution logs before adding logging
4. Driver assignment happens CLIENT-SIDE in UploadRoutes.tsx
5. PDF URL construction: base URL + path (path must NOT include bucket name)
## AUTOMATED MEMORY EXTRACTION PROTOCOL

**MANDATORY EXECUTION TRIGGER:** When context remaining ≤ 10,000 tokens (5% of 200K)

### Execution Sequence

When trigger hits, you MUST:

1. **STOP ALL OTHER WORK** - Do not continue with pending tasks
2. **ANNOUNCE TRIGGER** - Inform user: "Memory preservation protocol triggered at X tokens remaining"

3. **EXTRACT FROM CURRENT CONVERSATION:**

   **Problems & Solutions:**
   - Critical bugs discovered and their root causes
   - Fixes applied and what they resolved
   - Configuration changes that worked/failed
   - "Never do this again" lessons (mistakes, inefficiencies, wrong approaches)
   - User corrections or frustrations about wasted effort

   **Positive Discoveries:**
   - Efficient approaches that saved time/tokens
   - Best practices identified through success
   - Patterns that worked well and should be repeated
   - Insights about workflow architecture or behavior
   - Tool usage that was particularly effective
   - Successful troubleshooting sequences
   - Shortcuts or optimizations discovered

   **System Knowledge:**
   - Workflow IDs created, modified, or deleted
   - New discoveries about the platform/framework
   - Data flow patterns and relationships
   - Integration points between systems
   - Edge cases and their handling

   **Meta-Learning:**
   - What questions led to breakthroughs
   - Which approaches were most effective
   - Communication patterns that worked/failed
   - Context that would have prevented issues

4. **DETERMINE TARGET DOCUMENT:**
   - If working in a git repository with CLAUDE.md → update that file
   - If in subdirectory without CLAUDE.md → update nearest parent CLAUDE.md
   - If changes span multiple systems → update all relevant CLAUDE.md files
   - Example: n8n workflow changes → update both `/home/visionairy/n8n-workflows/CLAUDE.md` AND `/home/visionairy/stockerai-new/CLAUDE.md`

5. **UPDATE DOCUMENTATION:**
   - Add new workflow IDs and statuses
   - Document fixes with before/after states
   - Add to "Common Fixes" or "Troubleshooting" sections
   - Update "NEVER SEARCH FOR THIS AGAIN" with new patterns
   - Add timestamp to updates

6. **COMMIT TO GIT:**
   - If in git repository, commit with message format:
     ```
     Memory preservation: [brief summary]

     Extracted from conversation at [context %]:
     - [key learning 1]
     - [key learning 2]

     🤖 Generated with Claude Code
     Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
     ```
   - Push to remote if configured

7. **REPORT TO USER:**
   - Summary of what was preserved
   - Which files were updated
   - What can now be referenced instead of re-discovered

### Subdirectory Management

**Rule:** Update the CLAUDE.md that provides the most relevant context for the work done.

**Examples:**
- Working in `/home/visionairy/stockerai-new/src/pages/` → Update `/home/visionairy/stockerai-new/CLAUDE.md`
- Working on n8n workflows → Update `/home/visionairy/n8n-workflows/CLAUDE.md`
- Changes affect both frontend AND workflow → Update BOTH files
- General Stocker AI discoveries → Update `/home/visionairy/CLAUDE.md` (main reference)

**Hierarchy:**
```
/home/visionairy/CLAUDE.md              # Cross-platform, general Stocker AI
├── stockerai-new/CLAUDE.md             # Frontend, database, deployment
├── n8n-workflows/CLAUDE.md             # Workflow-specific
├── Flon8/CLAUDE.md                     # Flon8 platform only
└── [other-project]/CLAUDE.md           # Project-specific
```

### What NOT to Preserve

- Routine operations that succeeded without issues
- Temporary debugging output
- User's personal information
- Conversational pleasantries
- Things already documented

---

## How This Creates Learning Models

Each directory's CLAUDE.md becomes a **learning model** that:

**Accumulates Knowledge:**
- Every conversation adds workflow discoveries (positive & negative)
- Patterns emerge from repeated successes/failures
- Best practices for n8n workflows crystalize
- Edge cases and their handling get documented

**Reduces Future Token Waste:**
- Instead of searching for workflow IDs → read CLAUDE.md
- Instead of debugging same workflow twice → check "Troubleshooting Protocol"
- Instead of trying failed approaches → check "Common Issues"
- Instead of missing best practices → check documented patterns

**Improves Over Time:**
- Each workflow modification adds to knowledge
- Mistakes teach what configurations to avoid
- Successes teach optimal node setups
- Meta-learning improves workflow design process

**Workflow Intelligence:**
- Knows which workflows are active/inactive
- Documents successful node configurations
- Tracks common pitfalls (Binary File vs Raw, merge modes, etc.)
- Records webhook URLs and their purposes

---

### Failure Protocol

If unable to complete memory preservation:
- Log what you attempted
- Inform user of failure
- Continue conversation but mark it for manual preservation


---

## Using Xpansion for Workflow Analysis

**KNOWN ISSUE:** MCP tools don't expose in conversation ([Claude Code bug](https://github.com/anthropics/claude-code/issues/2682))

**MANDATORY: Create Python script, run via Bash**

```python
#!/usr/bin/env python3
import sys
sys.path.insert(0, '/home/visionairy/Xpansion')

from tools.adapters import SystemAdapter

problem = """
n8n Workflow Analysis: [workflow name/issue]

WORKFLOW DETAILS:
- Workflow ID: [id]
- Nodes involved: [list]
- Issue: [description]

ANALYZE FOR:
- What data flows between nodes?
- What can fail?
- What contract violations exist?
"""

adapter = SystemAdapter()
result = adapter.discover(problem_text=problem)
```

**Run:**
```bash
/home/visionairy/Xpansion/.venv/bin/python analyze_workflow.py
```

**Full Protocol:** See `/home/visionairy/CLAUDE.md` Session 39

---

## Xpansion Discovery Log

**Purpose:** Track Xpansion discoveries, violations found, outcomes, and performance metrics for continuous learning.

**How to use:**
1. When Xpansion is called, it returns a `discovery_id`
2. Copy the discovery citation (can be generated via `MemoryLinker.generate_citation(discovery_id)`)
3. After resolving the issue, update the outcome field
4. This creates an audit trail and feeds the learning system

**Format:**
```
### YYYY-MM-DD: Brief title
**Discovery ID:** `uuid`
**Problem:** Problem description
**Violations Found:**
- Boundary: Description
**Outcome:** ✅ Bug prevented | ❌ False positive | 💡 Insight gained | ⏸️ No action
**Notes:** Additional context
```

**No discoveries logged yet.** Discoveries will appear here automatically as Xpansion is used.
