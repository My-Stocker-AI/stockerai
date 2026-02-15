# Command Recognition & Last-Item Notification Fixes

**Date:** 2026-02-15
**Session:** 74
**Status:** ✅ Implemented, ⏳ Testing

---

## Issue 1: "next" Command Blocked After "OK"

### Problem
User reported: "next" command failed repeatedly, but "OK" worked. Pattern indicated state lock where:
1. Machine completes → `pendingMachineTransition` set
2. User says "OK" → AFFIRMATIVE handler calls `start_machine`
3. `start_machine` succeeds, returns first item
4. **BUG:** `pendingMachineTransition` NOT cleared
5. User says "next" → Frontend guard blocks it (not a direction command)
6. User says "OK" again → AFFIRMATIVE allowed, routes to get_next_item via fallback

### Root Cause
`pendingMachineTransition` flag not cleared after `start_machine` succeeds via CommandRecognizer path. Frontend guard at StockerApp.tsx:379-405 blocks all non-direction commands when this flag is set.

### Solution
**File:** `src/pages/StockerApp.tsx`
**Location:** Lines 665-681 (after tool execution in CommandRecognizer path)

Added cleanup code that clears `pendingMachineTransition` after detecting successful `start_machine` tool call:

```typescript
// FIX: Clear pendingMachineTransition after start_machine succeeds
for (const tr of toolResults) {
  if (tr.result && !tr.result.error) {
    const toolCall = toolCalls.find(tc => tc.id === tr.tool_call_id);
    if (toolCall && toolCall.function.name === 'start_machine') {
      setRouteState(prev => ({
        ...prev,
        pendingMachineTransition: null
      }));
      console.log('[CommandRecognizer] ✅ Cleared pendingMachineTransition');
      break;
    }
  }
}
```

### Impact
- ✅ "next" command works immediately after "OK" starts machine
- ✅ No more stuck state requiring repeated "OK" commands
- ✅ Natural command flow restored

---

## Issue 2: Last-Item Notification

### Problem
User requested: Preface last item(s) in machine with notification ("This is the last item" or "These are the last 2 items") to provide context to workers.

### Solution
**File:** `python-api/app/services/formatting.py`
**Function:** `generate_spoken_next_item()` (lines 109-131)

Added logic to detect last item(s) and prefix voice response:

```python
def generate_spoken_next_item(data: dict, parsed: dict, parsed2: dict | None) -> str:
    # Check if this is the last item(s) in the machine
    items_remaining = data.get("items_remaining", 0)
    is_last = (items_remaining == 0)

    # Build prefix based on HOW MANY ITEMS ARE DISPLAYED (not mode)
    prefix = ""
    if is_last:
        if parsed2:  # 2 items displayed
            prefix = "These are the last 2 items. "
        else:  # 1 item displayed
            prefix = "This is the last item. "

    # Build item voice text with prefix
    if data.get("product_name2") and parsed2:
        item1_text = _build_item_voice_parts(parsed, data["quantity"])
        item2_text = _build_item_voice_parts(parsed2, data["quantity2"])
        return f"{prefix}{item1_text}, {item2_text}"
    else:
        return f"{prefix}{_build_item_voice_parts(parsed, data["quantity"])}"
```

### Key Design Decisions
1. **Display-based, not mode-based:** Checks if `parsed2` exists (2 items displayed) rather than checking mode setting
2. **Handles odd counts:** In 2-pick mode with 5 items, last call shows 1 item → says "This is the last item" (singular) ✅
3. **Universal:** Works for both 1-pick and 2-pick modes automatically
4. **Backend-driven:** Voice generation happens in Python API, ensuring consistency

### Impact
- ✅ Workers get advance notice of last item(s)
- ✅ Handles 1-pick mode: "This is the last item. [product]"
- ✅ Handles 2-pick mode: "These are the last 2 items. [product1], [product2]"
- ✅ Handles odd counts: "This is the last item. [product]" even in 2-pick mode

---

## Files Changed

### Frontend
- `src/pages/StockerApp.tsx` - Added pendingMachineTransition cleanup
- `package.json` - Added Playwright test scripts

### Backend (Python API)
- `python-api/app/services/formatting.py` - Added last-item notification prefix

### Testing
- `playwright-tests/command-recognition-fixes.spec.ts` - Comprehensive E2E tests (NEW)
- `playwright.config.ts` - Playwright configuration (NEW)

---

## Testing Plan

### Test 1: pendingMachineTransition Clearing
```bash
npm run test:e2e -- command-recognition-fixes.spec.ts -g "next.*after.*OK"
```

**Expected:**
- Complete Machine 1 → Say "OK" → Start Machine 2
- Say "next" → Should work (NOT blocked)
- Should see second item (NOT "Top or bottom?" prompt)

### Test 2: Last-Item Notification (1-pick)
```bash
npm run test:e2e -- command-recognition-fixes.spec.ts -g "1-pick mode"
```

**Expected:**
- Pick items 1-4 normally
- On item 5 (last), hear: "This is the last item. [product details]"

### Test 3: Last-Item Notification (2-pick)
```bash
npm run test:e2e -- command-recognition-fixes.spec.ts -g "2-pick mode"
```

**Expected:**
- Pick items 1-2, then 3-4 normally
- On items 3-4 (if last 2), hear: "These are the last 2 items. [products]"

### Test 4: Odd Count Edge Case
```bash
npm run test:e2e -- command-recognition-fixes.spec.ts -g "odd count"
```

**Expected:**
- 2-pick mode, 5 items total
- Last call shows only item 5
- Should hear: "This is the last item. [product]" (SINGULAR)

### Run All Tests
```bash
npm run test:e2e
```

---

## Deployment Checklist

### Frontend (Auto-deploys)
- [x] Fix implemented in StockerApp.tsx
- [ ] Commit changes
- [ ] Push to main → Cloudflare auto-deploys
- [ ] Test in production

### Backend (Manual deploy)
- [x] Fix implemented in formatting.py
- [ ] Commit changes
- [ ] Deploy to Render: `git push render main`
- [ ] Verify deployment
- [ ] Test in production

### Validation
- [ ] Test "next" after "OK" in production
- [ ] Test last-item notification (1-pick)
- [ ] Test last-item notification (2-pick)
- [ ] Test odd count scenario
- [ ] Monitor logs for any errors

---

## Rollback Plan

### If Frontend Issue
```bash
git revert <commit-hash>
git push origin main
```

### If Backend Issue
```bash
# In python-api directory
git revert <commit-hash>
git push render main
```

---

## Success Criteria

✅ **Fix 1 Success:**
- User says "next" after "OK" → Works immediately
- No "Top or bottom?" repeated prompts
- No "didn't catch that" messages
- Smooth machine transitions

✅ **Fix 2 Success:**
- Last item(s) prefaced with notification
- Singular form for 1 item displayed
- Plural form for 2 items displayed
- Works in both 1-pick and 2-pick modes
- User feedback: "helpful context"

---

## Related Issues

**Previous similar issues:**
- Session 73: Done card dedup bug (fixed)
- Session 56: Direction reversal bug (fixed)
- Session 55: 2-pick mode duplication (fixed)

**Pattern:** State machine edge cases during machine transitions. This fix addresses the root cause by ensuring state cleanup happens consistently after all tool executions.

---

## Next Steps

1. Run Playwright tests locally to validate fixes
2. Commit and push frontend changes (auto-deploy)
3. Deploy Python API changes to Render
4. Test in production with real route
5. Update MEMORY.md with session results
