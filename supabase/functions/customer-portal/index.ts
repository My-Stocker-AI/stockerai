import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  BillingContractError,
  STRIPE_API_VERSION,
  getRequestOrigin,
  requirePrimaryAdministrator,
} from "../_shared/billing-contract.ts";

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
      .select("account_id, role, can_upload_routes")
      .eq("user_id", userData.user.id)
      .single();
    if (membershipError || !membership) throw new BillingContractError(403, "A single company membership is required.");
    requirePrimaryAdministrator({
      accountId: membership.account_id,
      role: membership.role,
      canUploadRoutes: membership.can_upload_routes === true,
    });

    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id, stripe_customer_id, is_platform_account")
      .eq("id", membership.account_id)
      .single();
    if (accountError || !account) throw new BillingContractError(404, "Company account not found.");
    if (account.is_platform_account) throw new BillingContractError(409, "Complimentary accounts do not use the Stripe portal.");
    if (!account.stripe_customer_id) throw new BillingContractError(409, "Subscribe before opening the billing portal.");

    const stripe = new Stripe(stripeKey, { apiVersion: STRIPE_API_VERSION });
    const customer = await stripe.customers.retrieve(account.stripe_customer_id);
    if (customer.deleted) throw new BillingContractError(409, "The linked billing customer no longer exists. Contact support.");
    if (customer.metadata.account_id && customer.metadata.account_id !== account.id) {
      throw new BillingContractError(409, "The billing customer is linked to a different company. Contact support.");
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: account.stripe_customer_id,
      return_url: `${origin}/dashboard/billing`,
    });
    return json(200, { url: portalSession.url }, origin);
  } catch (error) {
    const status = error instanceof BillingContractError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Billing portal failed.";
    console.error("[CUSTOMER-PORTAL] Request failed", { status, message });
    return json(status, { error: status === 500 ? "Billing portal could not be opened." : message }, origin);
  }
});
