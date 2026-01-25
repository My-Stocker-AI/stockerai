# Stocker AI - UI Implementation Specification

**Version:** 1.0
**Date:** 2025-12-27
**Source:** Flon8 Boundary & Branch Discovery Process

---

## 1. Screen Layout

### 1.1 Zone Architecture (6-Zone Grid)

```
┌─────────────────────────────────────┐
│           ZONE 1: PROGRESS          │  44px fixed
│      Route + Machine Progress       │
├─────────────────────────────────────┤
│                                     │
│       ZONE 2: CURRENT ITEM          │  ~180px (flexible)
│     Large, prominent display        │
│                                     │
├─────────────────────────────────────┤
│         ZONE 3: VOICE STATUS        │  60px fixed
│   Indicator + Controls + Last Input │
├─────────────────────────────────────┤
│         ZONE 4: AI RESPONSE         │  80px fixed
│        Last spoken response         │
├─────────────────────────────────────┤
│                                     │
│       ZONE 5: COMPLETED LIST        │  1fr (fills remaining)
│        Scrollable history           │
│                                     │
├─────────────────────────────────────┤
│         ZONE 6: NAVIGATION          │  70px + safe-area
│          [Voice] [Upload]           │
└─────────────────────────────────────┘
```

### 1.2 CSS Grid Definition

```css
body.app-mode {
  display: grid;
  grid-template-rows: 44px auto 60px 80px 1fr 70px;
  height: 100vh;
  height: 100dvh; /* Dynamic viewport for mobile */
}
```

---

## 2. Zone Specifications

### Zone 1: Progress Header

**Purpose:** Route context and machine progress at a glance

```html
<header class="progress-header">
  <span class="route-name">South Route</span>
  <span class="machine-badge">Machine 2 of 7</span>
</header>
```

| Property | Value |
|----------|-------|
| Height | 44px fixed |
| Background | `#16213e` (dark-surface) |
| Border | 1px solid `#2a3f5f` bottom |
| Padding | 0 20px |
| Display | flex, space-between, center |

**States:**
- `NO_SESSION`: Shows "Stocker AI" centered, no badge
- `ACTIVE`: Shows route name + machine count
- `COMPLETED`: Shows "Route Complete" + checkmark

### Zone 2: Current Item Card

**Purpose:** LARGEST element - readable from 3+ feet distance

```html
<div class="current-item-card">
  <div class="item-quantity">3x</div>
  <div class="item-product">Doritos Nacho Cheese</div>
  <div class="item-slot">Slot 58</div>
  <div class="item-machine">Machine 1 - Building A</div>
</div>
```

| Property | Value |
|----------|-------|
| Min Height | 160px |
| Background | `rgba(78, 204, 163, 0.12)` |
| Border Left | 4px solid `#4ecca3` |
| Border Radius | 16px |
| Margin | 12px 16px |
| Padding | 20px 24px |

**Typography:**
| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Quantity | 32px | 700 | `#4ecca3` |
| Product | 24px | 600 | `#ffffff` |
| Slot | 20px | 500 | `#4ecca3` |
| Machine | 14px | 400 | `#888888` |

**Empty State (NO_SESSION):**
```html
<div class="current-item-card empty-state">
  <div class="empty-icon">📦</div>
  <div class="empty-title">Ready to stock</div>
  <div class="empty-subtitle">Say "start my route" to begin</div>
</div>
```

**Completed State (ROUTE_COMPLETE):**
```html
<div class="current-item-card completed-state">
  <div class="complete-icon">✓</div>
  <div class="complete-title">Route Complete!</div>
  <div class="complete-subtitle">All 47 items picked</div>
</div>
```

### Zone 3: Voice Status

**Purpose:** Compact voice indicator with touch controls

```html
<div class="voice-status">
  <div class="status-indicator" data-state="listening"></div>
  <span class="status-text">Listening...</span>
  <span class="last-input">"got it"</span>
  <div class="voice-controls">
    <button class="control-btn pause" aria-label="Pause">⏸</button>
    <button class="control-btn stop" aria-label="Stop">⏹</button>
  </div>
</div>
```

| Property | Value |
|----------|-------|
| Height | 60px fixed |
| Background | `#1a1a2e` |
| Padding | 0 20px |
| Display | flex, align-center |
| Gap | 12px |

**Status Indicator States:**
| State | Color | Animation |
|-------|-------|-----------|
| `listening` | `#4ecca3` (green) | Gentle pulse (2s ease-in-out) |
| `speaking` | `#f39c12` (amber) | Wave effect |
| `thinking` | `#9b59b6` (purple) | Slow rotate |
| `paused` | `#666666` (gray) | Static, hollow |
| `error` | `#e74c3c` (red) | None |

**Control Buttons:**
- Only visible when `ACTIVE` or `PAUSED`
- 44x44px touch targets
- Pause toggles to Resume icon when paused
- Stop shows confirmation modal

### Zone 4: AI Response

**Purpose:** Display last AI spoken response as text

```html
<div class="ai-response">
  <span class="response-text">Got it. Slot 57, 2 Cheetos Crunchy for Machine 1.</span>
</div>
```

| Property | Value |
|----------|-------|
| Height | 80px fixed |
| Background | `rgba(42, 63, 95, 0.5)` |
| Padding | 12px 20px |
| Font Size | 16px |
| Color | `#cccccc` |
| Overflow | hidden, text-ellipsis (2 lines max) |

**Empty State:** "Waiting for command..."

### Zone 5: Completed Items List

**Purpose:** Scrollable history of picked items

```html
<div class="completed-list">
  <div class="completed-item">
    <span class="item-check">✓</span>
    <span class="item-qty">5x</span>
    <span class="item-name">Sun Chips Garden Salsa</span>
    <span class="item-slot">59</span>
  </div>
  <!-- More items... -->
</div>
```

| Property | Value |
|----------|-------|
| Flex | 1 (fills remaining space) |
| Overflow Y | auto (scrollable) |
| Padding | 12px 20px |
| Background | `#1a1a2e` |

**Item Row:**
| Property | Value |
|----------|-------|
| Padding | 10px 0 |
| Border Bottom | 1px solid `#2a3f5f` |
| Font Size | 14px |
| Color | `#888888` |

**Empty State:**
```html
<div class="empty-list">
  <span>No items picked yet</span>
</div>
```

**Auto-scroll:** New items appear at bottom, list auto-scrolls to show latest

### Zone 6: Navigation

**Purpose:** Fixed bottom nav (unchanged from current)

```html
<nav class="bottom-nav">
  <a href="/" class="nav-item active">
    <svg><!-- mic icon --></svg>
    <span>Voice</span>
  </a>
  <a href="/upload" class="nav-item">
    <svg><!-- upload icon --></svg>
    <span>Upload</span>
  </a>
</nav>
```

| Property | Value |
|----------|-------|
| Height | 70px + safe-area-inset-bottom |
| Background | `rgba(22, 33, 62, 0.98)` |
| Border Top | 1px solid `#2a3f5f` |
| Display | flex, space-around |

---

## 3. Session State Machine

### 3.1 States

```
┌─────────────────────────────────────────────────────────────┐
│                    SESSION STATE MACHINE                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌──────────┐                                               │
│   │NO_SESSION│ ────"start my route"────▶ ┌─────────┐        │
│   └──────────┘                           │STARTING │        │
│        ▲                                 └────┬────┘        │
│        │                                      │             │
│   [start fresh]                          [route loaded]     │
│        │                                      ▼             │
│   ┌────┴─────┐                          ┌─────────┐         │
│   │COMPLETED │ ◀────"done"/"complete"───│ ACTIVE  │◀───┐    │
│   └──────────┘                          └────┬────┘    │    │
│                                              │         │    │
│                          ┌───────────────────┼─────────┘    │
│                          │                   │              │
│                     "resume"            "pause"/"stop"      │
│                          │                   │              │
│                          ▼                   ▼              │
│                    ┌──────────┐        ┌──────────┐         │
│                    │INTERRUPTED│        │ PAUSED   │         │
│                    └──────────┘        └──────────┘         │
│                          │                   │              │
│                          └───────────────────┘              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 State Definitions

| State | Description | Voice | UI |
|-------|-------------|-------|-----|
| `NO_SESSION` | Initial state, no route loaded | Listening | Empty state card |
| `STARTING` | Loading route from backend | Processing | Loading spinner |
| `ACTIVE` | Route in progress, picking items | Listening | Current item + list |
| `PAUSED` | User-initiated pause | Stopped | "Paused" indicator |
| `INTERRUPTED` | System pause (call, app switch) | Stopped | "Tap to resume" |
| `VALIDATING` | Machine/route completion check | Speaking | Confirmation modal |
| `COMPLETED` | Route finished | Stopped | Completion summary |

### 3.3 Transitions

| From | Trigger | To | Action |
|------|---------|-----|--------|
| `NO_SESSION` | "start my route" | `STARTING` | Call set_route_sequence |
| `NO_SESSION` | Resume dialog | `ACTIVE` | Restore from IndexedDB |
| `STARTING` | Route loaded | `ACTIVE` | Display first item |
| `ACTIVE` | "got it"/"next" | `ACTIVE` | get_next_item, update UI |
| `ACTIVE` | "pause"/"stop" | `PAUSED` | Stop listening, save state |
| `ACTIVE` | "skip machine" | `ACTIVE` | skip_current_machine |
| `ACTIVE` | App backgrounded | `INTERRUPTED` | Auto-save state |
| `PAUSED` | "resume" | `ACTIVE` | Resume listening |
| `PAUSED` | Tap resume button | `ACTIVE` | Resume listening |
| `INTERRUPTED` | App foregrounded | `ACTIVE` | Resume from where left off |
| `ACTIVE` | Last item done | `VALIDATING` | Prompt completion confirmation |
| `VALIDATING` | Confirmed | `COMPLETED` | Show summary |
| `COMPLETED` | "start new route" | `NO_SESSION` | Clear state |

---

## 4. Voice Commands

### 4.1 Item Progression

| Trigger Phrases | Action | Response Pattern |
|-----------------|--------|------------------|
| "got it", "next", "done", "okay" | get_next_item | "Got it. [next item details]" |
| "go back", "undo", "previous" | go_back (current machine only) | "Going back. [previous item]" |
| "skip this one", "pass" | Skip item within machine | "Skipped. [next item]" |

### 4.2 Machine Navigation

| Trigger Phrases | Action | Response Pattern |
|-----------------|--------|------------------|
| "skip machine", "next machine" | skip_current_machine | "Skipping to [machine name]" |
| "what machine" | get_current_status | "You're on Machine [N], [name]" |

### 4.3 Session Control

| Trigger Phrases | Action | Response Pattern |
|-----------------|--------|------------------|
| "start my route" | set_route_sequence | "Starting [route]. First item..." |
| "pause", "hold on" | Pause session | "Paused. Say resume when ready." |
| "stop", "end route" | Stop (with confirmation) | "Stop route? Say confirm or cancel." |
| "resume", "continue" | Resume session | "Resuming. [current item]" |
| "start over", "redo route" | Nuclear reset (with confirmation) | "Restart entire route? Confirm or cancel." |

### 4.4 Information Queries

| Trigger Phrases | Action | Response Pattern |
|-----------------|--------|------------------|
| "where am I", "status" | get_current_status | "[machine], [item], [progress]" |
| "how many left" | get_current_status | "[N] items remaining on this machine" |
| "repeat", "say again" | Repeat last response | [last AI response] |

### 4.5 Error Recovery

| Trigger Phrases | Action | Response Pattern |
|-----------------|--------|------------------|
| "help" | List available commands | "You can say: got it, go back, skip machine..." |
| "cancel" | Cancel pending confirmation | "Cancelled." |
| [unrecognized] | Prompt for clarification | "I didn't catch that. Say 'got it' for next item, or 'help' for options." |

---

## 5. Design Tokens

### 5.1 Colors

```css
:root {
  /* Primary */
  --color-primary: #4ecca3;
  --color-primary-dim: rgba(78, 204, 163, 0.12);
  --color-primary-glow: rgba(78, 204, 163, 0.4);

  /* Backgrounds */
  --color-bg-base: #1a1a2e;
  --color-bg-surface: #16213e;
  --color-bg-elevated: #2a3f5f;

  /* Text */
  --color-text-primary: #ffffff;
  --color-text-secondary: #cccccc;
  --color-text-muted: #888888;
  --color-text-disabled: #666666;

  /* Status */
  --color-success: #4ecca3;
  --color-warning: #f39c12;
  --color-error: #e74c3c;
  --color-info: #9b59b6;

  /* Borders */
  --color-border: #2a3f5f;
  --color-border-focus: #4ecca3;
}
```

### 5.2 Typography

```css
:root {
  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  /* Scale */
  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  --text-lg: 18px;
  --text-xl: 20px;
  --text-2xl: 24px;
  --text-3xl: 32px;

  /* Weights */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;

  /* Line Heights */
  --leading-tight: 1.2;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;
}
```

### 5.3 Spacing

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
}
```

### 5.4 Borders & Shadows

```css
:root {
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-full: 9999px;

  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.4);
  --shadow-glow: 0 0 20px var(--color-primary-glow);
}
```

---

## 6. Animations & Transitions

### 6.1 Timing

```css
:root {
  --duration-instant: 100ms;
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 400ms;

  --ease-out: cubic-bezier(0.0, 0.0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0.0, 0.2, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### 6.2 Status Indicator Animations

```css
/* Listening - Gentle pulse */
@keyframes pulse-listening {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.15); opacity: 0.8; }
}

.status-indicator[data-state="listening"] {
  animation: pulse-listening 2s ease-in-out infinite;
}

/* Speaking - Wave effect */
@keyframes wave-speaking {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(1.4); }
}

.status-indicator[data-state="speaking"] {
  animation: wave-speaking 0.5s ease-in-out infinite;
}

/* Thinking - Slow rotate */
@keyframes rotate-thinking {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.status-indicator[data-state="thinking"] {
  animation: rotate-thinking 2s linear infinite;
}
```

### 6.3 Item Transitions

```css
/* New item slides in from right */
.current-item-card.entering {
  animation: slide-in-right 300ms var(--ease-out);
}

@keyframes slide-in-right {
  from { transform: translateX(20px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

/* Completed item fades down to list */
.completed-item.entering {
  animation: fade-in-down 250ms var(--ease-out);
}

@keyframes fade-in-down {
  from { transform: translateY(-10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
```

### 6.4 Button Feedback

```css
.control-btn:active {
  transform: scale(0.95);
  transition: transform var(--duration-instant);
}

.control-btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

### 6.5 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 7. Modals & Overlays

### 7.1 Confirmation Modal

Used for: Stop route, Redo route, Complete validation

```html
<div class="modal-overlay">
  <div class="modal-card">
    <div class="modal-icon">⚠️</div>
    <div class="modal-title">Stop Route?</div>
    <div class="modal-message">Progress will be saved. You can resume later.</div>
    <div class="modal-actions">
      <button class="btn-secondary">Cancel</button>
      <button class="btn-primary">Confirm</button>
    </div>
  </div>
</div>
```

| Property | Value |
|----------|-------|
| Overlay Background | `rgba(0, 0, 0, 0.7)` |
| Modal Background | `var(--color-bg-surface)` |
| Border Radius | 20px |
| Max Width | 320px |
| Padding | 24px |

### 7.2 Resume Session Dialog

Shown on page load if saved session exists (within 24 hours)

```html
<div class="modal-overlay">
  <div class="modal-card">
    <div class="modal-icon">📦</div>
    <div class="modal-title">Resume Session?</div>
    <div class="modal-message">
      <strong>South Route</strong><br>
      Machine 2 of 7 - 12 items picked
    </div>
    <div class="modal-actions">
      <button class="btn-secondary">Start Fresh</button>
      <button class="btn-primary">Resume</button>
    </div>
  </div>
</div>
```

---

## 8. Data Persistence

### 8.1 IndexedDB Schema

```javascript
const DB_NAME = 'stocker-sessions';
const DB_VERSION = 1;
const STORE_NAME = 'active-session';

// Session object structure
{
  sessionId: "uuid",
  oderId: "user-uuid",
  routeName: "South",
  routeDate: "2025-12-27",
  savedAt: 1735315200000, // timestamp

  // Progress
  totalMachines: 7,
  currentMachineIndex: 2,
  totalItems: 47,

  // Items (built incrementally)
  completedItems: [
    {
      product: "Sun Chips Garden Salsa",
      quantity: 5,
      slot: "059",
      slot_spoken: "slot 59",
      machine: "Building A",
      machineIndex: 1,
      completedAt: 1735315100000
    }
  ],

  // Current item
  currentItem: {
    product: "Doritos Nacho Cheese",
    quantity: 3,
    slot: "058",
    slot_spoken: "slot 58",
    machine: "Building A",
    machineIndex: 1
  },

  // Session state
  state: "ACTIVE", // NO_SESSION | STARTING | ACTIVE | PAUSED | INTERRUPTED | COMPLETED

  // Conversation (for context)
  conversationHistory: [/* last 15 messages */]
}
```

### 8.2 Save Triggers

Save to IndexedDB after:
- `set_route_sequence` response (new route started)
- `get_next_item` response (item completed)
- `skip_current_machine` response (machine skipped)
- State change to `PAUSED` or `INTERRUPTED`
- `beforeunload` event (browser closing)
- Every 30 seconds while `ACTIVE` (backup)

### 8.3 Session Expiry

- Sessions expire after 24 hours from last save
- On load, check `savedAt` timestamp
- If expired, clear session and start fresh
- If valid, show resume dialog

---

## 9. Accessibility

### 9.1 ARIA Labels

```html
<button class="control-btn pause" aria-label="Pause route">
<button class="control-btn stop" aria-label="Stop route">
<div class="status-indicator" role="status" aria-live="polite" aria-label="Listening for voice command">
<div class="current-item-card" role="region" aria-label="Current item to pick">
<div class="completed-list" role="list" aria-label="Completed items">
```

### 9.2 Focus Management

- Tab order: Controls → Navigation
- Focus visible ring: 2px solid primary, 2px offset
- Skip to main content link (hidden until focused)

### 9.3 Color Contrast

| Element | Foreground | Background | Ratio |
|---------|------------|------------|-------|
| Primary text | #ffffff | #1a1a2e | 12.6:1 |
| Secondary text | #cccccc | #1a1a2e | 8.4:1 |
| Muted text | #888888 | #1a1a2e | 4.5:1 |
| Primary accent | #4ecca3 | #1a1a2e | 7.8:1 |

### 9.4 Touch Targets

- Minimum touch target: 44x44px
- Control buttons: 44x44px
- Nav items: 60x60px effective area

---

## 10. Brand Assets (To Generate)

### 10.1 Logo Concept: "Voice Wave Box"

- Shipping box shape with sound wave emerging from top
- Represents: Voice-guided + warehousing
- Style: Modern, minimal, works at small sizes

### 10.2 Required Assets

| Asset | Size | Format | Use |
|-------|------|--------|-----|
| App Icon | 512x512 | PNG | App stores, splash |
| PWA Icon | 192x192 | PNG | Home screen (Android) |
| Apple Touch Icon | 180x180 | PNG | Home screen (iOS) |
| Favicon | 32x32 | PNG | Browser tab |
| Favicon Small | 16x16 | PNG | Browser tab (legacy) |

### 10.3 Tagline

**"Pick smarter. Stock faster."**

### 10.4 Brand Personality

- **Tone:** Efficient, supportive, no-nonsense
- **Voice:** Direct commands, minimal words
- **Character:** Reliable warehouse coworker

---

## 11. Component Reference

### 11.1 Buttons

```css
.btn-primary {
  background: linear-gradient(135deg, #4ecca3 0%, #38b090 100%);
  color: #1a1a2e;
  padding: 16px 24px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 16px;
}

.btn-secondary {
  background: transparent;
  border: 2px solid #2a3f5f;
  color: #cccccc;
  padding: 14px 22px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 16px;
}

.control-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(42, 63, 95, 0.8);
  border: none;
  color: #cccccc;
  font-size: 18px;
}
```

### 11.2 Cards

```css
.current-item-card {
  background: var(--color-primary-dim);
  border-left: 4px solid var(--color-primary);
  border-radius: var(--radius-lg);
  padding: var(--space-5) var(--space-6);
  margin: var(--space-3) var(--space-4);
}

.modal-card {
  background: var(--color-bg-surface);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  max-width: 320px;
  text-align: center;
}
```

### 11.3 Status Indicator

```css
.status-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-indicator[data-state="listening"] {
  background: var(--color-success);
  box-shadow: 0 0 8px var(--color-success);
}

.status-indicator[data-state="speaking"] {
  background: var(--color-warning);
}

.status-indicator[data-state="thinking"] {
  background: var(--color-info);
}

.status-indicator[data-state="paused"] {
  background: transparent;
  border: 2px solid var(--color-text-disabled);
}

.status-indicator[data-state="error"] {
  background: var(--color-error);
}
```

---

## 12. Implementation Checklist

### Phase A: Structure (Layout & HTML)
- [ ] Implement 6-zone CSS grid layout
- [ ] Add progress header HTML
- [ ] Add current item card HTML
- [ ] Add voice status zone HTML
- [ ] Add AI response zone HTML
- [ ] Add completed list HTML
- [ ] Keep navigation as-is

### Phase B: Styling (CSS)
- [ ] Add CSS custom properties (design tokens)
- [ ] Style progress header
- [ ] Style current item card (+ empty/completed states)
- [ ] Style voice status (indicator + controls)
- [ ] Style AI response zone
- [ ] Style completed list (items + empty state)
- [ ] Add animations (indicator states, transitions)
- [ ] Add reduced motion support

### Phase C: State Management (JS)
- [ ] Implement IndexedDB helper (save/load/clear)
- [ ] Define session state machine
- [ ] Hook tool results to update route state
- [ ] Connect state to UI update functions
- [ ] Add auto-save triggers
- [ ] Add 24-hour expiry check

### Phase D: UI Logic (JS)
- [ ] Implement updateProgressHeader()
- [ ] Implement renderCurrentItem()
- [ ] Implement updateVoiceStatus()
- [ ] Implement renderCompletedList()
- [ ] Implement showAIResponse()
- [ ] Add auto-scroll behavior
- [ ] Add modal show/hide

### Phase E: Session Flow (JS)
- [ ] Check for saved session on load
- [ ] Show resume dialog if session exists
- [ ] Implement resume flow
- [ ] Implement start fresh flow
- [ ] Auto-start listening after auth
- [ ] Handle pause/resume controls
- [ ] Handle stop confirmation

### Phase F: Polish
- [ ] Test all voice commands
- [ ] Test state transitions
- [ ] Test persistence (close/reopen browser)
- [ ] Test offline indicator
- [ ] Verify accessibility
- [ ] Bump service worker cache version

---

**End of Implementation Specification**
