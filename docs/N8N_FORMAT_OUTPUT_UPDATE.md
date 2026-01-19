# n8n Format Output Node Update - Option B Implementation
**Date:** 2026-01-18
**Purpose:** Add separate display_text and voice_text fields to item responses

---

## Instructions

### Step 1: Open n8n Workflow

1. Go to https://visionairy.app.n8n.cloud
2. Open workflow: **"Stocker Tool: get_next_item (Optimized)"**
3. Find the **"Format Output"** Code node (near the bottom of the workflow)
4. Click to edit it

### Step 2: Find the Current Code Section

Scroll to the bottom of the Code node and find this section (around line 220-235):

```javascript
// Add spoken field for fast path
output.spoken = generateSpoken(data.action, data, parsed);

return [{ json: output }];
```

### Step 3: Replace with New Code

**DELETE** the lines above and **REPLACE** with the complete code below:

```javascript
// Generate DISPLAY text (product first, then count)
function generateDisplayText(action, data, parsed) {
  if (action === 'next_item') {
    // Build display: Product Name (Packaging) X Quantity
    var parts = [];

    if (parsed.name) {
      parts.push(parsed.name);
    }

    if (parsed.size) {
      parts.push('(' + parsed.size + ')');
    }

    var productText = parts.join(' ');
    return productText + ' X ' + data.quantity;
  }

  if (action === 'next_machine') {
    return data.completed_machine + ' complete. Next is ' + data.next_machine + ' at ' + data.next_location + '. Top or bottom?';
  }

  if (action === 'complete') {
    return data.completed_route + ' route complete. Nice work!';
  }

  return null;
}

// Generate VOICE text (product first, then "count")
function generateVoiceText(action, data, parsed) {
  if (action === 'next_item') {
    // Build voice: Product Name Size "count"
    var parts = [];

    if (parsed.name) {
      parts.push(fixPronunciation(parsed.name));
    }

    if (parsed.size) {
      parts.push(fixPronunciation(parsed.size));
    }

    // Fix type duplication (don't say "pack" if it's already in name OR size)
    if (parsed.type) {
      var typeLower = parsed.type.toLowerCase();
      var nameLower = parsed.name ? parsed.name.toLowerCase() : '';
      var sizeLower = parsed.size ? parsed.size.toLowerCase() : '';

      // Only add type if it's not already in name OR size
      if (nameLower.indexOf(typeLower) === -1 && sizeLower.indexOf(typeLower) === -1) {
        parts.push(fixPronunciation(parsed.type));
      }
    }

    // Add count with "count" suffix
    parts.push(data.quantity + ' count');

    return parts.join(' ');
  }

  if (action === 'next_machine') {
    return data.completed_machine + ' complete. Next is ' + data.next_machine + ' at ' + data.next_location + '. Top or bottom?';
  }

  if (action === 'complete') {
    return data.completed_route + ' route complete. Nice work!';
  }

  return null;
}

// Add BOTH display and voice fields
output.display_text = generateDisplayText(data.action, data, parsed);
output.voice_text = generateVoiceText(data.action, data, parsed);
output.spoken = output.voice_text; // Keep for backwards compat during transition

return [{ json: output }];
```

### Step 4: Test the Node

1. Click **"Test step"** or **"Execute Node"** to run it
2. Check the output panel on the right
3. Verify you see **THREE** fields in the output:
   - `display_text`: "Snickers Bar (36 Pack) X 8"
   - `voice_text`: "Snickers Bar 36 Pack 8 count"
   - `spoken`: (same as voice_text, for backwards compatibility)

### Step 5: Save and Activate

1. Click **"Save"** in the top right
2. Ensure the workflow is **ACTIVE** (toggle should be ON)
3. The changes are now live

---

## Expected Output Examples

### Example 1: Snickers Bar
**Input:**
- product_name: "Snickers Bar"
- quantity: 8
- parsed.name: "Snickers Bar"
- parsed.size: "36 Pack"

**Output:**
- `display_text`: "Snickers Bar (36 Pack) X 8"
- `voice_text`: "Snickers Bar 36 Pack 8 count"

### Example 2: Coke (no size)
**Input:**
- product_name: "Coke"
- quantity: 12
- parsed.name: "Coke"
- parsed.size: null

**Output:**
- `display_text`: "Coke X 12"
- `voice_text`: "Coke 12 count"

### Example 3: Long Product Name
**Input:**
- product_name: "Reese's Peanut Butter Cups King Size"
- quantity: 12
- parsed.name: "Reese's Peanut Butter Cups King Size"
- parsed.size: "24 Pack"

**Output:**
- `display_text`: "Reese's Peanut Butter Cups King Size (24 Pack) X 12"
- `voice_text`: "Reese's Peanut Butter Cups King Size 24 Pack 12 count"

---

## Frontend Integration

The frontend has already been updated (committed 40b0888) to:
- Display `display_text` in the UI
- Speak `voice_text` via TTS
- Fall back to `spoken` for backwards compatibility

**No frontend deployment needed** - it's already live and will work with both old and new workflow formats.

---

## Testing Checklist

After deploying n8n changes:

1. **Visual Test**: Load a route and say "next"
   - [ ] Display shows "Product Name (Size) X Count" format
   - [ ] Product name is shown FIRST (not count first)

2. **Voice Test**: Listen to TTS
   - [ ] Voice says product name FIRST
   - [ ] Voice says "eight count" NOT "eight times"
   - [ ] Voice says "twelve count" NOT "twelve X"

3. **Edge Cases**:
   - [ ] Items with no packaging show "Product X Count" (no empty parens)
   - [ ] Long product names don't get cut off
   - [ ] 2-item mode works (if enabled)

4. **Repeat Command**:
   - [ ] Say "repeat" and verify same format is spoken again

---

## Rollback Plan

If anything breaks:

1. Open n8n workflow
2. Find "Format Output" Code node
3. Replace with old code:
```javascript
// Add spoken field for fast path
output.spoken = generateSpoken(data.action, data, parsed);

return [{ json: output }];
```
4. Save and test

Frontend will automatically fall back to using `spoken` field.

---

**Status:** Ready to deploy
**Frontend:** Already deployed (commit 40b0888)
**Next Step:** Update n8n workflow using instructions above
