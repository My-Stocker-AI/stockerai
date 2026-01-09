# BBRD Troubleshooting Protocol

## Purpose

A systematic protocol for diagnosing and resolving platform issues using BBRD principles. This protocol treats **observed symptoms as intent** and discovers root causes through MECE decomposition rather than assumption-based guessing.

---

## The Troubleshooting Axiom

> *"The symptom is the only objective input. The cause, the fix, and the verification are all DISCOVERED, not assumed."*

**What this means:**
- Do NOT guess causes based on "what usually breaks"
- Do NOT apply fixes without understanding what's actually wrong
- Do NOT assume a fix worked without verification

---

## The Protocol

### Phase 0: Symptom Capture (The Intent)

Before doing anything else, capture the symptom precisely:

```
SYMPTOM CAPTURE
===============
What is happening:     [Exact observable behavior]
What should happen:    [Expected behavior]
When it started:       [Timestamp or triggering event]
Frequency:             [Always | Sometimes | Once]
Affected scope:        [Specific component | System-wide]
```

**Critical:** The symptom description must be CONCRETE, not vague.

| Wrong | Right |
|-------|-------|
| "It's slow" | "API response time is 8s, should be <500ms" |
| "It's broken" | "Login button returns 500 error on click" |
| "It keeps failing" | "Job X fails at step 3 with OOM error every 4th run" |

---

### Phase 1: Boundary Detection (MECE Cause Categories)

Decompose potential causes into MECE boundaries. **Every cause must fit exactly one boundary.**

#### Standard Troubleshooting Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                    ROOT CAUSE BOUNDARIES                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. CODE           Has the code logic changed or been wrong?    │
│     └─ Recent changes, existing bugs, logic errors              │
│                                                                 │
│  2. DATA           Is the input/state data causing issues?      │
│     └─ Corrupt data, edge cases, missing data, bad format       │
│                                                                 │
│  3. DEPENDENCIES   Are external dependencies failing?           │
│     └─ APIs, databases, services, libraries, packages           │
│                                                                 │
│  4. ENVIRONMENT    Is the runtime environment misconfigured?    │
│     └─ Env vars, permissions, resources, versions               │
│                                                                 │
│  5. TIMING         Is there a race condition or timeout?        │
│     └─ Concurrency, async, rate limits, deadlocks               │
│                                                                 │
│  6. CONFIGURATION  Are settings/configs incorrect?              │
│     └─ Feature flags, thresholds, credentials, paths            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Phase 2: Recursive Discovery (Find Root Cause)

For each boundary, ask discovery questions until you reach a **terminal answer**.

#### Discovery Algorithm

```
FOR each boundary IN relevant_boundaries:

    ASK: "Could this boundary contain the cause?"

    IF answer is NO with evidence:
        ELIMINATE boundary
        RECORD: Why eliminated

    IF answer is YES or UNKNOWN:
        DRILL deeper with sub-questions
        REPEAT until TERMINAL
```

#### Terminal Criteria for Root Cause

A root cause is TERMINAL when ALL are true:

| Criterion | Test |
|-----------|------|
| CONCRETE | You can point to a specific line, value, or component |
| REPRODUCIBLE | You can trigger the symptom by manipulating this cause |
| SINGULAR | Fixing this ONE thing would resolve the symptom |
| VERIFIABLE | You can prove it's fixed after the change |

#### Non-Terminal Signals (Keep Drilling)

If your "root cause" has any of these, it's NOT terminal:

- "Something is wrong with..." (vague)
- "It might be..." (uncertain)
- "The [X] system" (too broad)
- "A configuration issue" (which config? which value?)
- "It's probably..." (guessing)

---

### Phase 3: Discovery Questions by Boundary

#### 1. CODE Boundary

```
Q1: What code paths does this symptom touch?
    → List specific files, functions, lines

Q2: When was this code last changed?
    → git log / git blame to identify recent changes

Q3: Does the code handle this case?
    → Read the actual code, don't assume

Q4: What does the code expect vs what it receives?
    → Add logging, inspect actual values

TERMINAL: "Line X in file.py expects string, receives None from [source]"
```

#### 2. DATA Boundary

```
Q1: What is the actual data at point of failure?
    → Log/print the exact values

Q2: Is this data valid according to the schema?
    → Check against expected format

Q3: Where does this data originate?
    → Trace back to source

Q4: Has this data shape changed recently?
    → Compare against working examples

TERMINAL: "Record ID 12345 has null in required field 'user_id'"
```

#### 3. DEPENDENCIES Boundary

```
Q1: What external calls does this code path make?
    → List all APIs, DBs, services

Q2: Are those dependencies responding?
    → Health checks, test calls

Q3: Are responses in expected format?
    → Log actual responses

Q4: Have dependency versions changed?
    → Check package.json, requirements.txt, lock files

TERMINAL: "Supabase API returns 429 rate limit at 100 req/min"
```

#### 4. ENVIRONMENT Boundary

```
Q1: What environment is this running in?
    → Dev/staging/prod, container/VM/local

Q2: Are required env vars set and correct?
    → Print (redacted) env var presence

Q3: Does the runtime have required resources?
    → Memory, CPU, disk, network

Q4: Are file paths and permissions correct?
    → ls -la, test access

TERMINAL: "NODE_ENV=production but accessing dev database URL"
```

#### 5. TIMING Boundary

```
Q1: Does this fail under load or only sometimes?
    → Test with single request vs concurrent

Q2: Are there async operations without proper awaits?
    → Review Promise/async handling

Q3: Are there timeouts being hit?
    → Check logs for timeout errors

Q4: Are there race conditions between operations?
    → Review operation ordering

TERMINAL: "DB write completes after read, causing stale data 30% of time"
```

#### 6. CONFIGURATION Boundary

```
Q1: What configs affect this code path?
    → List all config sources

Q2: What are the actual values in this environment?
    → Print/log config values

Q3: What are the expected values?
    → Check documentation, working environments

Q4: When were configs last changed?
    → Config history, deployment logs

TERMINAL: "rate_limit_per_user set to 10, should be 1000"
```

---

### Phase 4: Fix Implementation

Only after reaching a TERMINAL root cause:

```
FIX SPECIFICATION
=================
Root Cause:        [Terminal statement from Phase 3]
Fix:               [Specific change to make]
Files to modify:   [Exact paths]
Test to verify:    [How to confirm fix works]
Rollback plan:     [How to undo if fix breaks something else]
```

---

### Phase 5: Verification

A fix is NOT complete until verified:

```
VERIFICATION CHECKLIST
======================
[ ] Symptom no longer occurs
[ ] Symptom doesn't recur under same conditions
[ ] No new symptoms introduced
[ ] Fix is committed with clear commit message
[ ] Root cause documented for future reference
```

---

## Anti-Patterns (What NOT to Do)

| Anti-Pattern | Why It's Wrong | Do This Instead |
|--------------|----------------|-----------------|
| "Let me try restarting it" | Treats symptom, not cause | Capture symptom first, then diagnose |
| "I'll just update all dependencies" | Shotgun approach, may introduce new bugs | Identify which dependency is actually failing |
| "This usually fixes it" | Assumption-based, not discovery-based | Prove this is the actual cause first |
| "I'll add more error handling" | Masks problem, doesn't solve it | Find why error occurs, fix source |
| "It works on my machine" | Environment diff is the clue, not dismissal | Compare environments systematically |
| "Let me refactor this whole thing" | Over-engineering for unclear problem | Fix the specific issue, nothing more |

---

## Quick Reference: Troubleshooting Tree

```
SYMPTOM OBSERVED
       │
       ▼
┌──────────────────┐
│ Capture Symptom  │ ← Be SPECIFIC
│ (The Intent)     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Which boundaries │ ← CODE, DATA, DEPS, ENV, TIMING, CONFIG
│ could contain    │
│ the cause?       │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ For each:        │
│  - Ask questions │ ← Use boundary-specific questions
│  - Get evidence  │ ← Logs, values, comparisons
│  - Eliminate or  │
│    drill deeper  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ TERMINAL?        │
│                  │
│ Can you point to │ ← If NO, keep drilling
│ the specific     │ ← If YES, proceed to fix
│ line/value/thing?│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Implement fix    │ ← Specific, minimal change
│ Verify fix       │ ← Prove symptom resolved
│ Document         │ ← Record for future
└──────────────────┘
```

---

## Integration Notes

This protocol integrates with the broader BBRD framework:

- **Symptom = Intent**: The starting point for all discovery
- **Boundaries = MECE Categories**: Ensure no cause is missed
- **Terminal = Root Cause**: Concrete, specific, actionable
- **Discovery = Questions**: Reveal truth, don't assume

---

*When in doubt, ask another question. When certain, verify before closing.*
