# Boundary & Branch Discovery for UX/UI Design

**A Systematic Intent Translation Methodology for Human-AI Design Collaboration**

Version 1.0 | Adapted for Front-End UX/UI

---

## Purpose

This document defines a structured discovery process for designing front-end experiences. It bridges the gap between what users *say* they want and what they *actually need* — ensuring AI-assisted design produces intent-aligned results, not statistically likely guesses.

**Add this to your CLAUDE.md or workspace instructions.**

---

## The Core Problem

| Human Communication | AI Processing |
|---------------------|---------------|
| Intent-driven — outcome in mind | Prediction-driven — statistical likelihood |
| Compressed — years of context in few words | Literal — only sees explicit input |
| Contains unknown unknowns — latent requirements | Fills gaps with assumptions |
| Evolves through interaction | Static per request |

> **AI cannot infer human intent — it can only predict from explicit input.**
>
> Every gap in explicit instruction becomes an AI assumption.
> Assumptions ≠ Intent.
> Therefore: **Gaps = Design Failure.**

---

## The Three-Phase Framework

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    BOUNDARY & BRANCH DISCOVERY                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐                                                    │
│  │   PHASE 1       │  BOUNDARY IDENTIFICATION                           │
│  │   Constrain     │  Mutually exclusive containers that define         │
│  │                 │  the design space                                  │
│  └────────┬────────┘                                                    │
│           │                                                             │
│           ▼                                                             │
│  ┌─────────────────┐                                                    │
│  │   PHASE 2       │  RECURSIVE DISCOVERY                               │
│  │   Explore       │  Branch following + intent decompression           │
│  │                 │  until natural termination                         │
│  └────────┬────────┘                                                    │
│           │                                                             │
│           ▼                                                             │
│  ┌─────────────────┐                                                    │
│  │   PHASE 3       │  EVOLUTION                                         │
│  │   Evolve        │  Feedback loops that incorporate output            │
│  │                 │  into continued discovery                          │
│  └────────┬────────┘                                                    │
│           │                                                             │
│           ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    INTENT-ALIGNED DESIGN                        │    │
│  │         AI output converged with human intention                │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ════════════════════════════════════════════════════════════════════   │
│                                                                         │
│  SUCCESS METRIC: DESIGN SPACE NARROWING                                 │
│  Each phase measurably constrains possibilities toward intent           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Boundary Identification

### Definition

Boundaries are top-level, **mutually exclusive** containers that constrain the entire design space before any detail work begins.

### MECE Requirement

- **Mutually Exclusive:** Every design decision belongs to exactly ONE boundary
- **Collectively Exhaustive:** All possible design considerations are captured within the boundary set

### UX/UI Boundary Categories

| Boundary | What It Constrains |
|----------|-------------------|
| **User Type** | Who is the primary user? (admin, end-user, guest, power-user) |
| **Journey Stage** | Where in the flow? (onboarding, core task, settings, error recovery) |
| **Device/Context** | Where used? (mobile, desktop, tablet, offline, low-bandwidth) |
| **Interaction Pattern** | How do they interact? (browse, search, create, configure) |
| **Data State** | What data exists? (empty, loading, populated, error, stale) |
| **User State** | What's their status? (authenticated, anonymous, trial, premium) |

### How to Identify Boundaries

Boundaries emerge from understanding the use case. Ask:

1. **Who** is using this? (User Type boundary)
2. **What** are they trying to accomplish? (Journey Stage boundary)
3. **Where** are they using it? (Device/Context boundary)
4. **How** do they expect to interact? (Interaction Pattern boundary)
5. **What data** exists at this moment? (Data State boundary)

### Example: Dashboard Design

```
User says: "I need a dashboard for our sales team"

Boundaries identified:
├── User Type: Sales rep vs Sales manager vs Admin
├── Journey Stage: Quick glance vs Deep analysis vs Configuration
├── Device: Desktop primary vs Mobile secondary
├── Interaction: View-only vs Interactive filtering
├── Data State: Real-time vs Cached vs Historical
└── User State: Individual view vs Team view vs All-company view
```

**Result:** Massive design space reduction before any wireframing begins.

---

## Phase 2: Recursive Discovery (Branch Following)

### Definition

Phase 2 explores within each boundary, following every branch until it reaches a **terminal state** — a concrete, specific design decision that requires no further clarification.

### The Family Tree Principle

```
                        [Root: Design Goal]
                               │
              ┌────────────────┼────────────────┐
              │                │                │
        [Boundary 1]     [Boundary 2]     [Boundary 3]
              │                │                │
         ┌────┴────┐      ┌───┴───┐           │
         │         │      │       │       [Terminal]
    [Branch]  [Terminal]  │   [Terminal]
         │            [Branch]
    ┌────┴────┐           │
    │         │      ┌────┴────┐
[Terminal] [Terminal] │         │
                  [Terminal] [Terminal]
```

Key principles:
- **Depth is revealed, not decided** — simple designs = shallow trees
- **Each answer either terminates or branches** — no answer is ignored
- **The tree's size defines itself through discovery**

### The Core Rule

Every answer either:

1. **TERMINATES** — Concrete, specific, no implied dependencies
2. **BRANCHES** — Reveals new questions that must be followed

### Termination Criteria

A branch is **TERMINAL** when:
- Answer is concrete and specific (e.g., "blue primary button, 16px, full-width on mobile")
- No implied dependencies or undefined references
- Could be handed to implementation without clarifying questions
- "What else about this might matter?" yields nothing new

A branch is **NON-TERMINAL** when:
- Vague qualifiers present ("modern," "clean," "intuitive," "user-friendly")
- References undefined patterns ("like that other app")
- Contains assumptions about implementation
- Multiple reasonable interpretations exist

### Branch Following Example

```
User says: "I want a settings page"

This OPENS branches:
├── What settings categories? → [follow]
├── How should categories be organized? → [follow]
├── What's the navigation pattern? → [follow]
├── How are changes saved? → [follow]
├── What happens on unsaved navigation? → [follow]
├── Are there dangerous actions? → [follow]
└── What about mobile? → [follow]

Branch: "How are changes saved?"
User: "Auto-save"

This OPENS more branches:
├── What's the save frequency? → [follow]
├── How is save status indicated? → [follow]
├── What if offline? → [follow]
├── Conflict resolution? → [follow]
└── Undo capability? → [follow]

Continue until each sub-branch terminates with specific, concrete answers.
```

### Intent Decompression

As branches are followed, three layers of intent are unpacked:

| Layer | Definition | Discovery Approach |
|-------|------------|-------------------|
| **Explicit Intent** | What user knows and states | Direct questions |
| **Implicit Intent** | What user knows but assumes obvious | Probing questions |
| **Latent Intent** | What user hasn't consciously formed | Exploratory questions |

### The Unknown Unknowns

> Discovery doesn't just extract stated requirements — it surfaces requirements the human hasn't articulated even to themselves.

**Example:**
- User asks for "a form to collect user info"
- Latent requirements not mentioned:
  - Field validation patterns
  - Error message copy and placement
  - Empty state guidance
  - Autofill behavior
  - Accessibility requirements
  - International format support

These are **latent requirements** — real, critical, but unconscious until discovered.

---

## Phase 3: Evolution

### Definition

Complex design intent evolves through interaction. Seeing AI output often triggers clarification, refinement, or redirection.

### Types of Evolution

| Type | Trigger | Action |
|------|---------|--------|
| **Corrective** | "That's not what I meant" | Return to relevant branch, clarify |
| **Expansive** | "I also need..." | New branch opens, explore to termination |
| **Reductive** | "That's more than I need" | Scope narrows, simplify |
| **Redirective** | "Actually, different goal" | Return to boundary level, reassess |

### The Bidirectional Principle

> Discovery helps AI understand human intent AND helps humans clarify their own intent.

Many stakeholders don't know what they want until asked the right questions.

---

## UX-Specific Control Flow Detection

When exploring branches, detect these patterns:

### Conditional UI States

Detect when user description implies conditional rendering:
- "Show X only if Y"
- "Different view for admins"
- "If no data, show empty state"

**Follow-up questions:**
- What triggers each condition?
- What are all possible states?
- What's the default?
- How does state transition happen?

### Error/Edge Cases

Detect when error handling is needed:
- "What if it fails?"
- "Handle errors gracefully"
- "Retry capability"

**Follow-up questions:**
- What error types exist?
- What feedback does user need?
- What recovery actions are available?
- Is there a fallback experience?

### Iteration/Lists

Detect when lists or repetition is involved:
- "List of items"
- "Multiple entries"
- "Paginated results"

**Follow-up questions:**
- What's the item structure?
- How is the list sorted/filtered?
- What are empty/loading/error states?
- Pagination vs infinite scroll?

### Navigation/Routing

Detect when multi-page or multi-step flows exist:
- "Different screens based on..."
- "Step-by-step wizard"
- "Navigate between..."

**Follow-up questions:**
- What's the navigation structure?
- Can users jump between steps?
- What's preserved between views?
- How is progress indicated?

---

## Probability Space Narrowing (Success Metric)

Each phase measurably constrains AI output possibilities:

```
Unconstrained AI Design Space:
[━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━]
Could generate any UI — infinite possibilities

+ Boundaries Applied:
[━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━]
Constrained to user type, device, journey stage

+ Branches Explored:
[━━━━━━━━━━━━━━━━━]
Specific component and interaction decisions

+ Terminal Details Captured:
[━━━━━━━━]
Exact specifications, copy, behavior

+ Design System Applied:
[━━━]
Platform-specific patterns and constraints

= Intent-Aligned Design:
[█]
The design you actually wanted
```

---

## Discovery Questions by UX Category

### Layout & Structure
- What's the information hierarchy?
- What's the grid/responsive behavior?
- Fixed vs fluid elements?
- Above/below fold priorities?

### Navigation
- Primary navigation pattern? (sidebar, top nav, bottom nav, hamburger)
- Breadcrumbs or back navigation?
- Deep linking requirements?
- Search/filter accessibility?

### Forms & Input
- Field types and validation?
- Required vs optional?
- Inline vs summary validation?
- Multi-step or single page?
- Auto-save behavior?

### Data Display
- Table vs cards vs list?
- Sorting and filtering?
- Pagination approach?
- Detail view pattern?
- Empty/loading/error states?

### Actions & Feedback
- Primary vs secondary actions?
- Confirmation patterns?
- Success/error feedback?
- Loading indicators?
- Undo capability?

### Accessibility
- Screen reader requirements?
- Keyboard navigation?
- Color contrast needs?
- Focus management?
- ARIA requirements?

---

## The Definitive Test

### After Boundary Identification (Phase 1):
You should be able to answer:
- "This design serves [user type] doing [task] on [device]"
- "The core interaction pattern is [browse/create/configure/etc.]"
- "Key states to design for are [empty/loading/populated/error]"

### After Recursive Discovery (Phase 2):
You should be able to specify:
- Every component with its exact behavior
- Every state and transition
- Every edge case and error handling
- Exact copy, colors, sizes where specified
- Clear handoff-ready specifications

### After Evolution (Phase 3):
You should have:
- Stakeholder-validated design decisions
- Documented design rationale
- Clear implementation guidance
- No ambiguous requirements remaining

---

## Implementation Checklist

Before any design work, complete this discovery:

```
[ ] PHASE 1: BOUNDARIES IDENTIFIED
    [ ] User type(s) defined
    [ ] Journey stage(s) scoped
    [ ] Device/context constraints known
    [ ] Interaction pattern(s) identified
    [ ] Data states enumerated
    [ ] User states considered

[ ] PHASE 2: BRANCHES EXPLORED
    [ ] All vague terms clarified ("modern" → specific attributes)
    [ ] Edge cases identified and designed
    [ ] Error states defined
    [ ] Empty states defined
    [ ] Loading states defined
    [ ] Responsive behavior specified
    [ ] Accessibility requirements captured

[ ] PHASE 3: EVOLUTION COMPLETE
    [ ] Initial output reviewed
    [ ] Corrections incorporated
    [ ] Expansions explored
    [ ] Scope confirmed
    [ ] Stakeholder sign-off
```

---

## Forbidden Phrases (Without Verification)

Never accept or use these without drilling deeper:

| Vague Term | Required Clarification |
|------------|----------------------|
| "Clean design" | What specific attributes? White space, typography, color palette? |
| "Modern UI" | Which modern patterns? Specific examples? |
| "Intuitive" | Intuitive for whom? Based on what prior knowledge? |
| "Simple" | What complexity is being removed? What's essential? |
| "Like [other app]" | Which specific aspects? What should differ? |
| "User-friendly" | What user? What makes it friendly for them? |
| "Professional" | What signals professionalism in this context? |

**Replace with:** "Let me understand what you mean by [term] — can you describe specific examples or attributes?"

---

## Document Information

| Field | Value |
|-------|-------|
| Document | Boundary & Branch Discovery for UX/UI |
| Version | 1.0 |
| Based On | VisionAIry Discovery Methodology |
| Adapted For | Front-End UX/UI Design |
| License | Use freely with attribution |

---

**Boundary & Branch Discovery — Systematic Intent Translation for Design**
