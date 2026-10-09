# Route-completion legacy grant release

The route-completion naming migration recreated the private array-authority
`advance_picking` implementation and restored direct `service_role` execution. The deployed
API uses the tenant-resolving overload, so external callers must not be able to supply their
own authority array.

Reviewed migration:
`supabase/migrations/20261008000000_revoke_route_completion_legacy_signature.sql`

SHA-256: `B6D770A19C4D8F6590257DC705C9459137ED0B5BEA582CBD4D123E7E43927718`

GitHub does not apply this migration. Do not run a blanket migration push against production.

## Release order

1. Confirm a current, usable Supabase backup or point-in-time recovery window.
2. In the production SQL editor, run this read-only preflight and save the output:

   ```sql
   select
     to_regprocedure(
       'public.advance_picking(uuid,uuid[],uuid,uuid,uuid,integer,integer,text)'
     ) is not null as legacy_signature_exists,
     has_function_privilege(
       'service_role',
       'public.advance_picking(uuid,uuid[],uuid,uuid,uuid,integer,integer,text)',
       'EXECUTE'
     ) as legacy_service_role_execute,
     has_function_privilege(
       'service_role',
       'public.advance_picking(uuid,uuid,uuid,uuid,integer,integer,text)',
       'EXECUTE'
     ) as tenant_safe_service_role_execute;
   ```

   Require `legacy_signature_exists=true` and `tenant_safe_service_role_execute=true`. The
   expected vulnerable state before remediation is `legacy_service_role_execute=true`. Stop
   if the signatures differ or the tenant-safe wrapper is unavailable.
3. Apply only the reviewed migration file. It changes one function grant inside a transaction;
   it does not read or modify driver, route, machine, item or session rows.
4. Repeat the preflight query. Require `true | false | true` in the same column order.
5. Check Render health and inspect current logs for permission-denied picking errors. Do not
   issue a picking command against a customer route as a migration smoke test.
6. Merge PR #49 only after its independent frontend, backend and secret-leak checks pass. The
   main-branch workflow will publish the responsive frontend change; it will not apply the
   database migration.
7. Verify the exact merged frontend commit on both `www.stocker-ai.com` and
   `stockerai.pages.dev`. Keep physical Android and iOS acceptance separate.

## Rollback boundary

The tenant-safe wrapper calls the private implementation as a `SECURITY DEFINER` function and
does not require a direct `service_role` grant. Therefore no normal rollback is expected. If
production logs prove that an unreviewed caller still invokes the array signature, stop the
release and identify that caller. Regranting direct execution reopens the authority-injection
risk and requires explicit security approval; never use it as an automatic rollback.

## Acceptance evidence

- Production catalog output before and after the migration.
- Backup/recovery confirmation and reviewed migration checksum.
- No new permission-denied picking failures after the grant change.
- Exact merge commit and Cloudflare deployment verification.
- Separate physical Android and iOS route acceptance; database metadata verification does not
  establish microphone, Bluetooth, speaker, call, notification or screen-lock behavior.
