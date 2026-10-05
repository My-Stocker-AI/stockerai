import { describe, expect, it } from "vitest";
import {
  calculateMonthlyPriceCents,
  calculateTermPriceCents,
  parseBillingTerm,
  recognizedPriceIds,
  stripePriceConfiguration,
} from "./pricing-contract";

describe("Stripe pricing contract", () => {
  it("selects configured new prices and recognizes the grandfathered price", () => {
    const values: Record<string, string> = {
      STRIPE_PRICE_ID_MONTHLY: "price_monthly",
      STRIPE_PRICE_ID_SEMIANNUAL: "price_six",
      STRIPE_PRICE_ID_ANNUAL: "price_annual",
      STRIPE_PRICE_ID: "price_legacy",
    };
    const config = stripePriceConfiguration((name) => values[name]);
    expect(recognizedPriceIds(config)).toEqual([
      "price_monthly", "price_six", "price_annual", "price_legacy",
    ]);
  });

  it("fails closed when any new billing term is not configured", () => {
    expect(() => stripePriceConfiguration((name) => name === "STRIPE_PRICE_ID_MONTHLY" ? "price_m" : undefined))
      .toThrow("not configured");
  });

  it("accepts only supported billing terms", () => {
    expect(parseBillingTerm("annual")).toBe("annual");
    expect(() => parseBillingTerm("quarterly")).toThrow("Choose monthly");
  });

  it("matches the public graduated price and prepaid discounts", () => {
    expect(calculateMonthlyPriceCents(2)).toBe(4_800);
    expect(calculateMonthlyPriceCents(22)).toBe(47_100);
    expect(calculateTermPriceCents(22, "semiannual")).toBe(268_470);
    expect(calculateTermPriceCents(22, "annual")).toBe(508_680);
  });
});
