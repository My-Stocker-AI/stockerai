# Edge Function Optimization Analysis

**Date:** 2026-01-16
**Confidence:** 70/100 → **40/100 after verification**
**Risk:** Medium → **HIGH - Breaking Change Detected**

---

## The Optimization

**Current version** (index.ts):
- Returns ALL machines in the route (10-20 machines)
- Payload size: 20-50KB

**Optimized version** (index_optimized.ts):
- Returns only current machine + next machine (2 machines)
- Payload size: 3-5KB
- **80-90% reduction**

---

## ❌ BREAKING CHANGE DETECTED

### What the Workflow Needs

Looking at the "Determine Next State" node (lines 109-155):

```javascript
// Check for next non-skipped machine
for (var i = 0; i < machines.length; i++) {
  if (machines[i].sequence === currentMachineSeq + 1 && machines[i].status !== 'skipped') {
    nextMachine = machines[i];
    break;
  }
}

// ✅ CRITICAL: Check for ANY skipped machines
var firstSkippedMachine = null;
for (var i = 0; i < machines.length; i++) {
  if (machines[i].status === 'skipped') {
    firstSkippedMachine = machines[i];
    break;
  }
}
```

**The workflow loops through ALL machines to find:**
1. ✅ Current machine
2. ✅ Next machine (sequence + 1)
3. ❌ **ANY skipped machines** (from anywhere in the route)

### What the Optimization Breaks

**Optimized version only returns:**
- Current machine
- Next machine (sequence + 1)

**Missing:**
- Skipped machines from earlier in the route

**Result:** If user skips machine 1, completes machines 2-5, the workflow won't know machine 1 is skipped and won't return to it.

---

## Fix Required

The optimization needs to be modified to return:
1. Current machine
2. Next machine (sequence + 1)
3. **ALL skipped machines** (regardless of sequence)

**Modified filter logic:**
```typescript
// Include machine if:
// - It's the current machine, OR
// - It's the next machine (sequence + 1), OR
// - It has status = 'skipped'
if (row.machine_id === currentMachineId || 
    row.machine_sequence === currentMachineSeq + 1 ||
    row.machine_status === 'skipped') {
  machinesMap.set(row.machine_id, {
    id: row.machine_id,
    machine_name: row.machine_name,
    location_name: row.location_name,
    machine_number: row.machine_number,
    sequence: row.machine_sequence,
    status: row.machine_status
  });
}
```

**This would return:**
- Current machine (1)
- Next machine (1)
- Skipped machines (0-10 depending on route)
- **Total: 2-12 machines instead of 10-20**

**Payload reduction: 40-80% (not 90%, but still significant)**

---

## Updated Confidence

**Before verification:** 70/100
**After verification:** 40/100

**Why lower:**
- Breaking change detected
- Requires code modification before deployment
- Need to test skipped machine logic thoroughly

**To get to 90/100:**
1. Modify optimized version to include skipped machines
2. Test with route that has skipped machines
3. Verify "return to skipped" flow works

---

## Recommendation

**DO NOT deploy the optimization as-is.**

**Options:**
1. **Modify optimization** (add skipped machines filter) - 30 minutes
2. **Skip this optimization** - stick with current version
3. **Deploy modified version to staging first** - test thoroughly

**Your call.**
