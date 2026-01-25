# Location-Level Navigation - Cross-Functional Analysis
**Date:** 2026-01-10
**Purpose:** BBRD-compliant analysis for adding Location to navigation hierarchy
**Current Hierarchy:** Route → Machine → Item
**Target Hierarchy:** Route → **Location** → Machine → Item

---

## EXECUTIVE SUMMARY

### ✅ CONFIRMED: Location Data Already Captured
- **Database:** `machines.location_name` exists (nullable string)
- **PDF Parser:** Extracts `location_name` during route upload
- **Frontend Types:** `MachineState.location` field exists but unused for navigation

### 🎯 Goal
Enable users to:
- Switch between locations within a route (voice + tap)
- Skip entire locations (all machines at that location)
- Navigate: "Go to Warehouse B" or "Skip this location"
- Maintain current machine selections when switching locations

### 📊 Scope
This is a **MEDIUM-COMPLEXITY** change affecting **7 of 10 BBRD boundaries**.

---

## PART 1: CURRENT STATE VERIFICATION

### 1.1 Database Schema (LIVE QUERY NEEDED)

**CONFIRMED Fields:**
```sql
-- machines table
location_name TEXT NULL  -- ✅ Already exists
machine_name TEXT NOT NULL
sequence INT NOT NULL
status TEXT NULL
route_id UUID NOT NULL
```

**REQUIRED VERIFICATION (Missing psql access):**
- [ ] Verify location_name is actually populated in production data
- [ ] Check if location_name has consistent values (not NULL across routes)
- [ ] Confirm location grouping makes sense (multiple machines per location)

**Action:** User should run:
```sql
SELECT
  route_id,
  location_name,
  COUNT(*) as machine_count,
  array_agg(machine_name ORDER BY sequence) as machines
FROM machines
WHERE route_id = '<recent-route-id>'
GROUP BY route_id, location_name
ORDER BY MIN(sequence);
```

### 1.2 PDF Parser

**File:** `PARSE-PDF-TEXT-FIXED.js`
**Line 53:** `location_name: locationName`

✅ **CONFIRMED:** Parser extracts location_name from PDF and stores it.

### 1.3 Current Workflows (n8n)

**Workflows queried:**
- `set_route_sequence` (ID: `46lMRdxTgD1E3WFz`) - 18 nodes
- `get_next_item` (ID: `eBv7SfWF7hsuNGpH`) - 13 nodes

**Key Finding:** Workflows query machines by `route_id` and use `sequence` for ordering.
**Gap:** No workflows currently GROUP by location or provide location-level navigation.

### 1.4 Frontend State

**File:** `src/hooks/useStockerSession.ts`
**Lines 14-23:** `MachineState` interface

```typescript
export interface MachineState {
  id: string;
  name: string;
  location: string;  // ✅ Already exists
  sequence: number;
  totalItems: number;
  completedItems: number;
  status: MachineStatus;
  skippedAtItem?: number;
}
```

**Frontend receives location data but doesn't use it for navigation logic.**

---

## PART 2: BBRD BOUNDARY IMPACT ANALYSIS

Using the 10 BBRD boundaries from CLAUDE.md Section 5.1:

| # | Boundary | Impact Level | Why | Changes Required |
|---|----------|--------------|-----|------------------|
| 1 | **WORKFLOW** | 🔴 HIGH | Need new tools: `switch_location`, `skip_location`, `get_locations_for_route` | 3 new workflows + modifications to existing |
| 2 | **NODE** | 🟡 MEDIUM | Modify "Determine Next State" logic to check location boundaries | Code node updates in 2 workflows |
| 3 | **DATA** | 🟢 LOW | Location already in schema, just need to expose in workflow outputs | Add `location_name` to Format Output nodes |
| 4 | **CODE** | 🟡 MEDIUM | New location grouping logic, location-aware sequencing | JavaScript code nodes |
| 5 | **CONNECTION** | 🟢 LOW | No external service changes | None |
| 6 | **EXECUTION** | 🟢 LOW | No new timing/concurrency concerns | None |
| 7 | **ENVIRONMENT** | 🟢 LOW | No env var changes | None |
| 8 | **DATABASE** | 🟡 MEDIUM | Need to verify location_name population, may need RLS updates | Query verification + possible data cleanup |
| 9 | **API** | 🟡 MEDIUM | New webhook endpoints for location tools | 3 new n8n webhook paths |
| 10 | **FRONTEND** | 🔴 HIGH | New UI components, state management, voice commands | New LocationListPanel, state grouping, AI tool definitions |

**Summary:**
- **HIGH Impact:** 2 boundaries (WORKFLOW, FRONTEND)
- **MEDIUM Impact:** 4 boundaries (NODE, CODE, DATABASE, API)
- **LOW Impact:** 4 boundaries (DATA, CONNECTION, EXECUTION, ENVIRONMENT)

---

## PART 3: REQUIRED CHANGES (BY BOUNDARY)

### 3.1 DATABASE Boundary

**Changes:**
1. ✅ **Schema:** No changes needed (location_name exists)
2. ⚠️ **Data Validation:** Verify location_name is consistently populated
3. ⚠️ **Sessions Table:** May need `current_location_name` field for state tracking

**SQL to add (if needed):**
```sql
ALTER TABLE sessions
ADD COLUMN current_location_name TEXT NULL;
```

**Risk:** LOW - Additive change, nullable field

---

### 3.2 WORKFLOW Boundary

**New Workflows Needed:**

#### 3.2.1 `get_locations_for_route`
**Purpose:** List all locations in current route with machine counts
**Input:** `session_id`, `user_id`
**Output:**
```json
{
  "locations": [
    {
      "location_name": "Warehouse A",
      "machine_count": 5,
      "completed_machines": 2,
      "pending_machines": 2,
      "skipped_machines": 1,
      "sequence_range": [1, 5]
    },
    {
      "location_name": "Warehouse B",
      "machine_count": 3,
      "completed_machines": 0,
      "pending_machines": 3,
      "skipped_machines": 0,
      "sequence_range": [6, 8]
    }
  ],
  "current_location": "Warehouse A",
  "spoken": "You have 2 locations: Warehouse A with 5 machines, Warehouse B with 3 machines"
}
```

**Implementation:**
```
Webhook → Get Session → Get Route → Get All Machines →
Group by Location → Count Statuses → Format Output
```

**Nodes:** ~8 nodes (similar to `get_routes_for_date`)

---

#### 3.2.2 `switch_location`
**Purpose:** Move to a different location within current route
**Input:**
- `session_id`, `user_id`
- `target_location` (location name)
- `preserve_progress` (boolean)

**Output:**
```json
{
  "action": "location_switched",
  "location_name": "Warehouse B",
  "machine_id": "<first-machine-in-location>",
  "machine_name": "Vending Machine 6",
  "machines_in_location": 3,
  "spoken": "Switched to Warehouse B. First machine: Vending Machine 6. Top or bottom?"
}
```

**Logic:**
1. Get session
2. Find target location's machines (ordered by sequence)
3. If `preserve_progress`:
   - Leave current location machines as-is (status preserved)
4. If NOT `preserve_progress`:
   - Reset target location machines to 'pending'
5. Update session: `current_location_name`, `current_machine_id` = first in location
6. Return first machine in location

**Implementation:**
```
Webhook → Prepare Input → Get Session → Extract Session →
Get Machines (filter by route + location) → IF Preserve?
  ├─ TRUE: Get First Pending → Update Session → Format
  └─ FALSE: Reset Machines → Get First → Update Session → Format
```

**Nodes:** ~12 nodes (similar to `switch_route`)

**Risk:** MEDIUM - Similar to existing `switch_route` logic

---

#### 3.2.3 `skip_location`
**Purpose:** Skip all machines in current location, move to next location
**Input:** `session_id`, `user_id`

**Output:**
```json
{
  "action": "location_skipped",
  "skipped_location": "Warehouse A",
  "machines_skipped": 3,
  "next_location": "Warehouse B",
  "next_machine_id": "<id>",
  "next_machine_name": "Vending Machine 6",
  "spoken": "Skipped Warehouse A (3 machines). Moving to Warehouse B. First machine: Vending Machine 6"
}
```

**Logic:**
1. Get session
2. Get all machines in current location
3. Mark all as 'skipped' (UPDATE machines SET status = 'skipped' WHERE location_name = current)
4. Find next location (MIN(sequence) WHERE location_name != current AND status != 'completed')
5. Update session to first machine in next location
6. Return next machine

**Implementation:**
```
Webhook → Get Session → Get Current Location Machines →
Mark Skipped → Get Next Location → Update Session → Format
```

**Nodes:** ~10 nodes

**Risk:** MEDIUM - Batch status update (multiple machines), need to verify cascade behavior

---

**Existing Workflow Modifications:**

#### 3.2.4 `get_next_item` (ID: `eBv7SfWF7hsuNGpH`)
**Current:** Returns next item in machine, or next machine in route
**Change:** Add location boundary check

**Modification in "Determine Next State" Code Node:**
```javascript
// CURRENT LOGIC (simplified):
if (no more items in machine) {
  action = 'next_machine';
  // Find next machine in route by sequence
}

// NEW LOGIC:
if (no more items in machine) {
  // Check if more machines in CURRENT LOCATION
  const currentLocation = machines.find(m => m.id === sessionData.current_machine_id).location_name;
  const nextInLocation = machines.find(m =>
    m.location_name === currentLocation &&
    m.sequence > currentMachine.sequence &&
    m.status === 'pending'
  );

  if (nextInLocation) {
    action = 'next_machine';
    nextMachineId = nextInLocation.id;
  } else {
    // End of location - prompt user
    action = 'location_complete';
    nextLocation = machines.find(m =>
      m.location_name !== currentLocation &&
      m.status === 'pending'
    )?.location_name;
  }
}
```

**Risk:** 🔴 HIGH - Modifies critical picking logic (see Session 31 corruption incident)

**Safe Implementation:**
1. Backup workflow first
2. ONLY modify "Determine Next State" code node
3. DO NOT touch "Select Item" or sequence arithmetic logic
4. Add location check as additional branch, not replacement

---

#### 3.2.5 `set_route_sequence` (ID: `46lMRdxTgD1E3WFz`)
**Current:** Returns all machines with status
**Change:** Add location grouping to output

**Modification in "Format Output" Code Node:**
```javascript
// CURRENT OUTPUT:
{
  machines: [
    { id, name, location, sequence, status, totalItems, completedItems }
  ]
}

// NEW OUTPUT (add location summary):
{
  machines: [...],
  locations: [
    {
      location_name: "Warehouse A",
      machine_count: 5,
      machines: [...machine objects filtered by location]
    },
    {
      location_name: "Warehouse B",
      machine_count: 3,
      machines: [...]
    }
  ],
  current_location: "Warehouse A"
}
```

**Risk:** 🟡 MEDIUM - Output format change (verify frontend compatibility)

---

### 3.3 FRONTEND Boundary

**Files to Modify:**

#### 3.3.1 `src/hooks/useStockerSession.ts`
**Changes:**
1. Add `LocationState` interface:
```typescript
export interface LocationState {
  name: string;
  machineCount: number;
  completedMachines: number;
  pendingMachines: number;
  skippedMachines: number;
  machines: MachineState[];
}
```

2. Update `RouteState`:
```typescript
export interface RouteState {
  // ... existing fields
  locations: LocationState[];  // NEW
  currentLocationName: string | null;  // NEW
}
```

3. Update `updateFromTool()` to handle:
   - `switch_location` response
   - `skip_location` response
   - `get_locations_for_route` response
   - `set_route_sequence` with locations array

**Risk:** 🟡 MEDIUM - State management complexity increases

---

#### 3.3.2 `src/hooks/useStockerAI.ts`
**Changes:**
1. Add 3 new tool definitions:
```typescript
{
  type: "function",
  function: {
    name: "switch_location",
    description: "Switch to a different location within the current route",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        target_location: { type: "string", description: "Name of location to switch to" },
        preserve_progress: { type: "boolean", description: "True = keep progress, false = reset target location" }
      },
      required: ["session_id", "target_location", "preserve_progress"]
    }
  }
}

{
  type: "function",
  function: {
    name: "skip_location",
    description: "Skip all machines in the current location and move to next location",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string" }
      },
      required: ["session_id"]
    }
  }
}

{
  type: "function",
  function: {
    name: "get_locations_for_route",
    description: "Get list of all locations in current route with machine counts",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string" }
      },
      required: ["session_id"]
    }
  }
}
```

2. Add to `WEBHOOK_MAP`:
```typescript
const WEBHOOK_MAP = {
  // ... existing
  'switch_location': '/switch-location',
  'skip_location': '/skip-location',
  'get_locations_for_route': '/get-locations'
};
```

3. Update system prompt to include location commands:
```
Location Navigation:
- "Switch to Warehouse B" → calls switch_location, asks preserve_progress
- "Skip this location" → calls skip_location
- "What locations do I have?" → calls get_locations_for_route
- "Go to [location name]" → calls switch_location

When location is complete:
- Ask: "Warehouse A is done. Move to Warehouse B? (3 machines)"
- User: "Yes" → calls switch_location
- User: "Skip it" → calls skip_location
```

**Risk:** 🟡 MEDIUM - AI prompt complexity, need to disambiguate "skip machine" vs "skip location"

---

#### 3.3.3 New Component: `src/components/stocker/LocationListPanel.tsx`
**Purpose:** Similar to `MachineListPanel`, but groups machines by location

**UI Mockup:**
```
┌─────────────────────────────────┐
│ Locations (2)         [v]       │
├─────────────────────────────────┤
│ ▶ Warehouse A                   │  ← Collapsed
│   5 machines (2 done, 2 pending)│
│                                 │
│ ▼ Warehouse B (current)         │  ← Expanded
│   ├ ▶ Vending Machine 6  [Skip]│
│   ├ ○ Vending Machine 7        │
│   └ ○ Vending Machine 8        │
└─────────────────────────────────┘
```

**Features:**
- Collapsible location groups
- Current location highlighted
- Tap location to switch (triggers voice: "Switch to [location]")
- Skip button for current location
- Status counts per location

**Implementation:** ~150 lines (similar to MachineListPanel)

**Risk:** 🟢 LOW - New component, doesn't modify existing

---

#### 3.3.4 `src/pages/StockerApp.tsx`
**Changes:**
1. Import `LocationListPanel`
2. Add location panel to UI (either replace or sit above MachineListPanel)
3. Wire up callbacks:
   - `onLocationSelect` → calls `handleTranscript("Switch to [location]")`
   - `onSkipLocation` → calls `handleTranscript("Skip this location")`

**Risk:** 🟢 LOW - UI integration, no logic changes

---

### 3.4 AI Prompt Boundary

**Challenge:** Disambiguation

| User Says | Current Behavior | With Locations |
|-----------|------------------|----------------|
| "Skip" | Skips current machine | Same (skip machine) |
| "Skip this" | Skips current machine | Ambiguous - need context |
| "Skip this location" | N/A | Skip all machines in location |
| "Go to Warehouse B" | N/A | Switch to location |
| "Next location" | N/A | Complete location, move to next |

**System Prompt Update:**
```
Location vs Machine Disambiguation:
- "skip" / "skip this machine" → skip_current_machine
- "skip location" / "skip this location" / "skip warehouse" → skip_location
- "next machine" → get_next_item
- "next location" → complete current location, switch to next

When user completes all machines in a location:
- Automatically announce: "Location complete. Moving to [next location]"
- Call switch_location with next location name
```

**Risk:** 🟡 MEDIUM - AI interpretation accuracy critical for UX

---

## PART 4: IMPLEMENTATION RISK ASSESSMENT

### 4.1 High-Risk Changes

| Change | Risk Level | Why | Mitigation |
|--------|------------|-----|------------|
| Modify `get_next_item` "Determine Next State" | 🔴 CRITICAL | Session 31: Corrupted this exact logic, broke production | 1. Full workflow backup<br>2. Manual code node update only<br>3. Extensive testing<br>4. Staged rollout |
| AI prompt disambiguation | 🔴 HIGH | Misinterpretation breaks UX | 1. Add explicit examples<br>2. Test all edge cases<br>3. Fallback to clarification |
| `skip_location` batch update | 🟡 MEDIUM | Updates multiple machines at once | 1. Test cascade behavior<br>2. Transaction safety<br>3. Verify status rollback |

### 4.2 Medium-Risk Changes

| Change | Risk Level | Why | Mitigation |
|--------|------------|-----|------------|
| New workflows (`switch_location`, etc.) | 🟡 MEDIUM | Similar to existing `switch_route` | 1. Clone existing patterns<br>2. Test with mock data<br>3. Activate after validation |
| Frontend state complexity | 🟡 MEDIUM | Adding location layer to state tree | 1. Type safety<br>2. Unit tests<br>3. Gradual rollout |
| `set_route_sequence` output format | 🟡 MEDIUM | Frontend expects specific structure | 1. Verify backward compatibility<br>2. Test existing UI still works |

### 4.3 Low-Risk Changes

| Change | Risk Level | Why | Mitigation |
|--------|------------|-----|------------|
| Database field addition | 🟢 LOW | Nullable, additive | N/A |
| New UI component | 🟢 LOW | Doesn't modify existing | N/A |
| Webhook endpoints | 🟢 LOW | New, isolated | N/A |

---

## PART 5: ROLLBACK PLAN

### 5.1 If Location Feature Fails

**Immediate Rollback:**
1. Deactivate new workflows:
   - `switch_location`
   - `skip_location`
   - `get_locations_for_route`

2. Restore `get_next_item` workflow from backup (if modified)

3. Frontend revert:
   ```bash
   git revert <commit-hash>
   git push
   ```

**Data Cleanup (if needed):**
```sql
-- Remove location state from sessions (if column added)
UPDATE sessions SET current_location_name = NULL;
```

**Expected Downtime:** < 5 minutes (workflow deactivation is instant)

### 5.2 Backup Checklist

Before implementing:
- [ ] Backup `get_next_item` workflow → `/backups/get_next_item_pre_location_feature.json`
- [ ] Backup `set_route_sequence` workflow → `/backups/set_route_sequence_pre_location_feature.json`
- [ ] Document current Git commit hash for frontend
- [ ] Test rollback procedure on staging (if available)

---

## PART 6: IMPLEMENTATION PHASES (SAFE APPROACH)

### Phase 1: Foundation (No Breaking Changes)
**Goal:** Expose location data without changing behavior

**Changes:**
1. ✅ Add `current_location_name` to sessions table
2. ✅ Modify `set_route_sequence` Format Output to include locations array
3. ✅ Update frontend to receive and store locations (but not use for navigation yet)
4. ✅ Add `LocationListPanel` component (display-only, no actions)

**Test:** Verify existing functionality still works, location data visible

**Rollback:** Easy - just hide component

---

### Phase 2: Read-Only Location Features
**Goal:** Users can see locations, no navigation yet

**Changes:**
1. ✅ Create `get_locations_for_route` workflow (ACTIVE)
2. ✅ Add tool definition to frontend
3. ✅ Test AI can list locations: "What locations do I have?"

**Test:** Voice query works, no breaking changes to picking flow

**Rollback:** Deactivate workflow

---

### Phase 3: Location Switching (Non-Destructive)
**Goal:** Users can switch locations, preserve_progress = true always

**Changes:**
1. ✅ Create `switch_location` workflow (preserve_progress only)
2. ✅ Add tool definition
3. ✅ Wire up LocationListPanel tap → voice trigger
4. ✅ Update AI prompt for "Switch to [location]"

**Test:** Can switch between locations, progress preserved

**Rollback:** Deactivate workflow, revert frontend

---

### Phase 4: Skip Location
**Goal:** Users can skip entire locations

**Changes:**
1. ✅ Create `skip_location` workflow
2. ✅ Add tool definition
3. ✅ Update AI prompt for disambiguation
4. ✅ Test batch status update

**Test:** "Skip this location" works, doesn't confuse with "skip machine"

**Rollback:** Deactivate workflow

---

### Phase 5: Smart Location Transitions (HIGH RISK)
**Goal:** Automatic location boundary detection in `get_next_item`

**Changes:**
1. ⚠️ Modify `get_next_item` "Determine Next State" node
2. ⚠️ Add location completion prompt
3. ⚠️ Extensive testing of picking flow

**Test:**
- Completes last machine in location → prompts for next location
- Doesn't break existing sequence logic
- Reverse picking still works

**Rollback:** Restore backup workflow

---

## PART 7: TESTING CHECKLIST

### Database Verification
- [ ] Query production routes - confirm location_name populated
- [ ] Verify multiple machines per location (not all unique)
- [ ] Check location names are consistent (not typos)

### Workflow Testing
- [ ] `get_locations_for_route` returns correct counts
- [ ] `switch_location` updates session.current_location_name
- [ ] `skip_location` marks all machines in location as skipped
- [ ] `get_next_item` detects location boundary

### Frontend Testing
- [ ] LocationListPanel displays correctly
- [ ] Location state updates in real-time
- [ ] Tap to switch location triggers voice command
- [ ] Machine list still works alongside location list

### Voice Command Testing
- [ ] "What locations do I have?" → lists locations
- [ ] "Switch to Warehouse B" → switches location
- [ ] "Skip this location" → skips all machines
- [ ] "Skip" (ambiguous) → AI asks "Skip machine or location?"
- [ ] "Next" at end of location → AI announces next location

### Edge Cases
- [ ] Route with 1 location (no switching)
- [ ] Route with NULL location_name (fallback to machine-only nav)
- [ ] Switch to already-completed location (what happens?)
- [ ] Skip last location (route complete?)
- [ ] Reverse picking across location boundaries

---

## PART 8: OPEN QUESTIONS FOR USER

### Data Questions
1. **What percentage of routes have meaningful location grouping?**
   - If most routes = 1 location, feature is low value
   - Recommend querying production data first

2. **Are location names consistent across routes?**
   - "Warehouse A" vs "warehouse a" vs "WH-A" → need normalization?

3. **Do locations have implicit ordering or just machine sequence?**
   - Should "Skip location" go to NEXT location or just end current?

### UX Questions
4. **Should location switching ask preserve_progress, or always preserve?**
   - Recommend: Always preserve (simpler UX)

5. **When location is complete, auto-switch to next or ask user?**
   - Recommend: Announce + ask (maintains voice-first control)

6. **Should locations be collapsible in UI or always expanded?**
   - Recommend: Collapsed by default (less visual clutter)

### Technical Questions
7. **Is staging environment available for testing?**
   - HIGH RISK changes should NOT go directly to production

8. **What's the rollback SLA?**
   - If this breaks production, how fast can we revert?

---

## PART 9: RECOMMENDATION

### GO / NO-GO Decision Tree

```
START
  ↓
[Query production data - are locations populated?]
  ├─ NO → STOP (fix PDF parser first)
  └─ YES → Continue
       ↓
[Do most routes have 2+ locations?]
  ├─ NO → LOW VALUE (skip feature)
  └─ YES → Continue
       ↓
[Is staging environment available?]
  ├─ NO → HIGH RISK (recommend build staging first)
  └─ YES → Continue
       ↓
[Can we do phased rollout (5 phases)?]
  ├─ NO → TOO RISKY (all-or-nothing is dangerous)
  └─ YES → GO (implement Phases 1-5)
```

### If GO, Recommended Sequence:
1. **Week 1:** Data verification + Phase 1 (foundation)
2. **Week 2:** Phase 2 (read-only) + user testing
3. **Week 3:** Phase 3 (switching) + user testing
4. **Week 4:** Phase 4 (skip) + user testing
5. **Week 5:** Phase 5 (auto-transitions) + extensive testing
6. **Week 6:** Production rollout + monitoring

### If NO-GO:
- Document as future enhancement
- Focus on higher-value features (2-pick mode optimization, Bluetooth, etc.)

---

## PART 10: QUESTIONS TO ANSWER BEFORE IMPLEMENTATION

**Critical:**
1. Run this SQL and share results:
   ```sql
   SELECT
     COUNT(DISTINCT route_id) as total_routes,
     COUNT(DISTINCT CASE WHEN location_name IS NULL THEN route_id END) as routes_without_location,
     AVG(locations_per_route) as avg_locations_per_route
   FROM (
     SELECT route_id, COUNT(DISTINCT location_name) as locations_per_route
     FROM machines
     GROUP BY route_id
   ) sub;
   ```

2. Show sample data:
   ```sql
   SELECT location_name, machine_name, sequence
   FROM machines
   WHERE route_id = '<recent-route-id>'
   ORDER BY sequence
   LIMIT 20;
   ```

3. **Decision:** Phased implementation (5 weeks) or all-at-once?

4. **Decision:** Always preserve progress or ask user?

5. **Decision:** Build staging environment first?

---

**END OF CROSS-FUNCTIONAL ANALYSIS**

*Next step: User reviews this document, answers questions, makes GO/NO-GO decision.*
