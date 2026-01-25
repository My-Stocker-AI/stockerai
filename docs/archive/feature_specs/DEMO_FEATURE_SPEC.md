# Live Demo Feature Specification

**Created:** 2026-01-01 (Session 24)
**Methodology:** BBRD (Boundary and Branch Recursive Discovery)
**Status:** READY FOR IMPLEMENTATION

---

## Overview

Interactive live demo allowing prospects to experience Stocker AI's voice-guided stocking without creating an account. Captures leads and drives conversions with session-based incentives.

---

## User Journey

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DEMO USER JOURNEY                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. LANDING (/demo)                                                      │
│     ├── Value prop headline                                              │
│     ├── Lead capture form (name + email)                                 │
│     ├── "Want more info?" checkbox                                       │
│     └── [Start Demo] button                                              │
│              │                                                           │
│              ▼                                                           │
│  2. PAIN SCENE (text animation - NO product shown)                       │
│     ├── "Picture this... 6AM. Dark warehouse."                           │
│     ├── Build the pain they know                                         │
│     ├── "What if you could just... talk?"                                │
│     └── [Experience It Yourself] button                                  │
│              │                                                           │
│              ▼                                                           │
│  3. VOICE INSTRUCTIONS (popup)                                           │
│     ├── Earbuds/quiet environment tip                                    │
│     ├── Voice commands to try (SAY THESE OUT LOUD)                       │
│     └── [🎤 I'm Ready to Talk] button                                    │
│              │                                                           │
│              ▼                                                           │
│  4. LIVE DEMO (they experience it themselves)                            │
│     ├── "Hi {name}! Welcome to Stocker..."                               │
│     ├── Route 1: 3 machines × 7 items = 21 items                         │
│     │        │                                                           │
│     │        ▼ (Route 1 complete)                                        │
│     ├── MID-DEMO CTA POPUP ─────────────────────────────┐                │
│     │   "Nice work! Ready for the real thing?"          │                │
│     │   [Start Free Trial - First Month FREE]           │                │
│     │   [Continue Demo]                                 │                │
│     │   ☐ Yes, I'd like more info                       │                │
│     │   ────────────────────────────────────────────────┘                │
│     │        │                                                           │
│     │        ▼ (if continue)                                             │
│     └── Route 2: 3 machines × 7 items = 21 items                         │
│              │                                                           │
│              ▼                                                           │
│  5. EXIT (multiple triggers)                                             │
│     ├── Route 2 complete                                                 │
│     ├── Click "Exit Demo"                                                │
│     ├── Close browser tab (beforeunload intercept)                       │
│     ├── 10 min idle timeout                                              │
│     │        │                                                           │
│     │        ▼                                                           │
│     └── EXIT POPUP + STATS ─────────────────────────────┐                │
│         "You just completed 21 items - hands free!"      │                │
│         "0 screen touches. Just your voice."             │                │
│         [Start Free Trial - First Month FREE]            │                │
│         [Maybe Later]                                    │                │
│         ☐ Yes, I'd like more info about Stocker          │                │
│         ─────────────────────────────────────────────────┘                │
│              │                                                           │
│              ▼                                                           │
│  6. POST-EXIT                                                            │
│     └── Redirect to /pricing with thank-you banner + CTA                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### New Table: `demo_leads`

```sql
CREATE TABLE demo_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    wants_contact BOOLEAN DEFAULT FALSE,  -- "I'd like someone to reach out"
    discount_code TEXT UNIQUE,
    discount_type TEXT DEFAULT 'demo_bonus_2_weeks',  -- +2 weeks on top of standard 2-week trial
    discount_used BOOLEAN DEFAULT FALSE,
    demo_started_at TIMESTAMPTZ,
    demo_completed BOOLEAN DEFAULT FALSE,
    demo_progress JSONB,  -- {route: 1, machine: 2, items_completed: 5}
    items_completed INTEGER DEFAULT 0,
    machines_completed INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_demo_leads_email ON demo_leads(email);
CREATE INDEX idx_demo_leads_discount_code ON demo_leads(discount_code);
```

**Offer logic:**
- Standard trial = 2 weeks free
- Demo completed = +2 weeks bonus = 4 weeks (1 month) total
- `discount_type: 'demo_bonus_2_weeks'` flags this lead for extended trial

### Demo Route Data

**Source:** Real items from Parlevel route PDFs
**Structure:** Fake route names, locations, machine names with real product names

#### DEMO ROUTE 1: "Downtown Office"

| Machine | Location | Slot | Qty | Product |
|---------|----------|------|-----|---------|
| **Break Room Snacks** | Building A - 2nd Floor | 010 | 2 | Doritos Cool Ranch |
| | | 012 | 5 | Sun Chips Garden Salsa |
| | | 016 | 4 | Doritos Nacho Cheese |
| | | 018 | 4 | Lay's Classic |
| | | 030 | 5 | M&M's Chocolate |
| | | 031 | 7 | Reese's Peanut Butter Cups |
| | | 038 | 7 | Snickers |
| **Drink Cooler** | Building A - Lobby | 042 | 6 | Sprite Bottle 20 oz |
| | | 045 | 6 | Red Bull 8.4 oz |
| | | 052 | 5 | Diet Coke Bottle 20 oz |
| | | 056 | 2 | Coke Bottle 20 oz |
| | | 058 | 3 | Starbucks Mocha Frappuccino |
| | | 059 | 4 | Aquafina Water 20 oz |
| | | 048 | 4 | Premier Protein Chocolate |
| **Fresh & Healthy** | Building A - Gym | 037 | 6 | String Cheese (2 ct) |
| | | 039 | 6 | Welch's Fruit Snacks |
| | | 034 | 3 | Nature Valley Peanut Butter |
| | | 036 | 4 | Nature's Bakery Fig Bar |
| | | 033 | 4 | Keebler Peanut Butter Crackers |
| | | 046 | 4 | Busseto Salami & Provolone |
| | | 049 | 1 | Bumble Bee Chicken Salad Kit |

#### DEMO ROUTE 2: "Hospital Campus"

| Machine | Location | Slot | Qty | Product |
|---------|----------|------|-----|---------|
| **Main Lobby** | Building B - Entrance | 010 | 3 | Smartfood White Cheddar Popcorn |
| | | 012 | 5 | Boulder Canyon Jalapeno Cheddar |
| | | 022 | 7 | Cheetos Flamin Hot Limon |
| | | 035 | 9 | Kit Kat |
| | | 033 | 6 | Kinder Bueno |
| | | 030 | 4 | M&M's Chocolate |
| | | 031 | 4 | Nature's Bakery Blueberry Fig |
| **Energy Corner** | Building B - Fitness | 040 | 2 | Monster Ultra Fiesta Mango |
| | | 047 | 5 | Red Bull Sugar Free 8.4 oz |
| | | 054 | 6 | Dunkin Donuts Iced Coffee |
| | | 050 | 6 | Coke Bottle 20 oz |
| | | 051 | 6 | Diet Coke Bottle 20 oz |
| | | 052 | 6 | Sprite Bottle 20 oz |
| | | 059 | 3 | Fairlife Rich Chocolate |
| **Cafeteria** | Building B - Break Area | 010 | 5 | Doritos Nacho Cheese |
| | | 012 | 7 | Lay's Classic |
| | | 024 | 9 | Cheetos Flamin Hot Limon |
| | | 030 | 10 | Snickers |
| | | 034 | 7 | M&M's Peanut |
| | | 039 | 7 | Jack Link's Beef and Cheddar |
| | | 045 | 8 | Red Bull Sugar Free 12 oz |

**Total:** 42 items across 2 routes, 6 machines

### Demo Session Data

```javascript
{
  session_id: "demo-uuid",
  lead_id: "lead-uuid",
  first_name: "Sarah",
  current_route: 1,
  current_machine: 1,
  items_completed: 0,
  started_at: timestamp,
  last_activity: timestamp
}
```

---

## UI Components

### 1. Demo Landing Page (`/demo`)

```
┌─────────────────────────────────────────┐
│              [STOCKER LOGO]             │
├─────────────────────────────────────────┤
│                                         │
│         Picture this...                 │
│                                         │
│         🕕 6AM. Dark warehouse.         │
│         📋 Paper list in one hand.      │
│         📱 Phone in the other.          │
│         🍫 Arms full of product.        │
│                                         │
│         Squinting. Fumbling.            │
│         Every. Single. Morning.         │
│                                         │
│         What if you could just talk?    │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  First Name  [________________]         │
│                                         │
│  Email       [________________]         │
│                                         │
│  [    🎤 START THE DEMO!    ]           │
│                                         │
├─────────────────────────────────────────┤
│  🎁 Complete the demo →                 │
│     Get 2 EXTRA WEEKS FREE!             │
│     (1 full month to try Stocker)       │
└─────────────────────────────────────────┘
```

**Key elements:**
- Pain scene text (no images needed, just words)
- Simple form (name + email only)
- Big exciting CTA button
- Incentive at bottom (earned bonus, not given)

### 2. Live Demo Page (`/demo/live`)

**Initial state:** Greets by name, shows commands, prompts voice start.

```
┌─────────────────────────────────────────┐
│                                         │
│         Hey Sarah! 👋                   │
│                                         │
│         Welcome to Stocker.             │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  Here's what you can do:                │
│                                         │
│  🗣️ "Got it" or "Next" - advance        │
│  🗣️ "How many left?" - check progress   │
│  🗣️ "Skip machine" - come back later    │
│  🗣️ "Go back" - undo last item          │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  🎤 Make sure your mic is on!           │
│                                         │
│  When you're ready, say:                │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  │  "Stocker, start my route!"     │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  🎧 Works best with earbuds             │
│                                         │
└─────────────────────────────────────────┘
```

**Key design:**
- Personalized greeting with their name
- Quick command reference (not overwhelming)
- Voice-triggered start: "Stocker, start my route!"
- Mic reminder prominent
- No "click to start" button - voice is the ONLY way to begin
- Earbuds tip at bottom (not blocking)

### 3. Demo Voice Interface (After "Start my route!")

Same as production StockerApp with:
- Personalized greeting using captured first_name
- Demo route data instead of user routes
- "Exit Demo" button in header (small, unobtrusive)
- Progress indicator showing route/machine progress

**"Next" Button Strategy (HIDDEN BY DEFAULT):**
- Button is **NOT visible** when demo starts
- Only appears after **10 seconds of no voice input** on same item
- Small, muted styling (gray, not primary color)
- Tooltip: "Having trouble? Tap to continue"
- Goal: Force voice experience, but don't strand stuck users

```
VOICE WORKING:
┌─────────────────────────────────────────┐
│  🎤 Listening...                        │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  5x Doritos Nacho Cheese        │    │
│  │  slot 16                        │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Say "got it" or "next" when done       │  ← Voice prompt
│                                         │
└─────────────────────────────────────────┘

AFTER 10 SECONDS STUCK:
┌─────────────────────────────────────────┐
│  🎤 Listening...                        │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  5x Doritos Nacho Cheese        │    │
│  │  slot 16                        │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Say "got it" or "next" when done       │
│                                         │
│  [Having trouble? Tap here]             │  ← Muted fallback appears
└─────────────────────────────────────────┘
```

### 4. Guided Feature Discovery (AI Prompts During Demo)

**Purpose:** Don't hope they discover features - TELL them to try.
**Method:** AI weaves prompts naturally into the flow.

| After | AI Says |
|-------|---------|
| Item 3 | "Got it. 4 more on this machine. **Hey, try asking me 'how many left?' anytime.**" |
| Item 6 | "Nice! Last one on this machine. **By the way, if you need to skip a machine and come back later, just say 'skip machine'.**" |
| Machine 1 complete | "Machine done! **Notice you didn't touch your screen once? That's the point.** Moving to Drink Cooler..." |
| Machine 2, item 2 | "Got it. **You can also say 'go back' if you need to undo.**" |

**Implementation:** Custom demo system prompt with these callouts at specific item counts.

### 5. Mid-Demo CTA Popup (After Route 1)

```
┌─────────────────────────────────────────┐
│              NICE WORK! 🎉              │
├─────────────────────────────────────────┤
│                                         │
│  You just completed your first route    │
│  with Stocker. Imagine doing this       │
│  every morning - hands-free.            │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  [  START FREE TRIAL - 1 MONTH FREE  ]  │
│                                         │
│  [     CONTINUE TO ROUTE 2     ]        │
│                                         │
│  ☐ Yes, I'd like more info              │
│                                         │
└─────────────────────────────────────────┘
```

### 6. Exit Popup (With Stats + Earned Reward)

**Purpose:** Reinforce accomplishment + make discount feel EARNED.

```
┌─────────────────────────────────────────┐
│          YOU EARNED IT! 🎉              │
├─────────────────────────────────────────┤
│                                         │
│  ✓ 21 items picked                      │
│  ✓ 3 machines stocked                   │
│  ✓ 0 screen touches                     │
│                                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                         │
│  🎁 You unlocked: 2 EXTRA WEEKS FREE    │
│     That's 1 full month to try Stocker! │
│                                         │
│  Your code: DEMO-x7k9m                  │
│  (auto-applied at signup)               │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  [    CLAIM MY FREE MONTH    ]          │
│                                         │
│  [        Maybe Later        ]          │
│                                         │
│  ☐ Yes, I'd like someone to reach out   │
│                                         │
└─────────────────────────────────────────┘
```

**Key psychology:**
- "YOU EARNED IT" not "Thanks for trying"
- "You unlocked" - gamification language
- "2 EXTRA weeks" - feels like a bonus they won
- No opt-out here - unsubscribe handled in emails

**Dynamic stats:** Actual counts from their demo session.

### 7. Pricing Page Thank-You Banner

```
┌─────────────────────────────────────────┐
│ ✓ Thanks for trying the demo, Sarah!    │
│   Your first month FREE is ready.       │
│   [START FREE TRIAL]                    │
└─────────────────────────────────────────┘
```

---

## Timeout Behavior

| Trigger | Action |
|---------|--------|
| 5 minutes idle | Show "Still there?" prompt with [Continue] / [Exit Demo] |
| 10 minutes idle | Auto-end demo, show exit popup |
| 30 minutes total | Session expires, show exit popup |

---

## Discount Code System

### Code Generation
- Format: `DEMO-{6 random alphanumeric}` (e.g., `DEMO-a7x9km`)
- Generated when lead is created
- Unique per email address

### Code Application
- Stored in `demo_leads` table
- When user signs up with same email → auto-apply discount
- **Standard trial = 2 weeks. Demo bonus = +2 weeks = 4 weeks (1 month) total**
- Track `discount_used` for analytics

### Psychology
- Standard signup: "Get 2 weeks free"
- After demo: "You EARNED 2 extra weeks!"
- Same end result (1 month free) but feels like an achievement

### Returning Demo Users
- If same email demos again → same discount code (already exists)
- Still get the discount if they sign up
- No penalty for exploring multiple times

---

## Technical Implementation

### Frontend Components Needed

| Component | Location | Purpose |
|-----------|----------|---------|
| `DemoLanding.tsx` | `/src/pages/DemoLanding.tsx` | Lead capture form |
| `PainScene.tsx` | `/src/components/demo/PainScene.tsx` | Animated text intro (CSS fade-ins) |
| `DemoInstructions.tsx` | `/src/components/demo/DemoInstructions.tsx` | Voice-first instructions popup |
| `DemoApp.tsx` | `/src/pages/DemoApp.tsx` | Voice interface for demo |
| `DemoCTAPopup.tsx` | `/src/components/demo/DemoCTAPopup.tsx` | Mid-demo and exit popups (with stats) |
| `DemoNextButton.tsx` | `/src/components/demo/DemoNextButton.tsx` | Hidden fallback (appears after 10s) |

### API/Workflow Changes

| Endpoint | Purpose |
|----------|---------|
| `POST /demo/start` | Create demo_lead, generate discount code, return session |
| `GET /demo/routes` | Return demo route data |
| `POST /demo/progress` | Update demo progress |
| `POST /demo/complete` | Mark demo completed |
| `GET /demo/lead/{email}` | Check if lead exists (for discount lookup at signup) |

### beforeunload Intercept

```javascript
window.addEventListener('beforeunload', (e) => {
  if (demoInProgress && !exitPopupShown) {
    e.preventDefault();
    showExitPopup();
    e.returnValue = ''; // Required for Chrome
  }
});
```

---

## Analytics Events

| Event | Data |
|-------|------|
| `demo_started` | lead_id, email, timestamp |
| `demo_route_completed` | lead_id, route_number, duration |
| `demo_cta_shown` | lead_id, cta_type (mid/exit) |
| `demo_cta_clicked` | lead_id, cta_type, action (signup/continue/later) |
| `demo_abandoned` | lead_id, progress, reason (timeout/close/exit) |
| `demo_converted` | lead_id, discount_code, signup_timestamp |

---

## Implementation Phases

| Phase | Tasks | Estimate |
|-------|-------|----------|
| 1. Database | Create demo_leads table, demo route data | 1-2 hours |
| 2. Landing Page | DemoLanding.tsx with form | 2-3 hours |
| 3. Pain Scene | Animated text intro (CSS animations, no video) | 2 hours |
| 4. Voice Instructions | Instructions popup with voice emphasis | 1 hour |
| 5. Demo App | Fork StockerApp for demo mode, hidden Next button | 3-4 hours |
| 6. Guided Discovery | Custom demo system prompt with feature callouts | 1-2 hours |
| 7. CTA Popups | Mid-demo popup, exit popup with stats | 2 hours |
| 8. Timeouts | Idle detection, beforeunload | 1-2 hours |
| 9. Discount System | Code generation, signup integration | 2-3 hours |
| 10. Analytics | Event tracking | 1-2 hours |
| 11. Testing | Cross-browser, mobile, edge cases | 2-3 hours |

**Total Estimate:** 18-26 hours

---

## Confirmed Decisions

| Decision | Final Choice |
|----------|--------------|
| **Page structure** | **Main landing (CTA) → Demo landing (pain + form) → Live demo** |
| Lead form fields | Name + email only (no opt-out at signup) |
| Demo scope | 2 routes × 3 machines × 7 items = 42 items |
| **Pain Scene** | **Static page with pain text, form fields, "START THE DEMO!" button** |
| **Scenario time** | **6AM (realistic)** |
| **Demo start trigger** | **User says "Stocker, start my route!" (voice-first)** |
| Voice emphasis | Instructions on live demo page show commands, mic reminder |
| Fallback controls | "Next" button HIDDEN - appears after 10s stuck (muted styling) |
| **Guided discovery** | **AI prompts them to try features at specific items** |
| **Exit stats** | **"YOU EARNED IT!" - items, machines, "0 screen touches"** |
| Tab close intercept | Yes, use beforeunload |
| **Offer structure** | **Standard = 2 weeks free. Demo completion = +2 weeks = 1 month total** |
| **Offer psychology** | **"You unlocked 2 EXTRA weeks!" - feels earned, not given** |
| Discount code | Unique per lead, tied to email, auto-applied |
| **Opt-out approach** | **No opt-out in app. Standard unsubscribe link in emails.** |
| "Want more info?" | Checkbox: "Yes, I'd like someone to reach out" |
| Post-demo redirect | Pricing page with thank-you banner + CTA |
| Timeout | 5 min idle = query, 10 min idle = end demo |
| Mid-demo CTA | After Route 1: "Start Trial" or "Continue to Route 2" |

---

## Open Items

None - all BBRD branches closed.

---

**END OF SPECIFICATION**
