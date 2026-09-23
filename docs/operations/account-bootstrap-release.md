# Account bootstrap and complimentary access release

This release makes company signup transactional and gives the platform administrator
a supported way to grant no-charge pilot access. It does not change Stripe prices,
create a public free plan, or apply database migrations through GitHub.

## What changes

- Auth signup creates the profile, company and first `primary_admin` membership in the
  same database transaction. A failure aborts the Auth user creation instead of leaving
  a partial customer account.
- Invited identities do not create a second company because only public company signup
  sends the explicit bootstrap marker.
- Billing, seat and complimentary-access fields can no longer be edited through ordinary
  customer table updates. Existing service-role Stripe handlers retain authority.
- The platform-admin screen uses a restricted database function to grant a no-charge
  seat allowance. Stripe-linked companies cannot be converted through this path.
- Sign-out clears account-scoped browser query data, and email-confirmation signup lands
  on a clear confirmation screen.

## Ordered production release

1. In Supabase, capture the current definitions of `public.handle_new_user`, the Auth
   user trigger, `public.accounts`, and its existing triggers. Confirm the platform-admin
   Auth identity is `bdc96b72-3f35-4cae-9e79-99473eb4a23b`. Stop if it differs.
2. Apply only `supabase/migrations/20260927000000_atomic_account_bootstrap.sql` in the
   Supabase SQL editor. GitHub is not connected to Supabase and will not apply it.
3. Verify the Auth trigger still calls `public.handle_new_user`, the access-protection
   trigger exists on `public.accounts`, and only `authenticated` can execute
   `public.admin_update_account_access`. Do not create a production signup as a schema
   check.
4. Merge the reviewed application change. A push to `main` deploys the frontend through
   Cloudflare; the API contains no code change in this release.
5. With a new ordinary pilot identity, verify email confirmation, first login, company
   membership and dashboard access. From the platform-admin screen, mark that company
   complimentary and confirm it has the intended seat allowance without a Stripe customer
   or checkout. Verify another customer cannot change those fields.
6. Sign out and into a different disposable identity and confirm no prior company data is
   displayed. Record iOS and Android acceptance separately.

The migration must precede the client release. The updated client no longer performs the
three browser-side bootstrap writes and therefore depends on the new Auth trigger.

## Recovery and limits

If signup fails after the migration, inspect the Auth database log before changing data.
The transaction is designed to leave no partial Auth user, company or membership. Restore
the captured `handle_new_user` definition only if the new trigger function itself prevents
all signup; leave the access-field guard in place while investigating.

This slice proves the bootstrap and complimentary-access database contracts in the marked
disposable environment. It does not prove production email delivery, hosted redirect URLs,
Stripe sandbox reconciliation, invitation acceptance, password recovery, or the complete
two-company UI journey. Those remain separate launch acceptance checks.
