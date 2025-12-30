import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

// Stripe webhook secret - set this in Supabase secrets
const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    logStep("ERROR: No stripe-signature header");
    return new Response("No signature", { status: 400 });
  }

  if (!endpointSecret) {
    logStep("ERROR: STRIPE_WEBHOOK_SECRET not configured");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    logStep("ERROR: STRIPE_SECRET_KEY not set");
    return new Response("Stripe key not configured", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(body, signature, endpointSecret);

    logStep("Event received", { type: event.type, id: event.id });

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(supabaseClient, stripe, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(supabaseClient, stripe, subscription);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(supabaseClient, invoice);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(supabaseClient, invoice);
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(supabaseClient, stripe, session);
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logStep("ERROR processing webhook", { message: errorMessage });
    return new Response(`Webhook Error: ${errorMessage}`, { status: 400 });
  }
});

async function handleSubscriptionChange(
  supabase: any,
  stripe: Stripe,
  subscription: Stripe.Subscription
) {
  logStep("Processing subscription change", {
    subscriptionId: subscription.id,
    status: subscription.status,
    customerId: subscription.customer,
  });

  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id;

  // Get customer email
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) {
    logStep("Customer deleted, skipping");
    return;
  }

  const email = customer.email;
  if (!email) {
    logStep("No email for customer", { customerId });
    return;
  }

  // Get driver count from subscription
  const driverCount = subscription.items.data[0]?.quantity || 0;

  // Find user by email
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();

  if (!profile) {
    logStep("No profile found for email", { email });
    return;
  }

  // Find or create account for user
  const { data: accountUser } = await supabase
    .from('account_users')
    .select('account_id')
    .eq('user_id', profile.id)
    .single();

  if (accountUser) {
    // Update existing account
    const { error } = await supabase
      .from('accounts')
      .update({
        stripe_customer_id: customerId,
        subscription_status: subscription.status,
        driver_count: driverCount,
      })
      .eq('id', accountUser.account_id);

    if (error) {
      logStep("Error updating account", { error: error.message });
    } else {
      logStep("Account updated", {
        accountId: accountUser.account_id,
        status: subscription.status,
        driverCount
      });
    }
  } else {
    // Create new account and link user
    const { data: newAccount, error: createError } = await supabase
      .from('accounts')
      .insert({
        name: email.split('@')[0] + "'s Account",
        stripe_customer_id: customerId,
        subscription_status: subscription.status,
        driver_count: driverCount,
      })
      .select()
      .single();

    if (createError) {
      logStep("Error creating account", { error: createError.message });
      return;
    }

    // Link user to account
    const { error: linkError } = await supabase
      .from('account_users')
      .insert({
        account_id: newAccount.id,
        user_id: profile.id,
        role: 'primary_admin',
        can_view_all_routes: true,
      });

    if (linkError) {
      logStep("Error linking user to account", { error: linkError.message });
    } else {
      logStep("New account created and user linked", {
        accountId: newAccount.id,
        userId: profile.id
      });
    }
  }
}

async function handleSubscriptionDeleted(
  supabase: any,
  stripe: Stripe,
  subscription: Stripe.Subscription
) {
  logStep("Processing subscription deletion", {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
  });

  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id;

  // Update account status to canceled
  const { error } = await supabase
    .from('accounts')
    .update({
      subscription_status: 'canceled',
    })
    .eq('stripe_customer_id', customerId);

  if (error) {
    logStep("Error updating account to canceled", { error: error.message });
  } else {
    logStep("Account marked as canceled", { customerId });
  }
}

async function handlePaymentSucceeded(supabase: any, invoice: Stripe.Invoice) {
  logStep("Payment succeeded", {
    invoiceId: invoice.id,
    customerId: invoice.customer,
    amount: invoice.amount_paid,
  });

  const customerId = typeof invoice.customer === 'string'
    ? invoice.customer
    : invoice.customer?.id;

  if (!customerId) return;

  // Update account status to active (in case it was past_due)
  const { error } = await supabase
    .from('accounts')
    .update({
      subscription_status: 'active',
    })
    .eq('stripe_customer_id', customerId);

  if (error) {
    logStep("Error updating account after payment", { error: error.message });
  }
}

async function handlePaymentFailed(supabase: any, invoice: Stripe.Invoice) {
  logStep("Payment failed", {
    invoiceId: invoice.id,
    customerId: invoice.customer,
  });

  const customerId = typeof invoice.customer === 'string'
    ? invoice.customer
    : invoice.customer?.id;

  if (!customerId) return;

  // Update account status to past_due
  const { error } = await supabase
    .from('accounts')
    .update({
      subscription_status: 'past_due',
    })
    .eq('stripe_customer_id', customerId);

  if (error) {
    logStep("Error updating account to past_due", { error: error.message });
  } else {
    logStep("Account marked as past_due", { customerId });
  }
}

async function handleCheckoutCompleted(
  supabase: any,
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  logStep("Checkout completed", {
    sessionId: session.id,
    customerId: session.customer,
    mode: session.mode,
  });

  // If subscription mode, the subscription.created event will handle it
  if (session.mode === 'subscription' && session.subscription) {
    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription.id;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await handleSubscriptionChange(supabase, stripe, subscription);
  }
}
