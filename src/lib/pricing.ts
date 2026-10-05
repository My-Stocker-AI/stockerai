export const PRICING_VERSION = "2026-10-graduated";
export const FREE_TRIAL_DAYS = 7;
export const MINIMUM_BILLABLE_DRIVERS = 2;

export type BillingTerm = "monthly" | "semiannual" | "annual";

export const BILLING_TERMS: Record<BillingTerm, {
  label: string;
  months: number;
  discountPercent: number;
  description: string;
}> = {
  monthly: {
    label: "Monthly",
    months: 1,
    discountPercent: 0,
    description: "Maximum flexibility",
  },
  semiannual: {
    label: "Every 6 months",
    months: 6,
    discountPercent: 5,
    description: "Save 5%",
  },
  annual: {
    label: "Annual",
    months: 12,
    discountPercent: 10,
    description: "Best value — save 10%",
  },
};

export const DRIVER_PRICING_TIERS = [
  { label: "First 5 drivers", upTo: 5, unitAmountCents: 2400 },
  { label: "Drivers 6–20", upTo: 20, unitAmountCents: 2100 },
  { label: "Drivers 21+", upTo: null, unitAmountCents: 1800 },
] as const;

export interface PricingQuote {
  driverCount: number;
  billingTerm: BillingTerm;
  monthlyCents: number;
  termSubtotalCents: number;
  discountCents: number;
  dueAfterTrialCents: number;
  effectiveMonthlyCents: number;
}

export function normalizeDriverCount(count: number): number {
  if (!Number.isFinite(count)) return MINIMUM_BILLABLE_DRIVERS;
  return Math.max(MINIMUM_BILLABLE_DRIVERS, Math.floor(count));
}

export function calculateMonthlyPriceCents(count: number): number {
  let remaining = normalizeDriverCount(count);
  let previousLimit = 0;
  let total = 0;

  for (const tier of DRIVER_PRICING_TIERS) {
    const units = tier.upTo === null
      ? remaining
      : Math.min(remaining, tier.upTo - previousLimit);
    total += Math.max(0, units) * tier.unitAmountCents;
    remaining -= units;
    if (remaining <= 0) break;
    previousLimit = tier.upTo ?? previousLimit;
  }

  return total;
}

export function calculatePricingQuote(
  count: number,
  billingTerm: BillingTerm,
): PricingQuote {
  const driverCount = normalizeDriverCount(count);
  const term = BILLING_TERMS[billingTerm];
  const monthlyCents = calculateMonthlyPriceCents(driverCount);
  const termSubtotalCents = monthlyCents * term.months;
  const discountCents = Math.round(termSubtotalCents * term.discountPercent / 100);
  const dueAfterTrialCents = termSubtotalCents - discountCents;

  return {
    driverCount,
    billingTerm,
    monthlyCents,
    termSubtotalCents,
    discountCents,
    dueAfterTrialCents,
    effectiveMonthlyCents: Math.round(dueAfterTrialCents / term.months),
  };
}

export function formatCurrency(cents: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
  }).format(cents / 100);
}
