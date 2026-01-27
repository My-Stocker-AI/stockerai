// ============================================================================
// COMPLETE FIX: Use completed_items for BOTH incrementing AND sequence lookup
// ============================================================================
//
// BUG 1: itemsToIncrement = item2 ? 2 : 1 (counted items found, not picked)
// FIX 1: itemsToIncrement = count (use webhook parameter)
//
// BUG 2: Uses current_item_index to find next sequence (breaks in reverse mode)
// FIX 2: Calculate targetSequence from completed_items, not current_item_index
//
// ROOT CAUSE:
// - current_item_index tracks position in sequence (1,2,3,4,5)
// - completed_items tracks items picked count (0→5)
// - These can diverge, causing "Item not found" errors
//
// EXAMPLE (reverse mode, 5 items):
// - Pick 4 items (5,4,3,2) → completed_items=4, current_item_index=1
// - OLD: Look for sequence 1-1=0 (doesn't exist) → ERROR
// - NEW: Look for sequence 5-4=1 (exists!) → Works
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

// FIX: Calculate target sequence from completed_items, not current_item_index
var targetSequence;
if (pickDirection === 'forward') {
  targetSequence = completedItems + 1;  // 0→1, 1→2, 2→3, etc.
} else {
  targetSequence = totalItems - completedItems;  // 5 items: 0→5, 1→4, 2→3, etc.
}

// Find item with target sequence
var nextItem = null;
for (var i = 0; i < items.length; i++) {
  if (items[i].sequence === targetSequence) {
    nextItem = items[i];
    break;
  }
}

if (nextItem) {
  var newIndex = targetSequence;  // Use target sequence as new index

  // Get item2 if count=2
  var item2 = null;
  if (count === 2) {
    var item2Sequence = pickDirection === 'reverse' ? targetSequence - 1 : targetSequence + 1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].sequence === item2Sequence) {
        item2 = items[i];
        break;
      }
    }
    if (item2) {
      newIndex = item2Sequence;
    }
  }

  // CRITICAL FIX: Use count parameter, not item2 existence
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
throw new Error(
  'Item not found but machine incomplete. ' +
  'targetSequence=' + targetSequence + ', ' +
  'completed=' + completedItems + '/' + totalItems + ', ' +
  'direction=' + pickDirection + '. ' +
  'This indicates items missing from database or sequence gap.'
);
