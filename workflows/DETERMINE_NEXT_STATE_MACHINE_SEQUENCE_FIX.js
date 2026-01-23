// =============================================================================
// ROOT CAUSE FIX: Machine sequencing ignores reverse pick direction
// BUG: Workflow looked for Machine 0 when finishing Machine 1 in reverse mode
// DATE: 2026-01-22
// =============================================================================
//
// PROBLEM: Lines 111-125 had this broken logic:
//   if (pickDirection === 'reverse') {
//     look for machines[i].sequence === currentMachineSeq - 1  // WRONG!
//   } else {
//     look for machines[i].sequence === currentMachineSeq + 1  // CORRECT
//   }
//
// WHY IT'S WRONG:
// - Reverse pick direction = pick items bottom-to-top ON THE SAME MACHINE
// - It has NOTHING to do with which machine comes next
// - You ALWAYS go Machine 1 → 2 → 3 → 4 → 5 → 6 → 7
// - Item order (top→bottom vs bottom→top) is independent of machine order
//
// RESULT:
// - When finishing Machine 1 (seq=1) in reverse mode
// - Workflow looked for machine with sequence 0 (1 - 1 = 0)
// - No Machine 0 exists
// - Workflow returned 'complete' instead of 'next_machine'
//
// FIX: Remove the if/else, always use currentMachineSeq + 1
//
// =============================================================================
// COPY THIS INTO: n8n workflow "Stocker Tool: get_next_item (Optimized)"
// NODE: "Determine Next State"
// REPLACE: Lines 109-125 (the section that finds next machine)
// =============================================================================

// Get count parameter from webhook
var input = $('Webhook').first().json.body;
var count = input.count || 1;

var consolidated = $('Extract Consolidated Data').first().json;
var session = consolidated.session;
var items = consolidated.items;
var machines = consolidated.machines;

var currentItemIndex = session.current_item_index || 0;
var currentMachineId = session.current_machine_id;
var currentRouteId = session.current_route_id;
var pickDirection = session.pick_direction || 'forward';

// FIX: When starting a new machine (index=0) in reverse mode, initialize to items.length
// This allows reverse mode to look for sequence = items.length - 1 (last item)
if (currentItemIndex === 0 && pickDirection === 'reverse' && items.length > 0) {
  currentItemIndex = items.length;
}

// CONCURRENT FIX: Store original index for optimistic lock check
var originalItemIndex = session.current_item_index || 0;  // Use original from session, not adjusted

var currentMachine = null;
var currentMachineSeq = 0;
for (var i = 0; i < machines.length; i++) {
  if (machines[i].id === currentMachineId) {
    currentMachine = machines[i];
    currentMachineSeq = machines[i].sequence;
    break;
  }
}

// Determine next item based on pick direction and count mode
var nextItem = null;
var item2 = null;

if (pickDirection === 'reverse') {
  // Reverse mode: pick from bottom to top
  for (var i = 0; i < items.length; i++) {
    if (items[i].sequence === currentItemIndex - 1) {
      nextItem = items[i];
      break;
    }
  }
  // Count=2 mode: get second item
  if (count === 2 && nextItem) {
    for (var j = 0; j < items.length; j++) {
      if (items[j].sequence === currentItemIndex - 2) {
        item2 = items[j];
        break;
      }
    }
  }
} else {
  // Forward mode: pick from top to bottom
  for (var i = 0; i < items.length; i++) {
    if (items[i].sequence === currentItemIndex + 1) {
      nextItem = items[i];
      break;
    }
  }
  // Count=2 mode: get second item
  if (count === 2 && nextItem) {
    for (var j = 0; j < items.length; j++) {
      if (items[j].sequence === currentItemIndex + 2) {
        item2 = items[j];
        break;
      }
    }
  }
}

if (nextItem) {
  // Calculate new index and remaining items
  var newIndex = pickDirection === 'reverse' ? currentItemIndex - (count === 2 && item2 ? 2 : 1) : currentItemIndex + (count === 2 && item2 ? 2 : 1);
  // FIX: Reverse mode calculation was off by 1
  var remaining = pickDirection === 'reverse' ? newIndex : items.length - newIndex;

  return [{
    json: {
      action: 'next_item',
      product_name: nextItem.product_name,
      quantity: nextItem.quantity,
      slot: nextItem.slot,
      // FIX: Add inventory fields
      inventory_current: nextItem.inventory_current || 0,
      inventory_parlevel: nextItem.inventory_parlevel || 0,
      // Count=2: Add second item fields
      product_name2: item2 ? item2.product_name : null,
      quantity2: item2 ? item2.quantity : null,
      slot2: item2 ? item2.slot : null,
      inventory_current2: item2 ? (item2.inventory_current || 0) : null,
      inventory_parlevel2: item2 ? (item2.inventory_parlevel || 0) : null,
      machine_name: currentMachine ? currentMachine.machine_name : '',
      items_remaining: remaining,
      new_item_index: newIndex,
      new_machine_id: currentMachineId,
      new_route_id: currentRouteId,
      session_record_id: session.id,
      machine_complete: false,
      route_complete: false,
      session_complete: false,
      // CONCURRENT FIX
      original_item_index: originalItemIndex,
      expected_index: originalItemIndex
    }
  }];
}

// =============================================================================
// ROOT CAUSE FIX: Machine sequencing is ALWAYS forward (1 → 2 → 3...)
// Reverse pick direction only affects ITEM order, not MACHINE order
// =============================================================================
var nextMachine = null;
for (var i = 0; i < machines.length; i++) {
  if (machines[i].sequence === currentMachineSeq + 1 && machines[i].status !== 'skipped') {
    nextMachine = machines[i];
    break;
  }
}

if (nextMachine) {
  // FIX BUG 2: Don't use current machine's items.length for next machine
  // The start_machine workflow will set the correct index after loading next machine's items
  return [{
    json: {
      action: 'next_machine',
      new_item_index: 0,  // Safe placeholder - start_machine will set correct value
      new_machine_id: nextMachine.id,
      new_route_id: currentRouteId,
      // Add First Item to Machine expects these field names (transforms to next_machine for Format Output)
      completed_machine: currentMachine ? currentMachine.machine_name : '',
      completed_location: currentMachine ? currentMachine.location_name : '',
      next_machine_name: nextMachine.machine_name,
      next_machine_number: nextMachine.sequence,
      next_location: nextMachine.location_name,
      session_record_id: session.id,
      machine_complete: true,
      route_complete: false,
      session_complete: false,
      // CONCURRENT FIX
      original_item_index: originalItemIndex,
      expected_index: originalItemIndex
    }
  }];
}

// No next machine - check for skipped machines
var skippedMachines = [];
for (var i = 0; i < machines.length; i++) {
  if (machines[i].status === 'skipped') {
    skippedMachines.push(machines[i]);
  }
}

if (skippedMachines.length > 0) {
  var firstSkipped = skippedMachines[0];

  // FIX BUG 2: Safe placeholder - start_machine will set correct value
  return [{
    json: {
      action: 'next_machine',
      new_item_index: 0,  // Safe placeholder - start_machine will set correct value
      new_machine_id: firstSkipped.id,
      new_route_id: currentRouteId,
      // Add First Item to Machine expects these field names (transforms to next_machine for Format Output)
      completed_machine: currentMachine ? currentMachine.machine_name : '',
      completed_location: currentMachine ? currentMachine.location_name : '',
      next_machine_name: firstSkipped.machine_name,
      next_machine_number: firstSkipped.sequence,
      next_location: firstSkipped.location_name,
      session_record_id: session.id,
      machine_complete: true,
      route_complete: false,
      session_complete: false,
      returning_to_skipped: true,
      // CONCURRENT FIX
      original_item_index: originalItemIndex,
      expected_index: originalItemIndex
    }
  }];
}

// No next machine and no skipped machines, route is truly complete
return [{
  json: {
    action: 'complete',
    completed_route: 'Route',
    total_routes: 1,
    session_record_id: session.id,
    new_status: 'completed',
    new_item_index: currentItemIndex,
    new_machine_id: currentMachineId,
    new_route_id: currentRouteId,
    machine_complete: true,
    route_complete: true,
    session_complete: true,
    // CONCURRENT FIX
    original_item_index: originalItemIndex,
    expected_index: originalItemIndex
  }
}];
