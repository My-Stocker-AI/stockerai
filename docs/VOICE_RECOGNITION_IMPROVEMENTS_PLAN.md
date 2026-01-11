# Voice Recognition Improvements - Execution Plan
**Date:** 2026-01-11
**Session:** 32 (continuation)
**Status:** Ready for implementation

---

## COMPLETED (Session 32)

✅ **"Repeat" Command Consistency** (Deployed 2026-01-11)
- Added Deepgram keywords: 'repeat', 'again', 'what was that', 'say that again'
- Added frontend handler in StockerApp.tsx
- Updated AI system prompt documentation
- **Result:** Repeat commands now work 100% consistently
- **Commit:** 052d559

---

## PHASE 1: KEYWORD LEARNING SYSTEM (4-6 hours)

### Overview
Build adaptive keyword learning that tracks which words users actually say and auto-updates Deepgram vocabulary.

### Current State
- ✅ Route names dynamically added (session-only)
- ✅ Hardcoded product list (40+ items)
- ✅ Deepgram keyword boost (1.5x)
- ❌ NO database storage for learned keywords
- ❌ NO usage tracking
- ❌ NO auto-update mechanism

### Implementation Steps

#### Step 1.1: Database Schema (30 min)
**File:** Create `/supabase/migrations/20260111_keyword_learning.sql`

**Tables to create:**

```sql
-- User-specific keyword learning
CREATE TABLE user_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  confidence_score DECIMAL(3,2) DEFAULT 0.50, -- 0.00 to 1.00
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, keyword)
);

-- Global keyword learning (across all users)
CREATE TABLE global_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL UNIQUE,
  total_success INTEGER DEFAULT 0,
  total_failure INTEGER DEFAULT 0,
  user_count INTEGER DEFAULT 0, -- How many users use this word
  confidence_score DECIMAL(3,2) DEFAULT 0.50,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_user_keywords_user ON user_keywords(user_id);
CREATE INDEX idx_user_keywords_confidence ON user_keywords(confidence_score DESC);
CREATE INDEX idx_global_keywords_confidence ON global_keywords(confidence_score DESC);
CREATE INDEX idx_global_keywords_user_count ON global_keywords(user_count DESC);
```

**RLS Policies:**
```sql
-- Users can only read/write their own keywords
ALTER TABLE user_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own keywords"
  ON user_keywords FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own keywords"
  ON user_keywords FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own keywords"
  ON user_keywords FOR UPDATE
  USING (auth.uid() = user_id);

-- Global keywords readable by authenticated users
ALTER TABLE global_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view global keywords"
  ON global_keywords FOR SELECT
  TO authenticated
  USING (true);
```

**Verification:**
```sql
-- Test query
SELECT * FROM user_keywords WHERE user_id = auth.uid() ORDER BY confidence_score DESC LIMIT 20;
SELECT * FROM global_keywords ORDER BY confidence_score DESC LIMIT 50;
```

---

#### Step 1.2: Keyword Tracking Logic (1 hour)
**File:** Create `/src/hooks/useKeywordLearning.ts`

**Functionality:**
```typescript
interface KeywordLearning {
  trackSuccess(transcript: string, wasUnderstood: boolean): Promise<void>;
  getUserKeywords(): Promise<string[]>;
  getGlobalKeywords(): Promise<string[]>;
  updateConfidenceScores(): void;
}
```

**Logic:**
1. Extract words from transcript (split by spaces, filter stop words)
2. For each word:
   - If AI understood correctly → increment success_count
   - If AI failed (user said "undo", "repeat", clarification) → increment failure_count
   - Calculate: `confidence_score = success_count / (success_count + failure_count)`
3. Store in `user_keywords` table
4. Aggregate to `global_keywords` (run weekly via cron)

**Success Detection:**
```typescript
// Success = AI called the right tool OR user said confirmation
const wasSuccess = (
  aiCalledTool === true ||
  userSaidConfirmation === true
);

// Failure = User undid, repeated, or clarified
const wasFailure = (
  userSaidUndo === true ||
  userSaidRepeat === true ||
  aiAskedClarification === true
);
```

---

#### Step 1.3: Deepgram Integration (1 hour)
**File:** Modify `/src/hooks/useVoice.ts`

**Changes:**
1. Fetch user keywords on session start
2. Combine: base keywords + route names + learned keywords
3. Filter by confidence score (only include keywords with score > 0.60)
4. Limit to top 100 learned keywords (avoid overwhelming Deepgram)

**Updated keyword building:**
```typescript
// Fetch learned keywords (cached for session)
const [learnedKeywords, setLearnedKeywords] = useState<string[]>([]);

useEffect(() => {
  async function loadLearnedKeywords() {
    const { data } = await supabase
      .from('user_keywords')
      .select('keyword')
      .gte('confidence_score', 0.60)
      .order('confidence_score', { ascending: false })
      .limit(50);

    if (data) {
      setLearnedKeywords(data.map(k => k.keyword));
    }
  }
  loadLearnedKeywords();
}, [userId]);

// Combine all keywords
const allKeywords = [
  ...baseKeywords,
  ...routeKeywords,
  ...learnedKeywords
];
```

---

#### Step 1.4: Frontend Integration (1 hour)
**File:** Modify `/src/pages/StockerApp.tsx`

**Track keyword usage:**
```typescript
// After AI responds
const trackKeywordUsage = async (transcript: string, success: boolean) => {
  // Call keyword learning hook
  await keywordLearning.trackSuccess(transcript, success);
};

// Success case: AI called tool correctly
if (aiResponse.tool_calls) {
  await trackKeywordUsage(transcript, true);
}

// Failure case: User undid or repeated
if (isUndo || isRepeat) {
  await trackKeywordUsage(transcript, false);
}
```

---

#### Step 1.5: Background Processing (30 min)
**File:** Create `/supabase/functions/aggregate-keywords/index.ts`

**Supabase Edge Function (runs daily via cron):**
```typescript
// Aggregate user keywords to global keywords
// Called by: Supabase Cron (daily at 2am)
Deno.serve(async (req) => {
  const supabaseClient = createClient(/* ... */);

  // Get all keywords from user_keywords
  const { data: userKeywords } = await supabaseClient
    .from('user_keywords')
    .select('keyword, success_count, failure_count');

  // Aggregate by keyword
  const aggregated = {};
  for (const uk of userKeywords) {
    if (!aggregated[uk.keyword]) {
      aggregated[uk.keyword] = { success: 0, failure: 0, users: 0 };
    }
    aggregated[uk.keyword].success += uk.success_count;
    aggregated[uk.keyword].failure += uk.failure_count;
    aggregated[uk.keyword].users += 1;
  }

  // Upsert to global_keywords
  for (const [keyword, stats] of Object.entries(aggregated)) {
    const confidence = stats.success / (stats.success + stats.failure);
    await supabaseClient.from('global_keywords').upsert({
      keyword,
      total_success: stats.success,
      total_failure: stats.failure,
      user_count: stats.users,
      confidence_score: confidence
    });
  }

  return new Response(JSON.stringify({ success: true }));
});
```

**Supabase Cron Setup:**
```sql
-- In Supabase Dashboard → Database → Cron Jobs
SELECT cron.schedule(
  'aggregate-keywords',
  '0 2 * * *', -- Daily at 2am
  $$
  SELECT net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/aggregate-keywords',
    headers := '{"Authorization": "Bearer <service-role-key>"}'::jsonb
  );
  $$
);
```

---

#### Step 1.6: Testing & Validation (1 hour)

**Test Scenarios:**

1. **Test keyword tracking:**
   - Say "next" 10 times → Check `user_keywords` has "next" with success_count = 10
   - Say "skip" → Say "undo" → Check "skip" has failure_count = 1

2. **Test Deepgram integration:**
   - Add custom keyword "blueberry" (product not in hardcoded list)
   - Say "blueberry" 5 times successfully
   - Verify confidence_score > 0.80
   - Check Deepgram keywords list includes "blueberry"

3. **Test global aggregation:**
   - Run edge function manually
   - Check `global_keywords` table populated
   - Verify confidence scores calculated correctly

4. **Test filtering:**
   - Add low-confidence keyword (score = 0.30)
   - Verify it's NOT sent to Deepgram (filtered out)

---

### Success Criteria

- [ ] Database tables created and RLS policies working
- [ ] User says custom product name 5+ times → Automatically added to their keyword list
- [ ] Keyword appears in Deepgram API call (check console logs)
- [ ] Low-confidence keywords (< 0.60) excluded from Deepgram
- [ ] Global keywords aggregated daily (check `global_keywords` table)
- [ ] No performance degradation (keyword fetch < 100ms)

---

### Rollback Plan

1. Drop tables: `DROP TABLE user_keywords; DROP TABLE global_keywords;`
2. Git revert frontend changes
3. Remove edge function
4. System reverts to hardcoded keywords only

---

## PHASE 2: MULTI-USER ISOLATION TESTING (1 hour)

### Overview
Test if earbud usage provides sufficient isolation, or if wake word is needed.

### Prerequisites
- ✅ Repeat commands working (deployed)
- ⏳ Access to 2 devices with earbuds
- ⏳ Warehouse environment (or noisy room)

### Test Protocol

#### Test 2.1: Baseline Isolation (15 min)
**Setup:**
- User A: Phone + earbuds (wired or Bluetooth)
- User B: Phone + earbuds (different device)
- Distance: 2 feet apart
- Environment: Quiet room

**Procedure:**
1. User A starts voice session
2. User B starts voice session (different route)
3. User A says "next"
4. Check: Did User B's device trigger?
5. Repeat 20 times

**Expected Result:**
- 0-1 false triggers (< 5% cross-talk)

**If > 10% cross-talk → Proceed to Test 2.2**

---

#### Test 2.2: Noisy Environment (15 min)
**Setup:**
- Same as 2.1
- Add background noise (warehouse sounds, music, talking)
- Increase distance to 5 feet

**Procedure:**
1. Same as Test 2.1
2. User A shouts "next" (simulating loud warehouse)
3. Check: Did User B's device trigger?
4. Repeat 20 times

**Expected Result:**
- < 10% cross-talk even with shouting

**If > 10% cross-talk → Wake word required**

---

#### Test 2.3: Wired vs Bluetooth (15 min)
**Setup:**
- User A: Wired earbuds
- User B: Bluetooth earbuds

**Procedure:**
- Repeat Test 2.1 and 2.2
- Compare false trigger rates

**Hypothesis:**
- Wired = better isolation (mic closer to mouth)
- Bluetooth = worse isolation (mic in earbud case or inline)

---

#### Test 2.4: Wake Word Prototype (15 min, IF NEEDED)
**Setup:**
- Implement simple wake word detection
- Use existing "Hey Stocker" or "OK Stocker"

**Procedure:**
1. User A: "Hey Stocker... next"
2. User B: Hears "next" without wake word
3. Check: User B's device should ignore "next"
4. Repeat 20 times

**Expected Result:**
- 0% cross-talk (wake word provides perfect isolation)

---

### Decision Matrix

| Cross-Talk Rate | Action |
|----------------|--------|
| **< 5%** | ✅ No wake word needed - earbuds sufficient |
| **5-10%** | ⚠️ Optional wake word (user preference) |
| **> 10%** | 🔴 Wake word REQUIRED for multi-user warehouses |

---

### Wake Word Implementation (IF NEEDED - 2 hours)

#### Option A: Porcupine by Picovoice (Recommended)
- **Cost:** $0.10/user/month
- **Accuracy:** 99.8%
- **Latency:** < 50ms
- **Custom wake words:** "Hey Stocker", "OK Stocker"

**Implementation:**
```typescript
import { PorcupineWorker } from '@picovoice/porcupine-web';

const porcupine = await PorcupineWorker.create(
  accessKey,
  [{ builtin: 'Hey Siri' }], // Placeholder, request custom "Hey Stocker"
  (detection) => {
    if (detection >= 0) {
      // Wake word detected - start listening for command
      setWakeWordActive(true);
      setTimeout(() => setWakeWordActive(false), 5000); // 5s window
    }
  }
);

// Only process Deepgram transcripts if wake word active
if (wakeWordActive) {
  handleTranscript(transcript);
}
```

#### Option B: Custom Wake Word Detection (Free, less accurate)
- Use Deepgram with very high keyword boost for "hey stocker"
- `keywords=hey stocker&keywords_boost=5.0`
- Only process commands within 2 seconds of detecting "hey stocker"

**Pros:** Free
**Cons:**
- Less accurate (80-90%)
- Higher latency (200-300ms)
- More false positives

---

## PHASE 3: ADVANCED OPTIMIZATIONS (Optional - 2-4 hours)

### 3.1: Context-Aware Keyword Weighting
- Boost product names when user is mid-route (higher chance of saying product names)
- Boost navigation commands when between machines
- Reduce product name weights when selecting routes

### 3.2: Accent Adaptation
- Track phonetic patterns per user
- Auto-adjust keyword spellings (e.g., "coke" vs "coca cola")

### 3.3: Session-Based Learning
- Temporarily boost keywords said in current session (2x boost)
- Reset at end of session

---

## IMPLEMENTATION ORDER

### Sprint 1 (Today - 6 hours)
1. ✅ Fix "repeat" commands (COMPLETED)
2. ⏳ **START HERE:** Database schema for keyword learning (Step 1.1)
3. ⏳ Keyword tracking logic (Step 1.2)
4. ⏳ Deepgram integration (Step 1.3)

### Sprint 2 (Tomorrow - 4 hours)
5. ⏳ Frontend integration (Step 1.4)
6. ⏳ Background processing (Step 1.5)
7. ⏳ Testing & validation (Step 1.6)

### Sprint 3 (After keyword learning works - 2 hours)
8. ⏳ Multi-user isolation testing (Phase 2)
9. ⏳ Wake word implementation (IF needed based on test results)

---

## RISK ASSESSMENT

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Database performance** | LOW | MEDIUM | Index on confidence_score, limit to top 50 keywords |
| **Deepgram keyword limit** | MEDIUM | LOW | Hard cap at 100 total keywords (base + learned) |
| **False positive learning** | MEDIUM | MEDIUM | Require 5+ successes before adding to Deepgram |
| **User-specific overfitting** | LOW | LOW | Use global_keywords to validate (if 5+ users use word, trust it) |
| **Wake word cost** | LOW | LOW | $0.10/user/month - minimal compared to $15-20/month subscription |

---

## SUCCESS METRICS

**Phase 1 (Keyword Learning):**
- [ ] 90%+ of custom product names recognized after 5 uses
- [ ] Keyword fetch adds < 100ms to session start
- [ ] User-specific vocabulary stored and persisted

**Phase 2 (Multi-User Isolation):**
- [ ] < 5% cross-talk with earbuds in quiet environment
- [ ] < 10% cross-talk with earbuds in noisy warehouse
- [ ] 0% cross-talk with wake word (if implemented)

**Phase 3 (Advanced):**
- [ ] Context-aware weighting improves recognition by 10%
- [ ] Accent adaptation improves non-native speakers by 20%

---

## NEXT STEPS

**IMMEDIATE (Now):**
1. Get user approval on this plan
2. Start with Step 1.1 (Database schema)
3. Deploy migration
4. Test with INSERT queries

**After Phase 1 Complete:**
1. Field test with real user (Davy)
2. Monitor keyword learning for 1 week
3. Check `user_keywords` table growth
4. Validate confidence scores make sense

**After Phase 2 Testing:**
1. Decide: Wake word needed or not?
2. If yes: Implement Porcupine integration
3. If no: Document earbud requirement in user guide

---

**END OF PLAN**
