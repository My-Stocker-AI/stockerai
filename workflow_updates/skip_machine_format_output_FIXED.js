// Format Output node for skip_current_machine workflow
// FIX: Add action="next_machine" to trigger consistent machine transition handling
//
// This makes skip flow identical to completing a machine:
// 1. Workflow returns action="next_machine"
// 2. Frontend sets pendingMachineTransition
// 3. AI enters AWAITING DIRECTION state
// 4. User says "top" or "bottom"
// 5. Frontend calls start_machine with direction
//
// Workflow ID: ElCSMeguJNxwp0HO
// Node: Format Output

var processData = $('Prepare Session Update').first().json.process_data;
var itemData = null;

try {
  var inputItems = $input.all();
  if (inputItems.length > 0 && inputItems[0].json) {
    itemData = inputItems[0].json;
  }
} catch(e) {
  // No items
}

function formatSlotForTTS(slot) {
  if (!slot) return null;
  slot = String(slot);

  if (slot.indexOf('-') !== -1) {
    var parts = slot.split('-');
    var first = parseInt(parts[0], 10);
    var second = parseInt(parts[1], 10);
    if (!isNaN(first) && !isNaN(second)) {
      return 'slots ' + first + ' and ' + second;
    }
    return slot;
  }

  var num = parseInt(slot, 10);
  if (!isNaN(num)) {
    return 'slot ' + num;
  }

  return slot;
}

// Handle both: array from Supabase OR single object extracted by n8n
var item = {};
if (itemData) {
  if (Array.isArray(itemData) && itemData.length > 0) {
    item = itemData[0];
  } else if (typeof itemData === 'object' && itemData.id) {
    item = itemData;
  }
}

// Generate spoken response with variety
var spoken;
if (processData.route_complete) {
  var completePhrases = [
    'Skipped ' + processData.skipped_machine + '. That was the last machine.',
    'OK, skipping ' + processData.skipped_machine + '. No more machines on this route.',
    processData.skipped_machine + ' skipped. Route complete!'
  ];
  spoken = completePhrases[Math.floor(Math.random() * completePhrases.length)];
} else {
  // Simple skip announcement - AI will ask for direction based on action field
  var skipPhrases = [
    'Skipped ' + processData.skipped_machine + '. Next up is ' + processData.next_machine + ' at ' + processData.next_location + '.',
    'OK, skipping ' + processData.skipped_machine + '. Moving to ' + processData.next_machine + '.',
    processData.skipped_machine + ' skipped. On to ' + processData.next_machine + '.'
  ];
  spoken = skipPhrases[Math.floor(Math.random() * skipPhrases.length)];
}

return [{
  json: {
    // FIX: Add action field to trigger consistent machine transition handling
    action: processData.route_complete ? 'route_complete' : 'next_machine',

    skipped_machine: processData.skipped_machine,
    next_machine: processData.next_machine || null,
    next_machine_id: processData.next_machine_id || null,
    next_machine_number: processData.next_machine_number || null,
    next_location: processData.next_location || null,
    first_item: item.product_name || null,
    first_quantity: item.quantity || null,
    first_slot: item.slot || null,
    route_complete: processData.route_complete,
    spoken: spoken
  }
}];
