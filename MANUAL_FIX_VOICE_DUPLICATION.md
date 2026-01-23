# Manual Fix Required: Voice Duplication

**Issue:** Voice says "Route route complete" instead of "Route complete"

**Root Cause:** Line 138 in Format Output node duplicates the word "route"

**Fix:**

1. Open n8n: https://visionairy.app.n8n.cloud
2. Workflow: "Stocker Tool: get_next_item (Optimized)"
3. Node: "Format Output"
4. Find line 138:
   ```javascript
   return data.completed_route + ' route complete. Nice work!';
   ```
5. Change to:
   ```javascript
   return data.completed_route + ' complete. Nice work!';
   ```
6. Save

**Result:** Voice will say "Route complete. Nice work!" (correct)

**Fixed file ready:** `/home/visionairy/StockerAI/workflows/FORMAT_OUTPUT_FIXED_20260122.js` (updated)
