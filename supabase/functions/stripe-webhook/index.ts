import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  STRIPE_API_VERSION,
  isSubscriptionBlockingCheckout,
  subscriptionSnapshot,
} from "../_shared/billing-contract.ts";

type ServiceClient = SupabaseClient;

function customerId(value: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function accountIdForCustomer(
  supabase: ServiceClient,
  customer: string,
  metadataAccountId?: string | null,
): Promise<string> {
  if (metadataAccountId) {
    const { data, error } = await supabase
      .from("accounts")
      .select("id, stripe_customer_id")
      .eq("id", metadataAccountId)
      .single();
    if (error || !data) throw new Error("Stripe metadata references an unknown company account.");
    if (data.stripe_customer_id && data.stripe_customer_id !== customer) {
      throw new Error("Stripe customer metadata conflicts with the durable company binding.");
    }
    return data.id;
  }

  const { data, error } = await supabase
    .from("accounts")
    .select("id")
    .eq("stripe_customer_id", customer)
    .single();
  if (error || !data) throw new Error("Stripe customer is not bound to exactly one company account.");
  return data.id;
}

async function applySubscription(
  supabase: ServiceClient,
  stripe: Stripe,
  priceId: string,
  subscriptionId: string,
  eventCreated: number,
  expectedAccountId?: string | null,
) {
  // Retrieve under the pinned API version instead of trusting a webhook
  // snapshot whose shape is fixed by the event's historical API version.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customer = customerId(subscription.customer);
  if (!customer) throw new Error("Subscription has no customer identity.");
  const metadataAccountId = subscription.metadata.account_id || expectedAccountId || null;
  if (subscription.metadata.account_id && expectedAccountId && subscription.metadata.account_id !== expectedAccountId) {
    throw new Error("Checkout and subscription company metadata disagree.");
  }
  const accountId = await accountIdForCustomer(supabase, customer, metadataAccountId);
  const snapshot = subscriptionSnapshot(subscription, priceId);
  const { data, error } = await supabase.rpc("apply_stripe_account_state", {
    p_account_id: accountId,
    p_customer_id: customer,
    p_subscription_id: snapshot.subscriptionId,
    p_subscription_status: snapshot.status,
    p_driver_count: snapshot.quantity,
    p_period_end: snapshot.periodEnd,
    p_event_created_at: new Date(eventCreated * 1000).toISOString(),
  });
  if (error) throw new Error(`Account billing state was not saved: ${error.message}`);
  return { accountId, applied: data === true };
}

async function applyCurrentCustomerSubscription(
  supabase: ServiceClient,
  stripe: Stripe,
  priceId: string,
  customer: string,
  eventCreated: number,
) {
  const subscriptions = await stripe.subscriptions.list({ customer, status: "all", limit: 100 });
  const subscription = subscriptions.data
    .filter((candidate) => isSubscriptionBlockingCheckout(candidate.status))
    .sort((left, right) => right.created - left.created)[0];
  if (!subscription) return { ignored: true };
  return applySubscription(supabase, stripe, priceId, subscription.id, eventCreated);
}

async function markCheckoutCompleted(
  supabase: ServiceClient,
  accountId: string,
  operationId?: string | null,
) {
  if (!operationId) return;
  const { error } = await supabase
    .from("billing_checkout_intents")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .eq("operation_id", operationId);
  if (error) throw new Error(`Checkout completion was not recorded: ${error.message}`);
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Use POST.", { status: 405 });
  const signature = req.headers.get("stripe-signature");
  const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const priceId = Deno.env.get("STRIPE_PRICE_ID");
  if (!signature) return new Response("Missing signature.", { status: 400 });
  if (!endpointSecret || !stripeKey || !priceId) return new Response("Webhook is not configured.", { status: 503 });

  const stripe = new Stripe(stripeKey, { apiVersion: STRIPE_API_VERSION });
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, endpointSecret);
  } catch {
    return new Response("Invalid webhook signature.", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const eventCreatedAt = new Date(event.created * 1000).toISOString();
  const { data: claim, error: claimError } = await supabase.rpc("claim_stripe_webhook_event", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_event_created_at: eventCreatedAt,
  });
  if (claimError) {
    console.error("[STRIPE-WEBHOOK] Event claim failed", { eventId: event.id, message: claimError.message });
    return new Response("Event could not be claimed.", { status: 500 });
  }
  if (claim === "processed") {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (claim === "processing") return new Response("Event is already being processed.", { status: 503 });

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const result = await applySubscription(
          supabase, stripe, priceId, subscription.id, event.created, subscription.metadata.account_id,
        );
        await markCheckoutCompleted(supabase, result.accountId, subscription.metadata.operation_id);
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
        if (!subscriptionId) throw new Error("Completed subscription checkout has no subscription identity.");
        const result = await applySubscription(
          supabase, stripe, priceId, subscriptionId, event.created, session.metadata?.account_id,
        );
        await markCheckoutCompleted(supabase, result.accountId, session.metadata?.operation_id);
        break;
      }
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customer = customerId(invoice.customer);
        if (!customer) throw new Error("Subscription invoice has no customer identity.");
        await applyCurrentCustomerSubscription(supabase, stripe, priceId, customer, event.created);
        break;
      }
      default:
        // Recording an unhandled signed event is intentional: it makes retries
        // idempotent without claiming that the event changed account state.
        break;
    }

    const { error: finishError } = await supabase.rpc("finish_stripe_webhook_event", {
      p_event_id: event.id,
      p_error: null,
    });
    if (finishError) throw new Error(`Event completion was not recorded: ${finishError.message}`);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    console.error("[STRIPE-WEBHOOK] Event processing failed", { eventId: event.id, type: event.type, message });
    const { error: finishError } = await supabase.rpc("finish_stripe_webhook_event", {
      p_event_id: event.id,
      p_error: message,
    });
    if (finishError) console.error("[STRIPE-WEBHOOK] Failure state was not recorded", { eventId: event.id });
    return new Response("Webhook processing failed.", { status: 500 });
  }
});
