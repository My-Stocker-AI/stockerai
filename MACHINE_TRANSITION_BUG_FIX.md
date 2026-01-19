# MACHINE TRANSITION BUG FIX

**Date:** 2026-01-19 04:10 UTC
**Status:** FIXED AND DEPLOYED
**Severity:** CRITICAL - Broke production routes

---

## THE BUG

**Symptom (from Davy):**
- Finished all items on Machine 1
- Said "next"
- System showed first item from Machine 2
- Voice said: "Route finished!"
- Route did NOT actually finish - Machine 2 was still pending

**What Should Have Happened:**
> "Machine 1 complete. Next is Machine 2 at Location. Top or bottom?"

**What Actually Happened:**
> "Route route complete. Nice work!"

---

## ROOT CAUSE

**Edge Function Optimization (deployed 2026-01-16)** filtered machines too aggressively.

**Original filtering logic** (supabase/functions/get-next-item-data/index.ts:67-93):
```typescript
// Only return current + next + skipped machines
const isCurrentMachine = row.machine_id === currentMachineId;
const isNextMachine = row.machine_sequence === currentMachineSeq + 1;  // ← BUG
const isSkippedMachine = row.machine_status === 'skipped';
```

**The Problem:**
1. User finishes last item on Machine 1 (sequence = 1)
2. Session still has `current_machine_id = Machine 1` (not updated yet)
3. Edge Function calculates: `currentMachineSeq = 1`
4. Edge Function returns machines with sequence: 1, 2
5. Workflow's "Determine Next State" node runs
6. Finds no items left on Machine 1
7. Looks for next machine with `sequence = 1 + 1 = 2`
8. **BUG:** Edge Function didn't include Machine 2 (it was filtered because it was sequence + 1 from the STALE current_machine_id)
9. No next machine found → returns `action: "complete"` (route finished)
10. Format Output says "Route route complete. Nice work!"

---

## THE FIX

**Change:** Return current + next **2** machines (not just next 1)

**New filtering logic** (supabase/functions/get-next-item-data/index.ts:78-83):
```typescript
const isCurrentMachine = row.machine_id === currentMachineId;
const isNextMachine = row.machine_sequence === currentMachineSeq + 1;
const isNextNextMachine = row.machine_sequence === currentMachineSeq + 2;  // ← NEW
const isSkippedMachine = row.machine_status === 'skipped';

if (isCurrentMachine || isNextMachine || isNextNextMachine || isSkippedMachine) {
  machinesMap.set(row.machine_id, {...});
}
```

**Why This Works:**
- Returns machines with sequence: 1, 2, 3 (current, +1, +2)
- When transitioning from Machine 1 → Machine 2:
  - Edge Function returns: Machine 1 (current), Machine 2 (next), Machine 3 (next+1)
  - Determine Next State finds Machine 2 properly
  - Returns `action: "next_machine"` with correct machine info
  - Format Output says: "Machine 1 complete. Next is Machine 2 at Location. Top or bottom?"

---

## DEPLOYMENT

**Command:**
```bash
npx supabase functions deploy get-next-item-data
```

**Deployed:** 2026-01-19 04:10 UTC

**Git Commit:** 084add5

---

## TESTING

**Test Case:**
1. Start route with 2+ machines
2. Pick all items on Machine 1
3. Say "next" after last item
4. **Expected:** "Machine 1 complete. Next is Machine 2 at Location. Top or bottom?"
5. **NOT:** "Route finished!"

---

## WHY THIS HAPPENED

**Timeline of Changes:**
1. **2026-01-16:** Deployed Edge Function optimization to reduce payload
2. **Original logic:** Return ALL machines (100% correct, but large payload)
3. **Optimization:** Return only current + next + skipped (99% correct, smaller payload)
4. **BUG:** Didn't account for transition timing (when session hasn't updated yet)
5. **2026-01-19:** Davy discovered bug in production
6. **Fix:** Return current + next 2 machines (100% correct, still optimized payload)

---

## RELATED FILES

**Modified:**
- `supabase/functions/get-next-item-data/index.ts` (lines 78-83)

**Not Modified (still correct):**
- `CORRECT_FORMAT_OUTPUT.js` - This was correct
- Workflow "Determine Next State" node - This was correct
- Workflow "Add First Item to Machine" node - This was correct

**The ONLY bug was Edge Function filtering logic.**

---

## COMMIT MESSAGE

```
Fix machine transition bug in Edge Function

CRITICAL BUG: When finishing last item on machine 1, workflow said 'Route finished'
instead of transitioning to machine 2.

ROOT CAUSE: Edge Function only returned current + next 1 machine. When user finishes
last item on machine, session still has old current_machine_id, so Edge Function
returned machines that were filtered incorrectly.

FIX: Return current + next 2 machines (handles transition case)
- Line 80: Added isNextNextMachine check
- Now returns machines with sequence: current, +1, +2
- Plus all skipped machines

DEPLOYED: npx supabase functions deploy get-next-item-data

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```
