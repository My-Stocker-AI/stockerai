import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  BillingContractError,
  MINIMUM_BILLABLE_SEATS,
  STRIPE_API_VERSION,
  requirePrimaryAdministrator,
} from "../_shared/billing-contract.ts";
import {
  recognizedPriceIds,
  stripePriceConfiguration,
} from "../_shared/pricing-contract.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[UPDATE-SUBSCRIPTION-QUANTITY] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new BillingContractError(503, "Billing is not configured.");
    const priceConfig = stripePriceConfiguration((name) => Deno.env.get(name));
    const allowedPriceIds = recognizedPriceIds(priceConfig);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Authenticate the requesting user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new BillingContractError(401, "No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new BillingContractError(401, "Sign in to continue.");

    const user = userData.user;
    if (!user) throw new BillingContractError(401, "Sign in to continue.");
    logStep("User authenticated", { userId: user.id });

    // Get account info
    const { data: accountUser } = await supabaseClient
      .from('account_users')
      .select('account_id, role, can_upload_routes, accounts:account_id(stripe_customer_id, is_platform_account)')
      .eq('user_id', user.id)
      .single();

    if (!accountUser?.accounts) {
      throw new BillingContractError(403, "A single company membership is required.");
    }

    requirePrimaryAdministrator({
      accountId: accountUser.account_id,
      role: accountUser.role,
      canUploadRoutes: accountUser.can_upload_routes === true,
    });

    const account = Array.isArray(accountUser.accounts)
      ? accountUser.accounts[0]
      : accountUser.accounts;

    // Skip for platform accounts
    if (account.is_platform_account) {
      logStep("Platform account - skipping Stripe update");
      return new Response(JSON.stringify({
        success: true,
        message: "Platform account - no billing update needed"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const stripeCustomerId = account.stripe_customer_id;
    if (!stripeCustomerId) {
      throw new Error("No Stripe customer ID - user must subscribe first");
    }

    // The product's one billable-seat definition is shared with invitation
    // enforcement: drivers plus operational admins, with a two-seat minimum.
    const { data: activeDrivers, error: countError } = await supabaseClient
      .from('account_users')
      .select('id, role, can_upload_routes')
      .eq('account_id', accountUser.account_id);

    if (countError) throw countError;

    const billableSeatCount = activeDrivers?.filter((membership) =>
      membership.role === 'driver' ||
      (membership.role === 'primary_admin' && membership.can_upload_routes === true)
    ).length || 0;
    const driverCount = Math.max(MINIMUM_BILLABLE_SEATS, billableSeatCount);
    logStep("Active driver count calculated", { driverCount, totalUsers: activeDrivers?.length });

    const stripe = new Stripe(stripeKey, { apiVersion: STRIPE_API_VERSION });

    // Get current subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 100,
    });

    const subscription = subscriptions.data.find((candidate) =>
      candidate.status === 'active' || candidate.status === 'trialing'
    );
    if (!subscription) {
      throw new Error("No active subscription found");
    }
    const subscriptionItem = subscription.items.data.find((item) => allowedPriceIds.includes(item.price.id));
    if (!subscriptionItem) {
      throw new BillingContractError(409, "The active subscription does not contain the configured StockerAI price.");
    }
    const currentQuantity = subscriptionItem.quantity || 0;

    logStep("Current subscription", {
      subscriptionId: subscription.id,
      currentQuantity,
      newQuantity: driverCount,
    });

    // Only update if quantity changed
    if (currentQuantity === driverCount) {
      const { error: reconciliationError } = await supabaseClient
        .from('accounts')
        .update({ driver_count: driverCount })
        .eq('id', accountUser.account_id);
      if (reconciliationError) throw new Error(`Account reconciliation failed: ${reconciliationError.message}`);
      logStep("Quantity unchanged - no update needed");
      return new Response(JSON.stringify({
        success: true,
        message: "Quantity unchanged",
        driver_count: driverCount,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Update subscription quantity (Stripe auto-prorates)
    const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
      items: [{
        id: subscriptionItem.id,
        quantity: driverCount,
      }],
      proration_behavior: 'always_invoice', // Create invoice for prorated amount immediately
    });

    logStep("Subscription updated", {
      subscriptionId: updatedSubscription.id,
      newQuantity: driverCount,
      status: updatedSubscription.status
    });

    // Update accounts table
    const { error: updateError } = await supabaseClient
      .from('accounts')
      .update({ driver_count: driverCount })
      .eq('id', accountUser.account_id);

    if (updateError) throw new Error(`Subscription changed but account reconciliation failed: ${updateError.message}`);

    return new Response(JSON.stringify({
      success: true,
      driver_count: driverCount,
      subscription_id: updatedSubscription.id,
      message: `Subscription updated to ${driverCount} billable seats. Stripe calculated the proration from the configured price.`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const status = error instanceof BillingContractError ? error.status : 500;
    logStep("ERROR in update-subscription-quantity", { message: errorMessage });

    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });
  }
});
