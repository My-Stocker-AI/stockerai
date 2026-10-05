import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  BillingContractError,
  STRIPE_API_VERSION,
  getRequestOrigin,
  subscriptionSnapshot,
} from "../_shared/billing-contract.ts";
import {
  BILLING_TERM_MONTHS,
  BillingTerm,
  PRICING_VERSION,
  billingTermForPriceId,
  calculateMonthlyPriceCents,
  calculateTermPriceCents,
  recognizedPriceIds,
  stripePriceConfiguration,
} from "../_shared/pricing-contract.ts";

const baseCorsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    if (!stripeKey) throw new BillingContractError(503, "Billing is not configured.");
    const priceConfig = stripePriceConfiguration((name) => Deno.env.get(name));
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!/^Bearer\s+\S+$/i.test(authHeader)) throw new BillingContractError(401, "Sign in to continue.");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const { data: userData, error: userError } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (userError || !userData.user) throw new BillingContractError(401, "Sign in to continue.");

    const { data: membership, error: membershipError } = await supabase
      .from("account_users")
      .select("account_id")
      .eq("user_id", userData.user.id)
      .single();
    if (membershipError || !membership) throw new BillingContractError(403, "A single company membership is required.");

    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id, driver_count, subscription_status, stripe_customer_id, is_platform_account")
      .eq("id", membership.account_id)
      .single();
    if (accountError || !account) throw new BillingContractError(404, "Company account not found.");

    if (account.is_platform_account) {
      return json(200, {
        subscribed: true,
        complimentary: true,
        driver_count: account.driver_count ?? 0,
        subscription_status: "active",
        subscription_end: null,
        stripe_customer_id: null,
      }, origin);
    }
    if (!account.stripe_customer_id) {
      return json(200, {
        subscribed: false,
        complimentary: false,
        driver_count: account.driver_count ?? 0,
        subscription_status: null,
        subscription_end: null,
        stripe_customer_id: null,
      }, origin);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: STRIPE_API_VERSION });
    const customer = await stripe.customers.retrieve(account.stripe_customer_id);
    if (customer.deleted) throw new BillingContractError(409, "The linked billing customer no longer exists. Contact support.");
    if (customer.metadata.account_id && customer.metadata.account_id !== account.id) {
      throw new BillingContractError(409, "The billing customer is linked to a different company. Contact support.");
    }

    const subscriptions = await stripe.subscriptions.list({ customer: account.stripe_customer_id, status: "all", limit: 100 });
    const subscription = subscriptions.data
      .filter((candidate) => !["canceled", "incomplete_expired"].includes(candidate.status))
      .sort((left, right) => right.created - left.created)[0];
    if (!subscription) {
      return json(200, {
        subscribed: false,
        complimentary: false,
        driver_count: account.driver_count ?? 0,
        subscription_status: null,
        subscription_end: null,
        stripe_customer_id: account.stripe_customer_id,
      }, origin);
    }

    const allowedPriceIds = recognizedPriceIds(priceConfig);
    const snapshot = subscriptionSnapshot(subscription, allowedPriceIds);
    const active = subscription.status === "active" || subscription.status === "trialing";
    const stockerItem = subscription.items.data.find((item) => allowedPriceIds.includes(item.price.id));
    if (!stockerItem) throw new BillingContractError(409, "The subscription does not contain a recognized StockerAI price.");
    const billingTerm = billingTermForPriceId(priceConfig, stockerItem.price.id);
    if (!billingTerm) throw new BillingContractError(409, "The subscription billing term is not recognized.");
    const firstUnitAmount = stockerItem.price.unit_amount;
    const pricePerDriver = typeof firstUnitAmount === "number" ? firstUnitAmount / 100 : null;
    const isCurrentPricing = billingTerm !== "legacy" && subscription.metadata.pricing_version === PRICING_VERSION;
    const currentTerm = isCurrentPricing ? billingTerm as BillingTerm : null;
    const monthlyTotal = currentTerm
      ? calculateMonthlyPriceCents(snapshot.quantity) / 100
      : (pricePerDriver === null ? null : pricePerDriver * snapshot.quantity);
    const termTotal = currentTerm
      ? calculateTermPriceCents(snapshot.quantity, currentTerm) / 100
      : monthlyTotal;

    return json(200, {
      subscribed: active,
      complimentary: false,
      driver_count: snapshot.quantity,
      subscription_status: snapshot.status,
      subscription_end: snapshot.periodEnd,
      trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      stripe_customer_id: account.stripe_customer_id,
      billing_term: billingTerm,
      pricing_version: subscription.metadata.pricing_version || (billingTerm === "legacy" ? "legacy" : null),
      cancel_at_period_end: subscription.cancel_at_period_end,
      ...(monthlyTotal === null ? {} : { monthly_total: monthlyTotal }),
      ...(termTotal === null ? {} : { term_total: termTotal }),
      ...(currentTerm ? { billing_months: BILLING_TERM_MONTHS[currentTerm] } : {}),
      ...(pricePerDriver === null ? {} : { price_per_driver: pricePerDriver }),
    }, origin);
  } catch (error) {
    const status = error instanceof BillingContractError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Subscription lookup failed.";
    console.error("[CHECK-SUBSCRIPTION] Request failed", { status, message });
    return json(status, { error: status === 500 ? "Subscription status could not be loaded." : message }, origin);
  }
});
