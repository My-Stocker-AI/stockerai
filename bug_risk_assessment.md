# StockerAI Bug Risk Assessment
**Date:** 2026-01-17
**Purpose:** Assess implementation risk before fixing potential bugs

---

## Scoring Guide

**Impact (1-5):**
- 1 = Cosmetic annoyance
- 2 = Minor workflow disruption
- 3 = Feature partially broken
- 4 = Data corruption possible
- 5 = Complete system failure / Data loss

**Likelihood (1-5):**
- 1 = Theoretical edge case (never seen)
- 2 = Rare (< 1% of sessions)
- 3 = Occasional (5-10% of sessions)
- 4 = Common (25%+ of sessions)
- 5 = Happens every time

**Fix Complexity (1-5):**
- 1 = Single line change, isolated
- 2 = Single file, few changes
- 3 = Multiple files, clear solution
- 4 = Architectural change required
- 5 = Complete refactor needed

**Fix Risk (1-5):**
- 1 = Isolated, won't affect other features
- 2 = Touches shared code, low risk
- 3 = Could affect related features
- 4 = High chance of breaking something
- 5 = Critical path, breaking change

**Priority = Impact × Likelihood**

---

## Risk Matrix

| # | Boundary | Impact | Likelihood | Fix Complexity | Fix Risk | Priority | Action |
|---|----------|--------|------------|----------------|----------|----------|--------|
| 1 | State Synchronization | ? | ? | ? | ? | ? | ? |
| 2 | Sequence/Index Confusion | 4 | 4 | 2 | 2 | 16 | ✅ Already fixed (reverse mode) |
| 3 | Voice Recognition Ambiguity | ? | ? | ? | ? | ? | ? |
| 4 | Workflow Execution Failures | ? | ? | ? | ? | ? | ? |
| 5 | Machine State Transitions | ? | ? | ? | ? | ? | ? |
| 6 | Two-Item Mode Edge Cases | ? | ? | ? | ? | ? | ? |
| 7 | Route Completion Logic | ? | ? | ? | ? | ? | ? |
| 8 | Data Type Mismatches | ? | ? | ? | ? | ? | ? |
| 9 | Permission & Access Control | ? | ? | ? | ? | ? | ? |
| 10 | Cache Invalidation | ? | ? | ? | ? | ? | ? |

---

## Specific Known Issues (Map to Boundaries)

### Issue: Item number shows 58/59
- **Boundary:** #3 Voice Recognition Ambiguity (semantic interpretation)
- **Impact:** 2 (minor confusion)
- **Likelihood:** 4 (common when asked)
- **Fix Complexity:** 1 (prompt update only)
- **Fix Risk:** 1 (isolated change)
- **Priority:** 8
- **Status:** ✅ Fixed (awaiting test)

### Issue: Reverse mode premature termination
- **Boundary:** #2 Sequence/Index Confusion
- **Impact:** 4 (can't complete route)
- **Likelihood:** 4 (every reverse mode route)
- **Fix Complexity:** 2 (workflow logic update)
- **Fix Risk:** 2 (affects machine transitions)
- **Priority:** 16
- **Status:** ✅ Fixed (awaiting test)

### Issue: Skipped machine not remembered
- **Boundary:** #5 Machine State Transitions
- **Impact:** 3 (items not stocked)
- **Likelihood:** 3 (when machines skipped)
- **Fix Complexity:** 2 (state tracking)
- **Fix Risk:** 2 (state management)
- **Priority:** 9
- **Status:** ✅ Fixed with reverse mode fix

### Issue: [Add issues Davy reported]
- **Boundary:** ?
- **Impact:** ?
- **Likelihood:** ?
- **Fix Complexity:** ?
- **Fix Risk:** ?
- **Priority:** ?
- **Status:** Not analyzed

---

## Decision Framework

Based on Priority Score:

### HIGH PRIORITY (12+) - Fix Soon
- Priority 16-25: Critical bugs, fix immediately if low risk
- Priority 12-15: Important bugs, schedule fix

### MEDIUM PRIORITY (6-11) - Evaluate
- Worth fixing if low complexity + low risk
- Document workaround if high risk

### LOW PRIORITY (1-5) - Document Only
- Track as known issue
- Fix only if trivial (complexity=1, risk=1)

---

## Next Steps

1. **Fill in the matrix** based on Davy's feedback and your observations
2. **Identify high-priority, low-risk fixes** (Priority 12+, Fix Risk 1-2)
3. **Document high-priority, high-risk bugs** for careful implementation
4. **Ignore low-priority bugs** unless trivial to fix

---

**Questions to answer for each boundary:**
- Has Davy experienced issues in this area?
- How often does this cause problems?
- What's the worst-case scenario?
- How hard would it be to fix?
- What could break if we fix it?
