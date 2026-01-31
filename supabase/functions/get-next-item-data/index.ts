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

    const { user_id } = await req.json();
    if (!user_id) {
      throw new Error("user_id is required");
    }
    logStep("Request validated", { user_id });

    // Single consolidated query (replaces Get Session + Get Items + Get Machines)
    const { data, error } = await supabaseClient
      .rpc('get_next_item_data', { p_user_id: user_id });

    if (error) {
      logStep("Database error", { error: error.message });
      throw error;
    }

    if (!data || data.length === 0) {
      logStep("No active session found for user");
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // CRITICAL: Return structure that matches current workflow contract
    // Current workflow expects:
    // - Get Session returns: array with single session
    // - Get Items returns: array of items
    // - Get Machines returns: array of machines

    // Extract session (first row has session data)
    // SYSTEMIC FIX: Removed current_item_index (dual-counter eliminated)
    // Progress now tracked via machines.completed_items only
    const sessionArray = [{
      id: data[0].session_id,
      current_machine_id: data[0].current_machine_id,
      current_route_id: data[0].current_route_id,
      pick_direction: data[0].pick_direction
    }];

    // Extract unique machines from the result
    // CRITICAL FIX: Return ALL machines in route (not just current + next 2)
    // Bug: Route completion logic needs to see all remaining machines to decide next_machine vs complete
    const currentMachineId = data[0].current_machine_id;

    const machinesMap = new Map();
    data.forEach((row: any) => {
      if (row.machine_id && !machinesMap.has(row.machine_id)) {
        // Include ALL machines in the route (workflow needs full list for completion logic)
        machinesMap.set(row.machine_id, {
          id: row.machine_id,
          machine_name: row.machine_name,
          location_name: row.location_name,
          machine_number: row.machine_number,
          sequence: row.machine_sequence,
          status: row.machine_status,
          completed_items: row.machine_completed_items || 0,
          total_items: row.machine_total_items
        });
      }
    });

    // Extract items from the result (for current machine only)
    const items = data
      .filter((row: any) => row.item_id != null && row.machine_id === currentMachineId)
      .map((row: any) => ({
        id: row.item_id,
        product_name: row.product_name,
        quantity: row.quantity,
        slot: row.slot,
        sequence: row.item_sequence,
        status: row.item_status,
        inventory_current: row.inventory_current,
        inventory_parlevel: row.inventory_parlevel
      }));

    logStep("Query successful (optimized: current + next + skipped only)", {
      session_id: sessionArray[0].id,
      machines_count: machinesMap.size,
      items_count: items.length
    });

    // Return combined result with all three arrays
    // n8n will receive this as single response that we'll split in workflow
    return new Response(JSON.stringify({
      session: sessionArray,
      items: items,
      machines: Array.from(machinesMap.values())
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
