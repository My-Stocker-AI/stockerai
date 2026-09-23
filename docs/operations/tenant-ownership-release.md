# Tenant-owned routes release

This release makes the company the permanent owner of route data. A route can still be
assigned to a driver, and a driver can be removed, without moving or orphaning the route.
The current product contract remains one company per login.

## What changes

- `routes.account_id` is backfilled from the route owner's single current membership and
  becomes required and immutable.
- A permanent login-to-company binding prevents delete-and-reinsert from silently moving
  the same Auth identity into another company. Membership removal still revokes access.
- Database guards reject cross-company session and assignment references and moving an
  existing machine/item to a different parent.
- Restrictive RLS policies add a company boundary without broadening older role/owner
  permissions.
- New service-only picking overloads derive company authority inside the transaction.
  The API no longer supplies a cached teammate list to those operations.
- API route listing, selection, upload, route checks and machine checks use the stored
  company ID. A removed route owner no longer makes company data disappear.

This does not define role capabilities, enable account transfers, implement account
deletion, or change billing, signup, Storage, keyword RPCs, voice behavior, or route-import
atomicity. Those remain separate remediation work.

## Ordered production release

1. Confirm a usable database backup and run `tenant-ownership-preflight.sql` read-only.
   Every violation and collision count must be zero; both `already_exists` fields must be
   false. Stop and reconcile unexpected data rather than editing customer rows ad hoc.
2. In the Supabase SQL editor, apply only
   `supabase/migrations/20260925000000_tenant_route_ownership.sql`. GitHub is not connected
   to Supabase and does not apply this migration. Do not run a blanket migration push.
3. Verify the new column/backfill, triggers, policies and exact function grants. The
   migration is additive for the currently deployed API: old service-only picking
   signatures remain available during rollout, and old route inserts are populated by the
   trigger.
4. Merge the reviewed application PR. A push to `main` triggers the Render API deployment
   and the Cloudflare frontend workflow. Wait for Render to show the exact merge commit as
   Live; a successful trigger alone is insufficient.
5. Verify health, unauthenticated refusal, an authenticated company route list, one
   versioned picking context/transition, and a cross-company negative case using disposable
   accounts. Reopen mobile clients before route acceptance.
6. After the new API is verified, apply only
   `supabase/migrations/20260926000000_revoke_superseded_picking_signatures.sql`. It revokes
   the three teammate-array signatures from `service_role`; the tenant-resolving wrappers
   continue to call them as `SECURITY DEFINER` implementation details. Before applying it,
   confirm the exact API release is live and repository/deployed callers no longer submit
   `p_team_user_ids`. Afterward, verify the old signatures deny `service_role`, the new
   signatures still allow it, and API health remains green.

If the API rollout fails after the database migration, roll the application back to the
previous API commit. The additive schema and trigger remain compatible with that API.
Do not drop the company column or bindings as an emergency rollback; that would discard
the new ownership invariant and can strand newer writes.

## Acceptance evidence required

- Migration applies atomically to the marked disposable database and the full backend
  database suite passes, including duplicate concurrency and real Auth/JWKS tests.
- Two-company tests prove foreign routes, machines, sessions and RPCs remain inaccessible;
  membership removal is immediate; the original company retains its route; and the login
  cannot rejoin another company by recreating membership.
- Browser roles cannot execute either picking-function signature family directly. New
  service-only overloads work through the authenticated API.
- Frontend regression tests and the production build pass. Physical iOS/Android and voice
  acceptance remain separate because this release changes authority, not audio behavior.
