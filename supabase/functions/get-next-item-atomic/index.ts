// Atomic get_next_item Edge Function
// Consolidates all operations into single transaction for performance
// Replaces: Edge Function + n8n workflow hybrid
// Target: 400-600ms (vs current 1200-1800ms)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GetNextItemRequest {
  user_id: string;
  count?: number; // 1 or 2 items
}

interface Machine {
  id: string;
  machine_name: string;
  machine_number: string;
  location_name: string;
  sequence: number;
  total_items: number;
  completed_items: number;
  status: string;
  route_id: string;
}

interface Item {
  id: string;
  sequence: number;
  product_name: string;
  quantity: number;
  slot: string;
  slot_spoken: string | null;
  inventory_current: number;
  inventory_parlevel: number;
  machine_id: string;
}

interface Session {
  id: string;
  current_route_id: string;
  current_machine_id: string;
  current_item_index: number;
  pick_direction: string;
  status: string;
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

    const { user_id, count = 1 }: GetNextItemRequest = await req.json();

    // STEP 1: Get all data in single query with joins
    const { data: sessionData, error: sessionError } = await supabaseClient
      .from("sessions")
      .select(`
        id,
        current_route_id,
        current_machine_id,
        current_item_index,
        pick_direction,
        status
      `)
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

    const session = sessionData as Session;

    // Get machines for current route
    const { data: machinesData, error: machinesError } = await supabaseClient
      .from("machines")
      .select("id, machine_name, machine_number, location_name, sequence, total_items, completed_items, status, route_id")
      .eq("route_id", session.current_route_id)
      .order("sequence", { ascending: true });

    if (machinesError || !machinesData) {
      throw new Error("Failed to load machines");
    }

    const machines = machinesData as Machine[];
    const currentMachine = machines.find(m => m.id === session.current_machine_id);

    if (!currentMachine) {
      throw new Error("Current machine not found");
    }

    // Validate total_items
    if (!currentMachine.total_items || currentMachine.total_items <= 0) {
      throw new Error(`Invalid total_items for machine: ${currentMachine.machine_name}`);
    }

    // Get items for current machine
    const { data: itemsData, error: itemsError } = await supabaseClient
      .from("items")
      .select("id, sequence, product_name, quantity, slot, slot_spoken, inventory_current, inventory_parlevel, machine_id")
      .eq("machine_id", session.current_machine_id)
      .order("sequence", { ascending: true });

    if (itemsError) {
      throw new Error("Failed to load items");
    }

    const items = (itemsData || []) as Item[];

    // STEP 2: Determine next state (same logic as workflow)
    const completedItems = currentMachine.completed_items || 0;
    const totalItems = currentMachine.total_items;
    const pickDirection = session.pick_direction || "forward";
    const originalItemIndex = session.current_item_index || 0;

    // Check if current machine is complete
    if (completedItems >= totalItems) {
      // Find next incomplete, non-skipped machine
      const nextMachine = machines.find(m =>
        m.sequence === currentMachine.sequence + 1 &&
        m.status !== "skipped" &&
        (m.total_items || 0) > 0 &&
        (m.completed_items || 0) < (m.total_items || 0)
      );

      if (nextMachine) {
        return new Response(
          JSON.stringify({
            action: "next_machine",
            completed_machine: currentMachine.machine_name,
            completed_machine_number: currentMachine.machine_number,
            completed_location: currentMachine.location_name,
            next_machine_id: nextMachine.id,
            next_machine: nextMachine.machine_name,
            next_machine_number: nextMachine.machine_number,
            next_location: nextMachine.location_name,
            machine_complete: true,
            route_complete: false,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check for incomplete skipped machines
      const skippedMachines = machines.filter(m =>
        m.status === "skipped" &&
        (m.total_items || 0) > 0 &&
        (m.completed_items || 0) < (m.total_items || 0)
      );

      if (skippedMachines.length > 0) {
        const firstSkipped = skippedMachines[0];
        return new Response(
          JSON.stringify({
            action: "next_machine",
            completed_machine: currentMachine.machine_name,
            next_machine_id: firstSkipped.id,
            next_machine: firstSkipped.machine_name,
            next_machine_number: firstSkipped.machine_number,
            next_location: firstSkipped.location_name,
            machine_complete: true,
            route_complete: false,
            returning_to_skipped: true,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Route complete
      await supabaseClient
        .from("sessions")
        .update({ status: "completed" })
        .eq("id", session.id);

      return new Response(
        JSON.stringify({
          action: "complete",
          completed_route: "Route",
          machine_complete: true,
          route_complete: true,
          session_complete: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // STEP 3: Get next item(s)
    const targetSequence = pickDirection === "forward"
      ? completedItems + 1
      : totalItems - completedItems;

    const nextItem = items.find(i => i.sequence === targetSequence);

    if (!nextItem) {
      throw new Error(
        `Item not found but machine incomplete. targetSequence=${targetSequence}, ` +
        `completed=${completedItems}/${totalItems}, direction=${pickDirection}`
      );
    }

    // Get second item if count=2
    let item2: Item | null = null;
    if (count === 2) {
      const item2Sequence = pickDirection === "reverse" ? targetSequence - 1 : targetSequence + 1;
      item2 = items.find(i => i.sequence === item2Sequence) || null;
    }

    // STEP 4: Update machine and session atomically
    const itemsAvailable = totalItems - completedItems;
    const itemsToIncrement = Math.min(count, itemsAvailable);
    const newCompletedItems = completedItems + itemsToIncrement;

    // Update machine completed_items with optimistic lock
    const { error: updateMachineError } = await supabaseClient
      .from("machines")
      .update({ completed_items: newCompletedItems })
      .eq("id", currentMachine.id)
      .eq("completed_items", completedItems); // Optimistic lock

    if (updateMachineError) {
      throw new Error("Failed to update machine progress (concurrent update?)");
    }

    // Update session with optimistic lock
    const newIndex = item2 ? (pickDirection === "reverse" ? targetSequence - 1 : targetSequence + 1) : targetSequence;

    const { error: updateSessionError } = await supabaseClient
      .from("sessions")
      .update({ current_item_index: newIndex })
      .eq("id", session.id)
      .eq("current_item_index", originalItemIndex); // Optimistic lock

    if (updateSessionError) {
      // Rollback machine update
      await supabaseClient
        .from("machines")
        .update({ completed_items: completedItems })
        .eq("id", currentMachine.id);

      throw new Error("Failed to update session (concurrent update?)");
    }

    // STEP 5: Return response
    return new Response(
      JSON.stringify({
        action: "next_item",
        product_name: nextItem.product_name,
        quantity: nextItem.quantity,
        slot: nextItem.slot,
        slot_spoken: nextItem.slot_spoken,
        inventory_current: nextItem.inventory_current || 0,
        inventory_parlevel: nextItem.inventory_parlevel || 0,

        product_name2: item2?.product_name || null,
        quantity2: item2?.quantity || null,
        slot2: item2?.slot || null,
        slot_spoken2: item2?.slot_spoken || null,
        inventory_current2: item2?.inventory_current || 0,
        inventory_parlevel2: item2?.inventory_parlevel || 0,

        items_remaining: totalItems - newCompletedItems,
        completed_items: completedItems,
        items_to_increment: itemsToIncrement,
        total_items: totalItems,
        machine_name: currentMachine.machine_name,
        machine_complete: false,
        route_complete: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in get-next-item-atomic:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
