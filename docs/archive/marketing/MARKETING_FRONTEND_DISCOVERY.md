# Marketing Front End - MECE Discovery Progress
**Started:** 2025-12-28
**Status:** Phase 1 - Context Classification

---

## PHASE 1: CONTEXT CLASSIFICATION

### Input: Initial Request
"Marketing front end for Stocker AI - a voice-guided warehouse pre-kitting system for vending machine operators"

### Prior Context (from MEMORY.md)
- **Admin Page needed:** User Management, usage metrics, driver/machine workload monitoring
- **Client-side VAD:** To manage STT costs (reduce from $0.27 to $0.13/route)
- **Pricing model defined:** Solo $29, Team $69, Fleet $99, Business $179
- **Pages identified:** Landing page, Pricing page, Admin dashboard

### Classification Output

```javascript
{
  pattern: "SAAS_MARKETING_SITE",
  modifiers: [
    "B2B_VERTICAL",      // Specific industry (vending operators)
    "FREEMIUM_TRIAL",    // Likely needs trial/demo flow
    "ADMIN_PORTAL"       // Includes admin/dashboard component
  ],
  product_type: "VOICE_AI_TOOL",
  target_market: "SMB_NICHE",  // 3,000 mid-market vending operators
  complexity: "MEDIUM"         // Marketing site + Admin portal
}
```

### Pattern Characteristics
| Attribute | Value | Implication |
|-----------|-------|-------------|
| Site Type | Marketing + App | Need both public pages AND authenticated admin |
| Conversion Goal | Free trial signup | CTA focus on "Try Free" not "Buy Now" |
| Trust Building | High (B2B purchase) | Need social proof, ROI calculator, case studies |
| Technical Audience | Low-Medium | Operators, not developers - simple language |
| Decision Maker | Owner/Manager | Cost savings + efficiency messaging |

---

## PHASE 2: BOUNDARY MAP GENERATION (DETERMINISTIC)

Based on pattern `SAAS_MARKETING_SITE` + modifiers, the following boundaries are REQUIRED:

### Boundary Map

```javascript
{
  boundaries: [
    // === PUBLIC MARKETING SITE ===
    {
      id: "site_structure",
      name: "Site Structure & Navigation",
      required: true,
      min_fields: ["pages", "navigation_pattern", "cta_hierarchy"],
      depends_on: null
    },
    {
      id: "landing_page",
      name: "Landing Page",
      required: true,
      min_fields: ["hero", "value_props", "social_proof", "cta"],
      depends_on: "site_structure"
    },
    {
      id: "pricing_page",
      name: "Pricing Page",
      required: true,
      min_fields: ["tiers", "feature_comparison", "faq", "cta"],
      depends_on: "site_structure"
    },
    {
      id: "trust_elements",
      name: "Trust & Social Proof",
      required: true,
      min_fields: ["testimonials", "case_studies", "logos", "guarantees"],
      depends_on: null
    },
    {
      id: "conversion_flow",
      name: "Signup/Trial Flow",
      required: true,
      min_fields: ["signup_steps", "trial_terms", "onboarding_hook"],
      depends_on: "pricing_page"
    },

    // === AUTHENTICATED ADMIN PORTAL ===
    {
      id: "admin_structure",
      name: "Admin Portal Structure",
      required: true,
      min_fields: ["user_roles", "navigation", "dashboard_home"],
      depends_on: null
    },
    {
      id: "user_management",
      name: "User Management",
      required: true,
      min_fields: ["user_list", "add_user", "edit_user", "permissions"],
      depends_on: "admin_structure"
    },
    {
      id: "usage_metrics",
      name: "Usage Metrics & Analytics",
      required: true,
      min_fields: ["cost_tracking", "usage_graphs", "alerts"],
      depends_on: "admin_structure"
    },
    {
      id: "driver_monitoring",
      name: "Driver/Machine Workload Monitoring",
      required: true,
      min_fields: ["driver_list", "machine_assignments", "workload_view"],
      depends_on: "admin_structure"
    },

    // === TECHNICAL DECISIONS ===
    {
      id: "vad_implementation",
      name: "Client-Side VAD",
      required: true,
      min_fields: ["vad_library", "integration_point", "fallback"],
      depends_on: null
    },
    {
      id: "brand_identity",
      name: "Brand & Visual Identity",
      required: true,
      min_fields: ["colors", "typography", "logo_usage", "tone"],
      depends_on: null
    }
  ]
}
```

### Boundary Dependency Graph

```
                    ┌─────────────────┐
                    │ brand_identity  │ (independent)
                    └─────────────────┘

                    ┌─────────────────┐
                    │ trust_elements  │ (independent)
                    └─────────────────┘

                    ┌─────────────────┐
                    │vad_implementation│ (independent)
                    └─────────────────┘

┌─────────────────┐          ┌─────────────────┐
│ site_structure  │          │ admin_structure │
└────────┬────────┘          └────────┬────────┘
         │                            │
    ┌────┴────┐               ┌───────┼───────┐
    │         │               │       │       │
    ▼         ▼               ▼       ▼       ▼
┌────────┐ ┌────────┐   ┌─────────┐ ┌─────┐ ┌────────┐
│landing │ │pricing │   │user_mgmt│ │usage│ │driver_ │
│_page   │ │_page   │   │         │ │metrics│monitoring│
└────────┘ └───┬────┘   └─────────┘ └─────┘ └────────┘
               │
               ▼
        ┌─────────────┐
        │conversion_  │
        │flow         │
        └─────────────┘
```

---

## PHASE 3: RECURSIVE BRANCH-FOLLOWING

### Progress Tracker

| # | Boundary | Status | Skip Risks |
|---|----------|--------|------------|
| 1 | brand_identity | ✅ CONFIRMED | Prior work from Session 8 |
| 2 | site_structure | IN_PROGRESS | |
| 3 | landing_page | PENDING | |
| 4 | pricing_page | PENDING | |
| 5 | trust_elements | PENDING | |
| 6 | conversion_flow | PENDING | |
| 7 | admin_structure | PENDING | |
| 8 | user_management | PENDING | |
| 9 | usage_metrics | PENDING | |
| 10 | driver_monitoring | PENDING | |
| 11 | vad_implementation | DEFERRED | Phase 2 after voice fix deployed |

---

## BOUNDARY 1: brand_identity ✅ CONFIRMED

**Status:** Complete from Session 8 work

| Field | Value | Source |
|-------|-------|--------|
| Logo | S-Wave - Stylized "S" with sound wave arcs | `/pwa/icons/logo.svg` |
| Tagline | "Pick smarter. Stock faster." | Session 8 discovery |
| Personality | Efficient, supportive, no-nonsense | Market research |
| Positioning | "LightSpeed Killer" - enterprise voice picking for SMBs | Market research |
| Colors | TBD - need to extract from current PWA | |
| Typography | TBD - need to extract from current PWA | |

**Open Branch:** Colors and typography not formally documented. Accept defaults from PWA?

---

## BOUNDARY 2: site_structure 🔄 IN_PROGRESS

**Required Fields:** pages, navigation_pattern, cta_hierarchy

### Initial Question: What pages does the marketing site need?

**Context from prior work:**
- Landing page (hero, features, pricing preview)
- Pricing page (detailed tiers, FAQ)
- Admin dashboard (authenticated)
- Login/Signup (already exists in PWA)

### Branch: Pages List

| Page | Purpose | Priority |
|------|---------|----------|
| `/` | Landing page - hero, value props, social proof, CTA | P0 |
| `/pricing` | Detailed pricing tiers, feature comparison, FAQ | P0 |
| `/login` | Existing PWA auth | EXISTS |
| `/signup` | Existing PWA auth | EXISTS |
| `/app` | Existing PWA voice interface | EXISTS |
| `/upload` | Existing PWA upload | EXISTS |
| `/admin` | Admin dashboard (authenticated) | P1 |
| `/about` | Company story, team? | P2 |
| `/contact` | Support contact | P2 |
| `/demo` | Video demo or interactive demo? | P1 |

**SUB-BRANCH DECISION:** Hybrid architecture ✅

```
my-stocker-ai.com/
├── index.html          # NEW: Marketing landing page
├── pricing.html        # NEW: Pricing page
├── demo.html           # NEW: Demo/video page (P1)
├── app/
│   ├── index.html      # MOVED: Voice interface (was root index.html)
│   ├── upload.html     # MOVED: Route upload
│   ├── admin.html      # NEW: Admin dashboard
│   ├── auth.js         # EXISTS
│   ├── sw.js           # EXISTS
│   └── manifest.json   # EXISTS (update start_url)
├── icons/              # EXISTS
└── assets/             # NEW: Marketing assets (images, etc.)
```

### Branch: Navigation Pattern

**Marketing Site Navigation (public):**
```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]     Features   Pricing   Demo     [Login] [Try Free]│
└─────────────────────────────────────────────────────────────┘
```

**App Navigation (authenticated - already exists):**
```
┌─────────────────────────────────────────────────────────────┐
│  [Voice]                                           [Upload] │
└─────────────────────────────────────────────────────────────┘
```

**Admin Navigation (authenticated - NEW):**
```
┌─────────────────────────────────────────────────────────────┐
│  [Dashboard]   [Drivers]   [Usage]   [Settings]   [← App]   │
└─────────────────────────────────────────────────────────────┘
```

### Branch: CTA Hierarchy

| Location | Primary CTA | Secondary CTA |
|----------|-------------|---------------|
| Landing Hero | "Start Free Trial" | "Watch Demo" |
| Landing Features | "Try It Free" | - |
| Pricing Page | "Start Free" (per tier) | "Contact Sales" (Business tier) |
| Navigation | "Try Free" (button) | "Login" (link) |

### site_structure TERMINAL STATE ✅

```javascript
{
  architecture: "hybrid",
  pages: {
    marketing: ["/", "/pricing", "/demo"],
    app: ["/app", "/app/upload", "/app/admin"],
    auth: ["/app/login", "/app/signup"]  // or modal in marketing pages
  },
  navigation: {
    marketing: ["Features", "Pricing", "Demo", "Login", "Try Free"],
    app: ["Voice", "Upload"],
    admin: ["Dashboard", "Drivers", "Usage", "Settings"]
  },
  cta_hierarchy: {
    primary: "Start Free Trial",
    secondary: "Watch Demo",
    nav: "Try Free"
  }
}
```

---

## BOUNDARY 3: landing_page 🔄 IN_PROGRESS

**Required Fields:** hero, value_props, social_proof, cta

### Context Applied (from Market Research + FEATURES_AND_BENEFITS.md)

**COMPETITIVE LANDSCAPE (Researched):**

| Segment | Solution | Method | Cost | Stocker Advantage |
|---------|----------|--------|------|-------------------|
| Low End | Paper/PDF | Print route sheets, check off | Free | Error-prone, slow, eyes on paper |
| Mid-Market | Nayax MoMa, VendSoft, Gimme | Tablet/phone screen, tap checkboxes | ~$50-100/mo | Screen-based = eyes down, slower |
| Enterprise | **LightSpeed Automation** | Pick-to-Light LED hardware on every bin | **$100k+ CapEx** | Fast but massive investment |
| **Stocker** | Voice AI | Phone + Bluetooth earbuds, voice-guided | **$29-179/mo** | LightSpeed speed, zero hardware |

**WHAT LIGHTSPEED ACTUALLY IS:**
- LED hardware rails installed on EVERY warehouse bin
- Lights up which bin to pick from
- Used by massive operators (Coca-Cola bottlers, Canteen)
- Requires $50k-$100k+ hardware investment
- Your "LightSpeed Killer" positioning = give them the SPEED without the HARDWARE

**THE "MISSING MIDDLE" (Validated):**
- ~14,000 vending operators in US
- ~3,000 mid-market (5-50 routes) = YOUR target
- Too big for paper → making errors, wasting time
- Too small for $100k LightSpeed → stuck on slow screen-based apps

**KEY ANGLES FROM RESEARCH:**
1. **Zero CapEx** - "Don't buy LightSpeed. Use existing phones + Bluetooth headsets. Save $50k immediately."
2. **Eyes-Free Safety** - Competitors require looking at screens while walking warehouse. Voice = heads-up, safer.
3. **VMS Agnostic** - Works with Parlevel, Nayax, VendSoft exports. Not locked to one ecosystem.
4. **The "Sticky" Factor** - Once drivers use voice, they never go back to paper. You own the workflow.

---

### FIELD 1: Hero Section

**Proposed Terminal State (Research-Based):**

| Element | Content |
|---------|---------|
| Headline | **Pick-to-Light Speed. Zero Hardware Cost.** |
| Subhead | LightSpeed automation runs $100k+. Stocker runs on the phone in your pocket. Same voice-guided accuracy. Starting at $29/month. |
| Primary CTA | [Start Free Trial] |
| Secondary CTA | [See How It Works] |
| Visual | Split: warehouse with LED hardware bins vs. driver with earbuds + phone |

**Rationale:**
- Directly names the competitor (Pick-to-Light = LightSpeed's method)
- Stark cost contrast ($100k vs $29)
- "Phone in your pocket" = zero CapEx, BYOD
- Visual shows the comparison explicitly

**Alternative Headlines to Consider:**
- "LightSpeed Results. Smartphone Price."
- "Don't Buy a $100k Warehouse System."
- "Voice-Guided Picking Without the Hardware."

**→ CONFIRM or EXPLORE alternatives?**

---

### FIELD 2: Value Props

**Proposed Terminal State (Research-Based):**

| # | Headline | Subtext | Research Basis |
|---|----------|---------|----------------|
| 1 | **$0 Hardware Investment** | Phone + Bluetooth earbuds. Use what you already have. | Attacks LightSpeed's $100k CapEx |
| 2 | **Eyes Up, Hands Free** | No screen to stare at. Voice guides every pick. | Safety angle vs screen-based competitors |
| 3 | **Works With Your VMS** | Parlevel, Nayax, VendSoft - upload the PDF, start picking. | VMS Agnostic = no ecosystem lock-in |
| 4 | **5-Minute Setup** | No IT department. No installation. Upload and go. | Removes enterprise friction |

**Why These 4:**
- Props 1-2: Attack the two main competitor weaknesses (hardware cost, screen distraction)
- Props 3-4: Remove adoption objections (compatibility, complexity)

**→ CONFIRM or EXPLORE?**

---

### FIELD 3: Social Proof

**Branch Opens:** No customer testimonials yet (pre-launch).

**Options with Skip Risks:**

| Option | Description | Skip Risk |
|--------|-------------|-----------|
| a) Skip for MVP | Launch without, add later | Lower conversion rate |
| b) Beta count | "Join 50+ operators testing Stocker" | Weak social proof |
| c) Tech logos | "Powered by Deepgram • OpenAI" | Doesn't prove customer value |
| d) Founder story | Your vending background + why you built this | Authenticity, but needs content |

**→ Which path? Or EXPLORE what proof we actually have?**

---

### FIELD 4: CTA & Trial Terms

**Proposed Terminal State:**

| Decision | Proposed | Rationale |
|----------|----------|-----------|
| Trial duration | 14 days | Industry standard for B2B SaaS |
| Trial limits | 1 driver, unlimited routes | Lets them fully test the workflow |
| Credit card | No | Removes friction, higher signup rate |
| CTA text | "Start Free Trial" | Clear, action-oriented |

**→ CONFIRM or EXPLORE trial economics?**

---

## DISCOVERY LOG

### Session 19 (2025-12-28)
- Resumed discovery after voice latency fix
- ✅ brand_identity confirmed (Session 8 work)
- ✅ site_structure confirmed (Hybrid architecture)
- landing_page: Applying MECE methodology correctly
  - Using FEATURES_AND_BENEFITS.md context
  - Proposing terminal states with rationale
  - Asking CONFIRM or EXPLORE (not multiple choice)
- **AWAITING:** User decisions on Hero, Value Props, Social Proof, CTA

---

**END OF DISCOVERY DOCUMENT**
