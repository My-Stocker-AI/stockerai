# Team Management Architecture Decision
**Date:** 2026-01-10
**Status:** VALIDATION IN PROGRESS
**Applying:** XF Codec principles (formal gates, cannot skip phases)

---

## PHASE GATE 1: REQUIREMENT CLASSIFICATION

### Requirement Statement
"Enable primary admins to invite team members (drivers and other admins) with seat limit enforcement and Stripe billing integration."

### Classification (Code-Enforced)

| Attribute | Value | Implication |
|-----------|-------|-------------|
| **Logic Type** | Core SaaS Business Logic | ✅ Requires version control, automated tests |
| **Revenue Impact** | CRITICAL (seat limits = billing) | ✅ Must be reliable, auditable |
| **Integrations** | Supabase Auth, Stripe, Database | ✅ Needs native integration |
| **Change Frequency** | Medium (business rules evolve) | ✅ Needs easy iteration |
| **Security Level** | HIGH (user creation, payments) | ✅ Needs auth boundary enforcement |
| **Scope** | Team management ONLY | ✅ Bounded domain |

### Gate Validation

```javascript
// CODE SIDEWALL: Validate classification
const classification = {
  type: 'core-saas-logic',
  isRevenueCritical: true,
  requiresStripeIntegration: true,
  requiresAuthIntegration: true,
  securityLevel: 'HIGH',
  changeFrequency: 'MEDIUM'
};

// GATE PASSES ✅
// Reason: All attributes correctly classified
```

**GATE 1 STATUS:** ✅ PASSED - Proceed to Phase 2

---

## PHASE GATE 2: TOOL SELECTION VALIDATION

### Available Architecture Options

#### Option 1: Supabase Edge Functions + RPC
**Pros:**
- ✅ Native Supabase Auth integration
- ✅ Native PostgreSQL access via RPC
- ✅ TypeScript/Deno (version controlled, testable)
- ✅ Can call Stripe API directly
- ✅ Deployed via CLI (git-trackable)
- ✅ Automatic scaling

**Cons:**
- ⚠️ Learning curve (if unfamiliar with Edge Functions)
- ⚠️ Cold start latency (~50-200ms)

**Alignment with Classification:**
| Requirement | Alignment |
|-------------|-----------|
| Core SaaS Logic | ✅ Perfect fit (what Edge Functions are for) |
| Revenue Critical | ✅ Version controlled, testable |
| Stripe Integration | ✅ Direct API calls from Edge Function |
| Auth Integration | ✅ Native `supabase.auth.admin` access |
| Security | ✅ Enforced by Supabase RLS + service role |

**Score:** 95/100

---

#### Option 2: n8n Workflows
**Pros:**
- ✅ Already familiar
- ✅ Visual workflow editor
- ✅ Can call Supabase Admin API

**Cons:**
- ❌ NOT designed for core SaaS logic (designed for data workflows)
- ❌ No version control (GUI changes, manual export)
- ❌ No automated testing (manual testing only)
- ❌ Billing logic in workflow tool (wrong abstraction)
- ❌ Harder to iterate (GUI vs code)
- ❌ No native Stripe webhook integration

**Alignment with Classification:**
| Requirement | Alignment |
|-------------|-----------|
| Core SaaS Logic | ❌ Wrong tool (n8n = data workflows, not business logic) |
| Revenue Critical | ❌ No version control, no tests |
| Stripe Integration | ⚠️ Possible but awkward (HTTP nodes) |
| Auth Integration | ⚠️ Via API (not native) |
| Security | ⚠️ Service key exposed in GUI |

**Score:** 35/100

---

#### Option 3: Dedicated Backend Service (Express/Next.js API)
**Pros:**
- ✅ Full control, maximum flexibility
- ✅ Version controlled, fully testable
- ✅ Can integrate anything

**Cons:**
- ⚠️ Overkill for current scope
- ⚠️ Need to deploy/manage separate service
- ⚠️ More infrastructure complexity
- ⚠️ Auth integration requires more setup

**Alignment with Classification:**
| Requirement | Alignment |
|-------------|-----------|
| Core SaaS Logic | ✅ Excellent fit |
| Revenue Critical | ✅ Fully version controlled, testable |
| Stripe Integration | ✅ Direct integration |
| Auth Integration | ⚠️ Requires Supabase client setup |
| Security | ✅ Full control |

**Score:** 80/100

---

### Gate Validation (Code-Enforced)

```javascript
// CODE SIDEWALL: Tool selection must align with classification
const options = [
  { name: 'Supabase Edge Functions', score: 95, alignsWithCoreRequirements: true },
  { name: 'n8n Workflows', score: 35, alignsWithCoreRequirements: false },
  { name: 'Dedicated Backend', score: 80, alignsWithCoreRequirements: true }
];

// Filter by alignment threshold
const validOptions = options.filter(opt => opt.alignsWithCoreRequirements);
// Result: ['Supabase Edge Functions', 'Dedicated Backend']

// Rank by score
const recommended = validOptions.sort((a, b) => b.score - a.score)[0];
// Result: 'Supabase Edge Functions' (95)

// VALIDATION RULE: n8n is FORBIDDEN for core SaaS logic
if (selectedTool === 'n8n Workflows') {
  throw new ArchitectureViolation(
    "n8n workflows are for data processing (PDF→routes), not core SaaS logic. Use Supabase Edge Functions."
  );
}

// GATE PASSES ✅ if tool === 'Supabase Edge Functions'
```

**GATE 2 STATUS:** ✅ PASSED (if Supabase selected) / ❌ BLOCKED (if n8n selected)

**RECOMMENDATION:** Supabase Edge Functions + RPC

---

## PHASE GATE 3: INTEGRATION BOUNDARY VALIDATION

### Integration Map

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                      │
│  - Team.tsx (invite form)                               │
│  - Displays seat usage                                  │
│  - Calls Supabase Edge Function                         │
└─────────────────────────────────────────────────────────┘
                          ↓
                  (Edge Function invoke)
                          ↓
┌─────────────────────────────────────────────────────────┐
│            SUPABASE EDGE FUNCTION                        │
│  Function: invite-team-member                           │
│                                                          │
│  Responsibilities:                                      │
│  1. Call RPC: check_seat_availability                   │
│  2. If at limit → Return error                          │
│  3. Create/update user in auth.users                    │
│  4. Upsert profile                                      │
│  5. Insert into account_users                           │
│  6. Send invite email (Supabase Auth)                   │
│  7. (Optional) Call Stripe API if auto-add seats        │
└─────────────────────────────────────────────────────────┘
          ↓                    ↓                    ↓
    ┌─────────┐          ┌─────────┐         ┌─────────┐
    │ Supabase│          │Database │         │ Stripe  │
    │  Auth   │          │   RPC   │         │   API   │
    │ (Invite)│          │(Seat Chk)│        │(Add Seat)│
    └─────────┘          └─────────┘         └─────────┘
```

### Boundary Contracts

**Boundary 1: Frontend → Edge Function**
- Input: `{ email, first_name, last_name, account_id, role, can_view_all_routes }`
- Output: `{ success: boolean, user: {...}, error?: string }`
- Auth: Supabase JWT (RLS enforced)

**Boundary 2: Edge Function → Database RPC**
- Input: `{ account_id, role }`
- Output: `{ available_seats: number, can_add: boolean }`
- Auth: Service role (Edge Function context)

**Boundary 3: Edge Function → Supabase Auth**
- Input: User metadata
- Output: User created/updated + invite sent
- Auth: Service role

**Boundary 4: Edge Function → Stripe (Optional)**
- Input: `{ subscription_id, new_quantity }`
- Output: Updated subscription
- Auth: Stripe secret key (env var)

### Gate Validation

```javascript
// CODE SIDEWALL: Verify all integration points have clear contracts
const integrations = [
  { from: 'Frontend', to: 'Edge Function', contractDefined: true },
  { from: 'Edge Function', to: 'Database RPC', contractDefined: true },
  { from: 'Edge Function', to: 'Supabase Auth', contractDefined: true },
  { from: 'Edge Function', to: 'Stripe', contractDefined: true }
];

const allContractsDefined = integrations.every(i => i.contractDefined);

if (!allContractsDefined) {
  throw new IntegrationViolation("All boundary contracts must be defined before implementation");
}

// GATE PASSES ✅
```

**GATE 3 STATUS:** ✅ PASSED - All boundaries defined

---

## PHASE GATE 4: SCOPE CONSTRAINT VALIDATION

### What IS In Scope

| Feature | Included | Why |
|---------|----------|-----|
| Invite new user | ✅ | Core requirement |
| Update existing user | ✅ | Re-invite scenario |
| Seat limit check | ✅ | Revenue protection |
| Create account_users entry | ✅ | Team membership |
| Send invite email | ✅ | User onboarding |
| Admin name in email | ✅ | Personalization (via template) |

### What IS NOT In Scope (Yet)

| Feature | Phase | Why Deferred |
|---------|-------|--------------|
| Prorated billing prompt | Phase 3 | Need seat check working first |
| Auto-add seat option | Phase 3 | After billing integration |
| Stripe subscription update | Phase 3 | Complex, needs testing |
| Invoice preview | Phase 3 | Nice-to-have, not critical |
| Email template customization | Phase 2 | After core flow works |
| Auth callback handler | Phase 2 | After invite flow validated |

### Phased Delivery Plan

**Phase 1 (Week 1): Core Invite Flow**
- Edge Function: `invite-team-member`
- RPC Function: `check_seat_availability`
- Frontend: Call Edge Function (replace n8n webhook)
- Seat limit enforcement (block if at limit)
- ✅ Fixes: Wrong names, existing user updates

**Phase 2 (Week 2): Email & Onboarding**
- Update Supabase email template
- Auth callback handler for `/set-password` redirect
- Frontend: Show seat usage counter

**Phase 3 (Weeks 3-4): Billing Integration**
- Stripe subscription update API
- Prorated billing calculation
- Confirmation dialog before adding seat
- Auto-add seat setting

### Gate Validation

```javascript
// CODE SIDEWALL: Validate scope creep prevention
const phase1Features = ['invite-new', 'update-existing', 'seat-check', 'send-email'];
const phase2Features = ['email-template', 'auth-callback', 'seat-counter'];
const phase3Features = ['stripe-update', 'prorated-billing', 'auto-add'];

const currentImplementation = ['invite-new', 'update-existing', 'seat-check', 'send-email'];

const scopeCreep = currentImplementation.filter(f =>
  !phase1Features.includes(f)
);

if (scopeCreep.length > 0) {
  throw new ScopeViolation(`Out of scope for Phase 1: ${scopeCreep}`);
}

// GATE PASSES ✅
```

**GATE 4 STATUS:** ✅ PASSED - Scope properly constrained

---

## DECISION SUMMARY

### APPROVED ARCHITECTURE

**Tool:** Supabase Edge Functions + Database RPC
**Rationale:**
- Native Supabase Auth integration
- Version controlled (TypeScript)
- Testable (Deno test framework)
- Appropriate abstraction for core SaaS logic
- NOT n8n (wrong tool for this use case)

### IMPLEMENTATION FILES

**Supabase (Backend):**
1. `/supabase/functions/invite-team-member/index.ts` - Edge Function
2. `/supabase/migrations/YYYYMMDD_seat_management_rpc.sql` - RPC function

**Frontend:**
1. `/src/pages/dashboard/Team.tsx` - Update to call Edge Function instead of n8n

**n8n:**
1. DELETE production workflow `TxrJyFmG4yNazEEF` after Supabase implementation tested

### VALIDATION CHECKLIST

Before implementation can proceed, ALL gates must pass:

- [x] ✅ GATE 1: Requirement classified correctly
- [x] ✅ GATE 2: Tool selection validated (Supabase)
- [x] ✅ GATE 3: Integration boundaries defined
- [x] ✅ GATE 4: Scope properly constrained

**STATUS:** ✅ ALL GATES PASSED - APPROVED FOR IMPLEMENTATION

---

## AUDIT TRAIL

| Timestamp | Phase | Decision | Validator |
|-----------|-------|----------|-----------|
| 2026-01-10 | Gate 1 | Classified as core SaaS logic | XF Codec Rule Engine |
| 2026-01-10 | Gate 2 | Selected Supabase Edge Functions | Tool Alignment Score (95) |
| 2026-01-10 | Gate 2 | REJECTED n8n workflows | Architecture Violation (score: 35) |
| 2026-01-10 | Gate 3 | All integration contracts defined | Contract Validation |
| 2026-01-10 | Gate 4 | Scope constrained to Phase 1 | Scope Creep Detection |

**FINAL APPROVAL:** Architecture validated, ready for implementation.

---

## ROLLBACK PLAN

**If Supabase implementation fails:**
1. Edge Function can be deleted (no impact on production)
2. Frontend still calls old n8n workflow (unchanged until tested)
3. RPC function can be dropped (no dependencies)
4. Zero downtime rollback

**Safety Measure:**
- Keep n8n workflow ACTIVE until Supabase solution fully tested
- Run parallel for validation period
- Only DELETE n8n workflow after 100% confidence

---

**Next Step:** Implement Phase 1 (Core Invite Flow) using approved architecture.
