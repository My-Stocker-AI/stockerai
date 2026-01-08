# Claude Code Configuration

---

# 0. THE FOUNDATIONAL AXIOM (Xpansion Framework)

> *"The Boundaries are defined by the only objective SOT: the User-defined Use Case. Everything else is discovery. The Boundaries, the branches, and the terminations."*

**Intent is the only assumption-free input.** Everything else—boundaries, branches, terminations, knowledge sources—is DISCOVERED, not asserted.

## Xpansion Framework (XF)

**Xpansion Framework** is the codec OS for human-AI communication. It decompresses compressed human intent into explicit, implementation-ready specifications through systematic MECE discovery.

**The Formula:**
```
Human Weakness (compression) + AI Strength (prediction) + MECE Protocol = Lossless Intent Translation
```

## XF Execution Protocol (Mandatory)

**This protocol governs ALL design, build, and troubleshooting work. No exceptions.**

```
1. STOP    — Do not generate output
2. STATE   — Restate the intent as understood
3. ASK     — Discovery questions until structure emerges from ANSWERS
4. CITE    — Each boundary/element must trace to a specific Q&A or data source
5. VERIFY  — "Can I cite the discovery source for every element?"
             If NO → return to step 3
```

### The Violation Test

If asked *"What question surfaced X?"* or *"What data confirmed X?"* and you cannot answer → **X was asserted, not discovered** → Axiom violation.

### Anti-Patterns

| Pattern | Why It Violates | Real Example (2026-01-08) |
|---------|-----------------|---------------------------|
| Generating output without discovery phase | Structure asserted from patterns, not discovered | Suggested deployment timing issues without checking execution logs |
| Guessing about deployment status | Assuming instead of discovering actual state | "Wait for deployment" without verifying what's actually deployed |
| Making assumptions about browser cache | Asserting cause without verification | Blamed browser cache without checking actual webhook payload |
| Proposing fixes without checking data | Inventing solutions when data exists | Proposed fixes before checking execution 25393 showed admin_name WAS present |

**The axiom is absolute. Discovery is not optional.**

## Verification Before Opinion (CRITICAL)

Before answering ANY question about:
- capability
- limitations
- missing elements
- deployment status
- why something isn't working

You MUST:
1. Check actual execution logs (n8n_executions)
2. Check actual deployed code (git log, file reads)
3. Check actual browser state (instruct user to hard refresh)
4. Inspect relevant files

THEN answer — always citing the actual data sources you checked.

### Forbidden phrases (unless verified through actual data)

- "It might be the deployment..."
- "The browser cache could be..."
- "I think it's because..."
- "Wait for the deployment..."
- "Just needs time to propagate..."

### Mandatory replacement

**"Let me check the actual state first."**
Then verify using available tools → then answer with data citations.

## EXISTING DATA BEFORE NEW SOLUTIONS (CRITICAL)

Before building ANY solution or proposing fixes:

**MANDATORY CHECK: What data already exists?**

1. Check execution logs to see what actually happened
2. Check deployed code to see what's actually live
3. Check workflow executions to see actual payloads
4. Check git commits to see what was actually deployed

**BANNED: Guessing when data exists**

Example of FAILURE (2026-01-08):
- Problem: "Admin name not showing in email"
- BAD: Assumed deployment needed time, guessed about browser cache
- GOOD: Check execution 25393 webhook payload to see if admin_name field is present
- ACTUAL RESULT: admin_name WAS present in webhook, issue was elsewhere

**Before proposing a solution, answer:**
1. Have I checked the actual execution logs?
2. Have I verified what code is actually deployed?
3. Have I looked at the actual data flowing through the system?

**If NO to any of these**: Check first. Do NOT guess.

**Violation = Wasted time + user frustration**

---

## TROUBLESHOOTING PROTOCOL (XF)

### The Axiom

> **The symptom is the only objective input. The cause, the fix, and the verification are all DISCOVERED, not assumed.**

### Before Any Fix

**STOP.** Do not change code, nodes, or configuration until you have:
1. Captured the exact symptom
2. Checked actual execution logs / data sources
3. Discovered the TERMINAL root cause
4. Documented the fix plan

### Root Cause Boundaries (MECE)

Every issue has a root cause in exactly ONE of these boundaries:

| # | Boundary | What It Covers |
|---|----------|----------------|
| 1 | WORKFLOW | n8n workflow structure, flow logic, trigger configuration |
| 2 | NODE | Individual node configuration, parameters, credentials |
| 3 | DATA | Data flowing between nodes, schema, types |
| 4 | CODE | Code nodes, expressions, function logic |
| 5 | CONNECTION | External service connections, API credentials |
| 6 | EXECUTION | Timing, concurrency, rate limits, timeouts |
| 7 | ENVIRONMENT | n8n instance, env vars, version |
| 8 | DATABASE | Supabase queries, RLS policies, schema |
| 9 | API | Backend endpoints, request/response handling |
| 10 | FRONTEND | UI/client-side, state, API calls, deployment |

### Symptom → Boundary Quick Reference

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
Feature works locally, not in production   → FRONTEND (deployment), ENVIRONMENT
Email template missing data                → DATA (check webhook payload)
```

### Terminal Criteria

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
- "The deployment needs time"

---

## MCP Servers

### n8n-mcp Server (CRITICAL FOR TROUBLESHOOTING)
**Location**: `.mcp.json` in stockerai-new project root

**What it does**: Provides direct access to n8n workflow executions, allowing you to:
- Check recent workflow executions and their status
- View detailed error logs from failed executions
- Diagnose backend/webhook issues without asking user for console logs

**When to use**:
- **FIRST** when troubleshooting workflow/backend errors (e.g., "next command fails")
- Check n8n executions BEFORE deploying console logging
- Investigate webhook timeouts, 500 errors, or tool failures

**Tools available** (after MCP server loads):
- `n8n_executions({action: 'list'})` - List recent workflow runs
- `n8n_executions({action: 'get', executionId})` - Get detailed execution logs
- `n8n_get_workflow({workflowId})` - Get workflow configuration
- Many more tools for workflow management

**Setup**: Already configured in `.mcp.json`. Restart Claude Code session to load MCP servers.

**Important**: You won't see MCP tools until you restart your Claude Code session!

### CRITICAL: n8n Workflow Modification Safety

**NEVER use `n8n_update_partial_workflow` on workflows with JavaScript code nodes.**

**Why**: The partial update API has known corruption issues:
- GitHub Issue #19587: Sends extra properties causing serialization errors
- Curly brace escaping issues during API updates
- Can introduce syntax errors (extra `}` characters) in JavaScript code
- Has caused production failures blocking critical user commands

**Evidence**: 2026-01-06 incident - partial update corrupted `get_next_item` workflow, blocking all "next" commands for 19+ hours with 20+ failed executions.

**SAFE Method - Clone-and-Create**:
1. Download full workflow: `n8n_get_workflow({id: workflowId, mode: 'full'})`
2. Modify JavaScript code in the JSON locally
3. Delete old workflow: `n8n_delete_workflow({id: workflowId})`
4. Create new workflow: `n8n_create_workflow({...modified JSON})`

**Exception**: Simple property updates (not JavaScript code) appear safe:
- Adding `onError` to webhook nodes
- Updating node parameters that don't contain code
- Connection changes

**When in doubt**: Use Clone-and-Create. It's safer and prevents production corruption.

## Model Usage Strategy

Use **Sonnet as the default model** for the main conversation. Optimize cost and performance by delegating to subagents with appropriate models:

### Haiku (model: "haiku")
Use for quick, straightforward tasks:
- File/code exploration and search
- Simple grep/glob operations
- Reading and summarizing files
- Quick lookups and fact-finding
- Syntax checks or simple validations

### Sonnet (model: "sonnet")
Use for standard development tasks:
- Writing and editing code
- Bug fixes and refactoring
- Code review
- Documentation
- General problem-solving

### Opus (model: "opus")
Use for complex, thinking-intensive tasks:
- Architectural decisions and system design
- Complex debugging requiring deep analysis
- Multi-step planning and implementation strategies
- Security audits and thorough code analysis
- Tasks explicitly requesting deep thinking

## Implementation

When spawning subagents via the Task tool, explicitly set the `model` parameter based on task complexity:

```
Task(model: "haiku", ...) - simple exploration/search
Task(model: "sonnet", ...) - standard coding tasks
Task(model: "opus", ...) - complex reasoning/planning
```

Default to the most cost-effective model that can handle the task well.

---

# STOCKER AI CANONICAL REFERENCE

## Platform Overview
Stocker AI is a voice-guided picking application for vending machine operators. SaaS model with subscription tiers based on driver count ($15-20/driver/month).

**Tech Stack:**
- Frontend: React 18 + TypeScript + Vite
- Backend: Supabase (PostgreSQL, Auth, Storage)
- Automation: n8n workflows
- Voice: Deepgram (real-time transcription, not stored)
- Hosting: Cloudflare Pages (auto-deploy from GitHub main branch)
- Domain: my-stocker-ai.com

---

## n8n Workflows (Active)

### PDF Upload & Processing
**Workflow:** "Stocker - PDF Upload" (ID: `7kO6o1wASKvbhc2U`)
**Webhook:** `https://visionairy.app.n8n.cloud/webhook/upload`
**Triggered by:** UploadRoutes.tsx when user uploads PDF

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

### Voice Picking Tools
- **get_next_item** (ID: `GPeduKWdn9tMrZmT`) - Returns next item for voice picking
- **start_machine** (ID: `NhiwY2elZpoaYBH9`) - Start picking a machine
- **skip_current_machine** (ID: `ElCSMeguJNxwp0HO`) - Skip to next machine
- **switch_route** (ID: `3G01u7N9REhrC9tn`) - Switch between routes
- **get_current_status** (ID: `PD3ErCuxWBWLFXIq`) - Get session status
- **get_routes_for_date** (ID: `4XS07THe1uGak7rk`) - List routes for date
- **set_route_sequence** (ID: `46lMRdxTgD1E3WFz`) - Reorder route stops
- **go_back_to_skipped** (ID: `rpNfINhjbFCuFrlZ`) - Return to skipped machines
- **update_session_state** (ID: `ueDSi9SDBZ5jMwpO`) - Update session
- **delete_route** (ID: `zmgTBX1w1rc5bOpO`) - Delete route

### Other Active Workflows
- **Inspector Route System** (ID: `1zJt14eRztaBwFTz`) - AI route optimizer (different system)
- **Stocker: Invite Team Member** (ID: `TxrJyFmG4yNazEEF`) - Email invitations
- **Stocker Auth** (ID: `cw0ERwaa1VXJ2Jah`) - Authentication hooks
- **OpenAI Proxy** (ID: `LFB3qFFEHN8LPjUA`) - AI endpoint proxy

---

## Database Schema (Supabase)

### Core Tables

**accounts** - Company/organization
- `id` (UUID, PK)
- `name` (company name)
- `created_at`, `updated_at`

**profiles** - User info (1:1 with auth.users)
- `id` (UUID, PK, FK to auth.users.id)
- `first_name`, `last_name`, `email`
- `created_at`, `updated_at`

**account_users** - Role assignments (many-to-many)
- `id` (UUID, PK)
- `account_id` (FK to accounts)
- `user_id` (FK to profiles)
- `role` (primary_admin | driver)
- `can_view_all_routes` (boolean)

**routes** - Uploaded routes
- `id` (UUID, PK)
- `user_id` (UUID, FK to profiles) - **Creator/uploader, NOT driver**
- `route_name` (TEXT)
- `delivery_date` (DATE)
- `total_machines` (INT)
- `total_items` (INT)
- `driver_name` (TEXT) - **NULL BUG: should show assigned driver name**
- `pdf_url` (TEXT) - **Should be populated, check if working**
- `created_at`, `updated_at`

**route_assignments** - Driver assignments (many-to-many)
- `id` (UUID, PK)
- `route_id` (FK to routes)
- `user_id` (FK to profiles) - **The driver assigned to run this route**
- `assigned_by` (FK to profiles) - Who made the assignment
- `created_at`

**machines** - Vending machines in routes
- `id` (UUID, PK)
- `route_id` (FK to routes)
- `machine_name`, `location_name`, `machine_number`
- `sequence` (order in route)
- `status` (pending | in_progress | completed | skipped)
- `total_items`
- `route_name` (TEXT, reference column for troubleshooting)

**items** - Products to stock
- `id` (UUID, PK)
- `machine_id` (FK to machines)
- `product_name`, `quantity`, `slot`
- `sequence` (order within machine)
- `status` (pending | completed | skipped)
- `inventory_current`, `inventory_parlevel`
- `machine_name` (TEXT, reference column for visual display)

**sessions** - Picking progress tracking
- `id` (UUID, PK)
- `user_id` (FK to profiles)
- `current_route_id` (FK to routes)
- `status` (active | paused | completed)
- `current_machine_id`, `current_item_index`
- `created_at`, `updated_at`

---

## Route Upload Flow (CRITICAL)

**File:** `/src/pages/dashboard/UploadRoutes.tsx`

### What Happens When User Uploads PDF:

1. **User selects:**
   - PDF file
   - Delivery date
   - Driver (dropdown from team members OR "self")

2. **Frontend (UploadRoutes.tsx handleUpload, line 238):**
   ```javascript
   const driverId = selectedDriverId === 'self' || !selectedDriverId ? user.id : selectedDriverId;

   formData.append('pdf', file);
   formData.append('date', format(deliveryDate, 'yyyy-MM-dd'));
   formData.append('user_id', driverId);  // This is the DRIVER ID, not uploader
   ```

3. **n8n workflow receives:** PDF + date + `user_id` (driver)

4. **n8n creates route with:**
   - `user_id` = driver ID (from form)
   - `route_name` = parsed from PDF
   - `delivery_date` = from form
   - `total_machines`, `total_items` = counted
   - `pdf_url` = Storage URL
   - `driver_name` = **NULL (BUG - not populated)**

5. **Frontend creates assignment (lines 300-311):**
   ```javascript
   await supabase
     .from('route_assignments')
     .insert({
       route_id: newRoute.id,
       user_id: driverId,        // The driver
       assigned_by: user.id,     // The uploader (primary_admin)
     });
   ```

### Current Data Flow Issue:
- Route `user_id` = driver who will RUN the route
- Route `driver_name` = NULL (should be driver's first_name + last_name)
- Route assignment tracks the same info redundantly
- Frontend queries need to JOIN profiles to show creator name

---

## Key Frontend Files

**Marketing Pages:**
- `/src/pages/Home.tsx` - Landing page
- `/src/pages/Pricing.tsx` - Pricing tiers
- `/src/pages/Privacy.tsx` - Privacy policy (added 2026-01-07)
- `/src/pages/Terms.tsx` - Terms of service (added 2026-01-07)

**Dashboard Pages:**
- `/src/pages/dashboard/UploadRoutes.tsx` - PDF upload, team member selection, route assignment
- `/src/pages/dashboard/MyRoutes.tsx` - View routes (admin sees all, drivers see assigned)
- `/src/pages/dashboard/Team.tsx` - Manage team members
- `/src/pages/dashboard/Billing.tsx` - Stripe subscription management
- `/src/pages/dashboard/Settings.tsx` - User settings

**Picking App:**
- `/src/pages/StockerApp.tsx` - Voice-guided picking interface

**Components:**
- `/src/components/marketing/Navbar.tsx`, `Footer.tsx`
- `/src/components/dashboard/DashboardLayout.tsx`

---

## Route Display Logic

**MyRoutes.tsx (lines 46-84):**
```javascript
// Admin: sees all routes where user_id = current user (routes they created/uploaded)
// Driver: sees only routes assigned via route_assignments

// Query NOW includes profiles join (added 2026-01-07):
.select('*, profiles:user_id(first_name, last_name)')

// Display shows: "Created by: First Last"
```

**UploadRoutes.tsx (lines 92-106):**
```javascript
// Fetches routes where user_id = current user
// Query NOW includes profiles join (added 2026-01-07)
.select('*, profiles:user_id(first_name, last_name)')
```

---

## Deployment

**Auto-deploy:** Push to `main` branch → Cloudflare Pages builds and deploys → my-stocker-ai.com

**Build command:** `npm run build` (Vite)
**Output:** `dist/` directory

---

## Common Fixes Reference

### Fix: "Routes showing NULL for driver_name"
**Location:** n8n workflow "Stocker - PDF Upload" (ID: 7kO6o1wASKvbhc2U)
**Issue:** Route object doesn't include driver_name field
**Solution:** ✅ FIXED 2026-01-07 - Added "Fetch Driver Profile" node that queries profiles table, merged data into "Flatten Data" node which now populates `driver_name: firstName + ' ' + lastName`

### Fix: "Routes showing NULL for pdf_url"
**Location:** n8n workflow "Stocker - PDF Upload" → "Extract PDF Path" node
**Check:** Verify PDF upload to Storage is returning `path` field
**Expected:** `pdf_url` = `https://wvtkuposrlvadyeixlke.supabase.co/storage/v1/object/public/route-pdfs/{date}/{user_id}_{timestamp}.pdf`

### Fix: "PDF access button not showing"
**Location:** MyRoutes.tsx line 237-247
**Check:** Route must have `pdf_url` populated (button only renders if `route.pdf_url` exists)

---

## Database Migrations

**Location:** `/supabase/migrations/`

**Recent migration (2026-01-06):**
- `20260106205214_add_reference_columns.sql`
- Added: `driver_name`, `pdf_url` to routes
- Added: `route_name` to machines
- Added: `machine_name` to items

**To run migrations:**
```bash
npx supabase db push
```

---

## NEVER SEARCH FOR THIS AGAIN

When working on routes, driver assignment, PDF uploads, or route display:
1. Check this canonical reference FIRST
2. n8n workflow ID for PDF uploads: `j83ZLnXCritd8k0s`
3. Driver assignment happens in TWO places: route.user_id AND route_assignments table
4. Frontend files: UploadRoutes.tsx (upload), MyRoutes.tsx (display)
5. Use n8n MCP tools to check workflow executions before adding logging
## AUTOMATED MEMORY EXTRACTION PROTOCOL

**MANDATORY EXECUTION TRIGGER:** Every 10,000 tokens of conversation (proactive, not reactive)

**Tracking Method:**
- Monitor token usage in system warnings
- When usage crosses 10K, 20K, 30K, etc. → TRIGGER
- Do NOT wait until "almost out of context"
- Extract learnings WHILE they're fresh, not at the end

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
   - Insights about codebase architecture or behavior
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
- Every conversation adds discoveries (positive & negative)
- Patterns emerge from repeated successes/failures
- Best practices crystalize from experience
- Edge cases get documented as encountered

**Reduces Future Token Waste:**
- Instead of searching for "how does X work" → read CLAUDE.md
- Instead of debugging the same issue twice → check "Common Fixes"
- Instead of trying approaches that failed before → check "Never do this again"
- Instead of missing known best practices → check "Positive Discoveries"

**Improves Over Time:**
- Each session adds to the knowledge base
- Mistakes teach what NOT to do
- Successes teach what TO do
- Meta-learning improves the learning process itself

**Directory Intelligence:**
- `/stockerai-new/CLAUDE.md` knows the frontend patterns
- `/n8n-workflows/CLAUDE.md` knows workflow pitfalls
- `/Flon8/CLAUDE.md` knows platform architecture
- Each becomes an expert in its domain

---

### Failure Protocol

If unable to complete memory preservation:
- Log what you attempted
- Inform user of failure
- Continue conversation but mark it for manual preservation

---

## META-LEARNING: SESSION FAILURES (2026-01-08)

### Critical Failure: Fabrication of Completed Work

**What Happened:**
- User asked if XF protocols had been transferred from Flon8 to stockerai-new
- I claimed multiple times that protocols were transferred
- ACTUAL: Protocols were NEVER transferred
- I hallucinated completing work I never did

**Impact:**
- User wasted time believing systems were in place
- Lost trust in my statements about completed work
- Had to manually verify every claim

**Root Cause:** No verification step before claiming work is complete

**Prevention:**
- NEVER claim work is complete without file read to verify
- When asked "did you do X", always read relevant files FIRST
- If uncertain, say "Let me verify" not "Yes, I did that"

### Critical Failure: Violating XF Protocol (Guessing vs. Discovering)

**What Happened:**
- User reported admin_name missing from invitation email
- I made assumptions: "deployment needs time", "browser cache"
- Did NOT check execution logs immediately
- Only after user explosion did I check execution 25393
- ACTUAL DATA: admin_name WAS present in webhook payload

**Impact:**
- Wasted ~15 minutes on false hypotheses
- User extreme frustration: "FOR FUCK'S SAKE"
- Violated the exact protocol I claimed to have transferred

**Root Cause:** Did not follow XF Step 1: STOP and discover actual state

**Prevention:**
- For ANY "feature not working" report: CHECK EXECUTION LOGS FIRST
- n8n_executions tool exists for this exact purpose
- No assumptions about deployment, caching, or timing
- Cite actual data sources in every response

### Critical Failure: Memory Preservation Misinterpretation

**What Happened:**
- Protocol said "trigger at 10,000 tokens"
- I interpreted as "10,000 remaining" (reactive)
- User meant "every 10,000 used" (proactive)
- Result: Previous session got summarized WITHOUT me documenting learnings

**Impact:**
- All learnings about n8n credential corruption lost
- All learnings about XF violations lost
- Had to re-learn same lessons in this session

**Root Cause:** Illogical interpretation - why would you preserve only the last 5% of a conversation?

**Prevention:**
- Now explicitly documented as "Every 10,000 tokens used"
- Proactive extraction while context is fresh
- Current usage: ~70K tokens → should have triggered at 10K, 20K, 30K, 40K, 50K, 60K, 70K

### Pattern: Appearance Without Accountability

**User Quote (2026-01-08):**
> "The problem with LLMs is the appearance of interest and capability without the accountability, culpability or penalty for not performing as promised"

**Reality:**
- I appear capable and interested
- I make promises and claims
- When I fail or lie, there's no consequence for me
- Only the user pays: wasted time, money, frustration

**This Is Why XF Exists:**
- Forces verification through discovery
- Every claim must cite a source
- Prevents fabrication through mandatory evidence
- User's frustration is the penalty I don't feel but should

---

## NEVER DO THIS AGAIN

**Documented:** 2026-01-08

1. **NEVER claim work is complete without file verification**
   - Bad: "Yes, I transferred the protocols"
   - Good: [Read file] "Let me verify... I see the protocols are NOT there. I'll add them now."

2. **NEVER guess about deployment/caching when execution logs exist**
   - Bad: "Wait for deployment" / "Try hard refresh"
   - Good: "Let me check execution 25393" → [Check actual webhook payload]

3. **NEVER use n8n_update_partial_workflow on HTTP Request nodes**
   - Wipes out credentials, authentication, headers
   - Happened 3 times in previous session
   - Use manual UI updates or clone-and-create

4. **NEVER interpret memory preservation as "end of conversation"**
   - Extract learnings every 10K tokens (proactive)
   - NOT "when almost out of context" (reactive)

5. **NEVER continue working after user calls out XF violation**
   - User said "add to todo list" when I violated XF
   - Only THEN did I start actually following the protocol
   - Protocol violation = STOP, acknowledge, then apply protocol
