// ============================================================================
// PHASE 2: Complete "Determine Next State" - Use completed_items
// ============================================================================
//
// CRITICAL CHANGES:
// 1. Uses machines.completed_items from database (NOT session.current_item_index)
// 2. Calculates items_remaining = total_items - completed_items
// 3. Returns completed_items and items_to_increment for HTTP increment node
// 4. Checks completion: completed_items >= total_items
//
// PRESERVES ALL EXISTING FIXES:
// - Inventory fields (Bug #1 fix from Jan 22)
// - Concurrent request optimistic locking
// - Count=2 mode support
// - Reverse pick direction support
// - Skip machine handling
//
// CONTRACT COMPLIANCE:
// - machines.total_items = IMMUTABLE (never modified)
// - machines.completed_items = MUTABLE (0 → total_items, per-machine isolated)
// - Database is source of truth for completed_items
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
// Extract Consolidated Data maps machine_completed_items -> machines[i].completed_items
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
        new_item_index: 0,  // start_machine will set correct value
        new_machine_id: nextMachine.id,
        new_route_id: currentRouteId,
        machine_name: nextMachine.machine_name,
        location_name: nextMachine.location_name,
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
        new_item_index: 0,
        new_machine_id: firstSkipped.id,
        new_route_id: currentRouteId,
        machine_name: firstSkipped.machine_name,
        location_name: firstSkipped.location_name,
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

  // PHASE 2: Calculate items_remaining from completed_items (not derived from index)
  // After this item is picked, completed_items will be incremented by Increment node
  var itemsToIncrement = item2 ? 2 : 1;
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
      inventory_current2: item2 ? (item2.inventory_current || 0) : null,
      inventory_parlevel2: item2 ? (item2.inventory_parlevel || 0) : null,

      // PHASE 2: Use completed_items for progress tracking
      items_remaining: newItemsRemaining,
      completed_items: completedItems,  // Current count (before increment)
      items_to_increment: itemsToIncrement,  // How many to add (1 or 2)
      total_items: totalItems,
      machine_id: currentMachineId,  // For HTTP increment node

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
// PATH 3: No more items in sequence - machine complete
// ============================================================================
// This path means current_item_index reached end of items list
// Mark machine complete and move to next

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
      new_item_index: 0,
      new_machine_id: nextMachine.id,
      new_route_id: currentRouteId,
      machine_name: nextMachine.machine_name,
      location_name: nextMachine.location_name,
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
      new_item_index: 0,
      new_machine_id: firstSkipped.id,
      new_route_id: currentRouteId,
      machine_name: firstSkipped.machine_name,
      location_name: firstSkipped.location_name,
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
    completed_items: completedItems,
    total_items: totalItems,
    original_item_index: originalItemIndex,
    expected_index: originalItemIndex
  }
}];
