# Location Hierarchy Integration Analysis
**Created:** 2026-01-12
**Status:** Design Phase
**Complexity:** HIGH - Multi-boundary change (Database, Workflows, Frontend, State Management)

---

## Executive Summary

**Current State:** Route → Machine → Item (3 levels)
**Target State:** Route → Location → Machine → Item (4 levels)
**Key Finding:** `location_name` already exists in `machines` table as TEXT field

**Rationale:** PDFs contain 4-level hierarchy, but system only implements 3. Adding Location level enables:
- Skip entire location (e.g., skip all machines at "Building A")
- Switch between locations within a route
- Better route optimization (group by location, reduce travel)
- Accurate progress tracking by location

---

## BBRD Boundary Analysis

### Affected Boundaries (10 Total)

| # | Boundary | Impact Level | Changes Required |
|---|----------|--------------|------------------|
| 1 | **DATABASE** | CRITICAL | New table, FK changes, indexes, RLS |
| 2 | **WORKFLOW** | CRITICAL | New tools, logic updates, state tracking |
| 3 | **DATA** | HIGH | PDF parsing, data transformation |
| 4 | **CODE** | HIGH | Session state, navigation logic |
| 5 | **FRONTEND** | MEDIUM | UI components, location display |
| 6 | **API** | MEDIUM | New endpoints, response schemas |
| 7 | **NODE** | MEDIUM | Individual workflow node updates |
| 8 | **CONNECTION** | LOW | Supabase API unchanged |
| 9 | **EXECUTION** | LOW | No timeout/concurrency changes |
| 10 | **ENVIRONMENT** | LOW | No env var changes |

---

## 1. DATABASE SCHEMA CHANGES

### 1.1 Current Schema (Relevant Tables)

```sql
-- sessions table
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  current_route_id UUID,
  current_machine_id UUID,
  current_item_index INTEGER,
  pick_direction TEXT,
  status TEXT -- 'stocking', 'completed'
);

-- machines table
CREATE TABLE machines (
  id UUID PRIMARY KEY,
  route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
  machine_name TEXT,
  machine_number INTEGER,
  location_name TEXT, -- Currently TEXT, needs to become FK
  sequence INTEGER, -- Global sequence within route
  status TEXT, -- 'pending', 'in_progress', 'completed', 'skipped'
  total_items INTEGER
);

-- items table (no changes needed)
CREATE TABLE items (
  id UUID PRIMARY KEY,
  machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
  product_name TEXT,
  quantity INTEGER,
  slot TEXT,
  sequence INTEGER,
  status TEXT
);
```

### 1.2 New `locations` Table

```sql
CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  location_name TEXT NOT NULL,
  sequence INTEGER NOT NULL, -- Order of locations within route
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  total_machines INTEGER DEFAULT 0,
  completed_machines INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_locations_route_id ON public.locations(route_id);
CREATE INDEX idx_locations_sequence ON public.locations(route_id, sequence);
CREATE UNIQUE INDEX idx_locations_route_name ON public.locations(route_id, location_name);
```

### 1.3 Modify `machines` Table

```sql
-- Add location_id column
ALTER TABLE public.machines
ADD COLUMN location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE;

-- Backfill data: Create location records from existing location_name values
-- Then update machines.location_id to reference new locations
-- (Migration script needed - see section 1.5)

-- Add sequence within location
ALTER TABLE public.machines
ADD COLUMN location_sequence INTEGER;

-- Update indexes
CREATE INDEX idx_machines_location_id ON public.machines(location_id);
CREATE INDEX idx_machines_location_sequence ON public.machines(location_id, location_sequence);

-- Eventually drop location_name (after migration verified)
-- ALTER TABLE public.machines DROP COLUMN location_name;
```

### 1.4 Modify `sessions` Table

```sql
-- Add current_location_id to track location-level progress
ALTER TABLE public.sessions
ADD COLUMN current_location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX idx_sessions_current_location ON public.sessions(current_location_id);
```

### 1.5 Data Migration Strategy

**CRITICAL:** Cannot simply drop `location_name` - must preserve existing data.

**Migration Steps:**

```sql
-- Step 1: Create locations table (from 1.2)

-- Step 2: Populate locations from existing machines data
INSERT INTO public.locations (route_id, location_name, sequence)
SELECT DISTINCT
  m.route_id,
  m.location_name,
  ROW_NUMBER() OVER (PARTITION BY m.route_id ORDER BY MIN(m.sequence)) as sequence
FROM public.machines m
WHERE m.location_name IS NOT NULL
GROUP BY m.route_id, m.location_name;

-- Step 3: Add location_id column to machines (from 1.3)

-- Step 4: Backfill machines.location_id
UPDATE public.machines m
SET location_id = l.id
FROM public.locations l
WHERE m.route_id = l.route_id
  AND m.location_name = l.location_name;

-- Step 5: Add location_sequence (machines within each location)
WITH ranked_machines AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY location_id ORDER BY sequence) as loc_seq
  FROM public.machines
)
UPDATE public.machines m
SET location_sequence = rm.loc_seq
FROM ranked_machines rm
WHERE m.id = rm.id;

-- Step 6: Update total_machines count for each location
UPDATE public.locations l
SET total_machines = (
  SELECT COUNT(*) FROM public.machines m WHERE m.location_id = l.id
);

-- Step 7: Mark location_name as deprecated (keep for rollback safety)
COMMENT ON COLUMN machines.location_name IS 'DEPRECATED: Use location_id instead. Kept for rollback safety.';
```

**Rollback Strategy:**
- Keep `location_name` column for 30 days after deployment
- If rollback needed, can reconstruct from `location_name`
- After 30 days of stable operation, drop `location_name`

### 1.6 RLS Policies

```sql
-- locations table RLS (same pattern as machines)
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view locations for their assigned routes"
ON public.locations FOR SELECT
USING (
  route_id IN (
    SELECT r.id FROM public.routes r
    LEFT JOIN public.route_assignments ra ON ra.route_id = r.id
    WHERE r.user_id = auth.uid() OR ra.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update locations for their routes"
ON public.locations FOR UPDATE
USING (
  route_id IN (
    SELECT r.id FROM public.routes r
    LEFT JOIN public.route_assignments ra ON ra.route_id = r.id
    WHERE r.user_id = auth.uid() OR ra.user_id = auth.uid()
  )
);
```

---

## 2. N8N WORKFLOW CHANGES

### 2.1 New Workflows Needed

#### A. `skip_current_location` Workflow
**Webhook:** `/skip-location`
**Purpose:** Skip all machines at current location, move to next location

```javascript
// Inputs:
{
  "session_id": "uuid",
  "user_id": "uuid"
}

// Logic:
1. Get session → current_location_id
2. Mark location as 'skipped' in locations table
3. Mark all machines in location as 'skipped' in machines table
4. Find next location (sequence + 1, status != 'skipped')
5. If next location exists:
   - Update session: current_location_id, current_machine_id (first in location), current_item_index = 0
   - Return: next_location_name, next_machine_name
6. If no next location:
   - Return: route_complete

// Outputs:
{
  "action": "next_location" | "route_complete",
  "skipped_location": "Building A",
  "next_location": "Building B",
  "next_machine": "Vending Machine 5",
  "spoken": "Skipped Building A. Moving to Building B, Vending Machine 5, start at top or bottom?"
}
```

#### B. `switch_location` Workflow
**Webhook:** `/switch-location`
**Purpose:** Jump to a different location within the route

```javascript
// Inputs:
{
  "session_id": "uuid",
  "user_id": "uuid",
  "target_location": "Building A" // Location name to switch to
}

// Logic:
1. Get session → current_route_id
2. Find target location by name in current route
3. Get first non-skipped machine in that location
4. Update session: current_location_id, current_machine_id, current_item_index = 0
5. Return first item from first machine

// Outputs:
{
  "action": "switched_location",
  "new_location": "Building A",
  "new_machine": "Vending Machine 1",
  "product_name": "Coca-Cola",
  "quantity": 12,
  "slot": "A1",
  "spoken": "Switched to Building A. 12 Coca-Cola"
}
```

#### C. `go_back_to_skipped_location` Workflow
**Webhook:** `/back-to-skipped-location`
**Purpose:** Return to a previously skipped location

```javascript
// Logic:
1. Get all skipped locations for current route (ORDER BY sequence ASC)
2. If multiple skipped, ask user which one
3. Mark location as 'in_progress'
4. Get first machine in location (resume where left off if partial)
5. Update session state

// Outputs:
{
  "action": "resumed_location",
  "location": "Building C",
  "machine": "Vending Machine 8",
  "spoken": "Resuming Building C, Vending Machine 8, start at top or bottom?"
}
```

### 2.2 Modified Workflows

#### get_next_item Workflow
**Changes Needed:**

1. **Query Modification:**
```sql
-- Current: Only joins machines and items
SELECT ... FROM sessions s
LEFT JOIN machines m ON m.route_id = s.current_route_id
LEFT JOIN items i ON i.machine_id = m.id

-- New: Also join locations
SELECT ... FROM sessions s
LEFT JOIN locations l ON l.id = s.current_location_id
LEFT JOIN machines m ON m.location_id = l.id
LEFT JOIN items i ON i.machine_id = m.id
```

2. **"Determine Next State" Node:**
```javascript
// Current logic:
if (nextItem) return next_item;
if (nextMachine) return next_machine;
return route_complete;

// New logic:
if (nextItem) return next_item;
if (nextMachineInLocation) return next_machine;
if (nextLocation) return next_location; // NEW
return route_complete;
```

3. **New Action Type:** `next_location`
```javascript
{
  "action": "next_location",
  "completed_location": "Building A",
  "completed_machines_count": 5,
  "next_location": "Building B",
  "next_machine": "Vending Machine 6",
  "spoken": "Building A complete. Moving to Building B, Vending Machine 6, start at top or bottom?"
}
```

#### skip_current_machine Workflow
**Changes:**
- When marking machine as skipped, also update `location.completed_machines` count
- Check if ALL machines in location are now complete/skipped
- If location complete, auto-advance to next location

#### start_machine Workflow
**Changes:**
- Update both `session.current_machine_id` AND `session.current_location_id`
- Return location name in response for context

###2.3 Updated RPC Function

```sql
CREATE OR REPLACE FUNCTION get_next_item_data(p_user_id UUID)
RETURNS TABLE (
  -- Session fields
  session_id UUID,
  current_route_id UUID,
  current_location_id UUID, -- NEW
  current_machine_id UUID,
  current_item_index INTEGER,
  pick_direction TEXT,

  -- Location fields (NEW)
  location_id UUID,
  location_name TEXT,
  location_sequence INTEGER,
  location_status TEXT,
  location_total_machines INTEGER,

  -- Machine fields
  machine_id UUID,
  machine_name TEXT,
  machine_number INTEGER,
  machine_sequence INTEGER, -- Global sequence
  location_sequence INTEGER, -- Sequence within location
  machine_status TEXT,

  -- Item fields (unchanged)
  item_id UUID,
  product_name TEXT,
  quantity INTEGER,
  slot TEXT,
  item_sequence INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.current_route_id,
    s.current_location_id,
    s.current_machine_id,
    s.current_item_index,
    s.pick_direction,

    l.id,
    l.location_name,
    l.sequence,
    l.status,
    l.total_machines,

    m.id,
    m.machine_name,
    m.machine_number,
    m.sequence,
    m.location_sequence,
    m.status,

    i.id,
    i.product_name,
    i.quantity,
    i.slot,
    i.sequence
  FROM sessions s
  LEFT JOIN locations l ON l.route_id = s.current_route_id
  LEFT JOIN machines m ON m.location_id = l.id
  LEFT JOIN items i ON i.machine_id = m.id
  WHERE s.user_id = p_user_id
    AND s.status = 'stocking'
  ORDER BY s.created_at DESC, l.sequence ASC, m.location_sequence ASC, i.sequence ASC
  LIMIT 100;
END;
$$;
```

---

## 3. FRONTEND CHANGES

### 3.1 State Management (`useStockerSession.ts`)

**Add Location State:**

```typescript
export interface LocationState {
  id: string;
  name: string;
  sequence: number;
  totalMachines: number;
  completedMachines: number;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
}

export interface RouteState {
  // ... existing fields
  currentLocationId: string | null;  // NEW
  currentLocationName: string | null; // NEW
  locations: LocationState[];  // NEW - full location list
}
```

**Update `updateFromTool`:**

```typescript
if (toolName === 'get_next_item') {
  const action = result.action || '';

  // NEW: Handle next_location action
  if (action === 'next_location') {
    next.currentLocationId = result.next_location_id;
    next.currentLocationName = result.next_location;
    next.currentMachineId = result.next_machine_id;
    next.currentMachineName = result.next_machine;
    next.currentItem = null;
  }

  // ... existing next_item, next_machine logic
}

// NEW: Handle skip_location
if (toolName === 'skip_current_location') {
  next.locations = prev.locations.map(loc =>
    loc.id === prev.currentLocationId
      ? { ...loc, status: 'skipped' }
      : loc
  );
  next.currentLocationId = result.next_location_id;
  next.currentLocationName = result.next_location;
}
```

### 3.2 AI Tool Definitions (`useStockerAI.ts`)

**Add New Tools:**

```typescript
{
  type: "function",
  function: {
    name: "skip_current_location",
    description: "Skip all machines at the current location and move to the next location",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        user_id: { type: "string" }
      },
      required: ["session_id", "user_id"]
    }
  }
},
{
  type: "function",
  function: {
    name: "switch_location",
    description: "Switch to a different location within the current route",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        user_id: { type: "string" },
        target_location: { type: "string", description: "Name of location to switch to" }
      },
      required: ["session_id", "user_id", "target_location"]
    }
  }
}
```

**Update Webhook Map:**

```typescript
const WEBHOOK_MAP: Record<string, string> = {
  // ... existing
  'skip_current_location': '/skip-location',
  'switch_location': '/switch-location',
  'go_back_to_skipped_location': '/back-to-skipped-location'
};
```

**Update System Prompt:**

```typescript
const systemPrompt = `
...existing prompt...

Location-Level Commands:
- "skip location" / "skip this location" / "skip building" → skip_current_location
- "switch to [location name]" / "go to [location]" → switch_location
- "go back to skipped location" → go_back_to_skipped_location

IMPORTANT: Top/bottom choice is ONLY for machines, not locations.
When transitioning to a new location, immediately announce the first machine and ask for direction:
Example: "Building A complete. Moving to Building B, Vending Machine 6, start at top or bottom?"
`;
```

### 3.3 UI Components

#### Location Progress Panel (NEW Component)

```typescript
interface LocationPanelProps {
  locations: LocationState[];
  currentLocationId: string | null;
  onLocationSelect: (locationId: string) => void;
}

function LocationPanel({ locations, currentLocationId, onLocationSelect }: LocationPanelProps) {
  return (
    <div className="bg-[#0d1117] rounded-xl p-4 border border-gray-800">
      <h3 className="text-white font-semibold mb-3">Locations</h3>
      {locations.map(loc => (
        <div
          key={loc.id}
          className={cn(
            "p-3 rounded-lg mb-2 cursor-pointer",
            loc.id === currentLocationId ? "bg-emerald-500/20 border border-emerald-500" : "bg-gray-800",
            loc.status === 'completed' && "opacity-50",
            loc.status === 'skipped' && "opacity-30 border-amber-500"
          )}
          onClick={() => onLocationSelect(loc.id)}
        >
          <div className="flex items-center justify-between">
            <span className="text-white">{loc.name}</span>
            <span className="text-gray-400 text-sm">
              {loc.completedMachines}/{loc.totalMachines} machines
            </span>
          </div>
          {loc.status === 'skipped' && (
            <span className="text-xs text-amber-400">Skipped</span>
          )}
        </div>
      ))}
    </div>
  );
}
```

#### Update Main StockerApp Display

```typescript
// Add location name to context display
<div className="text-sm text-gray-500 mt-3">
  {routeState.currentLocationName && (
    <div className="text-emerald-400">📍 {routeState.currentLocationName}</div>
  )}
  <div>{routeState.currentMachineName}</div>
</div>
```

---

## 4. PDF PARSING CHANGES

### 4.1 Current PDF Upload Workflow

**Current extraction logic:**
- Parses machines with `location_name` as TEXT
- No location grouping or sequencing

### 4.2 Updated PDF Parsing

**Changes needed in n8n "Stocker - PDF Upload" workflow:**

```javascript
// Current: Extract machines
const machines = parsedText.map((line, idx) => ({
  machine_name: line.machine,
  location_name: line.location,
  sequence: idx + 1
}));

// New: Extract locations AND machines
const locationMap = new Map();
const machines = [];

parsedText.forEach((line, idx) => {
  // Track unique locations
  if (!locationMap.has(line.location)) {
    locationMap.set(line.location, {
      location_name: line.location,
      sequence: locationMap.size + 1,
      machines: []
    });
  }

  // Add machine to location
  const locationSeq = locationMap.get(line.location).machines.length + 1;
  machines.push({
    machine_name: line.machine,
    location_id: null, // Will be set after location insert
    location_name: line.location, // Temporary for matching
    sequence: idx + 1, // Global sequence
    location_sequence: locationSeq
  });

  locationMap.get(line.location).machines.push(machines[machines.length - 1]);
});

const locations = Array.from(locationMap.values());

// Insert locations first, then machines
return { locations, machines };
```

**Workflow nodes needed:**
1. Parse PDF Text (existing)
2. **NEW:** Extract Locations
3. **NEW:** Insert Locations → locations table
4. Prepare Machines (modified to include location_id from step 3)
5. Insert Machines → machines table (with location_id populated)

---

## 5. TESTING STRATEGY

### 5.1 Database Testing

```sql
-- Test 1: Location creation and cascade
-- Create location → Create machines → Verify FK relationship
-- Delete location → Verify machines cascade deleted

-- Test 2: RPC function returns location data
SELECT * FROM get_next_item_data('<user_id>');
-- Verify location_name, location_sequence present

-- Test 3: Migration integrity
-- Verify location_name matches locations.location_name for all machines
SELECT m.id, m.location_name as old, l.location_name as new
FROM machines m
JOIN locations l ON m.location_id = l.id
WHERE m.location_name != l.location_name;
-- Should return 0 rows
```

### 5.2 Workflow Testing

Test scenarios:
1. **Next Location Flow:**
   - Complete all items in location → "next" command → should advance to next location

2. **Skip Location:**
   - Say "skip location" → all machines marked skipped → advance to next location

3. **Switch Location:**
   - Say "switch to Building B" → jump to that location → start from first machine

4. **Back to Skipped:**
   - Skip location → complete other locations → "go back to skipped" → resume skipped location

5. **2-Item Mode with Locations:**
   - Enable 2-item mode → advance through location → verify both items from same location

### 5.3 Frontend Testing

- Location panel displays all locations with correct status
- Current location highlighted
- Tapping location triggers switch_location
- Voice commands recognized: "skip location", "switch to [name]"

---

## 6. ROLLOUT PLAN

### Phase 1: Database Migration (Week 1)
- ✅ Create `locations` table
- ✅ Add migration script
- ✅ Backfill data from existing `location_name`
- ✅ Add `current_location_id` to sessions
- ✅ Deploy RLS policies
- ⚠️ Keep `location_name` for rollback (30 day safety)

### Phase 2: Backend/Workflows (Week 2)
- ✅ Update `get_next_item_data` RPC
- ✅ Create `skip_current_location` workflow
- ✅ Create `switch_location` workflow
- ✅ Update `get_next_item` workflow logic
- ✅ Update PDF upload workflow
- ⚠️ Deploy to test environment first

### Phase 3: Frontend (Week 3)
- ✅ Update state management
- ✅ Add location tools to AI
- ✅ Create LocationPanel component
- ✅ Update system prompt
- ✅ Test voice commands

### Phase 4: Testing & Validation (Week 4)
- ✅ Full integration testing
- ✅ User acceptance testing
- ✅ Performance validation
- ✅ Rollback drill

### Phase 5: Production Deployment (Week 5)
- ✅ Deploy database changes
- ✅ Deploy workflows
- ✅ Deploy frontend
- ✅ Monitor for 7 days
- ✅ Drop `location_name` column after 30 days if stable

---

## 7. RISK ASSESSMENT

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Data loss during migration | CRITICAL | LOW | Keep `location_name`, test on staging first |
| Workflow breaks existing picking | HIGH | MEDIUM | A/B test flag, rollback plan |
| PDF parsing fails for new uploads | HIGH | MEDIUM | Validate with sample PDFs, fallback logic |
| Location names vary (typos) | MEDIUM | HIGH | Fuzzy matching, admin UI to merge locations |
| Performance degradation | MEDIUM | LOW | Index all FK columns, test with large routes |
| User confusion with new commands | MEDIUM | MEDIUM | Gradual rollout, training materials |

---

## 8. COST ESTIMATE

**Development Time:**
- Database migration: 8 hours
- Workflow updates: 16 hours
- Frontend changes: 12 hours
- Testing: 16 hours
- **Total: ~52 hours (1.5 weeks for 1 developer)**

**Ongoing Costs:**
- Additional database storage: ~5-10% increase (new locations table)
- Query complexity: No significant impact (already JOIN machines)
- Workflow executions: ~10% increase (new skip/switch location workflows)

---

## 9. APPENDIX: EXAMPLE DATA FLOW

### Before (Current):
```
Route: "Route A"
├── Machine 1: "Vending Machine 1" (location_name="Building A")
├── Machine 2: "Vending Machine 2" (location_name="Building A")
├── Machine 3: "Vending Machine 3" (location_name="Building B")
└── Machine 4: "Vending Machine 4" (location_name="Building B")
```

### After (With Locations):
```
Route: "Route A"
├── Location 1: "Building A" (sequence=1)
│   ├── Machine 1: "Vending Machine 1" (location_sequence=1)
│   └── Machine 2: "Vending Machine 2" (location_sequence=2)
└── Location 2: "Building B" (sequence=2)
    ├── Machine 3: "Vending Machine 3" (location_sequence=1)
    └── Machine 4: "Vending Machine 4" (location_sequence=2)
```

**User Commands:**
- "skip location" → Skips all of Building A, goes to Building B
- "switch to Building A" → Jumps back to Building A, starts at Machine 1
- "next" (after Machine 2) → "Building A complete. Moving to Building B, Vending Machine 3, start at top or bottom?"

---

## 10. OPEN QUESTIONS

1. **Location naming consistency:** How to handle typos/variations? (e.g., "Bldg A" vs "Building A")
   - **Recommendation:** Admin UI to view/merge duplicate locations

2. **Partial location skips:** Should "skip machine" affect location status?
   - **Recommendation:** Location only marked complete if ALL machines done (not if some skipped)

3. **Cross-location machine dependencies:** What if user wants specific machine order across locations?
   - **Recommendation:** Keep global `machine.sequence` for manual reordering via `set_route_sequence`

4. **Historical routes:** Should we backfill locations for old routes?
   - **Recommendation:** Yes, migration script handles this automatically

5. **UI real estate:** Where to display location panel without cluttering?
   - **Recommendation:** Collapsible panel, similar to current MachineListPanel

---

**END OF ANALYSIS**
