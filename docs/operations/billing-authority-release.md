# Billing authority release procedure

This procedure releases the bounded findings 13/14/16 correction and the authorized
2026-10 graduated-pricing/card-required trial update. It does not close seat lifecycle reconciliation (15),
immutable usage accounting (17), provider-side coupon administration, or customer
payment acceptance. Keep production credentials and customer billing objects out of
logs and release evidence.

## Preconditions and stop conditions

- Confirm the exact reviewed commit and green frontend, backend, build, lint and
  secret-publication gates.
- Confirm a recent database backup. Supabase database backups do not include Storage.
- Confirm `APP_URL=https://www.stocker-ai.com`, the correct environment-specific
  `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_SEMIANNUAL`,
  `STRIPE_PRICE_ID_ANNUAL`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` are
  present. Preserve `STRIPE_PRICE_ID` while grandfathered subscriptions still use it.
  Never infer test/live mode from a price ID or replace production keys for testing.
- Confirm the Stripe webhook endpoint uses the pinned Basil-compatible event shape and
  includes subscription, checkout-session and subscription-invoice events used by the
  handler.
- Stop if any non-null Stripe customer or subscription ID is bound to more than one
  account, if the environment-specific price cannot be identified, or if either migration
  SHA-256 differs from the reviewed value: `20261004000000` is
  `BA34C6D3ECB82A680BB8834CE2E5DD95FCF7E5C564053EB6B1AA6E6EB49B3339`; `20261005000000`
  is `0C429716FA9C2A1748319702F9F028C06FDD0D5312B05D0C70FBDEA2DCF0E8E0`.

## Ordered release

1. Run the migration preflight and duplicate-binding check without selecting customer
   identities into logs.
2. Apply `20261004000000_account_bound_billing.sql`, then
   `20261005000000_pricing_and_card_required_trial.sql`, each in its own transaction.
3. Run `scripts/verification/billing-authority-verify.sql`. Require all columns and
   indexes present; RLS true; anon/authenticated access false; service-role access true;
   every function security-definer with an empty search path.
4. Deploy `stripe-webhook`, then `check-subscription`, `create-checkout`,
   `customer-portal`, and `update-subscription-quantity` from the same reviewed commit.
   Do not invoke checkout, portal or quantity update as a production smoke test.
5. Deploy the frontend only after the functions are live. Verify the exact asset/commit,
   public health, Render Auto-Deploy Off, and ordinary signed-out behavior.
6. With an explicitly authorized Stripe test-mode company and disposable users, verify
   primary-admin checkout retry, ordinary-member refusal, shared company status, portal
   authority, duplicate/out-of-order webhook convergence, failed-write retry and Basil
   item-level period display. Also verify card collection, a seven-day $0 trial, each
   graduated boundary for all three billing terms, trial cancellation without a charge,
   and grandfathered subscription behavior. Test-mode object IDs may be recorded in the
   pricing specification; never record keys, customer identities, or payment details.

## Recovery boundary

The migration is additive. If a function rollout fails, restore the prior functions while
leaving the new columns/table/RPCs in place, then correct forward. Do not drop the event
ledger or unique indexes during an incident; they are evidence and duplicate-binding
guards. A webhook failure must return a retryable error and remain marked failed. Do not
manually mark it processed until account state has reconciled.

Production deployment does not establish billing acceptance or close any finding. A test-
mode end-to-end pass and separately reviewed production reconciliation evidence are still
required.

## Stripe contract references

- Basil subscription periods are item-level:
  <https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end>
- POST idempotency keys and their retention behavior:
  <https://docs.stripe.com/api/idempotent_requests>
- Customer metadata search is eventually consistent and unavailable to India merchants;
  its failure must stop checkout rather than fall back to email identity:
  <https://docs.stripe.com/api/customers/search>
