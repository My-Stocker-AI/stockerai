// ============================================================================
// SYSTEMIC FIX: Single-Counter Progress Tracking
// ============================================================================
// Replaces: Dual-counter system (current_item_index + completed_items)
// Uses: ONLY machines.completed_items for all progress tracking
//
// Benefits:
//   ✓ No counter divergence possible
//   ✓ Boundary protection built-in
//   ✓ Works for forward, reverse, skip, resume
//   ✓ Simpler logic, fewer bugs
// ============================================================================

var data = $input.item.json;

// Extract session data
var userId = data.user_id;
var count = data.count || 1;
var action = data.action;

// Extract machine data from Edge Function
var machineId = data.machine_id;
var machineName = data.machine_name;
var pickDirection = data.pick_direction || 'forward';
var totalItems = data.machine_total_items;
var completedItems = data.machine_completed_items || 0;

// Extract items array
var items = data.items || [];

// ============================================================================
// SINGLE-COUNTER ALGORITHM
// ============================================================================

// 1. Calculate how many items we CAN pick (boundary protection)
var itemsRemaining = totalItems - completedItems;
var itemsToPick = Math.min(count, itemsRemaining);

// 2. Calculate target sequences based on direction
var targetSequences = [];
if (pickDirection === 'forward') {
  // Forward: next unpicked items
  // Example: total=5, completed=0 → sequences=[1], completed=2 → sequences=[3,4]
  for (var i = 0; i < itemsToPick; i++) {
    targetSequences.push(completedItems + 1 + i);
  }
} else {
  // Reverse: count down from top
  // Example: total=5, completed=0 → sequences=[5], completed=2 → sequences=[3,2]
  for (var i = 0; i < itemsToPick; i++) {
    targetSequences.push(totalItems - completedItems - i);
  }
}

// 3. Find items by sequence
var nextItem = null;
var item2 = null;

for (var i = 0; i < items.length; i++) {
  if (items[i].sequence === targetSequences[0]) {
    nextItem = items[i];
  }
  if (targetSequences.length > 1 && items[i].sequence === targetSequences[1]) {
    item2 = items[i];
  }
}

// 4. Validate we found at least the first item
if (!nextItem) {
  // This should not happen if data is consistent
  // Return error for debugging
  return [{
    json: {
      action: 'error',
      error_message: 'Item not found at calculated sequence',
      debug: {
        completed_items: completedItems,
        total_items: totalItems,
        pick_direction: pickDirection,
        target_sequences: targetSequences,
        items_count: items.length,
        machine_id: machineId
      }
    }
  }];
}

// 5. Calculate new state after pick
var newCompletedItems = completedItems + itemsToPick;
var newItemsRemaining = totalItems - newCompletedItems;
var machineComplete = newCompletedItems >= totalItems;

// 6. Determine next action
var outputAction = 'next_item';
if (machineComplete) {
  outputAction = 'complete_machine';
}

// 7. Build output for workflow
return [{
  json: {
    // Action routing
    action: outputAction,
    machine_complete: machineComplete,
    route_complete: false, // Determined by downstream node

    // Item details for voice output
    product_name: nextItem.product_name,
    quantity: nextItem.quantity,
    slot: nextItem.slot,
    slot_spoken: nextItem.slot_spoken || null,
    product_name2: item2 ? item2.product_name : null,
    quantity2: item2 ? item2.quantity : null,
    slot2: item2 ? item2.slot : null,
    slot_spoken2: item2 ? (item2.slot_spoken || null) : null,

    // Inventory levels
    inventory_current: nextItem.inventory_current || 0,
    inventory_parlevel: nextItem.inventory_parlevel || 0,
    inventory_current2: item2 ? (item2.inventory_current || 0) : 0,
    inventory_parlevel2: item2 ? (item2.inventory_parlevel || 0) : 0,

    // Progress tracking (single counter)
    completed_items: completedItems,
    items_to_increment: itemsToPick,
    new_completed_items: newCompletedItems,
    total_items: totalItems,
    items_remaining: newItemsRemaining,

    // Machine/Route/Session IDs
    machine_id: machineId,
    machine_name: machineName,
    new_machine_id: machineId,
    new_route_id: data.route_id,
    session_record_id: data.session_record_id,

    // Debug info (for troubleshooting)
    _debug: {
      algorithm: 'single_counter',
      target_sequences: targetSequences,
      items_picked: itemsToPick,
      boundary_capped: itemsToPick < count
    }
  }
}];

// ============================================================================
// ALGORITHM VERIFICATION
// ============================================================================
// Forward count=2, boundary case:
//   total=5, completed=4, direction=forward, count=2
//   → itemsRemaining = 1
//   → itemsToPick = Math.min(2, 1) = 1
//   → targetSequences = [5]
//   → Pick item 5
//   → newCompleted = 4 + 1 = 5
//   → machineComplete = true ✓
//
// Reverse count=2, normal case:
//   total=5, completed=0, direction=reverse, count=2
//   → targetSequences = [5, 4]
//   → Pick items 5,4
//   → newCompleted = 0 + 2 = 2
//   → machineComplete = false ✓
//
// Resume from skip:
//   Skip at completed=2
//   Resume: completed_items = 2
//   Forward: targetSequences = [3]
//   Reverse: targetSequences = [3] (total=5, 5-2=3) ✓
// ============================================================================
