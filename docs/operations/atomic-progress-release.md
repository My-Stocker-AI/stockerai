# Atomic item advancement release

Scope: new Python-backed `get_next_item` calls use `/api/advance-item`. One service-role-only PostgreSQL function validates the caller's exact session, machine, presented count and direction, then commits item advancement or machine/session completion and a result receipt together. A duplicate operation ID returns the saved result; conflicting reuse and stale progress return a conflict. Browser roles cannot execute the function or read the receipts. The client does not automatically replay mutations or fall back to the old endpoint after an error.

This is a bounded step under remediation 09, not completion of picking-state remediation. Progress still means items presented. Start, skip, go-back, route selection, reset and legacy endpoints are not converted to this transaction protocol. A count/direction snapshot is not a monotonic version: resetting to the same values can defeat stale-state detection. Durable queued intent, two-item restore and confirmed-work semantics remain separate work. Old browser-generated session identities are resolved read-only only when the displayed route, machine, count and direction match the server; mismatches fail closed. Automatic refresh now retains saved direction and handoff state.

## Local validation

Start the disposable environment described in `local-test-isolation.md`. Apply the reviewed migration once:

```powershell
.test-runtime/Scripts/python.exe scripts/disposable-db/apply-progress-migration.py
& scripts/disposable-db/run-tests.ps1
```

The application helper is hardcoded to the named local database and checks its marker before any SQL. It must never be adapted to discover production credentials. The migration is additive and transaction-wrapped. A second application fails rather than silently accepting potentially different objects.

Tests include concurrent duplicates, different operations targeting the same old progress, lost-response replay, stale/paused/wrong session, changed payload reuse, forward/reverse one/two-item picks, incomplete item data, completion/handoff and injected failures after writes. The fault trigger is created only in the marked local database and removed in a finalizer. A separate test uses real local Auth/JWKS/account membership instead of the ordinary picking tests' mocked login gate. Production Auth/configuration and physical devices remain separate acceptance boundaries.

## Ordered release (requires explicit deployment authorization)

1. Review current production sessions/machines/items/routes columns and grants against the migration; check for conflicting `picking_operations`/`advance_picking` objects and verify available backup/recovery. The September 18 capture is a test baseline, not proof of current parity.
2. Apply **only** `supabase/migrations/20260922000000_atomic_advance_picking.sql` through the authorized Supabase deployment path. Do not run a blanket `supabase db push`: historical migrations are not a trusted production baseline. Verify function signature, grants, RLS and the receipt table from metadata without creating driver operations.
3. Release the API portion first. Confirm Render is Live at the intended commit, `/health` passes and OpenAPI exposes `/api/advance-item`. Existing clients remain supported on `/api/get-next-item`.
4. Release the frontend portion only after the API is live. Existing workflows deploy frontend/backend independently, so split release commits/PRs rather than assuming a combined push gives the required order. Confirm Cloudflare's commit and public picking bundle. Users should reopen/reload before their next route; an already-open client retains the legacy path.
5. Record migration, API and frontend versions separately in the remediation register. Verify the supported workflow on **both iOS and Android**, separately recording device/OS/browser and installed-versus-browser mode. Test normal routes, one/two-item modes, refresh, network interruption, headset removal/reinsertion, screen lock and touch fallback. Synthetic browser checks are not physical-device acceptance.

## Recovery and operational limits

For an application rollback, restore the prior frontend first, then the prior API if necessary. Retain the additive function and receipt table; do not drop receipts or reverse driver progress. Existing old clients continue using the old endpoint. No automatic production data repair is part of this release.

Receipts contain request targets and item-result data, not audio. They cascade with their session or Auth identity. No periodic retention deletion is introduced; establish a retention window and ledger-size monitoring before claiming long-term operational acceptance. Arbitrarily expiring receipts weakens the duplicate-replay guarantee and needs a defined client retry window.

The migration does not retire or secure existing legacy functions, rotate credentials, or resolve concurrency with the older multi-write operations. Those remain open findings, not implicit coverage of these tests.
