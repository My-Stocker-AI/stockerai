# Option B Implementation: Item Display Order Change
**Date:** 2026-01-18
**Approach:** Comprehensive (n8n + Frontend with separate display_text and voice_text)

---

## Step 1: Update n8n "Format Output" Node

**Workflow:** get_next_item (Optimized) - ID: `iykbFj7f9222PF7r`
**Node:** "Format Output" (Code node)

### Current Code Section (lines ~220-235):
```javascript
// Add spoken field for fast path
output.spoken = generateSpoken(data.action, data, parsed);

return [{ json: output }];
```

### NEW Code to Replace Above:
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

// Generate VOICE text (product first, then "X count")
function generateVoiceText(action, data, parsed) {
  if (action === 'next_item') {
    // Build voice: Product Name Size "X count"
    var parts = [];

    if (parsed.name) {
      parts.push(fixPronunciation(parsed.name));
    }

    if (parsed.size) {
      parts.push(fixPronunciation(parsed.size));
    }

    // Fix type duplication
    if (parsed.type) {
      var typeLower = parsed.type.toLowerCase();
      var nameLower = parsed.name.toLowerCase();
      if (nameLower.indexOf(typeLower) === -1) {
        parts.push(fixPronunciation(parsed.type));
      }
    }

    // Add count with number spelled out
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

**Test Examples:**
- Input: `product_name: "Snickers Bar"`, `quantity: 8`, `parsed.size: "36 Pack"`
- Output:
  - `display_text`: "Snickers Bar (36 Pack) X 8"
  - `voice_text`: "Snickers Bar 36 Pack 8 count"

---

## Step 2: Update Frontend to Use New Fields

**File:** `/src/hooks/useStockerAI.ts`

### Change 1: Update executeToolCalls to handle new response format

**Find this section (around line 150-200):**
```typescript
const result = await fetch...
const data = await result.json();
```

**After data parsing, ADD:**
```typescript
// Extract display and voice text from response
if (data.display_text && data.voice_text) {
  // New format with separate fields
  console.log('[Tools] Response has separate display/voice:', {
    display: data.display_text,
    voice: data.voice_text
  });
} else if (data.spoken) {
  // Backwards compatibility: use spoken for both
  data.display_text = data.spoken;
  data.voice_text = data.spoken;
}
```

### Change 2: Update speakResponse to use voice_text

**Find speakResponse function (around line 300-400):**
```typescript
const speakResponse = useCallback((text: string) => {
  // ... existing code
  speak(text);
}, [speak]);
```

**Replace calls to speakResponse with:**
```typescript
const speakResponse = useCallback((response: any) => {
  // Use voice_text if available, fallback to display_text or spoken
  const textToSpeak = response.voice_text || response.display_text || response.spoken || '';

  console.log('[Voice] Speaking:', textToSpeak);
  speak(textToSpeak);
}, [speak]);
```

### Change 3: Update UI display to use display_text

**File:** `/src/pages/StockerApp.tsx`

**Find where messages are rendered (search for "assistant" role messages):**

```typescript
// Around line 800-900, in message rendering
{msg.role === 'assistant' && (
  <div className="text-xl">
    {msg.content}  {/* <-- This displays the text */}
  </div>
)}
```

**Update to:**
```typescript
{msg.role === 'assistant' && (
  <div className="text-xl">
    {msg.display_text || msg.content}  {/* Display field first, fallback to content */}
  </div>
)}
```

---

## Step 3: Testing Checklist

### Unit Tests (n8n)
- [ ] Test single item: "Coke (12 Pack)" + quantity 8
  - display_text: "Coke (12 Pack) X 8" ✓
  - voice_text: "Coke 12 Pack 8 count" ✓

- [ ] Test long name: "Reese's Peanut Butter Cups King Size (24 Pack)" + quantity 12
  - display_text: "Reese's Peanut Butter Cups King Size (24 Pack) X 12" ✓
  - voice_text: "Reese's Peanut Butter Cups King Size 24 Pack 12 count" ✓

- [ ] Test NULL packaging: "Sprite" + quantity 10 + packaging NULL
  - display_text: "Sprite X 10" ✓
  - voice_text: "Sprite 10 count" ✓

### Voice Tests
- [ ] TTS says "eight count" NOT "eight times"
- [ ] TTS says "twelve count" NOT "twelve X"
- [ ] Long product names don't get cut off

### Visual Tests
- [ ] Mobile: Long names wrap properly
- [ ] Desktop: Format looks clean
- [ ] "X 8" separator is clear and visible

### Integration Tests
- [ ] Say "next" → hear product name FIRST
- [ ] Say "repeat" → same format replayed
- [ ] Toggle to 2-item mode → both formatted correctly

---

## Step 4: Deployment Instructions

### 4.1 Deploy n8n Changes

1. **Open n8n:**
   - Go to https://visionairy.app.n8n.cloud
   - Find workflow: "Stocker Tool: get_next_item (Optimized)"

2. **Edit "Format Output" node:**
   - Click on "Format Output" Code node
   - Scroll to bottom (around line 230)
   - Replace the `output.spoken = ...` section with NEW code above
   - Click "Execute Node" to test
   - Verify output has `display_text` and `voice_text` fields

3. **Activate workflow:**
   - Click "Save"
   - Ensure workflow is ACTIVE (toggle in top right)

### 4.2 Deploy Frontend Changes

**Option A: Quick test (manual):**
1. Edit files locally
2. Test with `npm run dev`
3. Verify voice and display work

**Option B: Production deployment:**
```bash
git add src/hooks/useStockerAI.ts src/pages/StockerApp.tsx
git commit -m "Implement Option B: Separate display/voice text for item order

Changes:
- n8n returns display_text (product X count) and voice_text (product count)
- Frontend uses voice_text for TTS, display_text for UI
- Product name now spoken/shown FIRST, then quantity
- Voice says 'eight count' instead of 'eight times'

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
git push origin main
```

Wait 2-3 minutes for Cloudflare to deploy.

---

## Step 5: Verification

### Test in Production
1. Load a route
2. Say "next"
3. Verify:
   - ✅ Voice says product name FIRST, then "X count"
   - ✅ Display shows "Product Name (Pack) X 8"
   - ✅ Voice says "count" NOT "times"

### Rollback if Needed
If anything breaks:
1. **n8n:** Restore `output.spoken = generateSpoken(...)` line
2. **Frontend:** Revert to previous commit: `git revert HEAD && git push`

---

## COMPLETE IMPLEMENTATION SUMMARY

**n8n Changes:**
- Add `generateDisplayText()` function → "Product X Count" format
- Add `generateVoiceText()` function → "Product Count" format (with "count" suffix)
- Return both `display_text` and `voice_text` in response

**Frontend Changes:**
- Update `executeToolCalls` to extract both fields
- Update `speakResponse` to use `voice_text`
- Update message rendering to use `display_text`

**Testing:**
- 3 n8n unit tests
- 3 voice TTS tests
- 3 visual display tests
- 3 integration tests

**Estimated Time:** 1 hour total (30 min n8n + 30 min frontend)

---

**END OF IMPLEMENTATION GUIDE**
