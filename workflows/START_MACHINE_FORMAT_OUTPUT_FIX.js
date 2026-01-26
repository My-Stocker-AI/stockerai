// =============================================================================
// start_machine workflow - Format Output node
// FIX: Return item1/item2 nested structure (contract compliance)
// =============================================================================

var data = $input.first().json;

// Build item1 object (always present when starting machine)
var item1 = {
  product_name: data.product_name,
  quantity: data.quantity,
  slot: data.slot,
  slot_spoken: data.slot_spoken || data.slot,
  inventory_current: data.inventory_current || 0,
  inventory_parlevel: data.inventory_parlevel || 0
};

// Build item2 object if present (2-pick mode)
var item2 = null;
if (data.product_name2) {
  item2 = {
    product_name: data.product_name2,
    quantity: data.quantity2,
    slot: data.slot2,
    slot_spoken: data.slot_spoken2 || data.slot2,
    inventory_current: data.inventory_current2 || 0,
    inventory_parlevel: data.inventory_parlevel2 || 0
  };
}

// Generate voice text
var voiceText = 'Starting from ' + data.direction + '. ';
voiceText += data.product_name + ' .... ' + data.quantity + ' count';
if (item2) {
  voiceText += ', ' + data.product_name2 + ' .... ' + data.quantity2 + ' count';
}

// Generate display text
var displayText = 'Starting from ' + data.direction + '. ';
displayText += data.product_name + ' X ' + data.quantity;
if (item2) {
  displayText += ', ' + data.product_name2 + ' X ' + data.quantity2;
}

// Return contract-compliant structure
return [{
  json: {
    machine_id: data.machine_id,
    machine_name: data.machine_name,
    direction: data.direction,
    items_remaining: data.items_remaining,
    new_item_index: data.new_item_index,
    item1: item1,  // ← CONTRACT COMPLIANCE
    item2: item2,  // ← CONTRACT COMPLIANCE (null if not present)
    voice_text: voiceText,
    display_text: displayText,
    spoken: voiceText
  }
}];
