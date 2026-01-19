# DEPLOY CORRECT CODE TO FIX 2-ITEM MODE

**Status**: n8n currently has BROKEN code with flat fields
**Evidence**: Execution 27236 shows `product_name2` instead of nested `item2` object

---

## THE PROBLEM

**Current n8n output (WRONG)**:
```json
{
  "product_name2": "Red Bull Can 12 oz - Can",
  "quantity2": 6,
  "slot2": "049"
}
```

**Frontend expects (CORRECT)**:
```json
{
  "item2": {
    "product_name": "Red Bull Can 12 oz - Can",
    "quantity": 6,
    "slot": "049"
  }
}
```

**Result**: App speaks 2 items but only displays 1 item (cannot find `result.item2.product_name`)

---

## THE FIX

### Step 1: Open the correct file

**File to use**: `/home/visionairy/StockerAI/CORRECT_FORMAT_OUTPUT.js`

**DO NOT USE**: `FIXED_FORMAT_OUTPUT_WITH_2ITEM.js` (this has flat fields bug)

### Step 2: Copy the entire file contents

```bash
cat /home/visionairy/StockerAI/CORRECT_FORMAT_OUTPUT.js
```

Select all and copy to clipboard.

### Step 3: Paste into n8n

1. Go to n8n workflow: "Stocker Tool: get_next_item (Optimized)"
2. Open the "Format Output" Code node
3. **DELETE ALL existing content**
4. **PASTE** the entire contents from CORRECT_FORMAT_OUTPUT.js
5. Click "Execute Workflow" to save

### Step 4: Test

Say "next" in the app.

**What you should see in console**:
```
[Display] Using display_text: Coke (20 oz) X 1, Red Bull (12 oz) X 6
[Voice] Using voice_text: new format Coke 20 ounce Bottle 1 count, Red Bull 12 ounce Kan 6 count
```

**App should display**:
```
Coke (20 oz) X 1, Red Bull (12 oz) X 6
```
(Both items visible, count at END)

### Step 5: Hard refresh browser

After verifying n8n works:
- Windows/Linux: Ctrl + Shift + R
- Mac: Cmd + Shift + R

This clears the cached JavaScript so display format updates.

---

## KEY DIFFERENCE IN CODE

**Line 143-157 of CORRECT_FORMAT_OUTPUT.js**:
```javascript
if (data.product_name2) {
  var parsed2 = parseProduct(data.product_name2);
  output.item2 = {                           // ← NESTED OBJECT
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

**Lines 194-206 of FIXED_FORMAT_OUTPUT_WITH_2ITEM.js (WRONG)**:
```javascript
if (data.product_name2) {
  parsed2 = parseProduct(data.product_name2);

  output.product_name2 = data.product_name2;  // ← FLAT FIELDS
  output.quantity2 = data.quantity2;
  output.slot2 = data.slot2;

  output.product_parsed2 = {
    name: parsed2.name,
    size: parsed2.size,
    type: parsed2.type
  };
}
```

---

## VERIFICATION

After deployment, check execution output has:
```json
{
  "item2": {
    "product_name": "...",
    "quantity": ...,
    "slot": "..."
  }
}
```

NOT:
```json
{
  "product_name2": "...",
  "quantity2": ...,
  "slot2": "..."
}
```
