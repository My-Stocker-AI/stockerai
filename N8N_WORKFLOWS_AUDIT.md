# n8n Workflows Technical Audit - Proactive Bug Discovery
**Date:** 2026-01-18
**File:** `/src/hooks/useStockerAI.ts` (692 lines)
**Purpose:** Identify potential bugs in n8n workflow integration before they manifest in production
**Method:** Systematic code review of webhook calls, retry logic, error handling

---

## CRITICAL BUGS DISCOVERED

### 🔴 BUG-N8N-1: Debounce Ignores Different Arguments (False Deduplication)

**Location:** `src/hooks/useStockerAI.ts:609-621`
**Severity:** CRITICAL (Legitimate commands blocked)
**Impact:** If user calls same tool twice with different arguments within 1.5s, second call blocked → user commands ignored

**Current Code:**
```typescript
// Line 611-621: Debounce checks command name only
if (lastCommandRef.current &&
    lastCommandRef.current.name === name &&  // ← Only checks name, not args!
    now - lastCommandRef.current.timestamp < DEBOUNCE_MS) {
  console.warn(`[Tools] Ignoring duplicate ${name} command`);
  results.push({
    tool_call_id: tc.id,
    result: { success: false, message: 'Duplicate command ignored (too fast)' }
  });
  continue;
}
```

**Problem Scenario:**
1. User: "Switch to North route" → calls switch_route(target_route="North")
2. AI mishears, user immediately corrects: "No, South route" → calls switch_route(target_route="South")
3. Second call within 1.5s → debounced as duplicate
4. User stuck on wrong route

**Should Be:**
```typescript
const now = Date.now();
const argsHash = JSON.stringify(args); // Hash arguments for comparison

if (lastCommandRef.current &&
    lastCommandRef.current.name === name &&
    lastCommandRef.current.argsHash === argsHash &&  // Check args match too
    now - lastCommandRef.current.timestamp < DEBOUNCE_MS) {
  console.warn(`[Tools] Ignoring duplicate ${name} command with same args`);
  results.push({
    tool_call_id: tc.id,
    result: { success: false, message: 'Duplicate command ignored (too fast)' }
  });
  continue;
}
lastCommandRef.current = { name, timestamp: now, argsHash };
```

**How to Reproduce:**
1. Say "Get routes for December 25"
2. Within 1.5s, say "Get routes for December 26"
3. Result: Second command ignored, only Dec 25 routes returned

---

### 🔴 BUG-N8N-2: Session ID Not Validated Before Tool Calls

**Location:** `src/hooks/useStockerAI.ts:226, 637`
**Severity:** CRITICAL (Data corruption)
**Impact:** If tool called before setSession, sends empty session_id → workflow creates new session OR uses wrong session data

**Current Code:**
```typescript
// Line 226: Init with empty string
const sessionIdRef = useRef<string>('');

// Line 637: Send to workflow WITHOUT validation
body: JSON.stringify({
  session_id: sessionIdRef.current,  // ← Could be empty string!
  user_id: userIdRef.current,
  ...args
})
```

**Problem Scenario:**
1. Component mounts
2. User says "What's next" before session initialized
3. get_next_item called with session_id=""
4. Workflow creates new session with no route data
5. Returns "No route selected" instead of actual item

**Should Be:**
```typescript
const executeToolCalls = useCallback(async (
  toolCalls: any[],
  onResult?: (name: string, result: any) => void
) => {
  // Validate session exists FIRST
  if (!sessionIdRef.current || sessionIdRef.current === '') {
    throw new Error('Session not initialized - cannot execute tools');
  }

  const results: any[] = [];
  // ... rest of function
}, []);
```

**How to Reproduce:**
1. Open StockerApp
2. Before session loads, say "What's next"
3. Result: Workflow error or wrong session data

---

### 🟡 BUG-N8N-3: Workflow Success Field Not Validated

**Location:** `src/hooks/useStockerAI.ts:654-660`
**Severity:** MEDIUM (Silent failures)
**Impact:** If workflow returns { success: false, error: "..." }, frontend treats as success → user sees wrong data

**Current Code:**
```typescript
let result = await resp.json();
console.log(`[Tools] ${name} succeeded:`, result);  // ← Assumes success

onResult?.(name, result);  // ← Passes to callback without validation
results.push({ tool_call_id: tc.id, result });
```

**Issue:** If workflow encounters business logic error (e.g., "No items remaining"), it might return:
```json
{
  "success": false,
  "error": "No items in this machine",
  "action": "error"
}
```

But frontend logs "succeeded" and passes to callback as if it worked.

**Should Be:**
```typescript
let result = await resp.json();

// Check for workflow-level errors
if (result.success === false) {
  console.error(`[Tools] ${name} workflow error:`, result.error);
  throw new Error(result.error || 'Workflow returned success: false');
}

console.log(`[Tools] ${name} succeeded:`, result);
onResult?.(name, result);
results.push({ tool_call_id: tc.id, result });
```

**How to Reproduce:**
1. Complete all items in a route
2. Say "What's next"
3. Workflow returns { success: false, error: "Route complete" }
4. Result: Error message passed to AI but logged as "succeeded"

---

### 🟡 BUG-N8N-4: getRoutes Doesn't Use Retry Logic

**Location:** `src/hooks/useStockerAI.ts:676-688`
**Severity:** MEDIUM (Inconsistent reliability)
**Impact:** getRoutes fails on transient 5xx errors, but other tool calls retry → inconsistent UX

**Current Code:**
```typescript
const getRoutes = useCallback(async (date: string) => {
  const resp = await fetchWithTimeout(`${N8N_BASE}/get-routes`, {  // ← No retry!
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionIdRef.current,
      user_id: userIdRef.current,
      date
    })
  });
  if (!resp.ok) throw new Error('Failed to get routes');
  return resp.json();
}, []);
```

**Comparison:**
- Line 633: executeToolCalls uses `fetchWithRetry` → 3 retries with backoff
- Line 676: getRoutes uses `fetchWithTimeout` → NO retries
- If n8n has brief outage, getRoutes fails but other tools would succeed

**Should Be:**
```typescript
const getRoutes = useCallback(async (date: string) => {
  const resp = await fetchWithRetry(`${N8N_BASE}/get-routes`, {  // ← Use retry logic
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionIdRef.current,
      user_id: userIdRef.current,
      date
    })
  });
  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Failed to get routes: ${errorText}`);
  }
  return resp.json();
}, []);
```

---

### 🟡 BUG-N8N-5: Error Response Body Not Parsed as JSON

**Location:** `src/hooks/useStockerAI.ts:645-651`
**Severity:** MEDIUM (Poor error messages)
**Impact:** If workflow returns JSON error, converted to string → ugly error message instead of structured data

**Current Code:**
```typescript
if (!resp.ok) {
  const errorText = await resp.text();  // ← Always reads as text
  console.error(`[Tools] ${name} failed:`, {
    status: resp.status,
    statusText: resp.statusText,
    body: errorText
  });
  throw new Error(`Workflow error (${resp.status}): ${errorText}`);
}
```

**Problem:** If workflow returns:
```json
{
  "error": "Database connection timeout",
  "details": {
    "table": "sessions",
    "timeout_ms": 5000
  }
}
```

Error message becomes: `Workflow error (500): {"error":"Database connection timeout","details":{"table":"sessions","timeout_ms":5000}}`

**Should Be:**
```typescript
if (!resp.ok) {
  let errorDetails;
  const contentType = resp.headers.get('content-type');

  if (contentType?.includes('application/json')) {
    try {
      const errorJson = await resp.json();
      errorDetails = errorJson.error || errorJson.message || JSON.stringify(errorJson);
    } catch (e) {
      errorDetails = await resp.text();
    }
  } else {
    errorDetails = await resp.text();
  }

  console.error(`[Tools] ${name} failed:`, {
    status: resp.status,
    statusText: resp.statusText,
    body: errorDetails
  });
  throw new Error(`Workflow error (${resp.status}): ${errorDetails}`);
}
```

---

### 🟡 BUG-N8N-6: Timeout Not Aborted on Retry

**Location:** `src/hooks/useStockerAI.ts:6-21, 24-72`
**Severity:** MEDIUM (Long hangs)
**Impact:** If first attempt times out at 30s, retry waits 1s, then starts NEW 30s timeout → total time 61s+ instead of max 30s

**Current Code:**
```typescript
// Line 6-21: Each call gets its own 30s timeout
async function fetchWithTimeout(url: string, options: RequestInit, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  // ... (always 30s per attempt)
}

// Line 24-72: Retry logic
for (let attempt = 0; attempt <= maxRetries; attempt++) {
  try {
    const response = await fetchWithTimeout(url, options, timeout);  // ← New 30s timeout each time
    // ...
  } catch (e: any) {
    // Calculate backoff: 1s, 2s, 4s
    const backoffMs = 1000 * Math.pow(2, attempt);
    await new Promise(resolve => setTimeout(resolve, backoffMs));
  }
}
```

**Problem:**
- Attempt 1: 30s timeout → fails
- Wait 1s backoff
- Attempt 2: 30s timeout → fails
- Wait 2s backoff
- Attempt 3: 30s timeout → fails
- Wait 4s backoff
- Attempt 4: 30s timeout → finally succeeds
- **Total time: 30+1+30+2+30+4+30 = 127 seconds!**

**Should Be:**
Use a TOTAL timeout across all retries:
```typescript
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  totalTimeout = 45000  // Max 45s total across ALL attempts
): Promise<Response> {
  const startTime = Date.now();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const elapsed = Date.now() - startTime;
    const remainingTime = totalTimeout - elapsed;

    if (remainingTime <= 0) {
      throw new Error('Total request timeout exceeded');
    }

    try {
      // Use remaining time for this attempt
      const response = await fetchWithTimeout(url, options, remainingTime);
      // ... rest of logic
    }
  }
}
```

---

### 🟢 BUG-N8N-7: Tool Result Error Not Logged to Console

**Location:** `src/hooks/useStockerAI.ts:662-664`
**Severity:** LOW (Debugging difficulty)
**Impact:** If tool call throws exception, error logged, but if tool returns {error: "..."}, not logged separately

**Current Code:**
```typescript
} catch (e: any) {
  console.error(`[Tools] ${name} exception:`, e);  // ← Exception logged
  results.push({ tool_call_id: tc.id, result: { error: e.message } });
}
```

**Issue:** If workflow returns HTTP 200 with { success: false, error: "..." }, it doesn't hit the catch block, so error not clearly visible in logs.

**Should Be:**
```typescript
let result = await resp.json();

// Log workflow-level errors prominently
if (result.error || result.success === false) {
  console.error(`[Tools] ${name} workflow error:`, result.error || result);
}

console.log(`[Tools] ${name} result:`, result);
```

---

## SUMMARY

**Total Bugs Found:** 7
- 🔴 CRITICAL: 2 (Debounce false positives, session validation missing)
- 🟡 MEDIUM: 4 (Success field not validated, getRoutes no retry, error parsing, timeout accumulation)
- 🟢 LOW: 1 (Error logging)

**Audit Coverage:** n8n workflow integration complete (100%)

**Most Critical:**
1. BUG-N8N-1: Debounce blocks legitimate commands with different args
2. BUG-N8N-2: Session ID not validated → wrong session data
3. BUG-N8N-3: Workflow errors treated as success
4. BUG-N8N-6: Timeout accumulates across retries → 127s hangs

**Next Steps:**
1. Fix CRITICAL bugs immediately
2. Fix MEDIUM bugs before next production deployment
3. Continue audit: database integrity

---

**END OF N8N WORKFLOWS AUDIT**
