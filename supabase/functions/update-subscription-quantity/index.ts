import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
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
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Authenticate the requesting user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);

    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get account info
    const { data: accountUser } = await supabaseClient
      .from('account_users')
      .select('account_id, accounts:account_id(stripe_customer_id, is_platform_account)')
      .eq('user_id', user.id)
      .single();

    if (!accountUser?.accounts) {
      throw new Error("Account not found");
    }

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

    // Count current active drivers in account
    const { data: activeDrivers, error: countError } = await supabaseClient
      .from('account_users')
      .select('id, role')
      .eq('account_id', accountUser.account_id);

    if (countError) throw countError;

    const driverCount = activeDrivers?.filter(u => u.role === 'driver').length || 0;
    logStep("Active driver count calculated", { driverCount, totalUsers: activeDrivers?.length });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Get current subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      throw new Error("No active subscription found");
    }

    const subscription = subscriptions.data[0];
    const subscriptionItem = subscription.items.data[0];
    const currentQuantity = subscriptionItem.quantity || 0;

    logStep("Current subscription", {
      subscriptionId: subscription.id,
      currentQuantity,
      newQuantity: driverCount
    });

    // Only update if quantity changed
    if (currentQuantity === driverCount) {
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

    if (updateError) {
      logStep("Warning: Failed to update account driver_count", { error: updateError.message });
    }

    return new Response(JSON.stringify({
      success: true,
      driver_count: driverCount,
      subscription_id: updatedSubscription.id,
      message: `Subscription updated to ${driverCount} drivers. Prorated charge applied.`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in update-subscription-quantity", { message: errorMessage });

    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
