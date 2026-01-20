# Skip Machine "Save Progress" - Complete Implementation Package

**Date:** 2026-01-19
**Status:** ✅ READY TO IMPLEMENT
**Your Decision:** APPROVED - Proceed with gradual rollout

---

## Implementation Files Created

All code and instructions are ready. Here's what was created:

### 1. Database Schema Documentation
**File:** `supabase/migrations/add_save_progress_schema_docs.sql`
- Documents new JSONB fields (no migration needed)
- Backward compatibility validated
- Status: ✅ COMPLETE

### 2. Skip Workflow Updates
**File:** `workflows/skip_machine_save_progress_nodes.js` (540 lines)
- 3 new nodes to add
- 1 existing node to update
- Feature flag for easy rollback
- Status: ✅ READY FOR MANUAL UPDATE (see instructions below)

### 3. Get Next Item Workflow Updates
**File:** `workflows/get_next_item_save_progress_check.js` (320 lines)
- 1 new node to add
- 1 existing node to update
- Edge case handling documented
- Status: ✅ READY FOR MANUAL UPDATE (see instructions below)

### 4. Frontend Updates (this file - see below)
- React component changes
- Voice prompt UI
- Status: 📝 INSTRUCTIONS BELOW

### 5. Complete Test Plan (this file - see below)
- 7 test scenarios
- Validation criteria
- Expected results
- Status: 📝 READY FOR EXECUTION

---

## Phase-by-Phase Implementation Guide

### Phase 1: Database (DONE) ✅

**Time:** 15 minutes
**Files:** `supabase/migrations/add_save_progress_schema_docs.sql`

**Nothing to do** - Schema already supports what we need via JSONB.

**Validation:**
```sql
-- Verify old records still work
SELECT machine_history FROM routes WHERE machine_history IS NOT NULL LIMIT 5;
```

---

### Phase 2: Backend Workflows (MANUAL - 2 hours)

**Why manual?** n8n's partial update API is unreliable (can corrupt workflows). Safer to update in UI.

#### Workflow 1: skip_current_machine (1 hour)

**File:** `workflows/skip_machine_save_progress_nodes.js`

**Steps:**

1. **Open workflow in n8n:**
   - Go to: https://visionairy.app.n8n.cloud/workflow/ElCSMeguJNxwp0HO
   - Workflow: "skip_current_machine"

2. **Add Node 1: "Ask Save Progress"**
   - Type: HTTP Request
   - Position: After "Skip confirmed" node
   - Method: POST
   - URL: `{{$env.N8N_WEBHOOK_BASE_URL}}/webhook/ai-prompt`
   - Body: (copy from skip_machine_save_progress_nodes.js line 21-29)

3. **Add Node 2: "Parse Save Response"**
   - Type: Code
   - Position: After "Ask Save Progress"
   - Code: (copy from skip_machine_save_progress_nodes.js line 53-68)

4. **Add Node 3: "Calculate Resume Point"**
   - Type: Code
   - Position: After "Parse Save Response"
   - Code: (copy from skip_machine_save_progress_nodes.js line 85-138)

5. **Update Node: "Update Route Status"**
   - Find existing Supabase Update node
   - Update `machine_history` field to include 4 new fields
   - New structure: (copy from skip_machine_save_progress_nodes.js line 167-179)

6. **Optional: Add Feature Flag (for easy rollback)**
   - Add "Check Feature Flag" node at beginning
   - Code: (copy from skip_machine_save_progress_nodes.js line 265-283)
   - Add IF node: if skip_prompt === false → "Ask Save Progress"

7. **Save and Activate:**
   - Click "Save"
   - Ensure workflow is "Active"

**Validation:**
- Execute workflow manually (webhook test)
- Check execution log for new nodes
- Verify no errors

#### Workflow 2: get_next_item (1 hour)

**File:** `workflows/get_next_item_save_progress_check.js`

**Steps:**

1. **Open workflow in n8n:**
   - Go to: https://visionairy.app.n8n.cloud/workflow/iykbFj7f9222PF7r
   - Workflow: "get_next_item (Optimized)"

2. **Add Node: "Check Saved Progress"**
   - Type: Code
   - Position: BEFORE "Get Current Item" node
   - Code: (copy from get_next_item_save_progress_check.js line 28-100)

3. **Update Node: "Get Current Item"**
   - Find existing Supabase Select node
   - Change OFFSET field from `0` to:
     `={{$node["Check Saved Progress"].json.starting_sequence}}`

4. **Save and Activate:**
   - Click "Save"
   - Ensure workflow is "Active"

**Validation:**
- Execute workflow with test skip record
- Check execution log for "Check Saved Progress" output
- Verify starting_sequence is calculated correctly

---

### Phase 3: AI Workflow Updates (30 minutes)

**File:** Updates to AI workflow for "save" and "fresh" command recognition

**Workflow:** AI workflow (GPT-4o-mini integration)

**Changes needed:**

1. **Add new commands to vocabulary:**

In the AI system prompt or command recognition node, add:

```javascript
// Existing commands:
const KNOWN_COMMANDS = [
  'next',
  'back',
  'skip',
  'switch',
  'stop',
  // ... other commands
];

// ADD these new commands:
const NEW_COMMANDS = [
  'save',      // User wants to save progress
  'fresh'      // User wants to start fresh
];

// Recognition logic:
if (userInput.includes('save')) {
  return { command: 'save', context: 'save_progress' };
}

if (userInput.includes('fresh')) {
  return { command: 'fresh', context: 'save_progress' };
}
```

2. **Add context detection:**

```javascript
// When in save_progress_prompt context:
if (session.waiting_for_save_response) {
  // User is responding to "save or fresh?" prompt
  // Parse response for "save" or "fresh"

  if (response.includes('save')) {
    return { response: 'save' };
  } else if (response.includes('fresh')) {
    return { response: 'fresh' };
  } else {
    // Didn't understand - ask again or default to fresh
    return { response: 'fresh', reason: 'timeout' };
  }
}
```

3. **Test voice recognition:**
- Say "save" → Should recognize correctly
- Say "fresh" → Should recognize correctly
- Say similar words ("safe", "flesh") → Should NOT trigger

**Validation:**
- Test in n8n execution log
- Verify "save" and "fresh" are recognized
- Verify no false positives

---

### Phase 4: Frontend Changes (1 hour)

**File:** `src/hooks/useStockerAI.ts` and `src/components/StockerApp.tsx`

#### Step 1: Update useStockerAI.ts

**Add state for save prompt:**

```typescript
const [showSavePrompt, setShowSavePrompt] = useState(false);
const [pendingSkipMachine, setPendingSkipMachine] = useState<string | null>(null);
```

**Handle skip confirmation:**

```typescript
// When skip is confirmed, show the save prompt
const handleSkipConfirmed = () => {
  setShowSavePrompt(true);
  setPendingSkipMachine(currentMachineId);
  // Backend will ask "save or fresh?" via AI
};
```

**Handle save/fresh response:**

```typescript
// When user says "save" or "fresh"
const handleSaveProgressResponse = (response: 'save' | 'fresh') => {
  setShowSavePrompt(false);
  setPendingSkipMachine(null);
  // Response already sent to backend via AI workflow
};
```

**Listen for AI prompts:**

```typescript
// In your AI response handler
if (aiResponse.includes('save or fresh')) {
  setShowSavePrompt(true);
}

if (aiResponse.includes('saving your progress') || aiResponse.includes('starting fresh')) {
  setShowSavePrompt(false);
}
```

#### Step 2: Update StockerApp.tsx

**Add save prompt UI:**

```tsx
{showSavePrompt && (
  <div className="save-progress-prompt">
    <div className="prompt-text">
      Would you like to save your progress or start fresh?
    </div>
    <div className="prompt-hint">
      Say "save" or "fresh"
    </div>
  </div>
)}
```

**Add CSS:**

```css
.save-progress-prompt {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--primary-bg);
  border: 2px solid var(--accent);
  border-radius: 8px;
  padding: 24px;
  z-index: 1000;
  text-align: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.prompt-text {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 12px;
}

.prompt-hint {
  font-size: 14px;
  opacity: 0.7;
}
```

**Validation:**
- UI should appear when skip confirmed
- UI should disappear after response
- No blocking of other functionality

---

### Phase 5: Testing (2 hours)

**Complete test plan with validation criteria:**

#### Test 1: Save Progress Flow (20 min)

**Steps:**
1. Upload PDF with route
2. Start machine, pick 5 items (sequence 0-4)
3. Say "skip"
4. When prompted "save or fresh?", say "save"
5. Say "back to skipped"
6. Verify next item shown

**Expected Results:**
```
Step 4 - n8n execution "Calculate Resume Point":
  save_progress: true
  skipped_at_sequence: 4
  resume_from_sequence: 5
  direction_when_skipped: "forward"

Step 4 - Database machine_history:
  {
    "save_progress": true,
    "skipped_at_sequence": 4,
    "resume_from_sequence": 5,
    ...
  }

Step 6 - Next item:
  sequence_number: 5 (NOT 0)
  ✓ PASS if item #5 shown
  ✗ FAIL if item #0 shown or "machine complete"
```

#### Test 2: Fresh Start Flow (20 min)

**Steps:**
1. Start machine, pick items
2. Say "skip"
3. When prompted, say "fresh"
4. Say "back to skipped"
5. Verify next item

**Expected Results:**
```
Step 3 - n8n execution:
  save_progress: false
  resume_from_sequence: null

Step 5 - Next item:
  sequence_number: 0
  ✓ PASS if item #0 shown (first item)
  ✗ FAIL if any other sequence
```

#### Test 3: Timeout Flow (20 min)

**Steps:**
1. Start machine, pick items
2. Say "skip"
3. When prompted, DON'T respond (wait 10+ seconds)
4. Say "back to skipped"
5. Verify behavior

**Expected Results:**
```
Step 3 - After 10 seconds:
  save_progress: false (timeout default)
  resume_from_sequence: null

Step 5 - Next item:
  sequence_number: 0
  ✓ PASS if starts from beginning (old behavior preserved)
  ✗ FAIL if error or wrong item
```

#### Test 4: Backward Compatibility (15 min)

**Steps:**
1. Manually create old skip record:
   ```sql
   UPDATE routes
   SET machine_history = '[
     {
       "machine_id": "test-machine",
       "skipped_at": "2026-01-19T14:00:00Z",
       "reason": "test"
     }
   ]'::jsonb
   WHERE route_id = 'test-route';
   ```
2. Resume that skipped machine
3. Verify no errors, starts from beginning

**Expected Results:**
```
Step 2 - n8n execution "Check Saved Progress":
  save_progress: null/undefined
  starting_sequence: 0 (default)

Step 2 - Next item:
  sequence_number: 0
  ✓ PASS if no errors and starts from beginning
  ✗ FAIL if error or undefined behavior
```

#### Test 5: Reverse Direction (20 min)

**Steps:**
1. Set route to reverse direction
2. Start machine (should start from last item)
3. Pick backwards (sequence 20 → 19 → 18 → ...)
4. Skip at sequence 15
5. Say "save"
6. Say "back to skipped"
7. Verify correct resume point

**Expected Results:**
```
Step 5 - n8n execution:
  skipped_at_sequence: 15
  resume_from_sequence: 14 (one less for reverse)
  direction_when_skipped: "reverse"

Step 7 - Next item:
  sequence_number: 14
  ✓ PASS if item #14 shown
  ✗ FAIL if wrong sequence
```

#### Test 6: Voice Recognition Accuracy (15 min)

**Steps:**
Test different pronunciations and similar words:

1. Say "save" clearly → Should recognize
2. Say "fresh" clearly → Should recognize
3. Say "safe" (similar to "save") → Should NOT trigger save
4. Say "flesh" (similar to "fresh") → Should NOT trigger fresh
5. Say "save me" → Should recognize "save"
6. Say "fresh start" → Should recognize "fresh"

**Expected Results:**
```
✓ PASS if "save" and "fresh" recognized >95% of time
✓ PASS if similar words don't trigger false positives
✗ FAIL if <95% accuracy or false positives
```

#### Test 7: 4AM Cold Warehouse Simulation (10 min)

**Steps:**
1. Set alarm for early morning (optional - or simulate cold environment)
2. Test in actual stocking environment:
   - Cold hands
   - Voice recognition in warehouse
   - Rapid workflow (no time to wait)
3. Execute full route with skips and resumes

**Expected Results:**
```
✓ PASS if:
  - Voice recognition works in warehouse
  - Prompt doesn't slow workflow too much
  - User can operate hands-free

✗ FAIL if:
  - Voice recognition fails in cold/noisy environment
  - Prompt causes frustration or delay
  - User needs to look at screen
```

**Validation Summary:**
- All 7 tests must pass before full rollout
- Any failures require fixes before proceeding
- Test 7 is most critical (real-world validation)

---

### Phase 6: Gradual Rollout (1 week)

#### Week 1: Single User Test

**Days 1-3: Initial Testing**
1. Enable feature for 1 test user (you or trusted beta tester)
2. Monitor daily:
   - How often is "save" chosen vs "fresh"?
   - Any errors in n8n execution logs?
   - Any user complaints?

**Days 4-7: Data Collection**
1. Collect metrics:
   ```sql
   -- Count save vs fresh choices
   SELECT
     COUNT(*) FILTER (WHERE machine_history->'save_progress' = 'true') as saved,
     COUNT(*) FILTER (WHERE machine_history->'save_progress' = 'false') as fresh,
     COUNT(*) FILTER (WHERE machine_history->'save_progress' IS NULL) as old_skips
   FROM routes
   WHERE machine_history IS NOT NULL;
   ```

2. Interview user:
   - "Did saving progress actually save time?"
   - "Was the prompt annoying or helpful?"
   - "Any issues or bugs?"

#### Decision Point (Day 7):

**Proceed to full rollout if:**
- ✅ Zero critical errors
- ✅ User reports positive experience
- ✅ "Save" chosen >50% of time (indicates value)
- ✅ Voice recognition >95% accurate

**Rollback if:**
- ❌ Critical errors or crashes
- ❌ User reports frustration
- ❌ "Save" chosen <20% (no value)
- ❌ Voice recognition issues

#### Week 2: Full Rollout (if approved)

**Days 8-9: Deployment**
1. No code changes (already deployed for test user)
2. Feature is live for all users automatically

**Days 10-14: Monitoring**
1. Check error logs daily
2. Monitor support requests
3. Collect usage metrics

**Rollback triggers:**
- >3 user complaints
- >5% error rate
- Critical bug discovered

---

## Rollback Procedures

### Quick Rollback (5 minutes)

**If issues occur during rollout:**

1. **Open skip_current_machine workflow in n8n**
2. **Find "Check Feature Flag" node** (if you added it)
3. **Change:**
   ```javascript
   var ENABLE_SAVE_PROGRESS = false;  // Was: true
   ```
4. **Save workflow**
5. **Verify:**
   - Skip workflow works without prompt
   - All skips default to "fresh" behavior
   - No errors

**Result:** Feature instantly disabled, old behavior restored

### Complete Rollback (30 minutes)

**If permanent removal needed:**

1. **Delete 3 nodes from skip_current_machine:**
   - "Ask Save Progress"
   - "Parse Save Response"
   - "Calculate Resume Point"

2. **Revert "Update Route Status" node:**
   - Remove 4 new fields from machine_history

3. **Delete 1 node from get_next_item:**
   - "Check Saved Progress"

4. **Revert "Get Current Item" query:**
   - Change OFFSET back to `0`

5. **Remove frontend changes:**
   - Delete save prompt state
   - Remove save prompt UI

6. **Save all workflows**

7. **Deploy frontend changes**

**Result:** Complete removal, old behavior fully restored

**Data impact:** NONE (new fields in database are harmless)

---

## Success Metrics

**After 1 week of testing:**

| Metric | Target | Actual |
|--------|--------|--------|
| Critical errors | 0 | ___ |
| Voice recognition accuracy | >95% | ___ |
| User satisfaction | Positive | ___ |
| "Save" adoption rate | >50% | ___ |
| Average time saved per skip | >2 min | ___ |

**After 2 weeks of full rollout:**

| Metric | Target | Actual |
|--------|--------|--------|
| Error rate | <5% | ___ |
| User complaints | <3 | ___ |
| Continued usage | >80% | ___ |

---

## Implementation Checklist

### Before You Start
- [ ] Read all implementation files
- [ ] Understand rollback procedures
- [ ] Have n8n access ready
- [ ] Have test route uploaded

### Phase 1: Database (15 min)
- [ ] Read schema documentation
- [ ] Verify old records still work
- [ ] No migration needed ✓

### Phase 2: Workflows (2 hours)
- [ ] Update skip_current_machine (1 hour)
  - [ ] Add 3 new nodes
  - [ ] Update 1 existing node
  - [ ] Add feature flag (optional)
  - [ ] Save and activate
- [ ] Update get_next_item (1 hour)
  - [ ] Add 1 new node
  - [ ] Update 1 existing query
  - [ ] Save and activate

### Phase 3: AI Workflow (30 min)
- [ ] Add "save" and "fresh" to vocabulary
- [ ] Add context detection
- [ ] Test voice recognition

### Phase 4: Frontend (1 hour)
- [ ] Update useStockerAI.ts
- [ ] Update StockerApp.tsx
- [ ] Add CSS for prompt
- [ ] Test UI display

### Phase 5: Testing (2 hours)
- [ ] Test 1: Save progress flow
- [ ] Test 2: Fresh start flow
- [ ] Test 3: Timeout flow
- [ ] Test 4: Backward compatibility
- [ ] Test 5: Reverse direction
- [ ] Test 6: Voice recognition
- [ ] Test 7: 4AM simulation

### Phase 6: Rollout (1 week)
- [ ] Day 1: Enable for test user
- [ ] Days 2-7: Monitor and collect data
- [ ] Day 7: Make go/no-go decision
- [ ] Days 8-14: Full rollout (if approved)

### Validation
- [ ] All 7 tests passing
- [ ] No errors in n8n logs
- [ ] User reports positive feedback
- [ ] Rollback procedures tested

---

## Quick Reference

**Implementation files:**
- `supabase/migrations/add_save_progress_schema_docs.sql`
- `workflows/skip_machine_save_progress_nodes.js`
- `workflows/get_next_item_save_progress_check.js`
- This file (complete package)

**Total time:**
- Development: 6 hours
- Testing: 2 hours
- Gradual rollout: 1 week
- **Total: 1 week + 1 day**

**Rollback time:**
- Quick: 5 minutes
- Complete: 30 minutes

**Risk level:** MEDIUM
- User-facing change
- Safe defaults (timeout → fresh)
- Easy rollback
- No breaking changes

---

## Next Steps

**You're ready to implement!**

1. Start with Phase 2 (workflows) - 2 hours
2. Then Phase 3 (AI) - 30 minutes
3. Then Phase 4 (frontend) - 1 hour
4. Then Phase 5 (testing) - 2 hours
5. Then Phase 6 (rollout) - 1 week

**Questions?** Everything is documented in the implementation files.

**Ready to start?** Open n8n and begin with skip_current_machine workflow!

---

**END OF IMPLEMENTATION PACKAGE**
