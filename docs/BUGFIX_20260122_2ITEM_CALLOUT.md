# Bug Fix: 2-Item Voice Callout Not Working

**Date:** 2026-01-22
**Severity:** HIGH (Feature broken)
**Impact:** When count=2 setting is active, voice only announces 1 item instead of 2

---

## Root Cause

**Field name mismatch between Determine Next State and Format Output nodes:**

### What Determine Next State Outputs:
```javascript
{
  product_name: "Coke Zero 12oz Can",
  quantity: 4,
  product_name2: "Dr Pepper 12oz Can",   // ← Note: product_name2
  quantity2: 2,                            // ← Note: quantity2
  slot2: "23"
}
```

### What Format Output Checks For:
```javascript
if (data.count === 2 && data.item2_product_name) {  // ← WRONG FIELD NAME
  // ... announce 2 items
}
```

**The condition is ALWAYS false because:**
1. `data.count` is never passed from Determine Next State → Format Output
2. `data.item2_product_name` doesn't exist (should be `data.product_name2`)

---

## The Fix

**Change 3 locations in Format Output node:**

### Location 1: generateSpoken() function (~line 105)
**BEFORE:**
```javascript
if (data.count === 2 && data.item2_product_name) {
```

**AFTER:**
```javascript
if (data.product_name2 && parsed2) {
```

### Location 2: generateSpoken() second item quantity (~line 118)
**BEFORE:**
```javascript
item2Parts.push('.... ' + data.item2_quantity + ' count');
```

**AFTER:**
```javascript
item2Parts.push('.... ' + data.quantity2 + ' count');
```

### Location 3: generateDisplayText() function (~line 153)
**BEFORE:**
```javascript
if (data.count === 2 && parsed2) {
  var item2 = parsed2.name + (parsed2.size ? ' (' + parsed2.size + ')' : '') + ' X ' + data.item2_quantity;
```

**AFTER:**
```javascript
if (data.product_name2 && parsed2) {
  var item2 = parsed2.name + (parsed2.size ? ' (' + parsed2.size + ')' : '') + ' X ' + data.quantity2;
```

### Location 4: Main output building (~line 207)
**BEFORE:**
```javascript
if (data.count === 2 && data.item2_product_name) {
    parsed2 = parseProduct(data.item2_product_name);

    output.item2 = {
      product_name: data.item2_product_name,
      quantity: data.item2_quantity,
```

**AFTER:**
```javascript
if (data.product_name2) {
    parsed2 = parseProduct(data.product_name2);

    output.product_name2 = data.product_name2;
    output.quantity2 = data.quantity2;
    output.slot2 = data.slot2;
    output.slot_spoken2 = formatSlotForTTS(data.slot2);

    output.product_parsed2 = {
```

---

## How to Apply the Fix

### Option 1: Replace Entire Code (Recommended)

1. Open n8n: https://visionairy.app.n8n.cloud
2. Find workflow: **"Stocker Tool: get_next_item (Optimized)"** (ID: iykbFj7f9222PF7r)
3. Click to edit
4. Find node: **"Format Output"**
5. Click on the node to open code editor
6. **Delete all existing code**
7. Copy all code from: `/home/visionairy/StockerAI/workflows/FORMAT_OUTPUT_FIXED_20260122.js`
8. Paste into the node
9. Click **Save**

### Option 2: Manual Edits (If you prefer minimal changes)

1. Open the "Format Output" node
2. Find line ~105: `if (data.count === 2 && data.item2_product_name) {`
   - Change to: `if (data.product_name2 && parsed2) {`
3. Find line ~118: `item2Parts.push('.... ' + data.item2_quantity + ' count');`
   - Change to: `item2Parts.push('.... ' + data.quantity2 + ' count');`
4. Find line ~153: `if (data.count === 2 && parsed2) {`
   - Change to: `if (data.product_name2 && parsed2) {`
5. Find line ~155: `var item2 = ... + data.item2_quantity;`
   - Change to: `var item2 = ... + data.quantity2;`
6. Find line ~207: `if (data.count === 2 && data.item2_product_name) {`
   - Change to: `if (data.product_name2) {`
7. Find line ~208: `parsed2 = parseProduct(data.item2_product_name);`
   - Change to: `parsed2 = parseProduct(data.product_name2);`
8. Find line ~210-215: Replace entire `output.item2 = { ... }` block with:
   ```javascript
   output.product_name2 = data.product_name2;
   output.quantity2 = data.quantity2;
   output.slot2 = data.slot2;
   output.slot_spoken2 = formatSlotForTTS(data.slot2);

   output.product_parsed2 = {
     name: parsed2.name,
     size: parsed2.size,
     type: parsed2.type
   };
   ```
9. Click **Save**

---

## Testing

After applying the fix:

1. **Start a route** with Stocker app
2. **Open settings** and set count to **2**
3. Say **"next"**
4. **Expected behavior:**
   - Voice should announce: "Product1 size type.... X count, Product2 size type.... Y count"
   - Screen should show both items
5. **If it doesn't work:**
   - Check n8n execution logs
   - Verify Format Output node was saved correctly
   - Check that Determine Next State is outputting product_name2 and quantity2

---

## Why This Happened

Someone manually edited the Format Output node in n8n and used incorrect field names that don't match what Determine Next State outputs.

**The repository file** (`FORMAT_OUTPUT_WITH_TTS_PAUSE.js`) was CORRECT all along, but the n8n workflow had diverged from it.

---

## Prevention

**Always check field names match between:**
- What the previous node OUTPUTS
- What the current node EXPECTS

**Use n8n's built-in variable browser** (click the variable icon) to see exactly what fields are available from previous nodes.

---

## Related Files

- **Fixed code:** `/home/visionairy/StockerAI/workflows/FORMAT_OUTPUT_FIXED_20260122.js`
- **Original (correct) code:** `/home/visionairy/StockerAI/workflows/FORMAT_OUTPUT_WITH_TTS_PAUSE.js`
- **n8n workflow:** "Stocker Tool: get_next_item (Optimized)" (ID: iykbFj7f9222PF7r)

---

## Summary

**Bug:** Format Output checked for wrong field names (`item2_product_name` instead of `product_name2`)
**Fix:** Update Format Output to use correct field names matching Determine Next State output
**Time to fix:** 5 minutes (copy/paste entire code)
**Risk:** Low (purely cosmetic fix, no logic changes)
