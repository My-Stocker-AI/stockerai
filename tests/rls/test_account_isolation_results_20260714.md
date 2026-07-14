# RLS Account Isolation — Live Verification Evidence

**Date:** 2026-07-14
**Project:** StockerAI Supabase `wvtkuposrlvadyeixlke`
**Migration:** `supabase/migrations/20260714_reenable_rls_account_isolation.sql`
**Method:** Simulated each user server-side via `SET ROLE authenticated` + `SET request.jwt.claims`
(so `auth.uid()` resolves to the target user) — real RLS enforcement, NOT the service role.

## Real accounts used (no synthetic data)
- **Account A** `435baae6…` — sundragonvending@gmail.com (`365ffef8…`, Davy)
- **Account B** `6ed5d948…` — russ@visionairy.biz (`bdc96b72…`, platform admin) + russwright63+test (`25df14da…`)

For write-restriction tests, `25df14da` was temporarily demoted primary_admin → driver, then restored.

## Results — all pass

| # | Scenario | Expected | Actual | Pass |
|---|----------|----------|--------|------|
| RLS | account_users + profiles rowsecurity | true | true / true | ✓ |
| Recursion | query returns (no infinite loop) | returns | returned | ✓ |
| T1 | driver SELECT account_users | own account (B) only | 2 rows, account B only | ✓ |
| T2 | driver self-promote UPDATE | 0 rows (blocked) | `[]` | ✓ |
| T3 | driver INSERT member | RLS violation | `ERROR 42501 new row violates RLS` | ✓ |
| T4 | driver DELETE owner's membership | 0 rows (blocked) | `[]` | ✓ |
| T5 | driver UPDATE own profile | 1 row (allowed) | 1 row | ✓ |
| T6 | driver UPDATE other's profile | 0 rows (blocked) | `[]`, target unchanged | ✓ |
| T7 | Davy SELECT profiles | own account only | only sundragon | ✓ |
| T8 | platform admin SELECT account_users | all accounts | 3 rows, both accounts | ✓ |
| T9 | platform admin SELECT profiles | all accounts | all 3 emails | ✓ |
| T10 | restored primary_admin UPDATE member | success (no over-block) | 1 row | ✓ |
| Safety | blocked T6 left no damage | profile intact | first_name still "Russ" | ✓ |
| Safety | role state restored | original | all primary_admin, both accounts | ✓ |

## Key finding corrected during build
The spec assumed `profiles` had an `account_id` column; it does not. Same-account profile
visibility is scoped by joining through `account_users` (profiles.id = account_users.user_id),
itself resolved via the `get_user_account_id()` SECURITY DEFINER helper — same observable
behavior, correct mechanism, no recursion.

## Out of scope (deferred)
Admin-dashboard authentication still uses a frontend email allowlist
(`PlatformAdminRoute.tsx`), not a server/DB gate. Deferred to a later hardening pass by decision.
