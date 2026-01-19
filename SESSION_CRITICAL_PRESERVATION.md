# CRITICAL SESSION PRESERVATION - Display Order Change Failure
**Date:** 2026-01-19 03:30 UTC
**Context Remaining:** 6%
**Status:** BROKEN - System was 98% functional, now broken

---

## ORIGINAL REQUEST
User: "Change display from '8 X Snickers Bar' to 'Snickers Bar X 8'"
- Voice should say: "Snickers Bar thirty-six pack eight count" (count at END)
- Display should show: "Snickers Bar (36 Pack) X 8" (count at END)

---

## WHAT WAS WORKING BEFORE (ORIGINAL CODE)

**Last working execution:** 27107 (2026-01-18 03:30:17)

**Original Format Output returned:**
```json
{
  "action": "next_item",
  "product_name": "Lay's Classic LSS 1.5 oz",
  "quantity": 5,
  "slot": "012",
  "slot_spoken": "slot 12",
  "spoken": "5 Lay's Classic LSS 1.5 ounce, 7 Doritos Nacho Cheese Chip LSS 1.75 ounce",
  "item2": {
    "product_name": "Doritos Nacho Cheese Chip LSS 1.75 oz",
    "quantity": 7,
    "slot": "010",
    "slot_spoken": "slot 10",
    "product_parsed": {
      "name": "Doritos Nacho Cheese Chip LSS",
      "size": "1.75 oz"
    }
  }
}
```

**CRITICAL: item2 was a NESTED OBJECT, not flat fields!**

---

## WHAT I BROKE

### Issue 1: Frontend Expects `item2` Nested Object
**Original structure:**
```javascript
output.item2 = {
  product_name: data.product_name2,
  quantity: data.quantity2,
  slot: data.slot2,
  slot_spoken: formatSlotForTTS(data.slot2),
  product_parsed: { ... }
}
```

**My broken structure:**
```javascript
output.product_name2 = data.product_name2;
output.quantity2 = data.quantity2;
output.slot2 = data.slot2;
output.product_parsed2 = { ... };
```

**Result:** Frontend can't find item2, shows only 1 item even though voice speaks 2.

### Issue 2: Display Format Not Updated
- n8n returning: `display_text: "Product (size) X count"` ✅
- Frontend still shows: "count× Product" ❌
- Cause: Browser cache (frontend code IS deployed to git)
- Fix: Hard refresh browser

### Issue 3: Auto-Advancing Picks
- TV in next room triggering "next" command
- Confidence filtering mentioned in MEMORY.md but NOT implemented
- Need to add Deepgram confidence threshold

---

## UPSTREAM DATA STRUCTURE (from Merge All Paths node)

**What workflow provides:**
```json
{
  "action": "next_item",
  "product_name": "Fritolay Smartfood Popcorn...",
  "quantity": 8,
  "slot": "026",
  "product_name2": "Funyuns Flamin' Hot LSS 1.25 oz",
  "quantity2": 1,
  "slot2": "028"
}
```

**Flat fields at input, BUT Format Output must convert to nested `item2` for frontend!**

---

## THE FIX NEEDED

**Format Output must return:**
```javascript
var output = {
  action: data.action,
  product_name: data.product_name,
  quantity: data.quantity,
  slot: data.slot,
  slot_spoken: formatSlotForTTS(data.slot),
  display_text: generateDisplayText(...),  // NEW: "Product (size) X count"
  voice_text: generateVoiceText(...),      // NEW: "Product size count count"
  spoken: generateVoiceText(...),          // Backwards compat
  product_parsed: { name, size, type }
};

// CRITICAL: Keep item2 as NESTED OBJECT
if (data.product_name2) {
  output.item2 = {
    product_name: data.product_name2,
    quantity: data.quantity2,
    slot: data.slot2,
    slot_spoken: formatSlotForTTS(data.slot2),
    inventory_current: data.inventory_current2 || 0,
    inventory_parlevel: data.inventory_parlevel2 || 0,
    product_parsed: parseProduct(data.product_name2)
  };
}
```

---

## FILES INVOLVED

**Modified (broken):**
- `/home/visionairy/StockerAI/FIXED_FORMAT_OUTPUT_WITH_2ITEM.js` (uses flat fields - WRONG)
- n8n workflow "get_next_item (Optimized)" - Format Output node

**Original working (before changes):**
- Execution 27107 shows original structure
- Had `spoken` field (count first)
- Had nested `item2` object

**Frontend (correctly deployed):**
- `/home/visionairy/StockerAI/src/pages/StockerApp.tsx` (commits 40b0888, 4f93753)
- Expects `result.item2.product_name`, NOT `result.product_name2`

---

## CORRECT FIX

1. **Format Output must:**
   - Parse both items
   - Generate `display_text` with count at END
   - Generate `voice_text` with "count" suffix at END
   - Return item2 as NESTED object (not flat fields)

2. **Frontend fix:**
   - Hard refresh browser to clear cache

3. **Voice confidence fix:**
   - Add Deepgram confidence threshold to prevent TV triggering

---

## WHAT NOT TO LOSE

**Frontend code structure (from StockerApp.tsx:586-599):**
```typescript
const buildDisplayText = (result: any): string => {
  if (result.display_text) {
    console.log('[Display] Using display_text:', result.display_text);
    return result.display_text;
  }

  // Backwards compatibility
  if (result.action === 'next_item' || result.action === 'item_ready') {
    const parts: string[] = [];
    if (result.product_name && result.quantity) {
      parts.push(`${result.quantity}× ${result.product_name}`);
    }
    if (result.item2?.product_name && result.item2?.quantity) {
      parts.push(`${result.item2.quantity}× ${result.item2.product_name}`);
    }
    return parts.join(', ');
  }

  return result.spoken || '';
};
```

**Note:** `result.item2?.product_name` - frontend expects NESTED object!

---

## EXECUTION TIMELINE

- 27107: Last working (2-item mode, nested item2 structure)
- 27147-27150: Failed (markdown in Format Output)
- 27177: First success after fix (but missing item2 nesting)
- 27220: Current broken state (flat fields, no item2 object)

---

## IMMEDIATE NEXT STEPS

1. ✅ Create CORRECT Format Output code with:
   - display_text/voice_text generation (count at end)
   - Nested item2 structure (frontend compatibility)
   - **FILE: `/home/visionairy/StockerAI/CORRECT_FORMAT_OUTPUT.js`**

2. **NEXT:** Paste CORRECT_FORMAT_OUTPUT.js into n8n Format Output node

3. User hard refresh browser (Ctrl+Shift+R)

4. Test with 1-item and 2-item mode

5. Add confidence filtering for voice (prevent TV triggering)

---

## GIT COMMITS INVOLVED

- 40b0888: Frontend Option B implementation ✅
- 4f93753: Type duplication fix ✅
- 144e54e: n8n workflow guide (created broken code)
