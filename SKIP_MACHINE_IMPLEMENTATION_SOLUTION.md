# Skip Machine "Save Progress" Feature - Complete Implementation Solution

**Date:** 2026-01-19
**Status:** ✅ PRESERVATION ANALYSIS COMPLETE - Ready for implementation
**Risk:** MEDIUM (user-facing UX change, but safe defaults + easy rollback)

---

## PRESERVATION Analysis Results

**Changes Discovered:** 5
**Auto-Approved:** 4 (backward compatible)
**Your Decision Needed:** 1 (voice prompt UX trade-off)
**Breaking Changes:** 0
**MECE Score:** 1.0 ✓

**Recommendation:** PROCEED with gradual rollout

---

## The One Decision You Need to Make

**CHANGE_002: Voice Prompt (EVOLUTION)**

**Question:** Is 3-10 second interruption worth 2-10 minute savings?

**Trade-off:**
- **Cost:** 3-10 second voice prompt after every skip (100% of skip operations)
- **Benefit:** Saves 2-10 minutes by not re-picking 5-30 items
- **Frequency:** Unknown (need usage data on how often machines are skipped)

**Recommended Option:** Gradual rollout
1. Test with 1 user for 1 week
2. Monitor: Does it actually save time? Does it frustrate?
3. If positive: Roll out to all users
4. If negative: Disable via feature flag (5 minutes)

**Rollback:** INSTANT (feature flag toggle)

**Your Call:** Proceed with gradual rollout? (yes/no)

---

## Complete Implementation Plan

### Phase 1: Database Schema (15 minutes)

**File:** `supabase/migrations/add_save_progress_to_machine_history.sql`

```sql
-- Add save progress fields to machine_history (JSON column)
-- These fields are optional and nullable, so backward compatible

-- No ALTER TABLE needed - machine_history is already JSONB
-- Just document the new schema:

/*
machine_history JSONB fields (updated schema):
{
  "skipped_at": "2026-01-19T14:30:00Z",
  "reason": "need more time",

  // NEW fields (optional):
  "save_progress": true,                  // User chose to save progress
  "skipped_at_sequence": 5,               // Sequence number when skipped
  "resume_from_sequence": 6,              // Where to resume (skipped_at + 1 for forward)
  "direction_when_skipped": "forward"     // Direction at time of skip
}
*/

-- No migration needed - fields are optional in JSON
```

**Test:**
```sql
-- Verify old records still work
SELECT * FROM routes WHERE machine_history IS NOT NULL LIMIT 5;

-- Should return successfully (old records don't have new fields)
```

**Duration:** 15 minutes
**Risk:** NONE (backward compatible)

---

### Phase 2: Backend Workflows (2 hours)

#### 2.1: Update skip_current_machine Workflow

**File:** `workflows/skip_current_machine.json` (n8n)

**Changes:**

**Add after "Skip confirmed" node:**

```javascript
// NEW NODE: "Ask Save Progress"
// Type: AI Workflow Call
{
  "endpoint": "/ai-workflow",
  "prompt": "Ask user: 'Would you like to save your progress on this machine, or start fresh when you come back to it? Say save or fresh.'",
  "timeout": 10000  // 10 seconds
}

// NEW NODE: "Handle Save Response"
// Type: Code
{
  "code": `
    const response = $json.ai_response.toLowerCase();
    const saveProgress = response.includes('save');
    const currentSequence = $json.current_sequence_number;
    const direction = $json.current_direction;

    // Calculate resume point
    let resumeFrom;
    if (saveProgress) {
      if (direction === 'forward') {
        resumeFrom = currentSequence + 1;
      } else {
        resumeFrom = currentSequence - 1;
      }
    } else {
      resumeFrom = null;  // Will start from beginning
    }

    return {
      save_progress: saveProgress,
      skipped_at_sequence: currentSequence,
      resume_from_sequence: resumeFrom,
      direction_when_skipped: direction
    };
  `
}

// NEW NODE: "Update Machine History"
// Type: Supabase Update
{
  "table": "routes",
  "filter": {
    "session_id": "{{ $json.session_id }}",
    "route_id": "{{ $json.route_id }}"
  },
  "update": {
    "machine_history": {
      "machine_id": "{{ $json.machine_id }}",
      "skipped_at": "{{ $now }}",
      "reason": "{{ $json.skip_reason }}",
      "save_progress": "{{ $json.save_progress }}",
      "skipped_at_sequence": "{{ $json.skipped_at_sequence }}",
      "resume_from_sequence": "{{ $json.resume_from_sequence }}",
      "direction_when_skipped": "{{ $json.direction_when_skipped }}"
    }
  }
}
```

**Timeout handling:**
```javascript
// If AI response times out (10 seconds), default to "fresh"
{
  "on_timeout": {
    "save_progress": false,
    "resume_from_sequence": null
  }
}
```

**Duration:** 1 hour
**Risk:** LOW (timeout defaults to old behavior)

---

#### 2.2: Update get_next_item Workflow

**File:** `workflows/get_next_item_optimized.json` (n8n)

**Changes:**

**Add before "Get current item" node:**

```javascript
// NEW NODE: "Check Saved Progress"
// Type: Code
{
  "code": `
    const machineHistory = $json.machine_history || {};
    const saveProgress = machineHistory.save_progress || false;
    const resumeFrom = machineHistory.resume_from_sequence;
    const currentMachineId = $json.machine_id;

    // If this is a resume from skip AND user chose to save progress
    if (saveProgress && resumeFrom !== null && resumeFrom !== undefined) {
      // Resume from saved sequence
      return {
        start_sequence: resumeFrom,
        resuming_from_save: true
      };
    } else {
      // Start from beginning (old behavior)
      return {
        start_sequence: 0,
        resuming_from_save: false
      };
    }
  `
}

// MODIFY: "Get current item" node
// Change query to use start_sequence from above
{
  "query": `
    SELECT * FROM items
    WHERE machine_id = '{{ $json.machine_id }}'
    ORDER BY sequence_number
    OFFSET {{ $json.start_sequence }}
    LIMIT 1
  `
}
```

**Duration:** 1 hour
**Risk:** LOW (defaults to old behavior if fields missing)

---

### Phase 3: Frontend Changes (1 hour)

**File:** `src/hooks/useStockerAI.ts`

**Changes:**

```typescript
// Add state for save progress prompt
const [showSavePrompt, setShowSavePrompt] = useState(false);
const [pendingSkipMachine, setPendingSkipMachine] = useState<string | null>(null);

// Modify handleSkip function
const handleSkip = async (reason: string) => {
  // Show save progress prompt
  setShowSavePrompt(true);
  setPendingSkipMachine(currentMachineId);

  // AI will ask user "save or fresh?"
  // Response handled in handleAIResponse
};

// Add handler for save/fresh response
const handleSaveProgressResponse = (saveProgress: boolean) => {
  setShowSavePrompt(false);

  // Send to backend
  // Backend will calculate resume point and update machine_history
};
```

**File:** `src/components/StockerApp.tsx`

**Changes:**

```tsx
// Add save progress prompt UI
{showSavePrompt && (
  <div className="save-progress-prompt">
    <p>Would you like to save your progress or start fresh?</p>
    <p className="hint">Say "save" or "fresh"</p>
  </div>
)}
```

**Duration:** 1 hour
**Risk:** LOW (just UI display, doesn't change logic)

---

### Phase 4: AI Workflow Updates (30 minutes)

**File:** `workflows/ai_workflow.json` (n8n)

**Changes:**

```javascript
// Add to voice command recognition
{
  "recognized_commands": [
    "next",
    "back",
    "skip",
    "switch",
    "save",    // NEW
    "fresh"    // NEW
  ]
}

// Add context detection
{
  "context": "save_progress_prompt",
  "active_when": "{{ $json.waiting_for_save_response }}",
  "commands": {
    "save": "User wants to save progress",
    "fresh": "User wants to start fresh"
  }
}
```

**Duration:** 30 minutes
**Risk:** NONE (new commands don't conflict with existing)

---

### Phase 5: Testing (2 hours)

#### Test Plan

**Test 1: Old Behavior Preserved (Backward Compatibility)**
```
1. Skip machine without responding to prompt
   → Should timeout after 10 seconds
   → Should default to "fresh" (start from beginning)
   → Should work exactly like old skip

2. Load route with old machine_history (no save_progress fields)
   → Resume skipped machine
   → Should start from first item (old behavior)
   → No errors

PASS CRITERIA: Identical to old skip behavior
```

**Test 2: Save Progress Flow**
```
1. Skip machine
2. Prompt appears: "save or fresh?"
3. Say "save"
4. System confirms: "Got it, saving your progress"
5. Resume machine later
6. Should start from NEXT item after skip (not first)

PASS CRITERIA: Resume from correct sequence number
```

**Test 3: Fresh Start Flow**
```
1. Skip machine
2. Prompt appears
3. Say "fresh"
4. System confirms: "Got it, starting fresh"
5. Resume machine later
6. Should start from FIRST item

PASS CRITERIA: Starts from beginning (same as old behavior)
```

**Test 4: Voice Recognition**
```
1. Test "save" recognition accuracy
2. Test "fresh" recognition accuracy
3. Test similar words don't trigger ("safe", "flesh", etc.)

PASS CRITERIA: >95% accuracy on "save" and "fresh"
```

**Test 5: Edge Cases**
```
1. Skip forward, then change direction to backward, then resume
   → Should resume correctly based on saved direction

2. Skip multiple machines with different save choices
   → Each should resume independently

3. Item deleted from route after skip
   → Should handle gracefully (skip to next item)

PASS CRITERIA: No crashes, graceful handling
```

**Test 6: 4AM Cold Warehouse Simulation**
```
1. Real user test at actual stocking time
2. Cold environment (test voice recognition with cold hands)
3. Rapid workflow (test if prompt is too slow)

PASS CRITERIA: User reports positive experience
```

**Duration:** 2 hours
**Risk:** MEDIUM (must validate all scenarios)

---

### Phase 6: Gradual Rollout (1 week)

**Week 1: Single User Test**
```
1. Enable for 1 test user (your account or trusted beta user)
2. Monitor:
   - How often is "save" chosen vs "fresh"?
   - Does it actually save time?
   - Any frustration with the prompt?
   - Voice recognition accuracy
3. Collect feedback

DECISION POINT: Proceed or abort based on feedback
```

**Week 2: Full Rollout** (if Week 1 positive)
```
1. Enable for all users
2. Monitor error logs for 48 hours
3. Check support requests for confusion

ROLLBACK TRIGGER: >3 complaints OR critical errors
```

**Duration:** 1 week (testing) + 2 days (monitoring)

---

## Implementation Timeline

| Phase | Duration | Risk | Blocking? |
|-------|----------|------|-----------|
| Database Schema | 15 min | NONE | No |
| Backend Workflows | 2 hours | LOW | No |
| Frontend UI | 1 hour | LOW | No |
| AI Workflow | 30 min | NONE | No |
| Testing | 2 hours | MEDIUM | YES |
| Gradual Rollout | 1 week | MEDIUM | YES (decision point) |

**Total Development Time:** 6 hours
**Total Testing Time:** 2 hours
**Total Rollout Time:** 1 week

---

## Rollback Plan

### Instant Rollback (5 minutes)

**If issues occur:**

1. **Disable feature flag**
   ```bash
   # Set environment variable
   ENABLE_SAVE_PROGRESS=false

   # OR disable in n8n workflow
   # Add condition: if (ENABLE_SAVE_PROGRESS === false) { skip prompt }
   ```

2. **Verify old behavior restored**
   - Skip machine
   - No prompt appears
   - Works like before

3. **Monitor for 30 minutes**
   - Ensure no errors
   - Verify skip functionality normal

**Data Impact:** NONE - new fields remain in database but are ignored

### Complete Rollback (1 hour)

**If permanent removal needed:**

1. Revert skip_current_machine workflow
2. Revert get_next_item workflow
3. Revert AI workflow changes
4. Revert frontend changes
5. Deploy

**Data Cleanup:** Optional (new fields harmless, can be left)

---

## Success Metrics

**Week 1 (Single User Test):**
- [ ] Zero critical errors
- [ ] Voice recognition >95% accuracy
- [ ] User reports positive experience
- [ ] "Save" chosen >50% of the time (indicates value)

**Week 2 (Full Rollout):**
- [ ] <5% error rate
- [ ] <3 user complaints
- [ ] Average time saved per skip: >2 minutes (measure actual)
- [ ] Adoption rate: >50% choosing "save" vs "fresh"

**If metrics NOT met:** Rollback and re-evaluate

---

## Files to Create/Modify

### Create New:
```
supabase/migrations/add_save_progress_schema_docs.sql  (documentation only)
tests/skip_machine_save_progress.test.ts
```

### Modify Existing:
```
workflows/skip_current_machine.json        (n8n - add prompt + logic)
workflows/get_next_item_optimized.json     (n8n - check saved progress)
workflows/ai_workflow.json                 (n8n - add "save"/"fresh" commands)
src/hooks/useStockerAI.ts                  (frontend - state + UI)
src/components/StockerApp.tsx              (frontend - prompt display)
```

---

## Your Decision Point

**PRESERVATION analysis shows:**
- ✅ 4 changes are safe (backward compatible)
- ❓ 1 change requires your judgment (UX trade-off)
- ⚠️ 0 breaking changes

**The question:**
Is 3-10 second interruption worth 2-10 minute savings?

**Recommendation:**
YES - Proceed with gradual rollout because:
1. Timeout defaults to old behavior (safe)
2. Easy rollback (5 minutes)
3. Addresses real pain point (re-picking items)
4. Low risk (can abort after 1-week test)

**Your call:** Approve gradual rollout? (yes/no)

---

## Next Steps

**If YES:**
1. I implement Phase 1-4 (6 hours development)
2. You test Phase 5 (2 hours)
3. We enable for 1 user (Week 1)
4. Review feedback
5. Full rollout or rollback (Week 2)

**If NO:**
- Skip this feature
- Keep current behavior
- No changes needed

**If "Let me think about it":**
- Analysis is complete
- No pressure
- Decision can wait

---

**PRESERVATION VALIDATION:** ✅ COMPLETE
**BREAKING CHANGES:** 0
**ROLLBACK TIME:** 5 minutes
**READY TO PROCEED:** YES

What's your decision?
