// UPDATED: Now references Extract Consolidated Data instead of 3 separate nodes
// FIXED: Added count=2 support (same logic as old workflow)
var consolidated = $('Extract Consolidated Data').first().json;
var session = consolidated.session;
var items = consolidated.items;
var machines = consolidated.machines;

var currentItemIndex = session.current_item_index || 0;
var currentMachineId = session.current_machine_id;
var currentRouteId = session.current_route_id;
var pickDirection = session.pick_direction || 'forward';

// Get count parameter from webhook
var input = $('Webhook').first().json.body;
var count = input.count || 1;

var currentMachine = null;
var currentMachineSeq = 0;
for (var i = 0; i < machines.length; i++) {
  if (machines[i].id === currentMachineId) {
    currentMachine = machines[i];
    currentMachineSeq = machines[i].sequence;
    break;
  }
}

// Find next item (advance by count if count=2)
var nextItem = null;
var targetIndex;
if (pickDirection === 'reverse') {
  targetIndex = currentItemIndex - count;  // FIX: Use count instead of hardcoded -1
} else {
  targetIndex = currentItemIndex + count;  // FIX: Use count instead of hardcoded +1
}

for (var i = 0; i < items.length; i++) {
  if (items[i].sequence === targetIndex) {
    nextItem = items[i];
    break;
  }
}

// If count=2, also get item2
var item2 = null;
if (nextItem && count === 2) {
  var item2Index;
  if (pickDirection === 'reverse') {
    item2Index = targetIndex + 1;  // One before the target (going backwards)
  } else {
    item2Index = targetIndex - 1;  // One before the target (going forwards)
  }

  for (var i = 0; i < items.length; i++) {
    if (items[i].sequence === item2Index) {
      item2 = items[i];
      break;
    }
  }
}

if (nextItem) {
  var newIndex = targetIndex;
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
      // Add item2 data if count=2
      item2_product_name: item2 ? item2.product_name : null,
      item2_quantity: item2 ? item2.quantity : null,
      item2_slot: item2 ? item2.slot : null,
      item2_inventory_current: item2 ? (item2.inventory_current || 0) : null,
      item2_inventory_parlevel: item2 ? (item2.inventory_parlevel || 0) : null,
      count: count
    }
  }];
}

// No next item on current machine - look for next machine
var nextMachine = null;
for (var i = 0; i < machines.length; i++) {
  if (machines[i].sequence === currentMachineSeq + 1 && machines[i].status !== 'skipped') {
    nextMachine = machines[i];
    break;
  }
}

if (nextMachine) {
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
      new_item_index: 0,
      new_machine_id: nextMachine.id,
      new_route_id: currentRouteId,
      session_record_id: session.id,
      machine_complete: true,
      route_complete: false,
      session_complete: false
    }
  }];
}

// No next machine - route complete
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
