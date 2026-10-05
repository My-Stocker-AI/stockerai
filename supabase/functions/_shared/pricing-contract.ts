import { BillingContractError } from "./billing-contract.ts";

export const PRICING_VERSION = "2026-10-graduated";
export const FREE_TRIAL_DAYS = 7;

export type BillingTerm = "monthly" | "semiannual" | "annual";

export const BILLING_TERM_MONTHS: Record<BillingTerm, number> = {
  monthly: 1,
  semiannual: 6,
  annual: 12,
};

export const BILLING_TERM_DISCOUNT_PERCENT: Record<BillingTerm, number> = {
  monthly: 0,
  semiannual: 5,
  annual: 10,
};

const BILLING_TERMS = new Set<BillingTerm>(["monthly", "semiannual", "annual"]);

export interface StripePriceConfiguration {
  monthly: string;
  semiannual: string;
  annual: string;
  legacy: string[];
}

export function parseBillingTerm(value: unknown): BillingTerm {
  if (typeof value !== "string" || !BILLING_TERMS.has(value as BillingTerm)) {
    throw new BillingContractError(400, "Choose monthly, six-month, or annual billing.");
  }
  return value as BillingTerm;
}

export function stripePriceConfiguration(
  env: (name: string) => string | undefined,
): StripePriceConfiguration {
  const monthly = env("STRIPE_PRICE_ID_MONTHLY");
  const semiannual = env("STRIPE_PRICE_ID_SEMIANNUAL");
  const annual = env("STRIPE_PRICE_ID_ANNUAL");
  if (!monthly || !semiannual || !annual) {
    throw new BillingContractError(503, "The new StockerAI billing plans are not configured.");
  }
  return {
    monthly,
    semiannual,
    annual,
    legacy: [env("STRIPE_PRICE_ID")].filter((value): value is string => Boolean(value)),
  };
}

export function priceIdForTerm(config: StripePriceConfiguration, term: BillingTerm): string {
  return config[term];
}

export function recognizedPriceIds(config: StripePriceConfiguration): string[] {
  return [...new Set([config.monthly, config.semiannual, config.annual, ...config.legacy])];
}

export function billingTermForPriceId(
  config: StripePriceConfiguration,
  priceId: string,
): BillingTerm | "legacy" | null {
  if (priceId === config.monthly) return "monthly";
  if (priceId === config.semiannual) return "semiannual";
  if (priceId === config.annual) return "annual";
  if (config.legacy.includes(priceId)) return "legacy";
  return null;
}

export function calculateMonthlyPriceCents(count: number): number {
  const seats = Math.max(2, Math.floor(count));
  const firstBand = Math.min(seats, 5);
  const secondBand = Math.min(Math.max(seats - 5, 0), 15);
  const thirdBand = Math.max(seats - 20, 0);
  return firstBand * 2400 + secondBand * 2100 + thirdBand * 1800;
}

export function calculateTermPriceCents(count: number, term: BillingTerm): number {
  const subtotal = calculateMonthlyPriceCents(count) * BILLING_TERM_MONTHS[term];
  return subtotal - Math.round(subtotal * BILLING_TERM_DISCOUNT_PERCENT[term] / 100);
}
