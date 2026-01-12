# Testing Instructions - Optimized Workflow A/B Test

**Session:** 33
**Optimization:** Remove Get Routes query (Priority 1)
**Expected Result:** ~300ms faster (2.4s → 2.1s total response time)

---

## Quick Start

### Step 1: Baseline Test (Production)

1. **Open the voice picking app** at https://my-stocker-ai.com
2. **Open browser console** (press F12, click "Console" tab)
3. **Start picking a route** (say "next" to begin)
4. **Watch the console** and note the timestamps for 10 "next" commands

**Look for these console messages:**
```
[Tools] Calling get_next_item: {...}
[Tools] get_next_item succeeded: {...}
```

**Calculate baseline:** (end time - start time) for each command, then average them

---

### Step 2: Enable Test Mode

**In the browser console, type:**
```javascript
localStorage.testOptimization = 'true'
```

**Then refresh the page** (F5 or Cmd+R)

**Verify test mode is active:**
You should see this in the console:
```
[StockerAI] 🧪 TEST MODE: Using optimized workflow /next-item-test
```

---

### Step 3: Test Optimized Version

1. **Say "next" 10 times** (same as baseline)
2. **Watch the console** for the same timestamps
3. **Calculate average time** for optimized version

**Compare:**
- Baseline (production): X.X seconds
- Optimized (test): Y.Y seconds
- **Improvement: (X.X - Y.Y) seconds** ← Should be ~0.3s faster

---

### Step 4: Verify Correctness

**Make sure everything still works:**
- [ ] Items are spoken correctly
- [ ] Product names, quantities match
- [ ] Machine transitions work
- [ ] Route completion works
- [ ] No errors in console
- [ ] UI updates correctly

---

### Step 5: Disable Test Mode (Revert)

**In the browser console, type:**
```javascript
localStorage.testOptimization = 'false'
```

**Then refresh the page**

You should **NOT** see the test mode message anymore.

---

## Detailed Timing Measurement

For more precise measurements, use browser Performance tools:

1. **Open Performance tab** (F12 → Performance)
2. **Click Record**
3. **Say "next"**
4. **Stop recording**
5. **Find the timeline:**
   - Look for network request to `/next-item` or `/next-item-test`
   - Measure duration from request start to response end

---

## What to Report

After testing, please share:

1. **Baseline average latency:** X.Xs
2. **Test average latency:** Y.Ys
3. **Improvement:** Z.Zs (or ZZ%)
4. **Any issues observed:** (if any)
5. **Correctness check:** ✅ All items correct / ❌ Found issue

---

## Troubleshooting

### "Test mode not activating"
- Make sure you typed `localStorage.testOptimization = 'true'` exactly
- Check you refreshed the page after setting it
- Look for the test mode console message

### "Errors in console"
- Copy/paste the error message
- Disable test mode immediately: `localStorage.testOptimization = 'false'`
- Refresh page to return to production

### "Results seem the same"
- n8n might be caching - wait 30 seconds and try again
- Check that test workflow is actually active in n8n
- Verify console shows `/next-item-test` in the "Calling" message

---

## Expected Console Output

### Production Mode (Default)
```
[Tools] Calling get_next_item: {args: {...}, endpoint: 'https://visionairy.app.n8n.cloud/webhook/next-item'}
[Tools] get_next_item succeeded: {...}
```

### Test Mode (Optimized)
```
[StockerAI] 🧪 TEST MODE: Using optimized workflow /next-item-test
[Tools] Calling get_next_item: {args: {...}, endpoint: 'https://visionairy.app.n8n.cloud/webhook/next-item-test'}
[Tools] get_next_item succeeded: {...}
```

**Notice:** `/next-item-test` instead of `/next-item`

---

## Safety Notes

- ✅ Test mode ONLY affects `get_next_item` workflow
- ✅ All other tools use production endpoints
- ✅ Easy to disable instantly (just set flag to 'false')
- ✅ Production workflow completely untouched
- ✅ No code rebuild needed to toggle modes

---

## If Test Is Successful

**Report back with:**
- Timing improvement confirmed
- No errors or issues
- All correctness checks passed

**Then we can:**
- Apply the same optimization to production workflow
- Move to next optimization (reduce Deepgram endpointing)
- Document the win in MEMORY.md

---

## If Test Fails

**Report back with:**
- What went wrong
- Console error messages
- When it happened

**We will:**
- Analyze the issue
- Fix or abandon this optimization
- Try a different approach

---

**Ready to test? Follow Step 1 above!**
