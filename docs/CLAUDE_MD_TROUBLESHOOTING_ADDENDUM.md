# CLAUDE.md Troubleshooting Addendum

Add the following to your project's CLAUDE.md file to enable systematic BBRD-based troubleshooting.

---

## Add to CLAUDE.md

```markdown
## Troubleshooting Protocol

When encountering errors, bugs, or unexpected behavior, follow the BBRD Troubleshooting Protocol:

### 1. STOP Before Fixing

**Never apply a fix without first completing discovery.**

Before changing any code to "fix" something:
1. Capture the exact symptom (what happens vs what should happen)
2. Identify which boundary the cause likely falls into
3. Ask discovery questions until you find the TERMINAL root cause
4. Only then implement a fix

### 2. Root Cause Boundaries (MECE)

Every bug has a root cause in exactly one of these boundaries:

| Boundary | What to Check |
|----------|---------------|
| **CODE** | Logic errors, missing handlers, wrong operations |
| **DATA** | Invalid input, edge cases, corrupt state |
| **DEPS** | External APIs, database, third-party services |
| **ENV** | Environment vars, permissions, resources |
| **TIMING** | Race conditions, async issues, timeouts |
| **CONFIG** | Settings, credentials, feature flags |

### 3. Terminal Root Cause Criteria

A root cause is only TERMINAL when you can answer YES to all:

- [ ] Can I point to a specific line, value, or component?
- [ ] Can I reproduce the symptom by manipulating this?
- [ ] Would fixing this ONE thing resolve the symptom?
- [ ] Can I verify it's fixed after the change?

If any answer is NO, keep drilling deeper.

### 4. Required Before Any Fix

Before implementing a fix, state:
```
ROOT CAUSE: [Specific terminal statement]
EVIDENCE: [How I know this is the cause]
FIX: [Exact change to make]
VERIFY: [How to confirm fix worked]
```

### 5. Anti-Patterns to Avoid

- **Shotgun debugging**: Changing multiple things hoping one works
- **Symptom treating**: Restarting/retrying without understanding why
- **Assumption-based fixes**: "This usually fixes it"
- **Over-engineering**: Refactoring unrelated code while debugging
- **Masking errors**: Adding try/catch without fixing the source

### 6. When Stuck

If unable to find root cause after checking all boundaries:
1. Add logging at key points to capture actual values
2. Reduce to minimal reproduction case
3. Compare against known-working state (git diff, env diff)
4. State explicitly: "I cannot determine root cause. Here is what I've eliminated: [list]"

Do NOT guess. Surface the uncertainty.
```

---

## Additional Context for AI Assistants

You may also want to add this context:

```markdown
## AI Assistant Instructions

When I report an error or bug:

1. **Ask before fixing**: "Let me understand the symptom first" before proposing solutions
2. **Show your work**: Explicitly state which boundary you're investigating and why
3. **Verify terminal**: Before proposing a fix, confirm the root cause meets terminal criteria
4. **Minimal changes**: Fix the specific issue, don't refactor surrounding code
5. **Verify works**: After fix, confirm the symptom is actually resolved

When I say "it's broken" or "it doesn't work":
- Ask me to describe the exact symptom (what happens vs expected)
- Don't assume you know what's wrong

When investigating:
- Read the actual code, don't assume based on function names
- Check actual values (logs, prints), don't assume data shape
- Compare working vs broken state explicitly
```

---

## Example Usage

Here's how a troubleshooting session should look:

```markdown
USER: The API is returning 500 errors

ASSISTANT: Let me capture the symptom first.

**Symptom Capture:**
- What is happening: API returns HTTP 500
- What should happen: Successful response (200/201)
- When: [Need more info] When did this start?
- Frequency: [Need more info] All requests or specific ones?
- Affected scope: [Need more info] Which endpoint(s)?

Can you provide more details on these?

USER: It's the /users endpoint, started after the last deploy, happens every time

ASSISTANT: Thanks. Now let me investigate boundaries.

**Investigating CODE boundary first** (recent deploy suggests code change):

1. What changed in the last deploy?
   [Runs git diff to see recent changes]

2. Does the /users endpoint handler have any new code?
   [Reads the route handler]

3. What error is actually thrown?
   [Checks logs for stack trace]

**Finding:** Stack trace shows `TypeError: Cannot read property 'id' of undefined` at line 47 in users.controller.ts

This is in the CODE boundary. Let me verify terminal:
- Specific: Yes, line 47, accessing .id on undefined
- Reproducible: Yes, happens on every request
- Singular: Need to verify - why is the object undefined?

[Continues drilling until terminal root cause found]
```

---

## File Location

Save the full troubleshooting protocol to your project at:
`docs/TROUBLESHOOTING_PROTOCOL.md`

This gives you the full reference with boundary-specific questions while keeping CLAUDE.md concise.
