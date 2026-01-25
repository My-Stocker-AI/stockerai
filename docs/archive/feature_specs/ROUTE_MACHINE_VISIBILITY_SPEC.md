# Route & Machine Visibility UX Specification

**Created:** 2026-01-01
**Methodology:** BBRD (Boundary and Branch Recursive Discovery)
**Status:** IN PROGRESS - BRANCHES OPEN

---

## Problem Statement

Users currently have no situational awareness of their work scope:
- Multiple routes show as voice-only options (no visual selection)
- No visibility into which machines are on a route
- No visibility into machine status (pending/active/done/skipped)
- Skipped machines disappear into the void
- Users don't know what's ahead or what's left

**User Need:** "I need to SEE my routes, my machines, and my progress - not just hear about them"

---

## BBRD Boundary Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW BOUNDARIES                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                 │
│  │   Supabase   │ ──▶ │Route Select  │ ──▶ │   Session    │                 │
│  │  (routes)    │     │     UI       │     │    State     │                 │
│  └──────────────┘     └──────────────┘     └──────────────┘                 │
│         │                                         │                          │
│         ▼                                         ▼                          │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                 │
│  │   Supabase   │ ──▶ │ Machine List │ ──▶ │  Machine     │                 │
│  │ (route_items)│     │     UI       │     │  Navigation  │                 │
│  └──────────────┘     └──────────────┘     └──────────────┘                 │
│                              │                    │                          │
│                              ▼                    ▼                          │
│                       ┌──────────────┐     ┌──────────────┐                 │
│                       │   Skip/Jump  │ ──▶ │  Persistence │                 │
│                       │   Actions    │     │   (state)    │                 │
│                       └──────────────┘     └──────────────┘                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Branch Discovery

### BRANCH 1: Route Selection UI

**Current State:** Voice-only announcement of route names
**Desired State:** Visual cards showing all available routes

#### Sub-branches:

| Branch | Scenario | Current Behavior | Desired Behavior | Status |
|--------|----------|------------------|------------------|--------|
| 1.1 | 0 routes for today | Says "No routes for today" | Show empty state with upload CTA | OPEN |
| 1.2 | 1 route for today | Auto-starts route | Auto-start OR show single card with "Start" button? | OPEN |
| 1.3 | 2+ routes for today | Says route names, asks "which one?" | Show route cards, tap OR voice to select | OPEN |
| 1.4 | Route in progress | Shows resume dialog | Keep resume dialog, add route context | CLOSED |
| 1.5 | Selection method | Voice only | Voice + Tap on card | OPEN |

**DECISION NEEDED (1.2):** When there's only 1 route, should we:
- A) Auto-start immediately (current behavior - faster)
- B) Show the route card and let user tap "Start" (more control, sees machines first)
- C) Show route card for 3 seconds, then auto-start if no tap (hybrid)

**DECISION NEEDED (1.3):** Route card information:
- Route name (required)
- Number of machines (required)
- Total items (required)
- Machine names preview? (optional)
- Last stocked date? (optional)

---

### BRANCH 2: Machine List Visibility

**Current State:** Only shows "Machine X of Y" in header
**Desired State:** Full machine list with status indicators

#### Sub-branches:

| Branch | Scenario | Question | Options | Status |
|--------|----------|----------|---------|--------|
| 2.1 | List placement | Where does the machine list go? | A) Collapsible panel below current item, B) Always-visible sidebar, C) Swipe-up drawer | OPEN |
| 2.2 | Mobile layout | How to fit on small screens? | A) Collapsible accordion, B) Horizontal scroll pills, C) Bottom sheet | OPEN |
| 2.3 | Machine states | What states to show? | pending, in-progress, completed, skipped | CLOSED |
| 2.4 | Item counts | Show items per machine? | Yes: "Break Room (4/7)" | CLOSED |
| 2.5 | Default state | Collapsed or expanded by default? | OPEN |

**DECISION NEEDED (2.1/2.2):** Machine list placement for mobile:

**Option A - Collapsible Panel:**
```
┌─────────────────────────────────────┐
│ [Current Item Card]                 │
├─────────────────────────────────────┤
│ ▼ MACHINES (tap to expand)          │
│   ✅ Break Room Snacks    (7/7)     │
│   ▶️ Drink Cooler         (3/7)     │
│   ○  Fresh & Healthy      (0/7)     │
└─────────────────────────────────────┘
```
- Pro: Doesn't take space when collapsed
- Con: Extra tap to see status

**Option B - Always Visible Compact:**
```
┌─────────────────────────────────────┐
│ [Current Item Card]                 │
├─────────────────────────────────────┤
│ ✅ ▶️ ○ ○ ⏸️  (5 machines)           │
│ └─ Drink Cooler (3/7)               │
└─────────────────────────────────────┘
```
- Pro: Always visible at a glance
- Con: Limited info, may confuse users

**Option C - Bottom Drawer:**
```
┌─────────────────────────────────────┐
│ [Current Item Card]                 │
│                                     │
│ [AI Response]                       │
├─────────────────────────────────────┤
│ ═══ Swipe up for machines ═══      │
└─────────────────────────────────────┘
```
- Pro: Full screen real estate for stocking
- Con: Hidden by default, requires swipe

---

### BRANCH 3: Machine States & Indicators

#### Visual States:

| State | Icon | Color | Meaning |
|-------|------|-------|---------|
| Pending | ○ | Gray | Not started yet |
| In Progress | ▶️ | Emerald/Teal | Currently stocking |
| Completed | ✅ | Green | All items picked |
| Skipped | ⏸️ | Orange/Yellow | Skipped, needs revisit |

#### Sub-branches:

| Branch | Scenario | Question | Status |
|--------|----------|----------|--------|
| 3.1 | Partial completion | User picks 4/7 items then skips - show as "Skipped (4/7)"? | OPEN |
| 3.2 | Skipped indicator | How prominent should skipped machines be? | OPEN |
| 3.3 | Completion animation | Celebrate when machine completes? | OPEN |

---

### BRANCH 4: Skip Machine Feature

**Current State:** Not implemented in production StockerApp
**Desired State:** Skip current machine, track for later return

#### Sub-branches:

| Branch | Scenario | Behavior | Status |
|--------|----------|----------|--------|
| 4.1 | Skip trigger | Voice: "skip machine" + Tap: button on machine list | CLOSED |
| 4.2 | Skip confirmation | Confirm before skipping? Or instant? | OPEN |
| 4.3 | Skipped machine placement | Where in list? Keep in order with orange highlight | CLOSED |
| 4.4 | Return to skipped | How to prompt user? | OPEN |
| 4.5 | All machines skipped | What happens? Can't complete route | OPEN |
| 4.6 | Skip mid-machine | User has picked 3/7 items, skips - preserve progress? | OPEN |

**DECISION NEEDED (4.2):** Skip confirmation:
- A) No confirmation - instant skip (faster, matches demo)
- B) Confirm: "Skip Break Room Snacks? You can come back later." (safer)
- C) Voice says "Skipping..." but no modal (middle ground)

**DECISION NEEDED (4.4):** Return to skipped machine prompt:
- A) After completing all non-skipped: "You have 1 skipped machine. Go back now?"
- B) Always show skipped in list, user taps when ready
- C) AI proactively reminds: "Don't forget you skipped Break Room Snacks"

**DECISION NEEDED (4.6):** Skip mid-machine with partial progress:
- A) Preserve progress - when user returns, resume at item 4/7
- B) Reset machine - start from item 1/7 when returning
- C) Ask user: "Resume where you left off, or start over?"

---

### BRANCH 5: Machine Navigation (Tap to Jump)

**Current State:** Linear progression only
**Desired State:** Tap machine in list to navigate

#### Sub-branches:

| Branch | Scenario | Allow? | Status |
|--------|----------|--------|--------|
| 5.1 | Jump to pending machine | Yes - skip ahead | OPEN |
| 5.2 | Jump to completed machine | View only? Or re-stock? | OPEN |
| 5.3 | Jump to skipped machine | Yes - that's the point | CLOSED |
| 5.4 | Jump mid-item | What if user is mid-item and taps different machine? | OPEN |

**DECISION NEEDED (5.2):** Completed machine tap behavior:
- A) View only - show items picked, can't modify
- B) Allow re-entry - "Restock this machine?"
- C) No tap - completed machines not tappable

---

### BRANCH 6: Route Completion with Skipped Machines

| Branch | Scenario | Behavior | Status |
|--------|----------|----------|--------|
| 6.1 | Complete with skips | Can user "finish" route with skipped machines? | OPEN |
| 6.2 | Force completion | User says "done" but machines skipped - warn or block? | OPEN |
| 6.3 | Partial save | Save route as "partial" if machines skipped? | OPEN |

**DECISION NEEDED (6.1):** Route completion with skipped machines:
- A) Block - must complete all machines (frustrating)
- B) Warn - "You have 2 skipped machines. Complete anyway?" (balanced)
- C) Allow - skipped stays skipped, route marked partial (flexible)

---

### BRANCH 7: Direction Selection (Top/Bottom)

**Current State (Demo):** Direction asked per machine
**Production State:** Not implemented

| Branch | Scenario | Question | Status |
|--------|----------|----------|--------|
| 7.1 | Ask every machine | Annoying or necessary? | OPEN |
| 7.2 | Remember preference | Save "usually stocks from top" per user? | OPEN |
| 7.3 | Skip direction step | Just start from sequence 1 always? | OPEN |

**DECISION NEEDED (7.1-7.3):** Direction handling:
- A) Ask every machine (matches demo)
- B) Ask once per route, apply to all machines
- C) Don't ask - always follow PDF sequence order
- D) User preference saved in settings

---

## UI Mockups

### Route Selection Screen (Multiple Routes)

```
┌─────────────────────────────────────────┐
│           [STOCKER LOGO]                │
│                                         │
│         Choose Your Route               │
│         ─────────────────               │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  📍 Downtown Office               │  │
│  │     3 machines • 21 items         │  │
│  │     ┌─────────────────────────┐   │  │
│  │     │ Break Room • Cooler •   │   │  │
│  │     │ Fresh & Healthy         │   │  │
│  │     └─────────────────────────┘   │  │
│  │                    [ START ]      │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  📍 Hospital Campus               │  │
│  │     3 machines • 24 items         │  │
│  │     ┌─────────────────────────┐   │  │
│  │     │ Main Lobby • Energy •   │   │  │
│  │     │ Cafeteria               │   │  │
│  │     └─────────────────────────┘   │  │
│  │                    [ START ]      │  │
│  └───────────────────────────────────┘  │
│                                         │
│    🎤 Or say the route name             │
│                                         │
└─────────────────────────────────────────┘
```

### Stocking Screen with Machine List (Collapsed)

```
┌─────────────────────────────────────────┐
│  Route: Downtown Office      Machine 2/3│
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  │
│  │  PICK ITEM                        │  │
│  │  6x Sprite Bottle 20 oz           │  │
│  │  Slot 042                         │  │
│  │  Drink Cooler - Building A Lobby  │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  🎤 Listening...                   │  │
│  │  [Mute] [Pause] [Stop]            │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  ▼ MACHINES (3)         [expand]  │  │
│  │  ✅ ▶️ ○                           │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  Stocker AI Says:                 │  │
│  │  "6 Sprites, slot 42. Got it?"    │  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### Stocking Screen with Machine List (Expanded)

```
┌─────────────────────────────────────────┐
│  Route: Downtown Office      Machine 2/3│
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  │
│  │  PICK ITEM                        │  │
│  │  6x Sprite Bottle 20 oz           │  │
│  │  Slot 042                         │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  ▲ MACHINES ON ROUTE    [collapse]│  │
│  ├───────────────────────────────────┤  │
│  │  ✅ Break Room Snacks      (7/7)  │  │
│  │  ▶️ Drink Cooler           (3/7)  │◀─│─ current
│  │  ○  Fresh & Healthy        (0/7)  │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  AI: "6 Sprites, slot 42"         │  │
│  └───────────────────────────────────┘  │
│                                         │
│  [──────────── progress bar ──────────] │
└─────────────────────────────────────────┘
```

### Machine List with Skipped Machine

```
┌───────────────────────────────────┐
│  ▲ MACHINES ON ROUTE              │
├───────────────────────────────────┤
│  ✅ Break Room Snacks      (7/7)  │
│  ⏸️ Drink Cooler          (3/7)  │ ← SKIPPED (orange)
│     └─ Tap to return              │
│  ▶️ Fresh & Healthy        (2/7)  │ ← current
└───────────────────────────────────┘
```

---

## Data Model Changes

### Current route_state (in useStockerSession):
```typescript
{
  routeName: string;
  routeDate: string;
  totalMachines: number;
  currentMachineIndex: number;
  currentMachineName: string;
  currentItem: Item | null;
  completedItems: Item[];
  completed: boolean;
}
```

### Proposed route_state:
```typescript
{
  routeName: string;
  routeDate: string;

  // Machine tracking (NEW)
  machines: MachineState[];
  currentMachineId: string | null;

  // Item tracking
  currentItem: Item | null;

  // Status
  completed: boolean;
}

interface MachineState {
  id: string;
  name: string;
  location: string;
  totalItems: number;
  completedItems: Item[];
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  skippedAtItem?: number;  // If skipped mid-machine, track position
}
```

---

## Implementation Phases

| Phase | Scope | Dependencies |
|-------|-------|--------------|
| 1 | Route Selection Cards | None |
| 2 | Machine List UI (collapsible) | Phase 1 |
| 3 | Machine State Tracking | Phase 2 |
| 4 | Skip Machine Feature | Phase 3 |
| 5 | Tap to Navigate | Phase 3 |
| 6 | Direction Selection | Phase 3 |

---

## Confirmed Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | **Route Selection (1 route)** | Show route card, say "Here's your route, let's get started" → auto-start |
| 2 | **Machine List Placement** | Mobile: Collapsible panel. Desktop: Always-visible sidebar |
| 3 | **Machine List Default** | Collapsed |
| 4 | **Skip Confirmation** | Always confirm via voice: "Skip [machine]? Say yes to confirm" |
| 5 | **Return to Skipped** | Before next machine: "Go back to [skipped] or move it to the end?" + allow voice request anytime |
| 6 | **Skip Mid-Machine** | Track progress, ask when returning: "Resume at item 4, or start over?" |
| 7 | **Completed Machine** | No re-entry. View-only state. |
| 8 | **Route Completion with Skips** | Warn: "You have X skipped machines. Complete anyway?" |
| 9 | **Direction Selection** | Ask every machine: "Top or bottom?" |

---

## VOICE-FIRST Interaction Model

**Primary interaction is ALWAYS voice. Tap is fallback only.**

| Action | Voice Command (Primary) | Tap Fallback |
|--------|-------------------------|--------------|
| Select route | "Start Downtown route" | Tap card |
| Next item | "Next" / "Done" / "Got it" | Tap item card |
| Skip machine | "Skip machine" | Tap skip icon |
| Check machines | "What machines do I have?" | Expand panel |
| Go to skipped | "Go back to [machine name]" | Tap machine in list |
| Check progress | "How many left?" | View panel |
| Direction | "Top" / "Bottom" | Tap button |

**The UI shows visual state for situational awareness, but voice drives all actions.**

---

## BRANCH STATUS SUMMARY

| Category | Open | Closed |
|----------|------|--------|
| Route Selection | 0 | 5 |
| Machine List | 0 | 6 |
| Machine States | 0 | 3 |
| Skip Machine | 0 | 6 |
| Navigation | 0 | 4 |
| Completion | 0 | 3 |
| Direction | 0 | 3 |
| **TOTAL** | **0** | **30** |

---

**STATUS: ALL BRANCHES CLOSED - READY FOR IMPLEMENTATION**
