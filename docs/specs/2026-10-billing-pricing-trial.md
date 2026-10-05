# StockerAI pricing and trial contract

Status: implementation authorized 2026-10-05. Deployment and production verification remain separate milestones.

## Commercial terms

- Graduated monthly pricing: first 5 drivers at $24 each, drivers 6–20 at $21 each, and drivers 21+ at $18 each.
- Two-driver minimum ($48 monthly equivalent).
- Monthly billing has no discount; six-month prepayment receives 5%; annual prepayment receives 10%.
- New companies receive one seven-day free trial.
- A valid card is required before the trial and operational access begin. The subscription charge is $0 during the trial.
- Cancel during the trial to prevent the first subscription charge. Paid cancellations stop renewal and retain access through the paid term.
- New pricing applies to new subscriptions. Existing paid subscriptions and active fourteen-day trials are not silently shortened or repriced.

## Billing behavior

- Stripe is authoritative for subscription status, period dates, prices and collected amounts.
- Checkout is account-bound, administrator-only and idempotent.
- New companies are billing-gated until a signed Stripe event establishes `trialing` or `active` status with the expected StockerAI price.
- Existing accounts are grandfathered from the new onboarding gate unless explicitly migrated.
- Added seats are charged using Stripe proration. Seat reductions take effect under the configured subscription/portal policy and never below two seats.
- One pricing version and billing term are persisted for reconciliation and support.
- Partner attribution is metadata; commissions are calculated from net collected revenue outside customer discounts.

## Acceptance boundaries

- Verify quantities 1, 2, 5, 6, 20, 21, 22 and 50 for every billing term.
- Verify incomplete card setup cannot activate operational access.
- Verify a completed card-required checkout activates exactly seven trial days without an immediate subscription charge.
- Verify cancellation before trial end prevents the first charge.
- Verify duplicate checkout and duplicate/out-of-order webhook delivery converge safely.
- Verify existing paid, existing trial, complimentary and platform accounts are not changed unexpectedly.
- Test-mode evidence is required before live prices or production deployment. Deployment success does not establish billing acceptance.

## Stripe test-mode evidence (2026-10-05)

- Product `prod_VO2FnQb8lY03Tn`: StockerAI Driver Seats.
- Monthly `price_1UNGAtGG50M447BhABlFa1n4`: lookup key `stockerai_2026_10_monthly`; graduated tiers $24 (1–5), $21 (6–20), $18 (21+), monthly.
- Six-month `price_1UNGAtGG50M447BhyrHaPV9y`: lookup key `stockerai_2026_10_semiannual`; graduated tiers $136.80, $119.70, $102.60, every six months.
- Annual `price_1UNGAtGG50M447BhQWWGAAl1`: lookup key `stockerai_2026_10_annual`; graduated tiers $259.20, $226.80, $194.40, yearly.
- Dashboard inspection confirmed all three prices are active in Stripe test mode with zero active subscriptions. End-to-end checkout remains unverified until a disposable non-production Supabase environment is connected to these test prices.
