import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GET-NEXT-ITEM-DATA] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { user_id, count = 1 } = await req.json();
    if (!user_id) {
      throw new Error("user_id is required");
    }
    logStep("Request validated", { user_id, count });

    // Call atomic RPC that calculates next item AND increments counter
    const { data, error } = await supabaseClient
      .rpc('get_next_item_and_increment', {
        p_user_id: user_id,
        p_count: count
      });

    if (error) {
      logStep("Database error", { error: error.message });
      throw error;
    }

    if (!data || data.length === 0) {
      logStep("No active session found for user");
      throw new Error("No active session found");
    }

    // RPC returns single row with all calculated data
    // No need to restructure - return directly
    logStep("RPC successful", {
      action: data[0].action,
      machine_id: data[0].machine_id,
      session_id: data[0].session_record_id
    });

    return new Response(JSON.stringify(data[0]), {
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
