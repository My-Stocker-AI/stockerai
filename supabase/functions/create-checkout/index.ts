import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  BillingContractError,
  STRIPE_API_VERSION,
  checkoutIdempotencyKey,
  customerIdempotencyKey,
  getRequestOrigin,
  isSubscriptionBlockingCheckout,
  parseOperationId,
  parseRequestedSeatCount,
  requirePrimaryAdministrator,
} from "../_shared/billing-contract.ts";

const baseCorsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AccountRecord {
  id: string;
  name: string;
  stripe_customer_id: string | null;
  is_platform_account: boolean | null;
  min_drivers_required: number | null;
}

function json(status: number, body: unknown, origin?: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...baseCorsHeaders,
      ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
      "Content-Type": "application/json",
    },
  });
}

serve(async (req) => {
  let origin: string;
  try {
    origin = getRequestOrigin(req.headers.get("origin"), Deno.env.get("APP_URL"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Origin is not allowed.";
    return json(error instanceof BillingContractError ? error.status : 403, { error: message });
  }

  if (req.method === "OPTIONS") return new Response(null, { headers: { ...baseCorsHeaders, "Access-Control-Allow-Origin": origin, Vary: "Origin" } });
  if (req.method !== "POST") return json(405, { error: "Use POST." }, origin);

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const priceId = Deno.env.get("STRIPE_PRICE_ID");
    if (!stripeKey || !priceId) throw new BillingContractError(503, "Billing is not configured.");

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!/^Bearer\s+\S+$/i.test(authHeader)) throw new BillingContractError(401, "Sign in to continue.");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const { data: userData, error: userError } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (userError || !userData.user?.email) throw new BillingContractError(401, "Sign in to continue.");

    const { data: membership, error: membershipError } = await supabase
      .from("account_users")
      .select("account_id, role, can_upload_routes")
      .eq("user_id", userData.user.id)
      .single();
    if (membershipError || !membership) throw new BillingContractError(403, "A single company membership is required.");
    requirePrimaryAdministrator({
      accountId: membership.account_id,
      role: membership.role,
      canUploadRoutes: membership.can_upload_routes === true,
    });

    const { data: accountData, error: accountError } = await supabase
      .from("accounts")
      .select("id, name, stripe_customer_id, is_platform_account, min_drivers_required")
      .eq("id", membership.account_id)
      .single();
    if (accountError || !accountData) throw new BillingContractError(404, "Company account not found.");
    const account = accountData as AccountRecord;
    if (account.is_platform_account) throw new BillingContractError(409, "Complimentary accounts do not use Stripe checkout.");

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const driverCount = parseRequestedSeatCount(body.driver_count, account.min_drivers_required ?? 2);
    const operationId = parseOperationId(body.operation_id);

    const stripe = new Stripe(stripeKey, { apiVersion: STRIPE_API_VERSION });
    let customerId = account.stripe_customer_id;
    if (customerId) {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) throw new BillingContractError(409, "The linked billing customer no longer exists. Contact support.");
      if (customer.metadata.account_id && customer.metadata.account_id !== account.id) {
        throw new BillingContractError(409, "The billing customer is linked to a different company. Contact support.");
      }
      if (!customer.metadata.account_id) {
        await stripe.customers.update(customerId, { metadata: { ...customer.metadata, account_id: account.id } });
      }
    } else {
      const matches = await stripe.customers.search({
        query: `metadata['account_id']:'${account.id}'`,
        limit: 2,
      });
      if (matches.data.length > 1) {
        throw new BillingContractError(409, "More than one billing customer is linked to this company. Contact support.");
      }
      const customer = matches.data[0] ?? await stripe.customers.create({
          email: userData.user.email,
          name: account.name,
          metadata: { account_id: account.id },
        }, { idempotencyKey: customerIdempotencyKey(account.id) });
      customerId = customer.id;

      const { data: boundAccount, error: bindError } = await supabase
        .from("accounts")
        .update({ stripe_customer_id: customerId })
        .eq("id", account.id)
        .is("stripe_customer_id", null)
        .select("stripe_customer_id")
        .maybeSingle();
      if (bindError) throw new Error(`Could not save the billing customer: ${bindError.message}`);
      if (!boundAccount) {
        const { data: currentAccount, error: currentError } = await supabase
          .from("accounts")
          .select("stripe_customer_id")
          .eq("id", account.id)
          .single();
        if (currentError || currentAccount?.stripe_customer_id !== customerId) {
          throw new BillingContractError(409, "Billing setup changed concurrently. Retry from the billing page.");
        }
      }
    }

    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    if (subscriptions.data.some((subscription) => isSubscriptionBlockingCheckout(subscription.status))) {
      throw new BillingContractError(409, "This company already has a subscription. Use Manage Subscription instead.");
    }

    const reserve = async (requestedOperationId: string) => {
      const { data, error } = await supabase.rpc("reserve_billing_checkout", {
        p_account_id: account.id,
        p_operation_id: requestedOperationId,
        p_driver_count: driverCount,
      });
      if (error || !data?.[0]) {
        throw new BillingContractError(409, error?.message ?? "Checkout could not be reserved.");
      }
      return data[0] as {
        operation_id: string;
        driver_count: number;
        status: string;
        stripe_checkout_session_id: string | null;
        stripe_checkout_url: string | null;
      };
    };

    let reservation = await reserve(operationId);
    if (reservation.stripe_checkout_session_id) {
      const reservedSession = await stripe.checkout.sessions.retrieve(reservation.stripe_checkout_session_id);
      if (reservedSession.status === "open" && reservedSession.url) {
        return json(200, { url: reservedSession.url, reused: true }, origin);
      }
      if (reservedSession.status === "complete") {
        throw new BillingContractError(409, "Checkout is already complete. Refresh subscription status.");
      }
      const { error: expireError } = await supabase.rpc("expire_billing_checkout", {
        p_account_id: account.id,
        p_operation_id: reservation.operation_id,
      });
      if (expireError) throw new Error(`Expired checkout could not be released: ${expireError.message}`);
      reservation = await reserve(crypto.randomUUID());
    }

    const openSessions = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 });
    const existingSession = openSessions.data.find((session) =>
      session.client_reference_id === account.id && session.metadata?.account_id === account.id && session.url
    );
    if (existingSession?.url) {
      const { error: completeError } = await supabase.rpc("complete_billing_checkout", {
        p_account_id: account.id,
        p_operation_id: reservation.operation_id,
        p_session_id: existingSession.id,
        p_session_url: existingSession.url,
      });
      if (completeError) throw new Error(`Existing checkout could not be recorded: ${completeError.message}`);
      return json(200, { url: existingSession.url, reused: true }, origin);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: account.id,
      line_items: [{ price: priceId, quantity: driverCount }],
      mode: "subscription",
      success_url: `${origin}/dashboard/billing?success=true`,
      cancel_url: `${origin}/dashboard/billing?canceled=true`,
      metadata: { account_id: account.id, operation_id: reservation.operation_id, driver_count: String(driverCount) },
      subscription_data: {
        trial_period_days: 14,
        metadata: { account_id: account.id, operation_id: reservation.operation_id, driver_count: String(driverCount) },
      },
      allow_promotion_codes: true,
    }, { idempotencyKey: checkoutIdempotencyKey(account.id, reservation.operation_id) });

    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    const { error: completeError } = await supabase.rpc("complete_billing_checkout", {
      p_account_id: account.id,
      p_operation_id: reservation.operation_id,
      p_session_id: session.id,
      p_session_url: session.url,
    });
    if (completeError) throw new Error(`Checkout was created but could not be recorded: ${completeError.message}`);
    return json(200, { url: session.url, reused: false }, origin);
  } catch (error) {
    const status = error instanceof BillingContractError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Checkout failed.";
    console.error("[CREATE-CHECKOUT] Request failed", { status, message });
    return json(status, { error: status === 500 ? "Checkout could not be created." : message }, origin);
  }
});
