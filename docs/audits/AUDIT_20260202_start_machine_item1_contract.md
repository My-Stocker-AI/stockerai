# System Impact Audit - start_machine item1 Contract Fix

**Date:** 2026-02-02
**Auditor:** Claude Sonnet 4.5
**Change:** Fix start_machine workflow Format Output to return `item1` object (match frontend contract)

---

## Proposed Change

**Current Output:**
```javascript
{
  action: 'item_ready',
  machine_id: "...",
  product_name: "...",  // Flat structure
  quantity: 5,
  slot: "...",
  item2: { ... }  // Only in 2-pick mode
}
```

**Fixed Output:**
```javascript
{
  action: 'item_ready',
  machine_id: "...",
  item1: {  // Wrapped in item1
    product_name: "...",
    quantity: 5,
    slot: "...",
    slot_spoken: "..."
  },
  item2: { ... }  // Only in 2-pick mode
}
```

---

## 6-Question Analysis

### 1. DATA FLOW

**Current:** Format Output → Webhook → Frontend updateFromTool()
**Change:** Output structure changes from flat to nested
**Impact:** Frontend code (line 232 of useStockerSession.ts):
```javascript
const itemData = result.item1 || result;
```
Already handles BOTH formats! Prefers `item1`, falls back to flat.

**Conclusion:** Frontend was built expecting the contract-compliant format. Workflow is broken, not frontend.

### 2. CALLERS (Upstream)

**Who calls start_machine?**
1. AI (OpenAI function calling) → `/start-machine` webhook
2. CommandRecognizer (direction commands) → `/start-machine` webhook

Both route through same webhook, both handled by updateFromTool().

**Impact:** ✅ None - Callers don't care about response structure, they just pass it to updateFromTool()

### 3. CALLEES (Downstream)

**What receives the output?**
1. Frontend updateFromTool() - ✅ Ready (already handles item1)
2. Contract validator - ✅ Waiting for this fix (currently failing)

**Impact:** ✅ None - All consumers ready

### 4. SIDE EFFECTS

**start_machine workflow:**
- Updates sessions table (not affected by Format Output)
- Updates machines table (not affected by Format Output)

**Format Output node:**
- Pure data transformation
- No database writes
- No external API calls

**Impact:** ✅ None

### 5. STATE DEPENDENCIES

**State involved:**
- machineTransitionLockRef - Not affected by output format
- pendingMachineTransition - Not affected by output format
- Session persistence - Not affected by output format

**Impact:** ✅ None

### 6. ERROR PROPAGATION

**Current:** Contract validation fails (logged only, doesn't block)
**After fix:** Contract validation passes
**If Format Output errors:** Workflow fails → Frontend error handler → User retry

**Impact:** ✅ Improves error detection (contract validation will catch future breaks)

---

## Risk Assessment

| Category | Risk | Mitigation |
|----------|------|------------|
| Breaking Change | LOW | Frontend already handles item1 format |
| Data Corruption | NONE | No database changes |
| State Corruption | NONE | No state dependencies affected |
| Error Handling | IMPROVED | Contract validation will pass |

**Overall Risk:** ✅ **LOW - Safe to proceed**

---

## Implementation Plan

### Step 1: Update start_machine Format Output Node

**File:** n8n workflow JbKdJuKgGbyvzlF0 → Format Output node

**Change:** Wrap first item in `item1` object (lines ~170-220 of current code)

**Before:**
```javascript
output.product_name = itemData.product_name;
output.quantity = itemData.quantity;
output.slot = itemData.slot;
// ...
```

**After:**
```javascript
output.item1 = {
  product_name: itemData.product_name,
  quantity: itemData.quantity,
  slot: itemData.slot,
  slot_spoken: formatSlotForTTS(itemData.slot),
  inventory_current: itemData.inventory_current || 0,
  inventory_parlevel: itemData.inventory_parlevel || 0,
  product_parsed: {
    name: parsed.name,
    size: parsed.size,
    type: parsed.type
  }
};
```

### Step 2: Verify Contract Validation Passes

After deployment, check browser console for:
```
[ContractValidation] Workflow start_machine output - 0 violations
```

### Step 3: Test User Flow

1. Start machine with "top" or "bottom"
2. Verify items display correctly
3. Verify 2-pick mode works
4. Verify contract validation passes

---

## Rollback Plan

If issues occur:
1. Revert Format Output node to previous version
2. Frontend fallback (`result.item1 || result`) will handle it
3. No data corruption possible (pure format change)

---

## Approval Status

**Status:** ⏳ AWAITING USER APPROVAL

**Approved by:** _____________
**Date:** _____________
