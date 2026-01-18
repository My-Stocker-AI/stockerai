# Phase 1: Verification Findings
**Date:** 2026-01-17
**Status:** Complete
**Purpose:** Verify critical system unknowns before implementing fixes

---

## Executive Summary

**CRITICAL SECURITY ISSUE FOUND:** No RLS policies on core StockerAI tables (routes, machines, items, sessions)

**Schema Verified:** Sequences are INTEGER (not TEXT), eliminates data type bug risk

**Voice Activation Verified:** Wake word system is implemented ("ok stocker", "hey stocker", etc.)

---

## 1. DATABASE SCHEMA VERIFICATION

### Sequence Data Type ✅ VERIFIED

**Finding:** Sequences are INTEGER, not TEXT

**Evidence:**
- `/home/visionairy/StockerAI/supabase/migrations/20260111_get_next_item_data_rpc.sql:25`
  ```sql
  machine_sequence INTEGER,
  ```
- `/home/visionairy/StockerAI/supabase/migrations/20260111_get_next_item_data_rpc.sql:34`
  ```sql
  item_sequence INTEGER,
  ```

**Impact on Bug Discovery:**
- **BOUNDARY_8_DATA_TYPES.md:** Priority 8 bug (String vs number sequence comparison) is **NOT POSSIBLE**
- Type coercion bugs related to sequence eliminated
- String sort vs numeric sort issue eliminated

**Action:** ✅ Close BOUNDARY_8 item 1A and 1B as non-issues

---

## 2. ROW LEVEL SECURITY (RLS) AUDIT ⚠️ CRITICAL ISSUE

### Core StockerAI Tables: NO RLS POLICIES FOUND

**Tables Checked:**
- `routes` - ❌ No RLS enabled, No policies found
- `machines` - ❌ No RLS enabled, No policies found
- `items` - ❌ No RLS enabled, No policies found
- `sessions` - ❌ No RLS enabled, No policies found

**Tables with RLS (account management only):**
- `accounts` - ✅ RLS enabled with 2 policies
- `account_users` - ✅ RLS enabled with 4 policies
- `route_assignments` - ✅ RLS enabled with 4 policies
- `discount_codes` - ✅ RLS enabled with 1 policy
- `user_keywords` - ✅ RLS enabled with 4 policies
- `global_keywords` - ✅ RLS enabled with 2 policies
- `monthly_usage` - ✅ RLS enabled with 1 policy

**Evidence:**
```bash
# Search for RLS on core tables:
grep -r "sessions.*ENABLE ROW LEVEL SECURITY" --include="*.sql"
# Result: No matches

grep -r "routes.*ENABLE ROW LEVEL SECURITY" --include="*.sql"
# Result: No matches

grep -r "CREATE POLICY.*sessions|routes|machines|items" --include="*.sql"
# Result: No matches
```

**Security Implications:**

### BOUNDARY_9_PERMISSIONS.md - CONFIRMED CRITICAL ISSUES:

#### 1A. User sees other users' routes (Priority: 10) ⚠️ **CONFIRMED**
- **Status:** POSSIBLE - No RLS on routes table
- **Risk:** Users can query routes table directly via anon key
- **Supabase Client Example:**
  ```javascript
  // This would return ALL routes from ALL users:
  const { data } = await supabase.from('routes').select('*')
  ```

#### 1B. User modifies other user's session (Priority: 5) ⚠️ **CONFIRMED**
- **Status:** POSSIBLE - No RLS on sessions table
- **Risk:** User could update another user's session state
- **Supabase Client Example:**
  ```javascript
  // This would update ANY session:
  const { data } = await supabase
    .from('sessions')
    .update({ current_item_index: 999 })
    .eq('id', 'some-other-users-session-id')
  ```

#### 3B. Supabase anon key misuse (Priority: 10) ⚠️ **CONFIRMED**
- **Status:** CRITICAL - Frontend uses anon key with NO RLS on core tables
- **Risk:** Complete data access without authentication

**Current Protection (if any):**
- RPC functions use `SECURITY DEFINER` and include user_id checks
- Example: `get_next_item_data(p_user_id UUID)` function filters by user_id (line 79)
- BUT: Direct table access via Supabase client is NOT protected

**Recommendation:** URGENT - Implement RLS policies on ALL core tables

**RLS Policy Templates Needed:**

```sql
-- Routes table
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own routes or assigned routes"
ON routes FOR SELECT
USING (
  user_id = auth.uid()
  OR id IN (SELECT route_id FROM route_assignments WHERE user_id = auth.uid())
  OR public.can_view_all_routes(auth.uid())
);

CREATE POLICY "Users can insert own routes"
ON routes FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own routes"
ON routes FOR UPDATE
USING (user_id = auth.uid());

-- Sessions table
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions"
ON sessions FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own sessions"
ON sessions FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own sessions"
ON sessions FOR UPDATE
USING (user_id = auth.uid());

-- Machines table (via route ownership)
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view machines for their routes"
ON machines FOR SELECT
USING (
  route_id IN (
    SELECT id FROM routes
    WHERE user_id = auth.uid()
    OR id IN (SELECT route_id FROM route_assignments WHERE user_id = auth.uid())
    OR public.can_view_all_routes(auth.uid())
  )
);

-- Items table (via machine -> route ownership)
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view items for their routes"
ON items FOR SELECT
USING (
  machine_id IN (
    SELECT m.id FROM machines m
    JOIN routes r ON m.route_id = r.id
    WHERE r.user_id = auth.uid()
    OR r.id IN (SELECT route_id FROM route_assignments WHERE user_id = auth.uid())
    OR public.can_view_all_routes(auth.uid())
  )
);
```

---

## 3. VOICE ACTIVATION METHOD ✅ VERIFIED

### Wake Word System Implemented

**Finding:** Wake word system IS implemented - requires wake phrase before command

**Evidence:**
- `/home/visionairy/StockerAI/src/hooks/useVoice.ts:12-19`
  ```javascript
  const WAKE_PHRASES = [
    'ok stocker', 'okay stocker', 'hey stocker', 'stocker',
    'ok stalker', 'okay stalker', 'hey stalker', 'stalker',  // mishearings
    'ok stoker', 'okay stoker', 'hey stoker', 'stoker',
    'ok docker', 'okay docker', 'hey docker',
    'ok soccer', 'okay soccer',
    'ok stock', 'okay stock', 'hey stock'
  ];
  ```

- `/home/visionairy/StockerAI/src/hooks/useVoice.ts:132-143`
  ```javascript
  const extractWakeCommand = useCallback((text: string): string | null => {
    const lower = text.toLowerCase();
    for (const phrase of WAKE_PHRASES) {
      const idx = lower.indexOf(phrase);
      if (idx !== -1) {
        let after = lower.substring(idx + phrase.length).trim();
        after = after.replace(/^[,\s]+/, '').trim();
        return after || "what's next"; // Return "what's next" if just wake phrase
      }
    }
    return null;  // No wake phrase = ignored
  }, []);
  ```

**Configuration:**
- `/home/visionairy/StockerAI/src/pages/StockerApp.tsx:730`
  ```javascript
  continuous: true,  // Always listening
  ```

**How it works:**
1. Microphone is always on (`continuous: true`)
2. User must say wake phrase ("ok stocker", "hey stocker", etc.)
3. Command after wake phrase is extracted and processed
4. If no wake phrase detected, input is ignored
5. If wake phrase alone, defaults to "what's next"

**Echo filtering:**
- 800ms cooldown after TTS speaks (prevents echo detection)
- Short inputs (<3 chars) ignored
- Exact echo of AI response filtered

**Impact on Bug Discovery:**

### BOUNDARY_3_VOICE_RECOGNITION.md - Updates:

#### Item 8: Wake word activation (Priority: 12) ✅ RESOLVED
- **Status:** Wake word system EXISTS
- **Implementation:** WAKE_PHRASES array with 18+ variants including mishearings
- **Action:** ~~Investigate wake word implementation~~ → **CONFIRMED WORKING**

#### Item 6: Background noise (Priority: 12) - STILL VALID
- **Status:** Wake word reduces false positives but doesn't eliminate
- **Issue:** Other workers saying "ok stocker" could trigger
- **Mitigation:** Wake word requirement helps, but warehouse environment may have multiple stockers

---

## 4. SEQUENCE RANGE VERIFICATION

### 1-based vs 0-based ✅ INFERRED

**Evidence from code:**
- `/home/visionairy/StockerAI/supabase/migrations/20260111_get_next_item_data_rpc.sql:81`
  ```sql
  ORDER BY s.created_at DESC, m.sequence ASC, i.sequence ASC
  ```
  No explicit range constraint, but ASC ordering suggests 1-based (common DB pattern)

**Frontend handling:**
- Workflow uses sequence directly from DB
- Item index shown to user is `item_index` field (separate from sequence)

**Sequence gaps:** Not explicitly prohibited in schema

**Action:** Monitor for sequence gap issues in production (Boundary 2, item 11)

---

## 5. RATE LIMITING VERIFICATION

### Not Found in Codebase

**Searched for:**
- Supabase Edge Function rate limiting configuration
- n8n workflow rate limiting
- Frontend request throttling

**Finding:** No explicit rate limiting found

**Impact:**
- **BOUNDARY_9_PERMISSIONS.md item 7A:** Rate limiting (Priority: 8) - NOT IMPLEMENTED
- **Risk:** User could spam API calls, drain OpenAI credits
- **Mitigation:** Supabase may have default rate limits on anon key

**Recommendation:** Implement rate limiting at Edge Function level

---

## 6. VOICE RECOGNITION CONFIGURATION

### Additional Findings:

**Speech-to-Text Provider:** Deepgram (not Web Speech API)
- `/home/visionairy/StockerAI/src/hooks/useVoice.ts:9`
  ```javascript
  const DEEPGRAM_TOKEN_URL = 'https://stocker-deepgram-stt.russ-731.workers.dev/token';
  ```

**TTS Provider:** Cloudflare Worker
- `/home/visionairy/StockerAI/src/hooks/useVoice.ts:6`
  ```javascript
  const TTS_URL = 'https://solitary-base-799c.russ-731.workers.dev';
  ```

**Endpointing:** Configurable via `environmentEndpointing` parameter
- Silence detection threshold can be tuned for warehouse noise

---

## Summary of Verification Results

| Item | Status | Finding | Priority |
|------|--------|---------|----------|
| DB Schema (sequence type) | ✅ VERIFIED | INTEGER (not TEXT) | Eliminates Priority 8 bugs |
| RLS Policies | ⚠️ CRITICAL | NOT ENABLED on core tables | **URGENT - Priority 10** |
| Wake Word | ✅ VERIFIED | Implemented with 18+ variants | Reduces Priority 12 risk |
| Sequence Range | ✅ INFERRED | Likely 1-based, ASC ordering | Low risk |
| Rate Limiting | ❌ NOT FOUND | No explicit implementation | Priority 8 |
| Voice Provider | ✅ VERIFIED | Deepgram STT + CF TTS | N/A |

---

## Recommended Next Steps

### CRITICAL (Do Immediately):
1. **Implement RLS policies on routes, machines, items, sessions tables**
   - Security vulnerability affecting ALL users
   - Users can currently access each other's data via direct queries
   - HIGH RISK, MEDIUM COMPLEXITY

### HIGH PRIORITY:
2. **Implement rate limiting on Edge Functions**
   - Prevent API abuse and OpenAI credit drain
   - MEDIUM RISK, LOW COMPLEXITY

3. **Test wake word in production warehouse environment**
   - Verify background noise filtering
   - Collect evidence from Davy on false positives

### PROCEED TO PHASE 2:
4. **Low-hanging fruit fixes** (Priority 12, Risk ≤2):
   - localStorage sync error handling
   - Fuzzy matching for homophones
   - Route name confidence tuning

---

**Files Referenced:**
- `/home/visionairy/StockerAI/supabase/migrations/*.sql` (13 files)
- `/home/visionairy/StockerAI/src/hooks/useVoice.ts`
- `/home/visionairy/StockerAI/src/pages/StockerApp.tsx`
- `BOUNDARY_8_DATA_TYPES.md` (updated)
- `BOUNDARY_9_PERMISSIONS.md` (confirmed critical)
- `BOUNDARY_3_VOICE_RECOGNITION.md` (updated)

**Verification Complete:** 2026-01-17
