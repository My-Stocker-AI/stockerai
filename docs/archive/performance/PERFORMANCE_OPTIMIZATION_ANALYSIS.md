# Voice Picking "Next" Command Performance Optimization Analysis

**Created:** 2026-01-11 (Session 33)
**Last Updated:** 2026-01-12 (Session 35 - Implementation Status Audit)
**Baseline:** Tag `session33-performance-baseline`
**Starting Latency:** 2.4-2.9 seconds
**Current Latency:** ~1.5-2.0 seconds (estimated with implemented optimizations)
**Target Latency:** <1 second

---

## IMPLEMENTATION STATUS (Session 35 Audit)

| Priority | Status | Savings | Deployed | Testing Status |
|----------|--------|---------|----------|----------------|
| 1. Remove Get Routes | ✅ **DONE** | 300ms | ✅ Production | User tested Session 33 |
| 2. Edge Function | ✅ **BUILT** | 400-600ms | ⏳ Awaiting testing | Manual testing required |
| 3. Item Prefetch | ❌ **SKIPPED** | 50-100ms | N/A | Cancelled - ROI too low |
| 4. Deepgram Endpointing | ✅ **DONE** | 100ms | ✅ Production | Unknown deploy date |
| 5. TTS Prefetch | ✅ **DONE** | 200-400ms | ✅ Production | Unknown deploy date |

**Total Savings (Deployed):** ~600-800ms (25-32% faster)
**Total Savings (If Priority 2 Deployed):** ~1000-1400ms (40-56% faster)

**Current Estimated Latency:**
- Before optimizations: 2.4-2.9s
- With P1, P4, P5: ~1.6-2.1s ✓
- With P1, P2, P4, P5: ~1.0-1.5s (projected)

---

## Executive Summary

**Current State (Session 33 Baseline):**
- Total latency: 2.4-2.9 seconds
- Goal: <1 second total latency
- Gap: 1.4-1.9 seconds to eliminate

**Latency Breakdown by Component:**

| Stage | Current | Theoretical Min | Savings Potential | Risk |
|-------|---------|-----------------|-------------------|------|
| Deepgram STT | ~300ms | ~200ms | 100ms | LOW |
| CommandRecognizer | ~0ms | ~0ms | 0ms | N/A |
| n8n workflow | 870-2876ms | ~400ms | 500-2400ms | MEDIUM |
| TTS fetch + decode | ~400-800ms | ~200ms | 200-600ms | MEDIUM |
| Audio playback | immediate | immediate | 0ms | N/A |
| Session persistence | ~100ms | ~50ms (async) | 50ms | LOW |

---

## 1. Component Analysis

### 1.1 Deepgram STT (Speech-to-Text)

**Current Configuration** (from `/home/visionairy/StockerAI/src/hooks/useVoice.ts` lines 564-573):
```javascript
const wsUrl = 'wss://api.deepgram.com/v1/listen?' +
  'model=nova-2&' +
  'language=en-US&' +
  `encoding=${encodingRef.current}&` +
  'smart_format=true&' +
  'interim_results=true&' +
  'vad_events=true&' +
  'endpointing=200' +
  keywordsParam +
  boostParam;
```

**Current Latency:** ~300ms from speech end to final transcript

**Bottleneck Analysis:**
1. `endpointing=200` - Waits 200ms after speech stops before finalizing
2. Silence timer fallback at 300ms (lines 414-416)
3. Network round-trip to Deepgram servers

**Optimization Opportunities:**

| Optimization | Expected Savings | Risk | Implementation |
|--------------|------------------|------|----------------|
| Reduce `endpointing` to 100ms | ~100ms | MEDIUM - may cause premature cuts | Change URL param |
| Use `utterance_end_ms=800` | ~50ms | LOW | Add new param |
| Reduce silence timer to 200ms | ~100ms | MEDIUM - may cause premature processing | Line 414 |

**Theoretical Minimum:** ~200ms (limited by network + VAD processing)

---

### 1.2 CommandRecognizer Pattern Matching

**Location:** `/home/visionairy/StockerAI/src/utils/commandRecognizer.ts`

**Current Latency:** ~0ms (instant, in-browser pattern matching)

**How It Works:**
1. Exact regex matching (lines 34-122) - 99.9% accuracy
2. Levenshtein fuzzy matching (lines 281-331) - 98% accuracy
3. Confidence threshold of 0.7 (line 194)

**Already Optimized:** This is already the fastest possible approach. The CommandRecognizer correctly bypasses AI for ~90% of commands.

**Verified Working:** Console logs show `[CommandRecognizer] Matched: next_item confidence: 0.75 (bypassing AI)`

---

### 1.3 n8n Workflow (get_next_item)

**Workflow ID:** `eBv7SfWF7hsuNGpH`
**Structure:** 13 nodes

**Execution Time Analysis from Recent Executions:**

| Execution | Total Duration | Slowest Nodes |
|-----------|----------------|---------------|
| 26139 | 1440ms | Get Items (421ms), Get Routes (455ms), Get Session (155ms) |
| 26140 | 2876ms | Extract Session (1739ms!), Get Session (411ms), Get Items (185ms) |
| 26138 | 1188ms | Normal range |
| 26125 | 873ms | Fast execution |

**Critical Finding:** Execution 26140 shows `Extract Session` taking 1739ms - this is an outlier that doubles total latency. This node is a simple Code node that should take <10ms.

**Node-by-Node Breakdown (typical):**

| Node | Typical Time | Function |
|------|--------------|----------|
| Webhook | 0ms | Entry point |
| Get Session | 150-411ms | HTTP Request to Supabase |
| Extract Session | 7-1739ms | Code node (outlier issue) |
| Get Items In Machine | 185-421ms | HTTP Request to Supabase |
| Get Machines In Route | 178-180ms | HTTP Request to Supabase |
| Get Routes | 148-455ms | HTTP Request to Supabase |
| Merge Query Results | 1ms | Merge node |
| Determine Next State | 11-12ms | Code node |
| Switch Action | 2ms | Switch node |
| Add First Item | varies | Code node (conditional) |
| Merge All Paths | 0-1ms | Merge node |
| Update Session | 157-174ms | HTTP Request to Supabase |
| Format Output | 13-14ms | Code node |

**Bottleneck Analysis:**

1. **Sequential HTTP Requests:** 4 Supabase queries running in parallel, but still add up:
   - Get Session: ~200ms
   - Get Items: ~300ms
   - Get Machines: ~180ms
   - Get Routes: ~300ms

2. **Cold Start Penalty:** n8n cloud may have cold starts causing outliers

3. **Database Query Inefficiency:** Each query is separate; could be combined

**Optimization Opportunities:**

| Optimization | Expected Savings | Risk | Implementation |
|--------------|------------------|------|----------------|
| Combine DB queries into single RPC call | 300-500ms | MEDIUM | Supabase Edge Function |
| Cache session data client-side | 150-300ms | LOW | IndexedDB cache |
| Prefetch next 3 items | 0ms (async) | LOW | Background fetch |
| Edge function closer to user | 50-100ms | LOW | Cloudflare Workers |
| Remove Get Routes query | 148-455ms | LOW | Not needed for next_item |

**Theoretical Minimum:** ~400ms (1 DB call + 1 update)

---

### 1.4 TTS (Text-to-Speech)

**Current Implementation** (from `/home/visionairy/StockerAI/src/hooks/useVoice.ts` lines 1049-1066):
```javascript
const response = await fetch(TTS_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: processed, voice: 'nova' })
});
const audioBlob = await response.blob();
// Then decodeAudioData + play
```

**Current Latency:** ~400-800ms (fetch + blob + decode + start)

**Bottleneck Analysis:**

1. **TTS API Call:** ~300-500ms to Cloudflare Worker -> OpenAI TTS
2. **Audio Blob Download:** ~50-100ms depending on audio length
3. **AudioContext Decode:** ~50-100ms for decodeAudioData
4. **Fresh AudioContext Creation:** ~50ms (required for Android speaker routing)

**Optimization Opportunities:**

| Optimization | Expected Savings | Risk | Implementation |
|--------------|------------------|------|----------------|
| Audio streaming (chunked response) | 200-400ms | HIGH | Major rewrite |
| Prefetch common phrases | 0ms (async) | LOW | Cache "5 Snickers" etc. |
| Use faster TTS voice | ~100ms | LOW | Test different voices |
| Reduce text length further | ~50-100ms | LOW | Already optimized |
| Parallel TTS fetch | 200-300ms | MEDIUM | Start TTS before workflow completes |

**Theoretical Minimum:** ~200ms (streamed audio with optimized voice)

---

### 1.5 Session Persistence

**Location:** `/home/visionairy/StockerAI/src/hooks/useSessionPersistence.ts`

**Current Behavior:**
- Non-blocking server save (line 219): `saveToServer(data, userId);` (no await)
- IndexedDB local save is synchronous-ish

**Current Latency:** ~100ms (mostly IndexedDB)

**Already Optimized:** Server save is fire-and-forget, doesn't block main flow.

---

## 2. Optimization Strategies (Prioritized by Impact/Risk)

### PRIORITY 1: Remove Unnecessary Get Routes Query ✅ DONE (Session 33)

**Status:** ✅ **DEPLOYED TO PRODUCTION** (2026-01-11)

**Workflow:** `gwmLuqCN37fhQ3Pr` (active)
**Savings:** ~300ms per "next" command
**Impact:** 12% faster

**Implementation:**
- Removed "Get Routes" node from workflow
- Reduced workflow from 13 → 12 nodes
- Trade-off: Route completion message now says "Route complete" instead of "[Route Name] complete"

---

### PRIORITY 2: Workflow Query Consolidation ✅ BUILT, READY FOR TESTING (Session 35)

**Status:** ✅ **BUILT, AWAITING DEPLOYMENT** (2026-01-12)

**Current Workflow:** 3 separate HTTP requests (Get Session, Get Items, Get Machines)
**New Workflow:** 1 Edge Function call to `/functions/v1/get-next-item-data`

**Workflow Created:** ID `3blW1i1poeCelBrI` (inactive, ready for testing)
**Expected Savings:** 400-600ms (20-30% faster)
**Testing Required:** See `/workflows/TESTING_CHECKLIST.md`

**Implementation Details:**

Supabase Edge Function `get_next_item_data` (DEPLOYED):
```sql
-- Single query that gets everything needed
SELECT
  s.id as session_id,
  s.current_item_index,
  s.current_machine_id,
  s.pick_direction,
  r.route_name,
  m.machine_name,
  m.location_name,
  i.*
FROM sessions s
JOIN routes r ON r.id = s.current_route_id
JOIN machines m ON m.id = s.current_machine_id
JOIN items i ON i.machine_id = m.id
WHERE s.session_key = $1
ORDER BY i.sequence;
```

**Documentation:** `/workflows/get_next_item_optimization_summary.md`
**Risk:** MEDIUM - Requires workflow swap
**Rollback:** Reactivate old workflow ID `gwmLuqCN37fhQ3Pr`

---

### PRIORITY 3: Client-Side Item Prefetching ❌ SKIPPED (Session 35)

**Status:** ❌ **CANCELLED - ROI TOO LOW**

**Original Claim:** "0ms instant response" from cache
**Reality:** Workflow must still execute to update database state (`current_item_index`)
**Actual Savings:** 50-100ms (network latency only, workflow still runs ~1200ms)
**Complexity:** HIGH (cache invalidation, state synchronization, edge cases)
**Risk:** MEDIUM (state desync, stale data)
**ROI:** 4% improvement for high complexity

**Decision:** Not worth the engineering effort. Focus on Priority 2 instead.

---

### ~~PRIORITY 3 ORIGINAL (ABANDONED):~~

**~~Current:~~** Each "next" command fetches the next item from the server
**~~Proposed:~~** After receiving item N, prefetch items N+1, N+2, N+3 in background

**Implementation in `StockerApp.tsx`:**
```typescript
// After successful get_next_item, prefetch next few items
const prefetchNextItems = useCallback(async (currentIndex: number) => {
  // Store in IndexedDB cache
  for (let i = 1; i <= 3; i++) {
    const nextIndex = currentIndex + i;
    // Background fetch, don't await
    fetchItem(nextIndex).then(item => {
      itemCache.set(nextIndex, item);
    });
  }
}, []);
```

---

### PRIORITY 4: Reduce Deepgram Endpointing ✅ DONE (Unknown Session)

**Status:** ✅ **DEPLOYED TO PRODUCTION**

**Location:** `src/hooks/useVoice.ts:575`
**Code:** `'endpointing=100'` (reduced from 200ms)
**Comment in code:** `// Reduced from 200ms for faster response (Performance Priority 2)`

**Savings:** ~100ms per voice command
**Risk:** MEDIUM - May cause premature cutoffs (monitor for user complaints)

**Implementation Date:** Unknown (found during Session 35 audit)

---

### PRIORITY 5: Parallel TTS Initiation ✅ DONE (Unknown Session)

**Status:** ✅ **DEPLOYED TO PRODUCTION**

**Implementation Locations:**
1. **Function:** `src/hooks/useVoice.ts:1219` - `prefetchTTS()` implemented
2. **Call Site 1:** `src/pages/StockerApp.tsx:437` - CommandRecognizer path
3. **Call Site 2:** `src/pages/StockerApp.tsx:523` - AI tool execution path

**Code:**
```typescript
// Performance Priority 5: Prefetch TTS in parallel
// Start TTS fetch immediately when result arrives (before speak() is called)
if (result.spoken) {
  v.prefetchTTS(result.spoken);
}
```

**How it works:**
- When workflow returns `result.spoken`, immediately fire-and-forget TTS fetch
- TTS audio fetched in parallel while state updates and UI renders
- When `speak()` is called later, audio is already cached
- Reduces TTS wait time from ~500-1000ms to near-zero

**Savings:** ~200-400ms
**Risk:** LOW - Fire-and-forget pattern, no blocking
**Implementation Date:** Unknown (found during Session 35 audit)

---

### PRIORITY 6: TTS Audio Streaming (HIGH IMPACT, HIGH RISK)

**Current:** Wait for complete audio file, then play
**Proposed:** Stream audio chunks as they're generated

**Implementation:** Would require:
1. Cloudflare Worker changes to stream OpenAI TTS output
2. Client-side streaming audio decoder
3. Web Audio API chunk-based playback

**Expected Savings:** 200-400ms (audio starts before full download)
**Risk:** HIGH - Major architectural change, browser compatibility issues
**Rollback:** N/A (would be separate code path)

---

## 3. Optimization Impact Summary

### Conservative Path (Safe, Incremental)

| Optimization | Savings | Cumulative | Risk |
|--------------|---------|------------|------|
| Remove Get Routes query | 300ms | 300ms | LOW |
| Reduce endpointing to 100ms | 100ms | 400ms | MEDIUM |
| Client-side prefetch | 0ms* | 400ms | LOW |
| Async session save (done) | 0ms | 400ms | N/A |

*Prefetch doesn't reduce first-command latency but makes subsequent commands instant

**Result:** 2.4s - 0.4s = **2.0 seconds** (still above goal)

### Aggressive Path (Higher Risk, Higher Reward)

| Optimization | Savings | Cumulative | Risk |
|--------------|---------|------------|------|
| All conservative optimizations | 400ms | 400ms | - |
| Supabase Edge Function | 400ms | 800ms | MEDIUM |
| Parallel TTS initiation | 300ms | 1100ms | MEDIUM |
| TTS streaming | 300ms | 1400ms | HIGH |

**Result:** 2.4s - 1.4s = **1.0 seconds** (achieves goal)

---

## 4. Testing Strategy

### 4.1 Baseline Measurement Protocol

**Before any changes, capture:**
1. 10 "next" commands in a row, measure end-to-end time
2. Record console timestamps for each stage:
   - `[CommandRecognizer] Matched`
   - `[Tools] Calling get_next_item`
   - `[Tools] get_next_item succeeded`
   - `[Voice] TTS volume multiplier`
   - `[Voice] Web Audio API playback started`

### 4.2 A/B Testing Per Optimization

**For each optimization:**
1. Create feature flag in localStorage
2. Run 20 commands with flag ON
3. Run 20 commands with flag OFF
4. Compare average latencies
5. Check for regressions (failures, wrong outputs)

### 4.3 Mobile Testing Checklist

- [ ] Test on iOS Safari (primary user device)
- [ ] Test on Android Chrome
- [ ] Test on slow 3G connection
- [ ] Test with earbuds connected
- [ ] Test during active picking session (6+ hours)

---

## 5. Rollback Procedures

### Optimization 1: Remove Get Routes Query
- **Rollback:** Re-enable "Get Routes" node in n8n workflow
- **Detection:** Missing route_name in output
- **Time:** <2 minutes

### Optimization 2: Workflow Query Consolidation
- **Rollback:** Set workflow to use original 4-node query pattern
- **Detection:** n8n execution errors or incorrect data
- **Time:** <5 minutes

### Optimization 3: Client-Side Prefetch
- **Rollback:** Delete prefetch code, clear IndexedDB cache
- **Detection:** Incorrect items shown
- **Time:** Deploy new build, <10 minutes

### Optimization 4: Deepgram Endpointing
- **Rollback:** Change `endpointing=100` back to `endpointing=200`
- **Detection:** Premature speech cutoffs reported
- **Time:** Deploy new build, <10 minutes

### Optimization 5: Parallel TTS
- **Rollback:** Remove parallel TTS code
- **Detection:** Audio glitches, wrong audio playing
- **Time:** Deploy new build, <10 minutes

---

## 6. Risk Assessment Summary

| Optimization | Impact | Risk | Priority | Reversible |
|--------------|--------|------|----------|------------|
| Remove Get Routes | HIGH | LOW | 1 | YES |
| Workflow consolidation | HIGH | MEDIUM | 2 | YES |
| Client prefetch | MEDIUM | LOW | 3 | YES |
| Endpointing reduction | MEDIUM | MEDIUM | 4 | YES |
| Parallel TTS | MEDIUM | MEDIUM | 5 | YES |
| TTS streaming | HIGH | HIGH | 6 | PARTIAL |

---

## 7. Implementation Sequence

**Phase 1: Quick Wins (Day 1)**
1. Remove Get Routes query from n8n workflow
2. Test: 10 "next" commands, verify 300ms savings

**Phase 2: STT Tuning (Day 1)**
1. Reduce endpointing to 100ms
2. Test: 20 commands, check for premature cutoffs
3. If issues, revert to 150ms as compromise

**Phase 3: Client Prefetch (Day 2)**
1. Implement IndexedDB item cache
2. Add prefetch logic after successful commands
3. Test: Cache hit rate, fallback behavior

**Phase 4: Workflow Consolidation (Day 3-4)**
1. Create Supabase Edge Function
2. Modify n8n workflow to call Edge Function
3. Test: End-to-end latency, data correctness
4. Gradual rollout with feature flag

**Phase 5: TTS Optimization (Day 5+)**
1. Implement parallel TTS initiation
2. Test edge cases (errors, cancellations)
3. Consider streaming as future enhancement

---

## 8. Critical Files for Implementation

1. **`/home/visionairy/StockerAI/src/hooks/useVoice.ts`** - STT configuration (endpointing), TTS fetch logic
   - Lines 564-573: Deepgram WebSocket URL params
   - Lines 1049-1066: TTS fetch and blob handling
   - Line 414: Silence timer fallback

2. **n8n workflow `get_next_item` (ID: eBv7SfWF7hsuNGpH)** - Query consolidation, remove Get Routes
   - Node "Get Routes": Can be removed
   - All HTTP Request nodes: Candidates for Edge Function consolidation

3. **`/home/visionairy/StockerAI/src/pages/StockerApp.tsx`** - Prefetch integration point
   - Lines 429-455: Where tool results are processed
   - Lines 513-524: Where lastItemPair is stored (could add prefetch here)

4. **`/home/visionairy/StockerAI/src/hooks/useStockerAI.ts`** - Tool execution, potential parallel TTS
   - Lines 570-675: executeToolCalls function
   - Line 660: Where onResult callback fires (trigger point for prefetch)

5. **`/home/visionairy/StockerAI/src/utils/commandRecognizer.ts`** - Already optimized, reference for confidence thresholds
   - Pattern reference for any new commands

---

## 9. Success Metrics

### Target Metrics
- **Average latency:** <1.0 seconds (from speech end to audio start)
- **P95 latency:** <1.5 seconds
- **P99 latency:** <2.0 seconds
- **Error rate:** <0.1% (same as current)

### Monitoring
- Track latency distribution before/after each optimization
- Monitor n8n execution times daily
- Track Deepgram STT accuracy (shouldn't degrade with endpointing change)
- Monitor TTS generation times

---

**END OF ANALYSIS**
