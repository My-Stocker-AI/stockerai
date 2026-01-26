// ============================================================================
// PHASE 2: COMPLETE FIX - Use webhook count parameter for items_to_increment
// ============================================================================
//
// BUG: Was using `item2 ? 2 : 1` which counts items found in sequence,
//      not items requested by user. This caused 3/5 instead of 5/5.
//
// ROOT CAUSE:
// - User requests count=2
// - Only 1 item exists in sequence (near end of list)
// - Workflow sets itemsToIncrement = 1 (based on item2 existence)
// - Database increments by 1, not 2
// - Result: completed_items = 3 after 3 API calls (2+1), not 5 after 3 calls (2+2+1)
//
// FIX:
// - Use count parameter directly: itemsToIncrement = count
// - Increment by what user REQUESTED, not what exists in sequence
// - Machine completion based on completed_items >= total_items (PATH 1)
// - Remove PATH 3 fallback (sequence exhaustion should never complete machine)
//
// CRITICAL CHANGES:
// 1. Line 194: itemsToIncrement = count (was: item2 ? 2 : 1)
// 2. Removed PATH 3 (lines 238-322) - no more "ran out of sequence" fallback
// 3. Added error handling if nextItem not found but machine incomplete
//
// Workflow: get_next_item (Optimized) - ID: iykbFj7f9222PF7r
// Node: "Determine Next State"
// ============================================================================

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

// CONCURRENT FIX: Store original index for optimistic lock check
var originalItemIndex = currentItemIndex;

// Find current machine (with completed_items from database)
var currentMachine = null;
var currentMachineSeq = 0;
for (var i = 0; i < machines.length; i++) {
  if (machines[i].id === currentMachineId) {
    currentMachine = machines[i];
    currentMachineSeq = machines[i].sequence;
    break;
  }
}

if (!currentMachine) {
  throw new Error('Current machine not found: ' + currentMachineId);
}

// PHASE 2: Use completed_items from database (PRIMARY source of truth)
var completedItems = currentMachine.completed_items || 0;
var totalItems = currentMachine.total_items;

// Calculate items remaining (per-machine, CONTRACT COMPLIANT)
var itemsRemaining = totalItems - completedItems;

// ============================================================================
// PATH 1: Machine already complete (completed_items >= total_items)
// ============================================================================
if (completedItems >= totalItems) {
  // Machine complete - move to next machine

  // Find next non-skipped machine
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
        completed_machine: currentMachine.machine_name,
        completed_machine_number: currentMachine.machine_number,
        completed_location: currentMachine.location_name,
        next_machine_id: nextMachine.id,
        next_machine: nextMachine.machine_name,
        next_machine_number: nextMachine.machine_number,
        next_location: nextMachine.location_name,
        new_item_index: 0,  // start_machine will set correct value
        new_machine_id: nextMachine.id,
        new_route_id: currentRouteId,
        session_record_id: session.id,
        machine_complete: true,
        route_complete: false,
        completed_items: completedItems,
        total_items: totalItems,
        original_item_index: originalItemIndex,
        expected_index: originalItemIndex
      }
    }];
  }

  // Check for skipped machines
  var skippedMachines = [];
  for (var i = 0; i < machines.length; i++) {
    if (machines[i].status === 'skipped') {
      skippedMachines.push(machines[i]);
    }
  }

  if (skippedMachines.length > 0) {
    var firstSkipped = skippedMachines[0];
    return [{
      json: {
        action: 'next_machine',
        completed_machine: currentMachine.machine_name,
        completed_machine_number: currentMachine.machine_number,
        completed_location: currentMachine.location_name,
        next_machine_id: firstSkipped.id,
        next_machine: firstSkipped.machine_name,
        next_machine_number: firstSkipped.machine_number,
        next_location: firstSkipped.location_name,
        new_item_index: 0,
        new_machine_id: firstSkipped.id,
        new_route_id: currentRouteId,
        session_record_id: session.id,
        machine_complete: true,
        route_complete: false,
        returning_to_skipped: true,
        completed_items: completedItems,
        total_items: totalItems,
        original_item_index: originalItemIndex,
        expected_index: originalItemIndex
      }
    }];
  }

  // Route complete
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
      completed_items: completedItems,
      total_items: totalItems,
      original_item_index: originalItemIndex,
      expected_index: originalItemIndex
    }
  }];
}

// ============================================================================
// PATH 2: Get next item (machine NOT complete)
// ============================================================================
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

  // CRITICAL FIX: Use count parameter, not item2 existence
  // User requested count=N, so increment by N (even if item2 doesn't exist in sequence)
  var itemsToIncrement = count;
  var newCompletedItems = completedItems + itemsToIncrement;
  var newItemsRemaining = totalItems - newCompletedItems;

  return [{
    json: {
      action: 'next_item',
      product_name: nextItem.product_name,
      quantity: nextItem.quantity,
      slot: nextItem.slot,
      slot_spoken: nextItem.slot_spoken || null,
      product_name2: item2 ? item2.product_name : null,
      quantity2: item2 ? item2.quantity : null,
      slot2: item2 ? item2.slot : null,
      slot_spoken2: item2 ? (item2.slot_spoken || null) : null,

      // INVENTORY FIX: Include inventory fields (Bug #1 from Jan 22)
      inventory_current: nextItem.inventory_current || 0,
      inventory_parlevel: nextItem.inventory_parlevel || 0,
      inventory_current2: item2 ? (item2.inventory_current || 0) : 0,
      inventory_parlevel2: item2 ? (item2.inventory_parlevel || 0) : 0,

      // PHASE 2: Use completed_items for progress tracking
      items_remaining: newItemsRemaining,
      completed_items: completedItems,  // Current count (before increment)
      items_to_increment: itemsToIncrement,  // How many to add (uses count param)
      new_completed_items: newCompletedItems,
      total_items: totalItems,
      machine_id: currentMachineId,  // For HTTP increment node
      machine_name: currentMachine.machine_name,

      item_index: newIndex,
      new_item_index: newIndex,
      new_machine_id: currentMachineId,
      new_route_id: currentRouteId,
      session_record_id: session.id,
      machine_complete: false,
      route_complete: false,

      // CONCURRENT FIX: Include optimistic lock fields
      original_item_index: originalItemIndex,
      expected_index: originalItemIndex
    }
  }];
}

// ============================================================================
// ERROR: No next item found but machine incomplete
// ============================================================================
// PATH 3 was removed - no more "ran out of sequence" fallback
// If nextItem is null but completed_items < total_items, this is a bug

throw new Error(
  'Item not found but machine incomplete. ' +
  'Index=' + currentItemIndex + ', ' +
  'completed=' + completedItems + '/' + totalItems + ', ' +
  'direction=' + pickDirection + '. ' +
  'This indicates start_machine set wrong initial index or items missing from database.'
);
