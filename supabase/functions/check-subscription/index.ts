import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

// Calculate price per driver based on quantity (volume discounts)
const getPricePerDriver = (count: number): number => {
  if (count >= 21) return 15;
  if (count >= 6) return 18;
  return 20;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      logStep("No customer found, returning unsubscribed state");
      return new Response(JSON.stringify({ 
        subscribed: false,
        driver_count: 0,
        subscription_status: null,
        subscription_end: null,
        stripe_customer_id: null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    // Get all subscriptions to check status
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      logStep("No subscription found");
      return new Response(JSON.stringify({
        subscribed: false,
        driver_count: 0,
        subscription_status: null,
        subscription_end: null,
        stripe_customer_id: customerId,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const subscription = subscriptions.data[0];
    const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
    const driverCount = subscription.items.data[0]?.quantity || 0;
    const isActive = subscription.status === 'active' || subscription.status === 'trialing';
    
    logStep("Subscription found", { 
      subscriptionId: subscription.id, 
      status: subscription.status,
      driverCount,
      endDate: subscriptionEnd 
    });

    // Update the accounts table with subscription info
    const { data: accountUser } = await supabaseClient
      .from('account_users')
      .select('account_id')
      .eq('user_id', user.id)
      .single();

    if (accountUser) {
      const { error: updateError } = await supabaseClient
        .from('accounts')
        .update({
          stripe_customer_id: customerId,
          subscription_status: subscription.status,
          driver_count: driverCount,
        })
        .eq('id', accountUser.account_id);

      if (updateError) {
        logStep("Warning: Failed to update account", { error: updateError.message });
      } else {
        logStep("Account updated with subscription info");
      }
    }

    return new Response(JSON.stringify({
      subscribed: isActive,
      driver_count: driverCount,
      subscription_status: subscription.status,
      subscription_end: subscriptionEnd,
      stripe_customer_id: customerId,
      price_per_driver: getPricePerDriver(driverCount),
      monthly_total: getPricePerDriver(driverCount) * driverCount,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
