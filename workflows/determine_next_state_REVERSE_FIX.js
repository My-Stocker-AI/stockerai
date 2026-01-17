// FIXED: Determine Next State - Fix reverse mode new machine starting index
// Problem: When starting new machine in reverse mode, sets index=0, then looks for sequence=-1 (doesn't exist)
// Solution: Start reverse mode at highest sequence, forward mode at 0

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

var currentMachine = null;
var currentMachineSeq = 0;
for (var i = 0; i < machines.length; i++) {
  if (machines[i].id === currentMachineId) {
    currentMachine = machines[i];
    currentMachineSeq = machines[i].sequence;
    break;
  }
}

var nextItem = null;
if (pickDirection === 'reverse') {
  for (var i = 0; i < items.length; i++) {
    if (items[i].sequence === currentItemIndex - 1) {
      nextItem = items[i];
      break;
    }
  }
} else {
  for (var i = 0; i < items.length; i++) {
    if (items[i].sequence === currentItemIndex + 1) {
      nextItem = items[i];
      break;
    }
  }
}

if (nextItem) {
  var newIndex = pickDirection === 'reverse' ? currentItemIndex - 1 : currentItemIndex + 1;

  // Get item2 if count=2
  var item2 = null;
  if (count === 2) {
    var item2Index = pickDirection === 'reverse' ? newIndex - 1 : newIndex + 1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].sequence === item2Index) {
        item2 = items[i];
        break;
      }
    }
    if (item2) {
      newIndex = item2Index;
    }
  }

  var remaining = pickDirection === 'reverse' ? newIndex - 1 : items.length - newIndex;
  return [{
    json: {
      action: 'next_item',
      product_name: nextItem.product_name,
      quantity: nextItem.quantity,
      slot: nextItem.slot,
      machine_name: currentMachine ? currentMachine.machine_name : '',
      inventory_current: nextItem.inventory_current || 0,
      inventory_parlevel: nextItem.inventory_parlevel || 0,
      items_remaining: remaining,
      new_item_index: newIndex,
      new_machine_id: currentMachineId,
      new_route_id: currentRouteId,
      session_record_id: session.id,
      machine_complete: false,
      route_complete: false,
      session_complete: false,
      item2_product_name: item2 ? item2.product_name : null,
      item2_quantity: item2 ? item2.quantity : null,
      item2_slot: item2 ? item2.slot : null,
      item2_inventory_current: item2 ? (item2.inventory_current || 0) : null,
      item2_inventory_parlevel: item2 ? (item2.inventory_parlevel || 0) : null,
      count: count
    }
  }];
}

// Current machine is done, look for next machine
var nextMachine = null;
for (var i = 0; i < machines.length; i++) {
  if (machines[i].sequence === currentMachineSeq + 1 && machines[i].status !== 'skipped') {
    nextMachine = machines[i];
    break;
  }
}

if (nextMachine) {
  // FIXED: Calculate correct starting index based on pick direction
  var startingIndex;
  if (pickDirection === 'reverse') {
    // Reverse mode: start at highest sequence number
    startingIndex = items.length;
  } else {
    // Forward mode: start at 0
    startingIndex = 0;
  }

  return [{
    json: {
      action: 'next_machine',
      completed_machine: currentMachine ? currentMachine.machine_name : 'Machine',
      completed_machine_number: currentMachine ? currentMachine.machine_number : 0,
      completed_location: currentMachine ? currentMachine.location_name : '',
      next_machine_id: nextMachine.id,
      next_machine_name: nextMachine.machine_name,
      next_machine_number: nextMachine.machine_number,
      next_location: nextMachine.location_name,
      new_item_index: startingIndex,  // ← FIXED
      new_machine_id: nextMachine.id,
      new_route_id: currentRouteId,
      session_record_id: session.id,
      machine_complete: true,
      route_complete: false,
      session_complete: false,
      returning_to_skipped: false
    }
  }];
}

// NEW: No next non-skipped machine found, check for ANY skipped machines
var firstSkippedMachine = null;
for (var i = 0; i < machines.length; i++) {
  if (machines[i].status === 'skipped') {
    firstSkippedMachine = machines[i];
    break;
  }
}

if (firstSkippedMachine) {
  // FIXED: Calculate correct starting index for returning to skipped machine
  var startingIndex;
  if (pickDirection === 'reverse') {
    startingIndex = items.length;
  } else {
    startingIndex = 0;
  }

  // Found skipped machine, return to it (use next_machine action to reuse existing flow)
  return [{
    json: {
      action: 'next_machine',
      completed_machine: currentMachine ? currentMachine.machine_name : 'Machine',
      completed_machine_number: currentMachine ? currentMachine.machine_number : 0,
      completed_location: currentMachine ? currentMachine.location_name : '',
      next_machine_id: firstSkippedMachine.id,
      next_machine_name: firstSkippedMachine.machine_name,
      next_machine_number: firstSkippedMachine.machine_number,
      next_location: firstSkippedMachine.location_name,
      new_item_index: startingIndex,  // ← FIXED
      new_machine_id: firstSkippedMachine.id,
      new_route_id: currentRouteId,
      session_record_id: session.id,
      machine_complete: true,
      route_complete: false,
      session_complete: false,
      returning_to_skipped: true
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
    session_complete: true
  }
}];
