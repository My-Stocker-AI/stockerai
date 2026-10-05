import { describe, expect, it } from "vitest";
import {
  BillingContractError,
  checkoutIdempotencyKey,
  getRequestOrigin,
  isSubscriptionBlockingCheckout,
  parseOperationId,
  parseRequestedSeatCount,
  requirePrimaryAdministrator,
  subscriptionSnapshot,
} from "./billing-contract";

describe("billing contract", () => {
  it("requires account-level primary administrator authority", () => {
    expect(() => requirePrimaryAdministrator({ accountId: "a", role: "driver", canUploadRoutes: true }))
      .toThrowError(BillingContractError);
    expect(() => requirePrimaryAdministrator({ accountId: "a", role: "primary_admin", canUploadRoutes: false }))
      .not.toThrow();
  });

  it("enforces integer seat bounds and the account minimum", () => {
    expect(parseRequestedSeatCount(7, 5)).toBe(7);
    expect(() => parseRequestedSeatCount(4, 5)).toThrow("between 5 and 999");
    expect(() => parseRequestedSeatCount(2.5)).toThrow("whole number");
    expect(() => parseRequestedSeatCount("5")).toThrow("whole number");
  });

  it("requires a UUID checkout operation and derives an account-bound idempotency key", () => {
    const operationId = "3dd618b0-a668-4d1b-8fb5-8d6221f7f71c";
    expect(parseOperationId(operationId.toUpperCase())).toBe(operationId);
    expect(checkoutIdempotencyKey("account-a", operationId))
      .toBe(`stockerai-checkout:account-a:${operationId}`);
    expect(() => parseOperationId("retry-me")).toThrow("operation ID");
  });

  it("accepts known app origins and rejects arbitrary redirect origins", () => {
    expect(getRequestOrigin("https://www.stocker-ai.com")).toBe("https://www.stocker-ai.com");
    expect(getRequestOrigin("https://8f81ea58.stockerai.pages.dev"))
      .toBe("https://8f81ea58.stockerai.pages.dev");
    expect(getRequestOrigin("http://localhost:5173", "http://localhost:5173"))
      .toBe("http://localhost:5173");
    expect(() => getRequestOrigin("http://localhost:5173")).toThrow("not allowed");
    expect(() => getRequestOrigin("https://attacker.example")).toThrow("not allowed");
  });

  it("reads Basil periods and quantities only from the configured price", () => {
    expect(subscriptionSnapshot({
      id: "sub_1",
      status: "active",
      items: { data: [
        { quantity: 2, current_period_end: 1_800_000_000, price: { id: "price_stocker" } },
        { quantity: 3, current_period_end: 1_700_000_000, price: { id: "price_stocker" } },
        { quantity: 99, current_period_end: 1_600_000_000, price: { id: "price_addon" } },
      ] },
    }, "price_stocker")).toEqual({
      subscriptionId: "sub_1",
      status: "active",
      quantity: 5,
      periodEnd: new Date(1_700_000_000 * 1000).toISOString(),
    });
    expect(() => subscriptionSnapshot({
      id: "sub_2",
      status: "active",
      items: { data: [{ quantity: 1, price: { id: "price_addon" } }] },
    }, "price_stocker")).toThrow("configured StockerAI price");
  });

  it("recognizes both new and grandfathered StockerAI prices", () => {
    expect(subscriptionSnapshot({
      id: "sub_legacy",
      status: "active",
      items: { data: [{ quantity: 4, price: { id: "price_legacy" } }] },
    }, ["price_monthly", "price_legacy"]).quantity).toBe(4);
  });

  it("blocks duplicate checkout for every nonterminal subscription state", () => {
    expect(isSubscriptionBlockingCheckout("active")).toBe(true);
    expect(isSubscriptionBlockingCheckout("trialing")).toBe(true);
    expect(isSubscriptionBlockingCheckout("past_due")).toBe(true);
    expect(isSubscriptionBlockingCheckout("canceled")).toBe(false);
    expect(isSubscriptionBlockingCheckout("incomplete_expired")).toBe(false);
  });
});
