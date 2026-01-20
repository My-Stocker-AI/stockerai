# Skip Machine Save Progress - System Impact Analysis

**Date:** 2026-01-19
**Problem:** Skip machine returns to beginning instead of resuming where user left off
**Proposed:** Ask user "save progress or start fresh?" when skipping

---

## XF Analysis Results

**Status:** Code enforcement found overlapping concepts - useful insights below

### Key Issues Found by MECE Validation

**Major Overlaps Detected:**
1. **Inventory snapshots** - Multiple ways of describing "save machine state at skip time"
2. **Credit decisions** - Different names for same concept of "did user earn credit?"
3. **Resume calculation** - Overlapping logic for "what item to show next"

**Missing Boundaries:**
1. Storage schema design (separated from logic)
2. Performance requirements (query speed, storage size)
3. Concurrency handling (multiple users, simultaneous skips)
4. Data retention policy (how long to keep records)
5. Backward compatibility (old skip records with new system)
6. Error handling and logging
7. Testing/validation strategy
8. Integration points (payroll, inventory systems)
9. Rollback and recovery

---

## What This Means (Plain English)

### The Simple Fix You Asked For

**What you want:**
- User skips machine after 3 items
- AI asks: "Save your progress or start fresh?"
- User chooses
- When they come back, system honors their choice

**What's actually involved:**
The system discovered this touches way more than just "save a choice":

1. **Data Storage:**
   - Need to save inventory snapshot (what items existed when skipped)
   - Need to save user's choice (save/fresh)
   - Need to save completed item count
   - Need to detect if items changed between skip and resume

2. **Credit/Payment:**
   - If items were removed, does user still get credit?
   - Who decides (system automatic vs manager review)?
   - Need audit trail for payment disputes

3. **Resume Logic:**
   - Calculate next item based on direction (forward/reverse)
   - Validate state still makes sense (items not deleted)
   - Handle mismatches (what if expected item gone?)

### The Existing Bug (Sequence Numbers)

**Currently broken:**
```javascript
var startingIndex = items.length;  // ❌ WRONG - uses array length
```

**Should be:**
```javascript
// Find actual max sequence number in items array
var maxSeq = 0;
for (var i = 0; i < items.length; i++) {
    if (items[i].sequence > maxSeq) maxSeq = items[i].sequence;
}
var startingIndex = maxSeq;  // ✅ CORRECT
```

---

## Recommended Approach

### Phase 1: Fix Existing Bug (NOW - Simple)

**File:** `get_next_item` n8n workflow
**Change:** Use sequence numbers instead of array length
**Impact:** Low risk, fixes current issue
**Time:** 15 minutes

### Phase 2: Add Save Progress Option (LATER - Complex)

**Why wait:**
- Touches 8+ components
- Needs database schema changes
- Requires credit/payment logic decisions
- Needs testing strategy

**Better approach:**
1. Fix sequence bug now (users can work)
2. Document full requirements for save progress
3. Discuss credit/payment policy with stakeholders
4. Design proper schema for machine_history
5. Implement with full testing

---

## Immediate Action

**Want me to:**
1. **Fix the sequence bug now** (simple, safe, fixes current problem)
2. **Create detailed spec** for save-progress feature (for future implementation)

Which makes more sense?
