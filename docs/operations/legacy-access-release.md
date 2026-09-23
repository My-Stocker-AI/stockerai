# Legacy access and account resolution release

This release contains legacy picking entry points behind the authenticated Python API.
It is not complete tenant isolation, credential revocation or a role/capability redesign.

## Behavior

- The API resolves account membership in one database snapshot on every request.
  Missing/multiple memberships fail closed. Users belonging to multiple accounts are
  also excluded from a teammate's authorized owner list. There is no five-minute cache.
  This matches the UI's current single-account expectation without deleting memberships.
- The new read-only status endpoint ignores body identity, uses the verified user's
  latest active session, and verifies its route owner and machine/route relationship.
  Status preserves the existing presented-count convention; confirmed progress remains
  separate remediation.
- The three legacy Edge entry points have no privileged database client. They forward
  only the user's login to a fixed API destination, refuse redirects and never retry.
  Status discards supplied identity/target. Both old next-item addresses require the
  versioned transition fields and force action `next`; older untargeted mutation calls
  return 409 with reload guidance and do not change progress.
- Six legacy SQL RPC signatures become service-only. Python service calls continue
  to work; direct browser/anonymous callers lose execution privileges.

## Ordered release and required preflight

1. Verify backup/recovery readiness and current migration/schema/function definitions.
   Check all overloads and dependent callers of the six restricted routines. Reconcile
   aggregate multi-membership counts before release: do not auto-delete memberships or
   choose a customer on a person's behalf. Stop if unexpected users would be stranded.
2. Apply **only** `20260923010000_resolve_picking_account.sql`. Verify function signature,
   service-role grant and browser denials. It changes no application rows.
3. Release the API, verify the exact Render commit is Live, and check the new status
   endpoint exists and rejects unauthenticated requests. Authenticated requests require the new RPC.
4. Deploy the three Edge Functions including `_shared/legacy-picking.ts`. Explicitly
   use application-level JWT verification (gateway `verify_jwt=false`): the Python API
   verifies the forwarded user JWT through its existing trusted Auth/JWKS path. Never
   accept an API key or body `user_id` as authentication. Verify unauthorized requests
   fail and signed-in disposable fixtures preserve the expected response contract.
5. Apply **only** `20260924000000_restrict_legacy_picking_rpcs.sql`, after checking that
   legitimate callers have moved to authenticated service paths. Verify all six exact
   signatures deny PUBLIC/anon/authenticated and retain service_role execution.
6. Release the client status URL change after the API is Live. Both older and updated
   clients can read status through the secured paths. Reopen clients before route work.

GitHub does not deploy Edge Functions or apply these migrations. Never blanket-push the
historical migrations. Keep frontend and API publication separate to avoid a race.

If the Supabase CLI is not authenticated, the dashboard code editor is an alternative.
Run `python scripts/render-legacy-edge-release.py` to produce deterministic single-file
entries under ignored `.test-runtime/edge-release/`. The script inlines the exact tested
shared handler into each entry point and prints its SHA-256. Paste the appropriate full
file into that function's dashboard editor, verify content/hash before Deploy updates,
and verify the deployed source afterward. Do not paste credentials or hand-edit the
generated handler. This generation step itself does not deploy anything.

## Recovery and acceptance limits

Keep the additive account resolver in place if reverting the API. Prefer forward repair
over restoring unauthenticated Edge handlers or public RPC grants. Restoring API cache
behavior would restore delayed revocation and needs an explicit security decision.
Migration grant rollback is not a safe default recovery path.

Verify separate companies with real disposable logins: own status, forged body identity,
foreign sessions, foreign route/machine references, versioned mutations, membership
revocation and ambiguous membership. Record iOS and Android workflow acceptance separately.
Physical devices, production latency, external n8n dependents, live Edge routing and
complete browser/RLS/Storage/billing isolation are separate acceptance gates.

## Tenant ownership follow-up

The interim API contract is one unambiguous company per login. A future multi-company
switcher requires explicit selected-account context throughout UI, API and database.
Routes are still owned through user identity: moving a user to another company can change
which company reaches those routes. Before allowing transfers, persist immutable tenant
ownership, define a reviewed backfill for existing routes, prevent accidental cross-tenant
references, and enforce capabilities consistently at each boundary. Checking membership
at request entry is not a transaction lock against an in-flight membership change.
The new resolver does not alter existing RLS helpers or billing behavior. Active
`get_top_user_keywords` / `upsert_user_keyword` routines also require caller-bound
authorization in follow-up work; they cannot simply be revoked without replacing the
current browser keyword-learning path. Service-role credential containment remains
mandatory regardless of these browser grant restrictions.
