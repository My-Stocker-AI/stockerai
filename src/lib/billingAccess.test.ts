import { describe, expect, it } from "vitest";
import { hasOperationalBillingAccess, requiresBillingSetup } from "./billingAccess";

describe("billing access", () => {
  it.each([
    [{ is_platform_account: true, subscription_status: null }, true],
    [{ is_platform_account: false, subscription_status: "trialing" }, true],
    [{ is_platform_account: false, subscription_status: "active" }, true],
    [{ is_platform_account: false, subscription_status: "past_due" }, false],
    [{ is_platform_account: false, subscription_status: "canceled" }, false],
    [{ is_platform_account: false, subscription_status: null }, false],
  ])("evaluates operational access for %o", (account, expected) => {
    expect(hasOperationalBillingAccess(account)).toBe(expected);
    expect(requiresBillingSetup(account)).toBe(!expected);
  });

  it("fails closed when account state is unavailable", () => {
    expect(requiresBillingSetup(undefined)).toBe(true);
  });
});
