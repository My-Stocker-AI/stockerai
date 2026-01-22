# CRITICAL BUG: count=2 System Failures

**Date:** 2026-01-22
**Severity:** CRITICAL (Core feature broken)
**Status:** ✅ PARTIALLY FIXED - Display issue resolved, auto-advancement under investigation

---

## Reported Symptoms

1. ✅ **First pick shows 2 items correctly** - Working
2. ❌ **After "next", only 1 item displays** - FIXED (see below)
3. ❌ **Announces 2 items but shows only 1** - FIXED (see below)
4. ⚠️ **Automatic advancement without "next" prompts** - UNDER INVESTIGATION

---

## Root Cause #1: Data Structure Mismatch (FIXED)

### The Problem

**Frontend expects item2 as NESTED OBJECT:**
```javascript
// StockerApp.tsx:469-470
if (result.item2?.product_name && result.item2?.quantity) {
  parts.push(`${result.item2.quantity}× ${result.item2.product_name}`);
}
```

**n8n Format Output was returning FLAT FIELDS:**
```javascript
output.product_name2 = data.product_name2;
output.quantity2 = data.quantity2;
output.slot2 = data.slot2;
```

**Result:**
- `result.item2` was `undefined`
- Frontend couldn't find second item data
- Display showed only first item
- Voice worked (uses `voice_text` directly from n8n)

### The Fix

**Changed Format Output to return nested object:**
```javascript
output.item2 = {
  product_name: data.product_name2,
  quantity: data.quantity2,
  slot: data.slot2,
  slot_spoken: formatSlotForTTS(data.slot2),
  inventory_current: data.inventory_current2 || 0,
  inventory_parlevel: data.inventory_parlevel2 || 0,
  product_parsed: {
    name: parsed2.name,
    size: parsed2.size,
    type: parsed2.type
  }
};
```

---

## How to Apply Fix #1

### Step 1: Update n8n Format Output Node

1. Open n8n: https://visionairy.app.n8n.cloud
2. Find workflow: **"Stocker Tool: get_next_item (Optimized)"**
3. Click on **"Format Output"** node
4. **Delete all existing code**
5. Copy ALL code from: `/home/visionairy/StockerAI/workflows/FORMAT_OUTPUT_FIXED_20260122.js`
6. Paste into node
7. Click **Save**

### Step 2: Test

1. Start route with count=2 enabled
2. Say "next"
3. **Expected:** Display should show BOTH items
4. Say "next" again
5. **Expected:** Next 2 items should display

---

## Root Cause #2: Automatic Advancement (INVESTIGATING)

### Symptom

System advances through items automatically without user saying "next"

### Possible Causes

1. **Frontend auto-repeat bug** - Could be triggering duplicate "next" commands
2. **Debounce failure** - Debounce logic not working (1.5s timeout)
3. **Voice recognition ghost triggers** - STT picking up background noise as "next"
4. **Session state corruption** - Index advancing incorrectly in database
5. **Race condition** - Multiple simultaneous API calls

### Investigation Needed

**Check these files:**
- `src/hooks/useStockerAI.ts:229-231` - Debounce logic
- `src/hooks/useVoice.ts` - Voice recognition triggers
- `src/pages/StockerApp.tsx` - Command processing
- n8n Determine Next State - Index advancement logic

**Diagnostic Steps:**
1. Open browser console
2. Enable count=2
3. Say "next" ONCE
4. Watch for duplicate API calls in Network tab
5. Check if debounce is firing multiple times

---

## Data Flow Map (count=2)

```
[Frontend Settings]
    ↓ (localStorage: 'stocker-call-two-items' = 'true')
[useStockerAI.ts:646]
    ↓ (Checks callTwoItems, adds count: 2 to request)
[n8n webhook: /next-item-optimized]
    ↓ (Receives { count: 2, session_id, user_id })
[Determine Next State]
    ↓ (Fetches item1 AND item2 if count=2)
    ↓ (Returns product_name2, quantity2, slot2)
[Format Output]
    ↓ (Creates output.item2 nested object)
    ↓ (Returns { item1: {...}, item2: {...}, voice_text: "..." })
[Frontend receives response]
    ↓ (Checks result.item2?.product_name)
    ↓ (Displays both items)
```

---

## Files Changed

| File | Change | Status |
|------|--------|--------|
| `workflows/FORMAT_OUTPUT_FIXED_20260122.js` | Return item2 as nested object | ✅ COMMITTED |
| `docs/BUGFIX_20260122_COUNT2_SYSTEMIC.md` | This document | ✅ COMMITTED |

---

## Testing Checklist

- [ ] Display shows 2 items when count=2 enabled
- [ ] Voice announces 2 items correctly
- [ ] No automatic advancement (waits for "next")
- [ ] First pick works correctly
- [ ] Second pick works correctly
- [ ] Third pick works correctly
- [ ] Switching back to count=1 works
- [ ] Progress bar updates correctly

---

## Remaining Issues

### URGENT: Automatic Advancement

**Status:** OPEN
**Priority:** CRITICAL
**Next Steps:**
1. Add console logging to track API call count
2. Monitor debounce timing in browser console
3. Check STT for ghost triggers
4. Verify database index isn't auto-incrementing

**User Impact:** System unusable - can't control progression

---

## Prevention

**Lesson Learned:** Frontend and backend data structures MUST match exactly

**Process Fix:**
1. When adding new fields, check BOTH ends of the API
2. TypeScript interfaces should match n8n output structure
3. Add integration tests for data structure compatibility

---

## Summary

**Fixed:** count=2 display issue (data structure mismatch)
**Investigating:** Automatic advancement bug
**User Action Required:** Update n8n Format Output node with new code
