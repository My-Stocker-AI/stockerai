# Keyword RPC authority release

This is a database-only authority correction for finding 02. It does not change the
browser RPC signatures, route state, voice command semantics, or driver progress.

## Proven production starting point

The production catalog showed both `upsert_user_keyword(uuid,text,boolean)` and
`get_top_user_keywords(uuid,numeric,integer)` were owned by `postgres`, ran as
`SECURITY DEFINER`, had no fixed `search_path`, accepted a caller-supplied user ID,
contained no `auth.uid()` check, and were executable by `anon`, `authenticated`, and
`service_role`. No RPC was invoked and no keyword or driver row was read for this check.

The released browser calls these exact signatures with its signed-in user's ID. Repository
search found no service-role caller. Migration
`20261001000000_bind_keyword_functions_to_caller.sql` therefore keeps both signatures and
their successful owner behavior while requiring `p_user_id = auth.uid()`, fixing the search
path, denying `anon` and `service_role`, and retaining `authenticated` execution.

## Validation and release order

1. Apply the migration only to the marked disposable database with
   `scripts/disposable-db/apply-keyword-authority-migration.py`.
2. Run `python-api/tests/test_keyword_rpc_authority.py` and the complete database-enabled
   backend suite. The focused test must prove own read/write behavior, cross-user refusal,
   anonymous refusal, grants, caller binding, and search-path protection using real local
   Auth/PostgREST.
3. Recheck the newest physical production backup and provider health. Record that Storage
   objects are outside the database backup and do not describe this function-only change as
   a restore rehearsal.
4. With explicit production approval, apply only
   `20261001000000_bind_keyword_functions_to_caller.sql`. Do not run a blanket migration
   push and do not invoke either function against customer data as a smoke test.
5. Run `keyword-authority-verify.sql`. Expect exactly two rows. Both must be security
   definers with `search_path=public, pg_temp`, `anon=false`, `authenticated=true`,
   `service_role=false`, and a body containing `auth.uid()`.
6. Confirm the public application and API health remain available. No frontend/backend
   deployment is required because the signatures and successful owner contract do not
   change. Physical voice acceptance is unrelated to this database authority correction.

## Failure and recovery

The migration is transactional and changes function definitions/grants only. If application
keyword learning fails after release, fail closed by revoking `authenticated` execution while
preparing a corrected caller-bound function. The application already treats keyword loading
and tracking failures as non-fatal and continues with route/base recognition keywords.
Never restore the anonymous, caller-supplied-user behavior as a rollback.

