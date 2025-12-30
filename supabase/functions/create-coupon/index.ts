import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-COUPON] ${step}${detailsStr}`);
};

// Platform admin emails who can create coupons
const PLATFORM_ADMIN_EMAILS = ['russ@visionairy.biz'];

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

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");

    // Check if platform admin
    if (!PLATFORM_ADMIN_EMAILS.includes(user.email)) {
      throw new Error("Only platform admins can create coupons");
    }
    logStep("Platform admin verified", { email: user.email });

    // Parse request body
    const {
      code,
      discount_percent,
      max_uses,
      duration_type,  // 'once', 'repeating', 'forever'
      duration_months // only for 'repeating'
    } = await req.json();

    if (!code || !discount_percent) {
      throw new Error("Code and discount_percent are required");
    }
    logStep("Request parsed", { code, discount_percent, duration_type, duration_months, max_uses });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Create Stripe coupon
    const couponParams: Stripe.CouponCreateParams = {
      percent_off: discount_percent,
      duration: duration_type || 'once',
      max_redemptions: max_uses || undefined,
      name: `${code} - ${discount_percent}% off`,
    };

    // Add duration_in_months for repeating duration
    if (duration_type === 'repeating' && duration_months) {
      couponParams.duration_in_months = duration_months;
    }

    const stripeCoupon = await stripe.coupons.create(couponParams);
    logStep("Stripe coupon created", { couponId: stripeCoupon.id });

    // Create Stripe promotion code (customer-facing code)
    const promoCode = await stripe.promotionCodes.create({
      coupon: stripeCoupon.id,
      code: code.toUpperCase(),
      max_redemptions: max_uses || undefined,
    });
    logStep("Stripe promotion code created", { promoCodeId: promoCode.id, code: promoCode.code });

    // Calculate expires_at based on duration
    let expiresAt = null;
    if (duration_type === 'once') {
      // One-time use codes expire in 1 year by default
      expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    } else if (duration_type === 'repeating' && duration_months) {
      // Repeating expires after the duration period
      expiresAt = new Date(Date.now() + duration_months * 30 * 24 * 60 * 60 * 1000).toISOString();
    }
    // 'forever' has no expiration

    // Save to Supabase
    const { data: discountCode, error: insertError } = await supabaseClient
      .from('discount_codes')
      .insert({
        code: code.toUpperCase(),
        discount_type: 'percent',
        discount_value: discount_percent,
        max_uses: max_uses || null,
        duration_months: duration_months || null,
        expires_at: expiresAt,
        stripe_coupon_id: stripeCoupon.id,
        stripe_promo_code_id: promoCode.id,
        times_used: 0,
      })
      .select()
      .single();

    if (insertError) {
      // If DB insert fails, try to delete the Stripe coupon
      try {
        await stripe.coupons.del(stripeCoupon.id);
      } catch (e) {
        logStep("Warning: Failed to cleanup Stripe coupon after DB error");
      }
      throw new Error(`Database error: ${insertError.message}`);
    }
    logStep("Discount code saved to database", { id: discountCode.id });

    return new Response(JSON.stringify({
      success: true,
      discount_code: discountCode,
      stripe_coupon_id: stripeCoupon.id,
      stripe_promo_code: promoCode.code,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
