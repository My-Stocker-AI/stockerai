# Safe Testing Strategy - Using Duplicate Sample Data
**Created:** 2026-01-12 (Session 35)
**Purpose:** Test full functionality without affecting production data

---

## Testing Philosophy

**NEVER test on production data.**

Use duplicate/sample data with clearly marked test identifiers:
- Test routes: Names starting with `TEST_`
- Test users: Email format `test+{name}@example.com`
- Test sessions: Session IDs with `test_` prefix
- Test workflows: Separate webhook paths (`/test-next-item` vs `/next-item`)

---

## What CAN Be Tested Safely

### 1. ✅ Edge Function Workflow (Priority 2)

**Safe Test Setup:**
1. Upload test route PDF with name: `TEST_Edge_Function_Route`
2. Test workflow already created with path: `/next-item-optimized`
3. Frontend can switch between workflows via localStorage flag

**Test Process:**
```javascript
// In browser console on StockerApp
localStorage.setItem('use-optimized-workflow', 'true');
// Reload page, start picking
// Workflow calls /next-item-optimized instead of /next-item
```

**What This Tests:**
- Edge Function returns correct data structure
- Workflow logic handles consolidated response
- Session state updates correctly
- Items advance in correct sequence
- No data corruption

**Risk:** ZERO - Different webhook path, test route data only

---

### 2. ✅ Voice Biometric Enrollment

**Safe Test Setup:**
1. Create test user: `test+voiceprint@example.com`
2. Enroll voiceprint in test account
3. Test speaker verification on test routes

**Test Process:**
1. User records 10-15 voice samples: "Hey Stocker", "Next", "Skip", etc.
2. System extracts speaker embedding (512-dim vector)
3. Store in `profiles` table: `voiceprint_embedding` column
4. During picking, compare live audio to stored voiceprint
5. Only activate if similarity >0.85

**What This Tests:**
- Voiceprint extraction accuracy
- Speaker verification threshold tuning
- False positive rate (wrong speaker)
- False negative rate (correct speaker rejected)
- Multi-user isolation

**Risk:** ZERO - Test account, no production impact

---

### 3. ✅ Environmental Noise Profiling

**Safe Test Setup:**
1. Use test route
2. Record ambient noise baseline during test session
3. Adjust VAD threshold dynamically based on noise

**Test Process:**
1. Capture 3-5 seconds of ambient noise on session start
2. Measure noise floor (dB level)
3. Classify environment: "Quiet", "Moderate", "Loud"
4. Auto-adjust Deepgram `vad_threshold`
5. Monitor accuracy across different environments

**What This Tests:**
- Noise detection algorithm accuracy
- VAD threshold optimization per environment
- Automatic gain control (AGC)
- Real-world warehouse vs quiet garage performance

**Risk:** ZERO - No data writes, only audio analysis

---

### 4. ✅ Personal Wake Word System

**Safe Test Setup:**
1. Test users enroll unique wake words:
   - Test User 1: "Hey Stocker Alpha"
   - Test User 2: "Hey Stocker Bravo"
   - Test User 3: "Hey Stocker Charlie"
2. Each stored in user profile

**Test Process:**
1. User logs in, system loads their personal wake word
2. Deepgram keywords list includes only their wake word
3. Test cross-talk: User 1 says "Hey Stocker Bravo" → Should NOT activate
4. Measure wake word detection accuracy

**What This Tests:**
- Wake word personalization
- Cross-talk prevention
- Keyword spotting accuracy
- User isolation effectiveness

**Risk:** ZERO - Test users, test routes

---

### 5. ✅ 2-Item Mode UI (Already Fixed, Needs Validation)

**Safe Test Setup:**
1. Use test route with multiple items
2. Enable 2-item mode toggle in settings
3. Verify both items display in UI

**Test Process:**
1. Start test route
2. Enable "Call 2 Items at Once" toggle
3. Say "Next"
4. Verify:
   - Voice speaks both items: "5 Snickers, 3 Coca-Cola"
   - UI shows item 1 above border
   - UI shows item 2 below border
   - Repeat command repeats both items

**What This Tests:**
- 2-item mode workflow logic
- UI rendering of dual items
- Repeat functionality
- State management

**Risk:** ZERO - Test route, no production impact

---

### 6. ✅ Command Recognition Patterns

**Safe Test Setup:**
1. Test route with test user
2. Test various voice commands and phonetic variations

**Test Process:**
Test CommandRecognizer with:
- "next", "nex", "necks" → Should all trigger next_item
- "skip", "schip", "escaped" → Should all trigger skip_machine
- "repeat", "re-peat", "repeat that" → Should all trigger repeat
- "top", "bottom" → Should set direction

**What This Tests:**
- Keyword recognition accuracy
- Phonetic variation handling
- CommandRecognizer MECE coverage
- False positive rate

**Risk:** ZERO - Test data, deterministic logic

---

### 7. ✅ Session Persistence & Recovery

**Safe Test Setup:**
1. Create test route
2. Start picking, then close browser mid-session
3. Reopen and verify state restored

**Test Process:**
1. Start test route, complete 3-5 items
2. Force close browser (or kill tab)
3. Reopen StockerApp
4. Verify:
   - Session restored
   - Current item is correct
   - Completed items list intact
   - Can continue picking from where left off

**What This Tests:**
- IndexedDB persistence
- State serialization/deserialization
- Session recovery logic
- No data loss

**Risk:** ZERO - Test session, designed for this

---

## What CANNOT Be Tested Safely (Production Only)

### ❌ Real Route Data Modification
**Why:** Could corrupt actual picking workflows
**Alternative:** Use TEST_ routes with duplicate data structure

### ❌ Multi-User Cross-Talk (With Real Users)
**Why:** Requires real users' voices and real routes
**Alternative:** Simulate with test accounts, validate in staging before production

### ❌ Production Workflow Swaps
**Why:** Could break active picking sessions
**Alternative:** A/B test with feature flag, rollback ready

---

## Test Data Setup Scripts

### Create Test Route
```sql
-- Create test route with TEST_ prefix
INSERT INTO routes (user_id, route_name, delivery_date, total_machines, total_items)
VALUES (
  '[test-user-id]',
  'TEST_Edge_Function_Route',
  CURRENT_DATE,
  3,
  20
);

-- Get the route ID
-- Then create machines and items manually or via PDF upload
```

### Create Test User
```sql
-- Use Supabase Auth UI or:
INSERT INTO auth.users (email, encrypted_password, email_confirmed_at)
VALUES (
  'test+voiceprint@example.com',
  '[hashed-password]',
  NOW()
);

-- Then create profile
INSERT INTO profiles (id, email, first_name, last_name)
VALUES (
  '[auth-user-id]',
  'test+voiceprint@example.com',
  'Test',
  'User'
);
```

### Create Test Session
```javascript
// In browser console after logging in as test user
const testSessionId = `test_session_${Date.now()}`;
localStorage.setItem('stocker-session-id', testSessionId);
// Now start picking - will use test session ID
```

---

## Testing Checklist

### Pre-Deployment Testing

- [ ] **Edge Function Workflow**
  - [ ] Upload test route
  - [ ] Enable optimized workflow flag
  - [ ] Complete full route
  - [ ] Verify no errors in console
  - [ ] Compare output with old workflow
  - [ ] Measure latency improvement

- [ ] **Voice Biometric**
  - [ ] Enroll 3 test users
  - [ ] Test cross-talk (User A's voice on User B's device)
  - [ ] Test false positives (TV/radio)
  - [ ] Measure verification latency (<200ms target)
  - [ ] Test accuracy across demographics

- [ ] **Environmental Profiling**
  - [ ] Test in quiet room
  - [ ] Test in moderate noise (TV at 60-70 dB)
  - [ ] Test in loud environment (warehouse simulation)
  - [ ] Verify VAD threshold auto-adjusts
  - [ ] Measure accuracy delta across environments

- [ ] **2-Item Mode**
  - [ ] Enable toggle
  - [ ] Verify both items show in UI
  - [ ] Test repeat command
  - [ ] Test boundary (last item in machine)
  - [ ] Disable toggle, verify single-item mode still works

---

## Staging Environment Setup (Recommended)

### Ideal Setup
1. **Separate Supabase Project** for staging
2. **Separate n8n Workflows** with `/test-*` webhook paths
3. **Test User Pool** (`test+*@example.com` emails)
4. **Feature Flags** to switch between staging/production endpoints

### Minimum Setup (Current)
1. **Test Routes** with `TEST_` prefix in production database
2. **Test Users** with `test+*@example.com` in production auth
3. **Feature Flags** (localStorage) to switch workflow endpoints
4. **Clear Test Data Weekly** to avoid clutter

---

## Data Cleanup After Testing

### Delete Test Routes
```sql
DELETE FROM items WHERE machine_id IN (
  SELECT id FROM machines WHERE route_id IN (
    SELECT id FROM routes WHERE route_name LIKE 'TEST_%'
  )
);

DELETE FROM machines WHERE route_id IN (
  SELECT id FROM routes WHERE route_name LIKE 'TEST_%'
);

DELETE FROM routes WHERE route_name LIKE 'TEST_%';
```

### Delete Test Sessions
```sql
DELETE FROM sessions WHERE id LIKE 'test_%';
```

### Keep Test Users (Reusable)
Don't delete test users - they can be reused for future testing.

---

## Monitoring During Tests

### What to Watch

1. **Browser Console**
   - Look for errors (red text)
   - Check workflow execution logs
   - Monitor TTS prefetch messages

2. **Network Tab**
   - Measure API latency
   - Check payload sizes
   - Verify correct endpoints called

3. **n8n Execution Logs**
   - Check for workflow errors
   - Verify data structure correctness
   - Monitor execution time

4. **Supabase Logs**
   - Check for database errors
   - Monitor RLS policy violations
   - Verify cascade deletes work

---

## Success Criteria

### Edge Function Workflow
- ✅ Completes full test route without errors
- ✅ Latency <1500ms (vs ~2400ms current)
- ✅ Output identical to old workflow
- ✅ No state corruption

### Voice Biometric
- ✅ <1% cross-talk rate (3+ test users)
- ✅ <1% false positive rate (TV/radio test)
- ✅ >98% true positive rate (correct user)
- ✅ Verification latency <200ms

### Environmental Profiling
- ✅ Accurately classifies environment type
- ✅ VAD threshold adjusts correctly
- ✅ Accuracy delta <5% across environments
- ✅ No false negatives in loud environments

---

## Risk Mitigation

### If Test Affects Production
1. **Immediate Rollback**
   - Disable feature flag
   - Revert to old workflow/code
   - Clear affected sessions

2. **Data Recovery**
   - Restore from backup if test data corrupts production
   - Supabase has point-in-time recovery

3. **Communication**
   - Notify affected users if test impacts them
   - Document what went wrong
   - Update testing procedures

---

**Status:** ✅ READY FOR USE
**Next Update:** After first major test cycle
