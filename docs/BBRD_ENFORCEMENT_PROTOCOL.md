# BBRD ENFORCEMENT PROTOCOL

**Status:** DRAFT - Proposed additions to CLAUDE.md
**Purpose:** Prevent BBRD violations through systematic enforcement, not just documentation
**Context:** Created after 4 consecutive API migration failures (OpenAI → Claude Haiku) that violated boundary verification protocols

---

## 0. The Problem

**Current State:** BBRD exists as documentation and guidance. Violations occur because:
1. No mechanism forces boundary detection before implementation
2. No mechanism requires contract verification before deployment
3. User override requires explicit rejection, not explicit acceptance
4. Cross-boundary changes feel like "parameter changes" without triggering BBRD analysis

**Failure Pattern:**
```
User says "do it" → AI implements immediately → Error → Fix → Error → Fix → Error...
                    ↑
                    BBRD should have intervened HERE
```

**Root Cause:** BBRD is REACTIVE (analyze after failure) not PROACTIVE (prevent failure).

---

## 1. Automatic Boundary Change Detection

### 1.1 Trigger Patterns (HIGH-RISK ACTIONS)

Before executing ANY of these actions, Claude MUST output boundary detection analysis:

| Action Type | Examples | Why High-Risk |
|-------------|----------|---------------|
| **API Integration Changes** | Switching OpenAI → Claude, Deepgram upgrades, new endpoints | Different APIs have different contracts (tool formats, auth, response schemas) |
| **Database Schema Modifications** | ALTER TABLE, foreign key changes, RLS policy edits | Cascades affect multiple boundaries downstream |
| **n8n Workflow Updates** | Adding nodes, changing credentials, modifying webhooks | Workflows sit between 3+ boundaries (frontend, DB, external APIs) |
| **Authentication/Credential Changes** | New API keys, auth method switches, RLS changes | Breaks connections if contracts not verified |
| **Data Format Transformations** | JSON schema changes, field renaming, type conversions | Upstream/downstream code expects specific formats |

### 1.2 Detection Protocol

**MANDATORY OUTPUT before implementation:**

```markdown
🚨 BOUNDARY CHANGE DETECTED

Boundary Type: [API | DATABASE | WORKFLOW | FRONTEND | DATA_FORMAT]
Specific Change: [Detailed description]

Upstream Boundary:
  - Component: [What sends data TO this change]
  - Output Contract: [What format/schema it produces]
  - Verification: [✓ Tested | ❌ Not Tested | ⚠️ Assumed]

Downstream Boundary:
  - Component: [What receives data FROM this change]
  - Input Contract: [What format/schema it expects]
  - Verification: [✓ Tested | ❌ Not Tested | ⚠️ Assumed]

Cross-Boundary Impact:
  - [List all OTHER boundaries that could be affected]
  - [E.g., "Frontend expects OpenAI format, now receiving Claude format"]

Risk Level: [LOW | MEDIUM | HIGH | CRITICAL]

BBRD Recommendation:
  - [ ] Enter Plan Mode to map full boundary chain
  - [ ] Query live data to verify contracts
  - [ ] Create isolated test before production deployment
  - [ ] OR: User explicitly accepts risk
```

### 1.3 Automatic Trigger Examples

#### Example 1: API Migration
```
USER: "Switch from GPT-4o-mini to Claude Haiku"

CLAUDE OUTPUT (BEFORE any tool use):
🚨 BOUNDARY CHANGE DETECTED

Boundary Type: API
Specific Change: AI provider switch (OpenAI → Anthropic)

Upstream Boundary:
  - Component: n8n workflow "Prepare Request"
  - Output Contract: OpenAI chat completion format
    - messages: [{ role, content }]
    - tools: [{ type: "function", function: {...} }]
    - model: "gpt-4o-mini"
  - Verification: ❌ Not Tested (different API contract)

Downstream Boundary:
  - Component: n8n workflow "Transform Response" + Frontend
  - Input Contract: OpenAI response format
    - choices[0].message.content
    - choices[0].message.tool_calls[]
  - Verification: ❌ Not Tested (response format differs)

Cross-Boundary Impact:
  - WORKFLOW boundary: Tool format incompatible (OpenAI vs Claude)
  - DATA boundary: Response schema different
  - FRONTEND boundary: Expects OpenAI format JSON

Risk Level: CRITICAL

BBRD Recommendation:
  - [✓] Enter Plan Mode to map full boundary chain
  - [✓] Query n8n workflow structure to identify transformation nodes
  - [✓] Create API format comparison document
  - [ ] OR: User explicitly accepts risk

❓ USER CHOICE REQUIRED:
1. Enter Plan Mode (verify all contracts before implementation)
2. Accept Risk (implement now, user handles failures)

Which do you choose?
```

#### Example 2: Database Schema Change
```
USER: "Add cascade delete to foreign keys"

CLAUDE OUTPUT (BEFORE any SQL execution):
🚨 BOUNDARY CHANGE DETECTED

Boundary Type: DATABASE
Specific Change: Foreign key constraint modification (ON DELETE CASCADE)

Upstream Boundary:
  - Component: Frontend delete button + n8n delete workflow
  - Output Contract: DELETE FROM routes WHERE id = ?
  - Verification: ✓ Tested (current behavior exists)

Downstream Boundary:
  - Component: machines, items, sessions tables
  - Input Contract: Currently expects manual cleanup OR orphaned records
  - Verification: ❌ Not Tested (cascade behavior NEW)

Cross-Boundary Impact:
  - DATABASE boundary: Orphaned session records may reference null route_id
  - FRONTEND boundary: UI may show stale data if not refreshed
  - WORKFLOW boundary: No notification to active sessions about deleted route

Risk Level: HIGH

BBRD Recommendation:
  - [✓] Query live database for current foreign key constraints
  - [✓] Check if any sessions reference routes about to cascade
  - [✓] Run pre-test query, execute delete, run post-test query
  - [ ] OR: User explicitly accepts risk

❓ USER CHOICE REQUIRED:
1. Verify Contracts (query live DB, test cascade in isolation)
2. Accept Risk (apply CASCADE now, user handles orphans)

Which do you choose?
```

---

## 2. Mandatory Verification Checklist

### 2.1 The Three Gates

Every boundary change MUST pass through these gates in sequence:

```
┌──────────────────────────────────────────────────────────┐
│ GATE 1: BOUNDARY DETECTION                               │
│ - Identify what's changing                               │
│ - Map upstream/downstream contracts                      │
│ - Assess cross-boundary impact                           │
│ OUTPUT: Boundary change alert (see 1.2)                  │
└──────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│ GATE 2: CONTRACT VERIFICATION                            │
│ - Query live data (not assumptions)                      │
│ - Test input → transformation → output                   │
│ - Identify mismatches between actual vs expected         │
│ OUTPUT: Contract verification report                     │
└──────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│ GATE 3: ISOLATED TESTING                                 │
│ - Test in isolation (not production)                     │
│ - Verify no unintended side effects                      │
│ - Document rollback procedure                            │
│ OUTPUT: Test results + deployment approval               │
└──────────────────────────────────────────────────────────┘
```

**ONLY AFTER passing all 3 gates → IMPLEMENT**

### 2.2 Contract Verification Report Template

After GATE 2, output:

```markdown
📋 CONTRACT VERIFICATION REPORT

Boundary: [Name]
Date: [YYYY-MM-DD HH:MM]

UPSTREAM CONTRACT (What we receive):
  Format: [Schema/structure]
  Source: [Live query result OR tool output]
  Status: [✓ Matches expectations | ❌ MISMATCH | ⚠️ Partial]

DOWNSTREAM CONTRACT (What we must produce):
  Format: [Schema/structure]
  Destination: [Live query result OR tool output]
  Status: [✓ Matches expectations | ❌ MISMATCH | ⚠️ Partial]

MISMATCHES IDENTIFIED:
  1. [Specific field/format difference]
  2. [Specific field/format difference]

TRANSFORMATION REQUIRED:
  - [Specific code/logic needed to bridge contracts]

VERIFICATION METHOD:
  - [How contracts were verified - live query, test execution, etc.]

NEXT STEP: [Proceed to GATE 3 | FIX mismatches | ABORT]
```

### 2.3 Testing Report Template

After GATE 3, output:

```markdown
🧪 BOUNDARY CHANGE TEST RESULTS

Test Environment: [Isolated | Staging | Production]
Test Date: [YYYY-MM-DD HH:MM]

PRE-TEST STATE:
  - [Captured current behavior/data]

TEST EXECUTION:
  - [What was changed/tested]

POST-TEST STATE:
  - [Resulting behavior/data]

BOUNDARIES AFFECTED:
  - [List of boundaries that actually changed]

UNEXPECTED SIDE EFFECTS:
  - [None | List specific issues]

ROLLBACK PROCEDURE:
  - [How to undo if deployed and fails]

RESULT: [✓ PASS - Safe to deploy | ❌ FAIL - Do not deploy | ⚠️ PARTIAL - Deploy with monitoring]

DEPLOYMENT APPROVAL: [Waiting for user | Approved by test | Rejected]
```

---

## 3. User Override Mechanism

### 3.1 Explicit Risk Acceptance

Users can skip BBRD gates, but ONLY by explicitly accepting risk:

**WRONG (current behavior):**
```
USER: "do it"
CLAUDE: *implements immediately without BBRD check*
```

**RIGHT (enforced behavior):**
```
USER: "do it"

CLAUDE:
🚨 BOUNDARY CHANGE DETECTED
[Full boundary analysis output]

❓ This requires boundary verification. Choose:
1. Verify Contracts First (recommended - enter plan mode)
2. Accept Risk & Implement Now (I am responsible for failures)

USER must explicitly say: "Accept risk" or "Verify first"
```

### 3.2 Risk Acceptance Documentation

When user chooses "Accept Risk", Claude MUST:

1. **Document the decision** in MEMORY.md:
```markdown
## Risk Acceptance Log

Date: 2026-01-05
Change: API migration OpenAI → Claude Haiku
Boundaries Affected: API, WORKFLOW, DATA, FRONTEND
User Choice: Accept Risk (skip verification)
Rationale: [User's stated reason OR "None provided"]
Responsibility: User accepted responsibility for failures
```

2. **Output warning**:
```
⚠️ RISK ACCEPTED - Implementing without boundary verification

You have chosen to skip contract verification. I will implement the change now.

IMPORTANT:
- If errors occur, they are expected (boundaries not verified)
- Fixes may require multiple iterations
- Rollback procedure: [How to undo]

Proceeding with implementation...
```

### 3.3 When Override is Appropriate

Users SHOULD accept risk when:
- Rapid prototyping / experimental feature
- User has deep technical knowledge of the boundaries involved
- Time-critical fix for production outage
- Verified contracts manually outside Claude Code

Users should NOT accept risk when:
- Production system with active users
- Unfamiliar with the codebase
- No rollback plan exists
- Change affects critical path (payments, auth, data integrity)

---

## 4. Integration with CLAUDE.md

### 4.1 Where This Fits

**Proposed Location:** Between Section 0 (SOURCE OF TRUTH) and Section 1 (PROJECT IDENTITY)

**Reasoning:** BBRD enforcement is MORE FUNDAMENTAL than project identity. It governs HOW Claude operates, not WHAT Claude is building.

### 4.2 Updates to Existing Sections

**Section 0.1 (Trusted vs Untrusted Sources):**
- Add: "Live contract verification results (from GATE 2)" to "Can Trust"
- Add: "Assumed API contracts" to "NEVER Trust"

**Section 5.7 (Fix Specification Template):**
- Add mandatory field: "BBRD Gates Passed: [1, 2, 3] OR Risk Accepted: [YES]"

**Section 5.8 (Systematic Testing Protocol):**
- Reference: "This protocol IS Gate 3 of BBRD Enforcement"

---

## 5. Enforcement Mechanisms (How This Actually Works)

### 5.1 Trigger Detection

Claude detects boundary changes by:

1. **Pattern matching on user requests:**
   - Keywords: "switch to", "migrate", "change API", "update workflow", "add cascade"
   - Tool patterns: n8n_update_workflow, n8n_create_workflow, Edit (for integration files), Bash (for schema migrations)

2. **File path heuristics:**
   - `/src/hooks/use*API.ts` → API integration
   - `/database/*.sql` → Database schema
   - n8n workflow IDs → Workflow boundary
   - `*credentials*` → Connection boundary

3. **Context from conversation:**
   - If discussing multiple components in last 3 messages → cross-boundary change
   - If user mentioned "doesn't work" after recent change → symptomatic debugging (anti-BBRD)

### 5.2 Forcing Functions

**Forcing Function:** A mechanism that makes the right behavior easier than the wrong behavior.

**Current Problem:** Implementing without BBRD is EASIER (faster, fewer steps) than following BBRD.

**Solution:** Make BBRD detection AUTOMATIC, not optional.

**Implementation:**
1. **Before ANY n8n workflow update:** Check if change crosses boundaries → Output detection alert → Require user choice
2. **Before ANY Edit/Write to integration files:** Scan for API changes → Output detection alert → Require user choice
3. **Before ANY database migration:** Query live foreign keys → Output detection alert → Require user choice

**If detection alert is skipped:**
- Claude has violated protocol
- User should respond: "BBRD this" (triggers retrospective analysis)

### 5.3 State Machine Implementation

**BBRD as Conversation State:**

```
┌─────────────────┐
│  NORMAL MODE    │
└────────┬────────┘
         │ User requests change
         ↓
    [Boundary Detected?]
         │
    YES ─┼─ NO → [Implement normally]
         ↓
┌─────────────────────────┐
│  GATE 1: DETECTION      │
│  Output: Boundary alert │
└────────┬────────────────┘
         │
         ↓
    [User Choice?]
         │
"Accept Risk" ─┼─ "Verify First"
         │              │
         │              ↓
         │     ┌─────────────────────┐
         │     │ GATE 2: VERIFY      │
         │     │ Query live contracts│
         │     └──────────┬──────────┘
         │                │
         │                ↓
         │        [Contracts Match?]
         │                │
         │          YES ──┼── NO → [FIX mismatches, re-verify]
         │                ↓
         │       ┌─────────────────────┐
         │       │ GATE 3: TEST        │
         │       │ Isolated validation │
         │       └──────────┬──────────┘
         │                  │
         │                  ↓
         │           [Tests Pass?]
         │                  │
         │            YES ──┼── NO → [Report failure, rollback]
         │                  │
         └─────────┬────────┘
                   ↓
          ┌──────────────────┐
          │  IMPLEMENT       │
          └──────────────────┘
```

**Key Insight:** User can skip gates, but Claude CANNOT skip gate detection.

---

## 6. Limitations & Open Questions

### 6.1 What This CAN Prevent

✅ Implementing API changes without checking tool format compatibility
✅ Deploying database migrations without testing cascades
✅ Modifying workflows without verifying upstream/downstream contracts
✅ "Do it" requests that skip verification

### 6.2 What This CANNOT Prevent

❌ Claude misidentifying a boundary change (detection failure)
❌ Claude incorrectly verifying a contract (verification error)
❌ User saying "Accept Risk" for every change (override abuse)
❌ Subtle logic errors that don't cross boundaries

### 6.3 Open Questions for User

1. **Override abuse:** If user always says "Accept Risk", enforcement fails. How to handle?
   - Option A: Warn after 3 consecutive risk acceptances
   - Option B: Require rationale when accepting risk
   - Option C: Trust user judgment (no intervention)

2. **False positives:** If Claude detects boundaries when none exist, user gets annoyed. How to tune sensitivity?
   - Option A: Only trigger on HIGH-RISK actions (API, DB, credentials)
   - Option B: Trigger on all boundaries, but allow quick "Not a boundary" override
   - Option C: Learn from user feedback over time

3. **Performance impact:** BBRD gates add conversation steps. Is this acceptable?
   - Tradeoff: Slower implementation vs fewer failures
   - User preference: Speed or reliability?

4. **Partial verification:** What if Gate 2 shows contracts match, but Gate 3 test fails?
   - Does this indicate contract verification was incomplete?
   - Should we require re-verification?

---

## 7. Next Steps: Implementation

### 7.1 Immediate Actions

1. **Add to CLAUDE.md:** Insert BBRD Enforcement Protocol as new section after Section 0
2. **Update MEMORY.md:** Add "BBRD Enforcement Status: ACTIVE" to session protocol
3. **Test with next boundary change:** Next time user requests API/DB/workflow change, use this protocol

### 7.2 Iteration Plan

**Week 1:** Manual enforcement (Claude outputs detection alerts, user feedback on false positives)
**Week 2:** Refine trigger patterns based on real usage
**Week 3:** Formalize state machine (explicit BBRD mode vs normal mode)
**Week 4:** Retrospective - did enforcement reduce failures?

### 7.3 Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **Boundary changes detected** | 100% of API/DB/workflow changes | Count detection alerts vs actual changes |
| **Verification completed before deploy** | >80% (allowing risk acceptance) | Count Gate 2+3 completions vs total changes |
| **Failures after boundary change** | <1 per change (down from 4 in Claude Haiku case) | Count errors requiring fixes after deployment |
| **User satisfaction** | User reports fewer "come back" iterations | Qualitative feedback |

---

## 8. Appendix: Case Study - Claude Haiku Migration

**What Happened:**
- User said "do it" to switch from GPT-4o-mini to Claude Haiku
- Claude implemented immediately without BBRD gates
- 4 consecutive errors requiring fixes:
  1. Tool format incompatibility (OpenAI vs Claude)
  2. Workflow configuration lost (URL cleared, expression broken)
  3. HTTP method changed to GET instead of POST
  4. Invalid model name (guessed wrong)

**What SHOULD Have Happened (with enforcement):**

```
USER: "do it"

CLAUDE: 🚨 BOUNDARY CHANGE DETECTED
[Full analysis from Example 1 in Section 1.3]

❓ Choose: 1) Verify Contracts First  2) Accept Risk

USER: "Verify first"

CLAUDE: Entering Plan Mode...

[GATE 1 - Detection: Complete ✓]
[GATE 2 - Verification:]
  - Reading current n8n workflow structure
  - Comparing OpenAI vs Claude API docs
  - Identifying tool format mismatch
  - Identifying response format mismatch

📋 CONTRACT VERIFICATION REPORT
Upstream Contract: OpenAI request format (messages, tools)
Downstream Contract: OpenAI response format (choices, tool_calls)

MISMATCHES IDENTIFIED:
1. Tool format: OpenAI uses {type:"function",function:{...}}, Claude uses {name,input_schema}
2. Response format: OpenAI uses choices[].message, Claude uses content[]
3. Model name: Must verify correct Claude model ID from docs

TRANSFORMATION REQUIRED:
- Request transformation: Convert OpenAI tools → Claude tools
- Response transformation: Convert Claude content → OpenAI format
- Model name: Query Anthropic docs for correct ID

NEXT STEP: Proceed to GATE 3 (create isolated test workflow)

[GATE 3 - Testing:]
  - Creating test n8n workflow
  - Sending sample request with tools
  - Verifying response transforms correctly
  - Testing: SUCCESS ✓

🧪 TEST RESULTS: PASS - Safe to deploy

Deployment approved. Implementing changes to production workflow...

[Implementation succeeds on first try - no errors]
```

**Outcome Comparison:**

| Metric | Without Enforcement | With Enforcement |
|--------|---------------------|------------------|
| Time to working solution | ~45 minutes (4 iterations) | ~20 minutes (1 iteration) |
| Errors encountered | 4 | 0 |
| User frustration | High ("repeated come backs") | Low (progress visible) |
| Learning captured | Reactive (after failure) | Proactive (before failure) |

---

**END OF DOCUMENT**
