# Boundary 8: Data Type Mismatches - Deep Analysis
**Date:** 2026-01-17
**Status:** Complete

---

## Discovery Question

**Where can type coercion break logic?**

---

## Discovered Failure Modes

### 1. STRING vs NUMBER

#### 1A. Sequence "10" vs 10 comparison
- **Trigger:** DB returns string, code expects number
- **Code:** `items[i].sequence === currentItemIndex - 1`
- **Bug:** If sequence is string: `"10" === 9` → false (WRONG)
- **Likelihood:** 2/5 (depends on DB schema) | **Impact:** 4/5 | **Priority:** 8
- **Action:** **VERIFY DB SCHEMA** (see Boundary 2)

#### 1B. String sort vs numeric sort
- **Trigger:** Sorting items by sequence
- **Bug:** String sort: "1", "10", "2", "3" vs numeric: 1, 2, 3, 10
- **Likelihood:** 2/5 | **Impact:** 3/5 | **Priority:** 6
- **Investigation:** Are items pre-sorted by DB or sorted in code?

---

### 2. NULL vs UNDEFINED vs 0

#### 2A. items_remaining=0 vs undefined
- **Trigger:** Last item on machine
- **Bug:** `if (!items_remaining)` → treats 0 as falsy
- **Should:** `if (items_remaining === undefined)`
- **Likelihood:** 2/5 | **Impact:** 2/5 | **Priority:** 4

#### 2B. Empty string vs null
- **Trigger:** Optional field like `slot_spoken`
- **Bug:** `slot_spoken || slot` when slot_spoken="" → uses slot (WRONG)
- **Should:** `slot_spoken !== undefined ? slot_spoken : slot`
- **Likelihood:** 1/5 | **Impact:** 1/5 | **Priority:** 1

---

### 3. BOOLEAN STRING

#### 3A. "true" string vs true boolean
- **Trigger:** URL param or storage returns string
- **Bug:** `if (booleanParam)` when param="false" → truthy!
- **Should:** `if (booleanParam === true)` or `if (booleanParam === "true")`
- **Likelihood:** 1/5 | **Impact:** 3/5 | **Priority:** 3

---

### 4. DATE FORMATS

#### 4A. "2026-01-17" vs "01/17/2026" vs timestamp
- **Trigger:** Date comparison or matching
- **Bug:** String comparison "2026-01-17" < "2026-01-20" works, but "01/17/2026" doesn't
- **Likelihood:** 1/5 | **Impact:** 3/5 | **Priority:** 3
- **Investigation:** Are dates consistently formatted?

---

### 5. ARRAY vs SINGLE VALUE

#### 5A. Expecting array but get single item
- **Trigger:** API returns single item not wrapped in array
- **Bug:** `items.map(...)` when items is object → crash
- **Likelihood:** 1/5 | **Impact:** 4/5 | **Priority:** 4
- **Investigation:** Are Edge Function responses always arrays?

---

### 6. FLOAT vs INT

#### 6A. Quantity 5.0 vs 5
- **Trigger:** Division or calculation produces float
- **Bug:** Display shows "5.0 Snickers" instead of "5 Snickers"
- **Likelihood:** 1/5 | **Impact:** 1/5 | **Priority:** 1

---

## Risk Summary

| Failure Mode | Priority | Action |
|--------------|----------|--------|
| 1A. String vs number sequence | 8 | **VERIFY DB SCHEMA** |
| 1B. String vs numeric sort | 6 | **Check sort logic** |
| 2A. items_remaining=0 falsy | 4 | Monitor |
| 2B. Empty string vs null | 1 | Ignore |
| 3A. Boolean string | 3 | Monitor |
| 4A. Date format mismatch | 3 | **Verify consistency** |
| 5A. Array vs single value | 4 | **Check Edge Function** |
| 6A. Float display | 1 | Ignore |

---

## High Priority (8+)

1. **String vs number sequence** (Priority: 8) - MUST verify DB schema

---

**Status:** 8 failure modes discovered, 1 high-priority schema verification
