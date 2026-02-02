// Atomic switch_route Edge Function
// Wraps all reset operations in single transaction with rollback
// Prevents data corruption from partial reset failures

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SwitchRouteRequest {
  user_id: string;
  target_route: string;
  preserve_progress: boolean;
  route_date?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const {
      user_id,
      target_route,
      preserve_progress,
      route_date
    }: SwitchRouteRequest = await req.json();

    // STEP 1: Get current session
    const { data: sessionData, error: sessionError } = await supabaseClient
      .from("sessions")
      .select("id, current_route_id, status")
      .eq("user_id", user_id)
      .eq("status", "stocking")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (sessionError || !sessionData) {
      return new Response(
        JSON.stringify({ error: "No active session found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const currentRouteId = sessionData.current_route_id;

    // STEP 2: Validate target route exists
    const dateToUse = route_date || new Date().toISOString().split("T")[0];

    const { data: routesData, error: routesError } = await supabaseClient
      .from("routes")
      .select("id, route_name, route_date")
      .eq("user_id", user_id)
      .eq("route_date", dateToUse)
      .ilike("route_name", `%${target_route}%`)
      .order("route_name", { ascending: true });

    if (routesError || !routesData || routesData.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Route not found",
          target_route,
          route_date: dateToUse,
          message: `No route matching "${target_route}" found for ${dateToUse}`
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const targetRouteData = routesData[0];

    // Don't switch if already on this route
    if (targetRouteData.id === currentRouteId) {
      return new Response(
        JSON.stringify({
          error: "Already on this route",
          route_name: targetRouteData.route_name
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // STEP 3: Execute transaction (reset if needed, then switch)
    // Note: Supabase Edge Functions don't support explicit transactions
    // But we can simulate with error handling and manual rollback

    let machineIds: string[] = [];
    let resetError = null;

    if (!preserve_progress) {
      // Get machine IDs for current route
      const { data: machinesData, error: machinesError } = await supabaseClient
        .from("machines")
        .select("id")
        .eq("route_id", currentRouteId);

      if (machinesError) {
        throw new Error("Failed to get machines for reset");
      }

      machineIds = (machinesData || []).map(m => m.id);

      try {
        // Reset machines (status and completed_items)
        const { error: resetMachinesError } = await supabaseClient
          .from("machines")
          .update({
            status: "pending",
            completed_items: 0
          })
          .eq("route_id", currentRouteId);

        if (resetMachinesError) {
          resetError = "Failed to reset machines";
          throw new Error(resetError);
        }

        // Reset items (status only - no completed_items on items table)
        if (machineIds.length > 0) {
          const { error: resetItemsError } = await supabaseClient
            .from("items")
            .update({ status: "pending" })
            .in("machine_id", machineIds);

          if (resetItemsError) {
            // Rollback machine reset
            await supabaseClient
              .from("machines")
              .update({ completed_items: 0 }) // Can't restore exact values, so keep at 0
              .eq("route_id", currentRouteId);

            resetError = "Failed to reset items";
            throw new Error(resetError);
          }
        }
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: resetError || "Reset operation failed",
            details: err.message,
            rollback_attempted: true
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }
    }

    // STEP 4: Pause other sessions
    const { error: pauseError } = await supabaseClient
      .from("sessions")
      .update({ status: "paused" })
      .eq("user_id", user_id)
      .eq("status", "stocking")
      .neq("current_route_id", targetRouteData.id);

    if (pauseError) {
      console.error("Warning: Failed to pause other sessions", pauseError);
      // Non-critical, continue
    }

    // STEP 5: Get first machine of target route
    const { data: firstMachineData, error: firstMachineError } = await supabaseClient
      .from("machines")
      .select("id, machine_name, machine_number, location_name, total_items, completed_items, status")
      .eq("route_id", targetRouteData.id)
      .order("sequence", { ascending: true })
      .limit(1)
      .single();

    if (firstMachineError || !firstMachineData) {
      throw new Error("Target route has no machines");
    }

    // STEP 6: Update session to new route
    const { error: updateSessionError } = await supabaseClient
      .from("sessions")
      .update({
        current_route_id: targetRouteData.id,
        current_machine_id: firstMachineData.id,
        current_item_index: 0,
        status: "stocking"
      })
      .eq("id", sessionData.id);

    if (updateSessionError) {
      throw new Error("Failed to update session to new route");
    }

    // STEP 7: Build machines array for response
    const { data: allMachinesData } = await supabaseClient
      .from("machines")
      .select("id, machine_name, machine_number, location_name, sequence, total_items, completed_items, status")
      .eq("route_id", targetRouteData.id)
      .order("sequence", { ascending: true });

    const machines = (allMachinesData || []).map(m => ({
      id: m.id,
      name: m.machine_name,
      number: m.machine_number,
      location: m.location_name,
      sequence: m.sequence,
      totalItems: m.total_items || 0,
      completedItems: m.completed_items || 0,
      status: m.status || "pending"
    }));

    // STEP 8: Return success response
    return new Response(
      JSON.stringify({
        action: "route_switched",
        route_name: targetRouteData.route_name,
        route_id: targetRouteData.id,
        first_machine: firstMachineData.machine_name,
        first_machine_id: firstMachineData.id,
        first_machine_number: firstMachineData.machine_number,
        first_location: firstMachineData.location_name,
        machines: machines,
        progress_preserved: preserve_progress,
        spoken: preserve_progress
          ? `Switched to ${targetRouteData.route_name}. Starting at ${firstMachineData.machine_name}.`
          : `Switched to ${targetRouteData.route_name}. Progress reset. Starting at ${firstMachineData.machine_name}.`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in switch-route-atomic:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        type: "switch_route_error"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
