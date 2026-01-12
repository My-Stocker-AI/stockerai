# Comprehensive Testing Plan - 2026-01-12
**Created:** 2026-01-11 (Session 35)
**Deployments:** Environmental Detection + Edge Function (both LIVE)
**Purpose:** Validate bug fixes and measure performance improvements

---

## Pre-Testing Checklist

### ✅ Verify Deployments Are Live

1. **Frontend Code (Cloudflare Pages)**
   - Visit: https://my-stocker-ai.com
   - Check browser console - should see version/build timestamp
   - Expected: Commit `5ab0338` or later

2. **Edge Function Workflow (n8n)**
   - Login to n8n: https://visionairy.app.n8n.cloud
   - Find workflow: "Stocker Tool: get_next_item (Optimized)" (ID: `iykbFj7f9222PF7r`)
   - Status should be: INACTIVE (not activated yet)
   - Webhook path: `/next-item-optimized`

3. **Environmental Detection Code**
   - File: `src/hooks/useEnvironmentDetection.ts`
   - Check thresholds: QUIET_THRESHOLD = -40, MODERATE_THRESHOLD = -20 (raw dB scale)
   - Check cleanup: useEffect with AudioContext.close() present
   - Check suspension handling: audioContext.resume() before use

---

## Test 1: Environmental Detection (30 minutes)

### Test 1A: Auto-Detection in Quiet Environment

**Location:** Garage, quiet room, or home office

**Steps:**
1. Open StockerApp on phone
2. Tap Settings (gear icon)
3. Scroll to "Environment Type" section
4. Tap "🔍 Auto-Detect Environment" button
5. Wait 3 seconds (phone will listen to ambient noise)

**Expected Results:**
- ✅ "Detected: 🏡 Quiet (Garage, Small Room)"
- ✅ Console shows: `[EnvDetect] ✅ Detection complete: { type: 'quiet', noiseLevel: '-XX dB' }`
- ✅ VAD threshold: 0.3, Mic gain: 1.0, Endpointing: 100ms

**Check for Bugs:**
- ❌ Does NOT classify as "moderate" or "loud" when actually quiet
- ❌ Console does NOT show memory leak warnings
- ❌ Microphone indicator stays on after detection (should turn off)

### Test 1B: Auto-Detection in Moderate Noise

**Location:** Office with background chatter, or room with TV at 60-70dB

**Steps:**
1. Turn on TV or play music at moderate volume
2. Repeat auto-detect steps from Test 1A

**Expected Results:**
- ✅ "Detected: 🏢 Moderate (Office, Small Warehouse)"
- ✅ Console shows: `type: 'moderate', noiseLevel: '-XX dB'` (between -40 and -20)
- ✅ VAD threshold: 0.5, Mic gain: 1.2, Endpointing: 150ms

### Test 1C: Auto-Detection in Loud Noise

**Location:** Warehouse, or simulate with loud TV/music (80+ dB)

**Steps:**
1. Turn on loud machinery sound (YouTube: "warehouse noise 1 hour")
2. Repeat auto-detect steps from Test 1A

**Expected Results:**
- ✅ "Detected: 🏭 Loud (Large Warehouse, Factory)"
- ✅ Console shows: `type: 'loud', noiseLevel: '-XX dB'` (> -20 dB)
- ✅ VAD threshold: 0.7, Mic gain: 1.5, Endpointing: 200ms

### Test 1D: Manual Override

**Steps:**
1. Auto-detect shows "Quiet"
2. Manually tap "🏢 Moderate" button
3. Check that status changes to Moderate
4. Manually tap "🏭 Loud" button
5. Check that status changes to Loud

**Expected Results:**
- ✅ Manual selection overrides auto-detection
- ✅ Settings persist across sessions (localStorage)
- ✅ Console logs: `[EnvDetect] 👤 Manual override: moderate`

### Test 1E: Memory Leak Check

**Steps:**
1. Run auto-detect 10 times in a row
2. Open Chrome Task Manager (Shift+Esc)
3. Check memory usage before and after

**Expected Results:**
- ✅ Memory usage does NOT increase significantly after 10 detections
- ✅ AudioContext count remains at 1 (check: `window.AudioContext.prototype`)
- ✅ Microphone access released after each detection

**Bug Check:**
- ❌ FAIL if memory grows >50MB after 10 detections
- ❌ FAIL if microphone stays on after detection

---

## Test 2: 2-Item Mode UI Display (15 minutes)

### Test 2A: Debug Logging Collection

**Setup:**
1. Open StockerApp
2. Open browser Console (F12 → Console tab)
3. Enable "Call 2 Items at Once" toggle in Settings

**Steps:**
1. Start any route (or create test route)
2. Say "Hey Stocker"
3. Say "Next"
4. Observe:
   - What do you HEAR? (Should be 2 items)
   - What do you SEE? (Should be 2 items in pick card)
5. Check Console for logs starting with `[2-Pick Debug]`

**Console Logs to Collect:**
```
[2-Pick Debug] result.item1: { product: "...", quantity: X, slot: "..." }
[2-Pick Debug] result.item2: { product: "...", quantity: Y, slot: "..." }
[2-Pick Debug] Setting lastItemPair: { spokenText: "...", item1: {...}, item2: {...} }
[2-Pick Render] lastItemPair: { spokenText: "...", item1: {...}, item2: {...} }
[2-Pick Render] lastItemPair?.item2: { product: "...", quantity: Y, slot: "..." }
[2-Pick Render] Conditional will render: true
```

**Expected Results:**
- ✅ Voice speaks: "5 Snickers, 3 Coca-Cola" (or similar with 2 items)
- ✅ UI shows BOTH items in pick card with border separator
- ✅ Console shows `item2` is NOT null
- ✅ Console shows "Conditional will render: true"

**If UI Shows Only 1 Item:**
- Copy ALL console logs starting with `[2-Pick Debug]` and `[2-Pick Render]`
- Send to me for analysis
- Logs will reveal exact root cause

### Test 2B: Repeat Command with 2 Items

**Steps:**
1. After hearing 2 items, say "Repeat"
2. Check if voice repeats BOTH items
3. Check if UI still shows both items

**Expected Results:**
- ✅ Voice repeats: "5 Snickers, 3 Coca-Cola"
- ✅ UI continues showing both items
- ✅ Console shows: `[Repeat] Using lastItemPair: 2-item mode`

### Test 2C: Disable 2-Item Mode

**Steps:**
1. Open Settings
2. Toggle "Call 2 Items at Once" OFF
3. Say "Next"
4. Check that only 1 item is called

**Expected Results:**
- ✅ Voice speaks only 1 item: "5 Snickers"
- ✅ UI shows only 1 item (no second item below border)
- ✅ Console shows: `[2-Pick Debug] result.item2: null`

---

## Test 3: Edge Function Performance (20 minutes)

**NOTE:** Workflow is INACTIVE by default. SKIP THIS TEST for now - we'll activate it in a later session after validating Test 1 and Test 2.

**Placeholder for Future:**
- Activate workflow in n8n
- Update frontend to call `/next-item-optimized` endpoint
- Measure latency improvement (expected: 400-600ms faster)
- A/B test with feature flag

---

## Test 4: Regression Testing (10 minutes)

### Test 4A: Basic Voice Commands Still Work

**Steps:**
1. Start route
2. Test these commands:
   - "Next" → Should advance to next item
   - "Skip machine" → Should skip to next machine
   - "Top" → Should set direction to top
   - "Bottom" → Should set direction to bottom
   - "Complete route" → Should finish route

**Expected Results:**
- ✅ All commands work as before
- ✅ No new errors in console
- ✅ Voice responses are clear and correct

### Test 4B: Session Persistence

**Steps:**
1. Start route, pick 5 items
2. Close browser tab (force close)
3. Reopen StockerApp
4. Check that session restored

**Expected Results:**
- ✅ Route continues from item 6 (not restart)
- ✅ Completed items list intact
- ✅ No data loss

---

## Bug Discovery Protocol

### If You Find a Bug

1. **Capture Evidence:**
   - Screenshot of the issue
   - Copy full browser console logs
   - Note exact steps to reproduce
   - Device/browser info

2. **Severity Classification:**
   - 🔴 CRITICAL: App crashes, data loss, or core feature broken
   - 🟡 HIGH: Feature works but with incorrect results
   - 🟢 MEDIUM: Minor UI issue or non-critical bug
   - ⚪ LOW: Cosmetic issue

3. **Report Format:**
   ```
   BUG TITLE: [One sentence description]

   SEVERITY: [CRITICAL/HIGH/MEDIUM/LOW]

   STEPS TO REPRODUCE:
   1. [Step 1]
   2. [Step 2]
   3. [Step 3]

   EXPECTED: [What should happen]
   ACTUAL: [What actually happened]

   CONSOLE LOGS: [Paste relevant console output]

   SCREENSHOT: [Attach if applicable]
   ```

4. **Send to Me:**
   - I'll analyze and fix immediately if critical
   - Or add to backlog if low-priority

---

## Success Criteria

### Must Pass (Deployment Blockers)

- ✅ Environmental detection correctly classifies quiet/moderate/loud
- ✅ No memory leaks after 10+ detections
- ✅ Microphone access properly released
- ✅ Basic voice commands still work (next, skip, top, bottom)
- ✅ Session persistence works

### Should Pass (Non-Blockers)

- ✅ 2-Item Mode displays both items in UI
- ✅ Repeat command works with 2 items
- ✅ Manual environment override works

### Can Defer

- ⏸️ Edge Function performance testing (workflow not activated yet)

---

## Post-Testing Actions

### After Completing Tests

1. **Send Results:**
   - Summary: Which tests passed/failed
   - Any bugs found (use Bug Discovery format above)
   - Console logs from 2-Item Mode test
   - Overall experience rating (1-10)

2. **I Will:**
   - Fix any critical bugs immediately
   - Update MEMORY.md with test results
   - Plan next deployment steps
   - Activate Edge Function workflow if all tests pass

3. **Next Session:**
   - Fix 2-Item Mode UI bug (if root cause identified)
   - Activate and test Edge Function workflow
   - Measure performance improvements
   - Plan personal wake word implementation

---

## Quick Reference Card

**Print this and keep handy during testing:**

```
┌─────────────────────────────────────────┐
│ TEST 1: Environmental Detection         │
│  → Settings → Auto-Detect Environment  │
│  → Check console for dB level           │
│  → Verify correct classification        │
├─────────────────────────────────────────┤
│ TEST 2: 2-Item Mode UI                  │
│  → Settings → Toggle ON                 │
│  → Say "Next"                            │
│  → Check: Hear 2? See 2? Console logs? │
├─────────────────────────────────────────┤
│ TEST 3: Edge Function (SKIP FOR NOW)   │
├─────────────────────────────────────────┤
│ TEST 4: Regression Testing              │
│  → Basic commands (next, skip, etc.)   │
│  → Session persistence (close/reopen)   │
└─────────────────────────────────────────┘

📋 CHECKLIST:
□ Environmental detection: quiet
□ Environmental detection: moderate
□ Environmental detection: loud
□ Memory leak check (10x detections)
□ 2-Item Mode: hear 2 items
□ 2-Item Mode: see 2 items (UI)
□ 2-Item Mode: console logs
□ Repeat command with 2 items
□ Basic voice commands work
□ Session persistence works
```

---

**Status:** ✅ READY FOR TESTING
**Estimated Time:** 75 minutes total
**Next Update:** After testing results received

