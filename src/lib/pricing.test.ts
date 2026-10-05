import { describe, expect, it } from "vitest";
import {
  calculateMonthlyPriceCents,
  calculatePricingQuote,
  normalizeDriverCount,
} from "./pricing";

describe("graduated StockerAI pricing", () => {
  it.each([
    [1, 4_800],
    [2, 4_800],
    [5, 12_000],
    [6, 14_100],
    [20, 43_500],
    [21, 45_300],
    [22, 47_100],
    [50, 97_500],
  ])("prices %i requested drivers at %i cents monthly", (drivers, expected) => {
    expect(calculateMonthlyPriceCents(drivers)).toBe(expected);
  });

  it("never lowers the total when a driver crosses a tier boundary", () => {
    for (let drivers = 2; drivers < 100; drivers += 1) {
      expect(calculateMonthlyPriceCents(drivers + 1))
        .toBeGreaterThan(calculateMonthlyPriceCents(drivers));
    }
  });

  it("calculates exact six-month and annual prepaid discounts", () => {
    expect(calculatePricingQuote(22, "semiannual")).toMatchObject({
      monthlyCents: 47_100,
      termSubtotalCents: 282_600,
      discountCents: 14_130,
      dueAfterTrialCents: 268_470,
    });
    expect(calculatePricingQuote(22, "annual")).toMatchObject({
      monthlyCents: 47_100,
      termSubtotalCents: 565_200,
      discountCents: 56_520,
      dueAfterTrialCents: 508_680,
      effectiveMonthlyCents: 42_390,
    });
  });

  it("normalizes invalid or below-minimum counts to two drivers", () => {
    expect(normalizeDriverCount(Number.NaN)).toBe(2);
    expect(normalizeDriverCount(0)).toBe(2);
    expect(normalizeDriverCount(2.9)).toBe(2);
  });
});
