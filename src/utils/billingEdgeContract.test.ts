import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const edgeSource = (name: string) => readFileSync(
  resolve(process.cwd(), `supabase/functions/${name}/index.ts`),
  "utf8",
);

describe("billing Edge boundary source contract", () => {
  it("binds checkout to account identity, admin authority, request identity, and fixed price config", () => {
    const source = edgeSource("create-checkout");
    expect(source).toContain("requirePrimaryAdministrator");
    expect(source).toContain("parseOperationId(body.operation_id)");
    expect(source).toContain("client_reference_id: account.id");
    expect(source).toContain("metadata: { account_id: account.id");
    expect(source).toContain("STRIPE_PRICE_ID");
    expect(source).toContain("idempotencyKey: checkoutIdempotencyKey");
    expect(source).toContain('rpc("reserve_billing_checkout"');
    expect(source).toContain('rpc("complete_billing_checkout"');
    expect(source).toContain("customers.search");
    expect(source).not.toContain("customers.list({ email");
  });

  it("uses the durable account customer for read and portal paths without mutating on reads", () => {
    const status = edgeSource("check-subscription");
    const portal = edgeSource("customer-portal");
    expect(status).toContain("account.stripe_customer_id");
    expect(status).not.toContain('.from("accounts")\n        .update');
    expect(status).not.toContain("customers.list({ email");
    expect(portal).toContain("requirePrimaryAdministrator");
    expect(portal).toContain("account.stripe_customer_id");
    expect(portal).not.toContain("customers.list({ email");
  });

  it("fails webhook writes closed and reconciles through ordered service-only RPCs", () => {
    const source = edgeSource("stripe-webhook");
    expect(source).toContain('rpc("claim_stripe_webhook_event"');
    expect(source).toContain('rpc("apply_stripe_account_state"');
    expect(source).toContain('rpc("finish_stripe_webhook_event"');
    expect(source).toContain('status: 500');
    expect(source).not.toContain('.from("profiles")');
    expect(source).not.toContain("Find user by email");
  });

  it("authorizes quantity changes and uses the shared billable-seat definition", () => {
    const source = edgeSource("update-subscription-quantity");
    expect(source).toContain("requirePrimaryAdministrator");
    expect(source).toContain("membership.role === 'driver'");
    expect(source).toContain("membership.can_upload_routes === true");
    expect(source).toContain("MINIMUM_BILLABLE_SEATS");
  });
});
