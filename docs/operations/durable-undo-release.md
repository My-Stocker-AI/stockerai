# Durable item undo release

This release adds an authoritative item-level undo for an active machine. It does not
permit undo across a machine handoff or after route completion. `Go back`, `Previous
item`, and undo phrases use the same durable operation. `Repeat that` remains read-only.

Reviewed migration: `20260930000000_durable_item_undo.sql`

SHA-256: `AB1701529CDD5AC484DF489A782787D1BAB35B376329BAECA280C2BD1AA5AAFB`

## Release order

1. Confirm the reviewed commit, migration checksum, database backup status, and current
   production application/database versions. Do not infer migration history from GitHub.
2. Apply only `20260930000000_durable_item_undo.sql` to production Supabase. The function
   is additive and unused by the currently released client.
3. Verify the exact function definition, service-role execute grant, and denial for
   `anon` and `authenticated`. Do not run an undo against driver data as a verification.
4. Merge/deploy the API and frontend only after their independent CI passes. During a
   mixed-version rollout, an old API can refuse the new endpoint without changing progress;
   it must not fall back to browser-only undo.
5. Verify Render is live at the exact merge commit and `/health` succeeds. Verify the
   Cloudflare assets, `v0.2.4-durable-undo`, and `stocker-ai-v13-durable-undo`. These checks
   establish rollout, not route or device acceptance.

GitHub does not apply the migration. Applying the migration, merging the application,
and using a production route are separate authorization boundaries.

## Rollback

Revert the application first. The additive function may remain while older clients run;
they do not call it. Drop the function only after no deployed client references
`/api/undo-item`. Do not delete operation receipts or rewrite driver counts as part of an
application rollback. A successfully committed undo is user progress and must not be
silently reversed.

## Acceptance

Automated acceptance covers exact duplicate replay, different concurrent operations,
timeout/lost-response recovery through the existing revision contract, stale targets,
receipt-write rollback, missing/corrupt evidence, forward/reverse direction, one/two-item
windows, repeated item-level rewind, resume after undo, tenant isolation, and browser-role
denial.

Physical acceptance remains separate for iOS and Android. Record actual device, OS,
browser, build, browser/installed mode, microphone permission, Bluetooth state,
background/foreground and screen-lock recovery, and touch fallback. On each platform,
verify one- and two-item routes, repeated go-back within a pair, refresh after undo, a
lost-network refusal with unchanged screen state, and the next command after recovery.
