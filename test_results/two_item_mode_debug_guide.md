# 2-Item Mode Debug Guide
**Companion to:** two_item_mode_ui_validation.md

---

## Quick Reference: Where Code Handles 2-Item Mode

### State Definition
```
File: src/pages/StockerApp.tsx
Line: 131-135
State: lastItemPair
Type: { spokenText: string; item1?: any; item2?: any; }
```

### State Population (2 places)
```
File: src/pages/StockerApp.tsx
Location 1: Line 441-449 (Command Recognizer path)
Location 2: Line 527-535 (AI path)
Trigger: get_next_item or start_machine tool results
```

### Settings Toggle
```
File: src/components/stocker/SettingsSheet.tsx
Line: 23-50
Storage Key: 'stocker-call-two-items'
Value: 'true' or 'false'
```

### UI Rendering
```
File: src/pages/StockerApp.tsx
Lines: 1567-1640 (Pick card component)
First Item: Line 1581-1589 (uses routeState.currentItem)
Second Item: Line 1591-1599 (uses lastItemPair.item2)
Condition: {lastItemPair?.item2 && ( ... )}
```

---

## Step-by-Step Debug Procedure

### Phase 1: Verify Feature Is Enabled

**Step 1a:** Check Settings Toggle
```javascript
// Open browser console (F12 → Console tab)
localStorage.getItem('stocker-call-two-items')
// Expected: 'true' if enabled, 'false' if disabled
```

**Step 1b:** Enable if Disabled
```javascript
localStorage.setItem('stocker-call-two-items', 'true')
localStorage.getItem('stocker-call-two-items')  // Should return 'true'
```

### Phase 2: Verify Voice System Works

**Step 2a:** Listen to What Voice Says
- Start a route
- Say "next"
- Listen carefully to the spoken response

**Expected (2-item mode ON):**
- Two items in one sentence: "5 Snickers, 3 Coca-Cola"
- No pause between items
- One complete thought

**Unexpected (indicates bug at n8n level):**
- Only one item: "5 Snickers"
- Two separate announcements
- Missing second item entirely

**Step 2b:** Check Console Logs
```javascript
// Open browser console (F12 → Console tab)
// Look for these logs after saying "next":

"[CommandRecognizer] ✓ Matched: NEXT_ITEM"
"[Repeat] Using lastItemPair: 2-item mode 5 Snickers, 3 Coca-Cola"
```

**If NOT present:**
- `lastItemPair` is not being populated
- Issue: State management bug in StockerApp.tsx

**If present:**
- `lastItemPair` IS being set correctly
- Issue: UI rendering bug

### Phase 3: Verify n8n Workflow Returns item2

**Step 3a:** Trigger "next" command

**Step 3b:** Check n8n Execution
1. Go to https://visionairy.app.n8n.cloud
2. Click Workflows → find "get_next_item" (ID: `GPeduKWdn9tMrZmT`)
3. Click "Executions" tab
4. Click on the LATEST execution (top of list)
5. Find the last node (should be HTTP response or similar)
6. Look at the OUTPUT - it should contain:

```json
{
  "spoken": "5 Snickers, 3 Coca-Cola",
  "product": "Snickers",
  "quantity": 5,
  "slot": "A1",
  "item1": {
    "product": "Snickers",
    "quantity": 5,
    "slot": "A1"
  },
  "item2": {
    "product": "Coca-Cola",
    "quantity": 3,
    "slot": "B2"
  }
}
```

**If item2 is present:**
- n8n is working correctly
- Issue: JavaScript state management in React

**If item2 is missing or null:**
- n8n workflow is not returning the second item
- Issue: n8n workflow configuration or 2-item mode logic

---

## Diagnosing Specific Failures

### Scenario A: Voice speaks ONE item, UI shows ONE item
**Status:** 2-item mode OFF or disabled
**Action:**
1. Check localStorage: `localStorage.getItem('stocker-call-two-items')`
2. If false/missing, enable it
3. Restart route
4. Try again

### Scenario B: Voice speaks TWO items, UI shows ONE item
**Status:** BUG - UI rendering failure (most likely)
**Action:**
1. Open DevTools console
2. Add this debug code:
   ```javascript
   // In StockerApp.tsx, Line 1573 (before picking card returns)
   console.log('[PickCard] DEBUG:', {
     lastItemPair,
     currentItem: routeState.currentItem,
     twoItemModeEnabled: localStorage.getItem('stocker-call-two-items'),
     item2Exists: lastItemPair?.item2 ? 'YES' : 'NO',
     shouldShowItem2: lastItemPair?.item2 ? 'YES' : 'NO'
   });
   ```
3. Trigger "next" command
4. Check console output
5. If `item2Exists: YES` but UI doesn't show it → React rendering bug
6. If `item2Exists: NO` → State not being set

### Scenario C: Voice speaks ONE item, n8n returns TWO items
**Status:** BUG - State management failure
**Action:**
1. Issue is in `setLastItemPair()` or `updateFromTool()`
2. Check if `updateFromTool()` is clearing the pair state
3. Likely in `useStockerSession` hook

### Scenario D: Voice speaks ONE item, n8n returns ONE item
**Status:** 2-item mode not working at n8n level
**Action:**
1. Check if 2-item mode flag is being passed to workflow
2. Verify workflow checks `input.call_two_items` or similar
3. Check if n8n workflow logic for 2-item is enabled

---

## Console Log Points to Add

### For Quick Debugging

Add these console.log statements to trace the data flow:

**Location 1: When lastItemPair is set (Line 443)**
```javascript
console.log('[DEBUG] setLastItemPair called:', {
  spokenText: result.spoken,
  item1Product: result.item1?.product || result.product,
  item2Product: result.item2?.product || 'MISSING',
  timestamp: new Date().toISOString()
});
```

**Location 2: When pick card renders (Line 1573)**
```javascript
console.log('[DEBUG] PickCard rendering:', {
  lastItemPair,
  currentItem: routeState.currentItem?.product,
  item2Present: !!lastItemPair?.item2,
  twoItemMode: localStorage.getItem('stocker-call-two-items')
});
```

**Location 3: When item2 conditional checks (Line 1591)**
```javascript
if (lastItemPair?.item2) {
  console.log('[DEBUG] Rendering item2:', lastItemPair.item2);
} else {
  console.log('[DEBUG] item2 NOT RENDERED - condition failed:', {
    hasLastItemPair: !!lastItemPair,
    hasItem2: !!lastItemPair?.item2,
    item2Value: lastItemPair?.item2
  });
}
```

---

## Common Failure Points & Solutions

### Failure 1: lastItemPair State Never Updates
**Symptom:** Console shows `lastItemPair: null` even after "next"
**Root Cause:** `setLastItemPair()` not being called
**Solution:**
1. Add log at line 442: `console.log('[setLastItemPair] Calling with:', result)`
2. Check if this log appears
3. If NOT: result.spoken is not being returned from n8n

### Failure 2: item2 is null
**Symptom:** Console shows `item2: null` or `item2: undefined`
**Root Cause:** n8n not returning item2 field
**Solution:**
1. Check n8n execution logs (Phase 3 above)
2. Verify workflow has logic to populate item2
3. Check if 2-item mode flag is being used in n8n

### Failure 3: UI renders but item2 is hidden
**Symptom:** Console shows `item2Present: true` but UI blank
**Root Cause:** CSS/DOM issue or conditional logic issue
**Solution:**
1. Check if border-t (separator) is visible (should be gray line above item2)
2. Try removing the condition: `{lastItemPair?.item2 && ( ... )}`
3. Change to always show: `{lastItemPair?.item2 && ( ... ) || null}`
4. If it shows then → conditional logic issue
5. If still blank → CSS issue

### Failure 4: Two items show but they're the same
**Symptom:** Both items show Snickers quantity and product
**Root Cause:** item2 is being set to same as item1
**Solution:**
1. Check n8n workflow response structure
2. Verify item2 is a different item, not a duplicate
3. Check if workflow's second item extraction is correct

---

## Browser DevTools Commands

### Quick Status Check
```javascript
// Copy-paste these into console (F12)

console.log('=== 2-ITEM MODE STATUS ===');
console.log('Enabled:', localStorage.getItem('stocker-call-two-items'));
console.log('State available: see React DevTools');
console.log('Expected behavior: Should speak TWO items, show TWO items');
```

### Extract lastItemPair from React
```javascript
// This requires React DevTools extension
// In React DevTools → click on pick card component
// Then in console:
$r.props.lastItemPair
// Should show: {spokenText: "...", item1: {...}, item2: {...}}
```

### Check All Related State
```javascript
// Requires access to app state (varies by setup)
localStorage.getItem('stocker-call-two-items')    // Toggle status
// Then check React component state via DevTools
```

---

## n8n Workflow Verification

### How to Find Recent Executions

1. Go to https://visionairy.app.n8n.cloud
2. Click "Workflows" in left sidebar
3. Find "get_next_item" workflow (ID: `GPeduKWdn9tMrZmT`)
4. Click the workflow name
5. Click "Executions" tab at top
6. Look for recent executions (sort by newest first)
7. Click on an execution to see the full flow

### What to Check in n8n Response

The final response should have:
```json
{
  "spoken": "[two items together]",
  "item1": { ... },
  "item2": { ... }
}
```

**OR** if using the HTTP response node:
```json
{
  "spoken": "[two items together]",
  "product": "[first item product]",
  "quantity": 5,
  "slot": "A1",
  "item1": { "product": "...", "quantity": 5 },
  "item2": { "product": "...", "quantity": 3 }
}
```

The `item2` field should be present and have:
- `product` (string)
- `quantity` (number)
- `slot` or `slot_spoken` (string)

---

## Success Criteria

### When Fixed, You Should See:

1. **Settings Toggle Works**
   - Enable "Call 2 Items at Once"
   - Disable and re-enable
   - Setting persists after page refresh

2. **Voice Speaks Two Items**
   - Say "next"
   - Hear: "5 Snickers, 3 Coca-Cola" (one continuous sentence)
   - Check console: `[Repeat] Using lastItemPair: 2-item mode ...`

3. **UI Shows Two Items**
   - First item displayed: Large "5x" in teal, "Snickers" below
   - Separator line (gray horizontal line)
   - Second item displayed: Large "3x" in teal, "Coca-Cola" below
   - Slot information for both items

4. **Repeat Works**
   - Say "repeat" or "what was that"
   - Hear the same two items again: "5 Snickers, 3 Coca-Cola"
   - UI still shows both items

5. **Toggle Disables Feature**
   - Disable "Call 2 Items at Once" in settings
   - Say "next"
   - Hear only one item: "5 Snickers"
   - UI shows only one item
   - Console: `[Repeat] Using lastItemPair: 1-item mode ...`

---

## Files to Monitor During Testing

### React Component State
- File: `src/pages/StockerApp.tsx`
- State: `lastItemPair`
- Update points: Lines 443, 531
- Display points: Lines 1591-1599

### Settings Storage
- File: `src/components/stocker/SettingsSheet.tsx`
- Key: `stocker-call-two-items`
- Read points: Lines 28, 290
- Write points: Lines 42

### n8n Response
- Workflow: `get_next_item`
- ID: `GPeduKWdn9tMrZmT`
- Response fields: `spoken`, `item1`, `item2`

---

## Contact Points for Support

If debug process shows:

**"Voice works, UI doesn't"** → React state/render bug
- File: `src/pages/StockerApp.tsx`
- Focus: Lines 1591-1599 (conditional rendering)
- Issue: Item2 UI not rendering even when state is correct

**"Voice doesn't work"** → n8n workflow issue
- File: n8n workflow ID: `GPeduKWdn9tMrZmT`
- Focus: 2-item mode logic, response structure
- Issue: Workflow not returning item2 field

**"Toggle doesn't work"** → Settings storage issue
- File: `src/components/stocker/SettingsSheet.tsx`
- Focus: Lines 40-43 (toggle handler)
- Issue: localStorage not persisting or reading correctly

