# Atomic route upload and private report release

This release removes the browser's dormant n8n fallback, makes recognized route replacement
transactional and retry-safe, and moves route reports from public Storage URLs to authenticated,
one-minute signed URLs. It does not authorize reading or mutating a customer route as a smoke test.

## Reviewed artifacts

- `supabase/migrations/20261003000000_atomic_route_upload.sql`
  - SHA-256 `970F4823E456FDBF5F4EAC296F7DBB6636E749867E44798C42B5ECF9948080C3`
- `supabase/migrations/20261002000000_private_route_pdfs.sql`
  - SHA-256 `BF3E9E8EE47099C067E84DDC4D73910F50734A69D26237CCBD328025B08559CE`
- `docs/operations/route-upload-verify.sql`

Recalculate and compare both hashes immediately before a production operation. Stop if either
differs from the reviewed release. Apply only the named file in each database step; never run a
blanket migration push against the production project.

## Preconditions and stop conditions

1. Confirm the exact PR head passed required frontend, backend and secret checks and is based on
   current production `main`.
2. Confirm a usable Supabase backup and public service status. Storage backups are not included in
   database backups, so do not present a database backup as report-object recovery.
3. Run `route-pdf-storage-verify.sql` read-only. Before this release, the expected bucket is
   `public=true`, 50 MB, PDF-only, with no browser-facing `storage.objects` policies. Stop and
   reconcile any different bucket, limit, MIME type or policy state.
4. Confirm Render Auto-Deploy remains **Off**. The gated exact-SHA GitHub job must remain the only
   application release actor.
5. Do not continue if current production health is failing, the migration checksum differs, the
   exact release cannot be identified, or the private-bucket prerequisite is absent.

## Ordered production release

1. **Database compatibility first:** apply only
   `20261003000000_atomic_route_upload.sql`. It is additive and the current application does not
   call its new service-only function.
2. Run the function/table portions of `route-upload-verify.sql`. Require exactly one function with
   `security_definer=true`, `search_path=public, pg_temp`, anon/authenticated execute false,
   service-role execute true, and all three body checks true. Require the operation table to have
   RLS enabled, no anon/authenticated select and service-role CRUD privileges. Require the pending-
   format recorder to have the same function/grant boundary, retry serialization and capability
   check. Require both functions to refuse an operation ID already used by the other upload path;
   require the queue table to retain RLS and service-role-only CRUD.
3. Merge only the reviewed application PR. Wait for main CI gates, then for both exact-SHA release
   jobs. Independently verify the Render commit/deploy is **Live**, API health succeeds, and both
   Cloudflare origins expose the exact built asset and byte-identical service worker.
4. Confirm live OpenAPI exposes `GET /api/route-pdf-url` and the updated upload contract. Do not call
   upload or open a customer's report merely as a smoke test.
5. **Privacy cutover last:** apply only
   `20261002000000_private_route_pdfs.sql` after the new application is independently live. Run the
   bucket portions of `route-upload-verify.sql`; require `public=false`, 25 MB, PDF-only and no
   browser-facing object policy.
6. With an explicitly authorized disposable production fixture or user-controlled route, verify
   an allowed owner/assignee receives a one-minute signed URL, an unassigned same-company driver
   is denied, a foreign-company caller receives the same denial, and a missing report returns a
   non-disclosing error. Record the actual account/fixture scope without copying the URL/token.
7. Reload/reopen clients before route testing. Record iOS and Android acceptance separately; a
   deployment and a desktop browser check do not establish either mobile pass.

## Unsupported-format review boundary

Unsupported reports remain in the internal `pending_unrecognized_formats` queue. Accepted reports
are now stored and recorded before the UI promises capture; identical operation retries return the
same queue item and do not send a second notification. After the bucket is private, its stored
former-public reference is an object locator, not a usable public link.
Review it only through the authenticated Supabase dashboard/Storage tooling; do not make the bucket
public or add a browser policy for convenience. The notification is best-effort, so operational
review must include the queue rather than relying on Telegram delivery alone.

## Failure and recovery boundaries

- If the atomic migration fails, its transaction must roll back. Do not merge the application.
- If application rollout fails before the privacy cutover, roll the application back to the prior
  exact commit; the additive function/table may remain while the cause is corrected.
- Once the bucket is private, do not roll back to an application that opens stored public URLs.
  Restore/roll forward the signed-URL application. Making the bucket public again is a privacy
  regression and requires a separate explicit incident decision.
- A generic upload transport failure can occur after a commit response is lost. Preserve the same
  operation ID on retry; do not manually delete or recreate a customer route.
- The API refuses an older cached upload request that omits its operation ID and tells the operator
  to reload. This is intentional: accepting it would reintroduce destructive retry ambiguity.
- Database/application publication does not close route, voice or mobile findings without their
  separate workflow and physical-device acceptance evidence.
