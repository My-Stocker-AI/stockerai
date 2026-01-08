# Claude Code Configuration

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

**MANDATORY EXECUTION TRIGGER:** When context remaining ≤ 10,000 tokens (5% of 200K)

### Execution Sequence

When trigger hits, you MUST:

1. **STOP ALL OTHER WORK** - Do not continue with pending tasks
2. **ANNOUNCE TRIGGER** - Inform user: "Memory preservation protocol triggered at X tokens remaining"

3. **EXTRACT FROM CURRENT CONVERSATION:**
   - Workflow IDs created, modified, or deleted
   - Critical bugs discovered and their root causes
   - Fixes applied and what they resolved
   - Configuration changes that worked/failed
   - "Never do this again" lessons (mistakes, inefficiencies, wrong approaches)
   - New discoveries about the codebase/platform
   - Repeated troubleshooting patterns
   - Any user corrections or frustrations about wasted effort

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

### Failure Protocol

If unable to complete memory preservation:
- Log what you attempted
- Inform user of failure
- Continue conversation but mark it for manual preservation
