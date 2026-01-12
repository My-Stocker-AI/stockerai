# 2-Item Mode Code Reference
**Quick lookup guide for all relevant code locations**

---

## File: src/pages/StockerApp.tsx

### Declaration Section

#### 1. Import the state (no imports needed - useState is already imported)
**Line:** 1
**Context:** File starts with imports

#### 2. State Definition
**Line:** 131-135
```javascript
const [lastItemPair, setLastItemPair] = useState<{
  spokenText: string;
  item1?: any;
  item2?: any;
} | null>(null);
```
**Purpose:** Stores both items when get_next_item returns two items
**Used by:** Voice, UI display, repeat command

---

### Logic Section

#### 3. Repeat Command Handler
**Line:** 283-296
```javascript
const repeatWords = ['repeat', 'again', 'what was that', 'say that again', 'say again', 'what\'s next', 'current'];
const isRepeat = repeatWords.some(w => lower.indexOf(w) !== -1);

if (isRepeat) {
  processingRef.current = true;

  // Check if 2-item mode is enabled
  const twoItemMode = localStorage.getItem('stocker-call-two-items') === 'true';

  // Priority 1: Use lastItemPair if available (supports 2-item mode)
  if (lastItemPair && lastItemPair.spokenText) {
    await v.speak(lastItemPair.spokenText);
    console.log('[Repeat] Using lastItemPair:', twoItemMode ? '2-item mode' : '1-item mode', lastItemPair.spokenText);
  }
```
**Purpose:** Repeats the last spoken response (voice uses lastItemPair)
**Reads:** `localStorage` for toggle status
**Uses:** `lastItemPair.spokenText` (contains both items)

---

#### 4. Set LastItemPair (Command Recognizer Path)
**Line:** 441-449
```javascript
// Store last item pair for repeat functionality
if (name === 'get_next_item' || name === 'start_machine') {
  if (result.spoken) {
    setLastItemPair({
      spokenText: result.spoken,
      item1: result.item1 || { product: result.product, quantity: result.quantity, slot: result.slot },
      item2: result.item2 || null
    });
  }
}
```
**Purpose:** Populate lastItemPair when workflow returns results
**Triggered by:** get_next_item or start_machine tool calls
**Data source:** `result.item1` and `result.item2` from n8n workflow
**Flow:** CommandRecognizer path (fast path, bypasses AI)

---

#### 5. Set LastItemPair (AI Path)
**Line:** 527-535
```javascript
// Store last item pair for repeat functionality (2-item mode support)
if (name === 'get_next_item' || name === 'start_machine') {
  if (result.spoken) {
    setLastItemPair({
      spokenText: result.spoken,
      item1: result.item1 || { product: result.product, quantity: result.quantity, slot: result.slot },
      item2: result.item2 || null
    });
  }
}
```
**Purpose:** Same as above but for AI path
**Triggered by:** get_next_item or start_machine tool results after AI processing
**Data source:** Same - workflow results
**Flow:** AI routing path (slower path, uses full AI reasoning)

---

### Display Section

#### 6. Pick Card Container
**Line:** 1567-1640
```javascript
{/* Current Item - Tap to advance */}
<div
  className={cn(
    "bg-[#161b22] rounded-xl p-4 border border-gray-800 cursor-pointer active:scale-[0.98] transition-all",
    routeState.currentItem && voice.status === 'listening' && "border-emerald-500/50 shadow-lg shadow-emerald-500/20"
  )}
  onClick={handleItemCardClick}
>
```
**Purpose:** Main pick card component
**Content:** Displays current and next items
**Interactive:** Tappable to advance (tap-to-advance feature)

---

#### 7. First Item Display
**Line:** 1581-1589
```javascript
{routeState.currentItem ? (
  <div className="mt-2">
    {/* First Item */}
    <div className="flex items-baseline gap-2">
      <span className="text-4xl font-bold text-emerald-400">{routeState.currentItem.quantity}x</span>
      <span className="text-2xl">{routeState.currentItem.product}</span>
    </div>
    <div className="text-lg text-gray-300 mt-2">{routeState.currentItem.slot_spoken || routeState.currentItem.slot}</div>
```
**Purpose:** Display first item from current route state
**Source:** `routeState.currentItem` (updated by workflow)
**Shows:** Quantity, Product name, Slot location
**Status:** ✅ WORKING

---

#### 8. Second Item Display (THE BUG)
**Line:** 1591-1599
```javascript
{/* Second Item (2-Pick Mode) */}
{lastItemPair?.item2 && (
  <div className="mt-4 pt-4 border-t border-gray-700">
    <div className="flex items-baseline gap-2">
      <span className="text-4xl font-bold text-emerald-400">{lastItemPair.item2.quantity}x</span>
      <span className="text-2xl">{lastItemPair.item2.product}</span>
    </div>
    <div className="text-lg text-gray-300 mt-2">{lastItemPair.item2.slot_spoken || lastItemPair.item2.slot}</div>
  </div>
)}
```
**Purpose:** Display second item from 2-item mode
**Source:** `lastItemPair.item2` (from workflow response)
**Condition:** `{lastItemPair?.item2 && ( ... )}`
**Shows:** Quantity, Product name, Slot location
**Status:** ❌ BROKEN - Code present but doesn't render

---

## File: src/components/stocker/SettingsSheet.tsx

### Settings Toggle

#### 9. State Declaration
**Line:** 23-24
```javascript
const [callTwoItems, setCallTwoItems] = useState(false);
const [ttsVolume, setTtsVolume] = useState(1.5); // Default 150%
```
**Purpose:** Local state for settings UI
**Type:** Boolean for 2-item toggle

---

#### 10. Load from Storage on Mount
**Line:** 27-37
```javascript
// Load preferences from localStorage on mount
useEffect(() => {
  const savedTwoItems = localStorage.getItem('stocker-call-two-items');
  if (savedTwoItems !== null) {
    setCallTwoItems(savedTwoItems === 'true');
  }

  const savedVolume = localStorage.getItem('stocker-tts-volume');
  if (savedVolume !== null) {
    setTtsVolume(parseFloat(savedVolume));
  }
}, []);
```
**Purpose:** Restore saved preferences when settings open
**Reads:** `localStorage.getItem('stocker-call-two-items')`
**Storage Key:** `'stocker-call-two-items'`
**Value Format:** `'true'` or `'false'` (string)

---

#### 11. Save to Storage on Change
**Line:** 40-44
```javascript
// Save preference to localStorage when changed
const handleToggle = (enabled: boolean) => {
  setCallTwoItems(enabled);
  localStorage.setItem('stocker-call-two-items', enabled.toString());
  console.log('[Settings] Call two items:', enabled);
};
```
**Purpose:** Persist setting when toggle is clicked
**Writes:** `localStorage.setItem('stocker-call-two-items', enabled.toString())`
**Storage Key:** `'stocker-call-two-items'`
**Value Format:** `'true'` or `'false'` (string)

---

#### 12. Toggle UI
**Line:** 87-100
```javascript
{/* Toggle Switch */}
<button
  onClick={() => handleToggle(!callTwoItems)}
  className={`
    relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0
    ${callTwoItems ? 'bg-teal-500' : 'bg-gray-700'}
  `}
>
  <span
    className={`
      inline-block h-4 w-4 transform rounded-full bg-white transition-transform
      ${callTwoItems ? 'translate-x-6' : 'translate-x-1'}
    `}
  />
</button>
```
**Purpose:** Visual toggle button
**Interaction:** Click to toggle 2-item mode on/off
**Visual:** Teal when ON, gray when OFF

---

## Data Flow Reference

### Forward Flow: Item speaks → UI displays
```
n8n Workflow
    ↓
result.item1 & result.item2
    ↓
setLastItemPair() [Line 443 or 531]
    ↓
State: lastItemPair = {
  spokenText: "5 Snickers, 3 Coca-Cola",
  item1: {...},
  item2: {...}
}
    ↓
Voice speaks: result.spoken [Line 456]
    ↓
UI renders:
  First item: routeState.currentItem [Line 1585]
  Second item: lastItemPair.item2 [Line 1595] ← BREAKS HERE
```

---

## State Variables Reference

### lastItemPair
```
Type: {
  spokenText: string;        // "5 Snickers, 3 Coca-Cola"
  item1?: any;               // {product, quantity, slot, ...}
  item2?: any;               // {product, quantity, slot, ...}
} | null

Initialized: Line 131-135
Set at: Line 443, 531
Used by:
  - Repeat command: Line 294
  - UI display: Line 1591, 1595
```

### routeState.currentItem
```
Type: any (item object)
Properties:
  - product: string
  - quantity: number
  - slot: string
  - slot_spoken: string (optional)
  - inventory_current: number (optional)
  - inventory_parlevel: number (optional)

Set by: updateFromTool() (updates to item1, not item2)
Used by: UI first item display (Line 1585)
```

### localStorage['stocker-call-two-items']
```
Type: string
Values: 'true' | 'false' | null

Set at: SettingsSheet.tsx Line 42
Read at:
  - SettingsSheet.tsx Line 28
  - StockerApp.tsx Line 290

Purpose: Toggle for 2-item calling mode
Persistence: Browser storage (survives page refresh)
```

---

## Conditional Logic Reference

### Repeat Command Conditional
**Location:** StockerApp.tsx Line 283-321
**Condition:** `const isRepeat = repeatWords.some(w => lower.indexOf(w) !== -1);`
**Logic:**
1. Check if transcript contains repeat keywords
2. If repeat AND lastItemPair exists → speak lastItemPair.spokenText
3. Else if repeat AND aiResponse exists → speak aiResponse
4. Else if repeat AND currentItem exists → build and speak
5. Else → say nothing to repeat

---

### Item2 Display Conditional
**Location:** StockerApp.tsx Line 1591
**Condition:** `{lastItemPair?.item2 && ( ... )}`
**Logic:**
1. Check if lastItemPair exists
2. AND check if item2 field exists
3. IF both true → render second item
4. ELSE → skip rendering

**Status:** Condition appears correct, but doesn't render ❌

---

## Debug Logging Points

### To Add Debug Logs:

#### Point 1: When setting lastItemPair
**Location:** Line 443 (after `setLastItemPair()`)
```javascript
console.log('[DEBUG] setLastItemPair called:', {
  spoken: result.spoken,
  item1: result.item1?.product || result.product,
  item2: result.item2?.product || 'MISSING'
});
```

#### Point 2: When rendering pick card
**Location:** Line 1573 (in pick card render)
```javascript
{console.log('[DEBUG] PickCard render:', {
  lastItemPair,
  currentItem: routeState.currentItem?.product,
  item2Present: !!lastItemPair?.item2
})}
```

#### Point 3: When checking item2 conditional
**Location:** Line 1591 (item2 section)
```javascript
{(() => {
  console.log('[DEBUG] item2 conditional:', {
    hasLastItemPair: !!lastItemPair,
    hasItem2: !!lastItemPair?.item2,
    item2Data: lastItemPair?.item2
  });
  return null;
})()}
{lastItemPair?.item2 && (
  // render...
)}
```

---

## Key Properties of Item Objects

All items have these properties:
```
{
  id: string,
  product: string,           // "Snickers"
  quantity: number,          // 5
  slot: string,              // "A1"
  slot_spoken: string,       // "Slot A 1" (for voice)
  sequence: number,          // Order in machine
  status: string,            // "pending" | "completed"
  machine_id: string,        // FK to machines table
  machine_name: string,      // "Snack Machine 1"
  inventory_current: number, // Current stock level
  inventory_parlevel: number // Par level target
}
```

---

## Related Files

| File | Purpose | Status |
|------|---------|--------|
| `src/pages/StockerApp.tsx` | Main picking interface | Contains bug |
| `src/components/stocker/SettingsSheet.tsx` | Settings UI | Working ✅ |
| `src/hooks/useStockerSession.ts` | State management | Need to verify |
| `src/hooks/useStockerAI.ts` | AI communication | Need to verify |
| `src/hooks/useVoice.ts` | Voice system | Working ✅ |
| n8n workflow `GPeduKWdn9tMrZmT` | get_next_item | Need to verify response |

---

## localStorage Key Reference

| Key | Value | Set By | Read By | Status |
|-----|-------|--------|---------|--------|
| `stocker-call-two-items` | `'true'`/`'false'` | SettingsSheet.tsx:42 | StockerApp.tsx:290 | ✅ Working |
| `stocker-tts-volume` | `'1.5'` (string) | SettingsSheet.tsx:48 | useVoice.ts | ✅ Working |

---

## Summary: What Needs Fixing

**Single file with bug:**
- `src/pages/StockerApp.tsx`
- **Lines:** 1591-1599 (pick card 2-item display)
- **Issue:** Conditional doesn't render even when data exists
- **Fix:** Debug to find why condition fails, then correct

**Everything else is working correctly:**
- ✅ State definition
- ✅ State population
- ✅ Voice speaking
- ✅ Settings storage
- ✅ Repeat command

