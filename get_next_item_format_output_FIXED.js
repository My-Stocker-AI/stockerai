// =============================================================================
// FIXED: Added item2 support for count=2 mode
// =============================================================================

var data = $('Merge All Paths').first().json;

// ===== SEMANTIC PRODUCT PARSING =====
function parseProduct(productName) {
  if (!productName) return { name: '', size: '', type: '' };

  var text = productName.trim();

  // Extract size (numbers + oz/ml/g/ct/pk/count)
  var sizePattern = /(\d+(?:\.\d+)?)\s*(oz|ounce|ml|g|gram|ct|count|pk|pack)/gi;
  var sizeMatch = sizePattern.exec(text);
  var size = sizeMatch ? sizeMatch[0] : '';

  // Extract type (Can/Bottle/Bag/Box/Bar)
  var typePattern = /\b(can|bottle|bag|box|bar|pouch|packet|pack)\b/gi;
  var typeMatch = typePattern.exec(text);
  var type = typeMatch ? typeMatch[0] : '';

  // Remove size and type from name to get base product
  var name = text;
  if (size) {
    name = name.replace(sizePattern, '').trim();
  }
  if (type) {
    // Only remove standalone type word, not if it's part of brand name
    var typeWord = typeMatch[0];
    // Remove if it's at the end or followed by size/quantity
    name = name.replace(new RegExp('\\s*' + typeWord + '\\s*$', 'gi'), '');
    name = name.replace(new RegExp('\\s*' + typeWord + '\\s*-', 'gi'), ' -');
  }

  // Clean up extra whitespace, dashes, parentheses
  name = name.replace(/\s+/g, ' ').trim();
  name = name.replace(/\s*-\s*$/, '').trim();
  name = name.replace(/\(\s*\)/, '').trim();

  return {
    name: name,
    size: size,
    type: type
  };
}

// Fix TTS pronunciation issues
function fixPronunciation(text) {
  if (!text) return text;
  // Fix "Can" pronounced as "Kahn"
  text = text.replace(/\bCan\b/g, 'Kan');
  text = text.replace(/\bCAN\b/g, 'KAN');
  // Fix abbreviations
  text = text.replace(/\boz\b/gi, 'ounce');
  text = text.replace(/\bct\b/gi, 'count');
  text = text.replace(/\bpk\b/gi, 'pack');
  return text;
}

// Format slot for TTS (only for data field, not spoken)
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

// Generate formatted item text for count=1 or count=2
function formatItemText(quantity, parsed, includeSlot, slot) {
  var parts = [];
  parts.push(quantity);

  if (parsed.name) {
    parts.push(fixPronunciation(parsed.name));
  }

  if (parsed.size) {
    parts.push(fixPronunciation(parsed.size));
  }

  // Fix type duplication: if parsed.type is already in name, don't add it
  if (parsed.type) {
    var typeLower = parsed.type.toLowerCase();
    var nameLower = parsed.name.toLowerCase();
    if (nameLower.indexOf(typeLower) === -1) {
      // Type not in name, safe to add
      parts.push(fixPronunciation(parsed.type));
    }
  }

  if (includeSlot && slot) {
    parts.push('in');
    parts.push(formatSlotForTTS(slot));
  }

  return parts.join(' ');
}

// Generate optimized spoken response (NO slot, NO random prefixes)
function generateSpoken(action, data, parsed, parsed2) {
  if (action === 'next_item') {
    // Check if count=2 and we have item2
    if (data.count === 2 && data.item2_product_name) {
      // Format: "4 Coke Zero 12 ounce Kan, 2 Dr. Pepper 12 ounce Kan"
      var item1Text = formatItemText(data.quantity, parsed, false, null);
      var item2Text = formatItemText(data.item2_quantity, parsed2, false, null);
      return item1Text + ', ' + item2Text;
    } else {
      // Single item
      return formatItemText(data.quantity, parsed, false, null);
    }
  }

  if (action === 'next_machine') {
    // Machine complete - ask for direction
    return data.completed_machine + ' complete. Next is ' + data.next_machine + ' at ' + data.next_location + '. Top or bottom?';
  }

  if (action === 'complete') {
    // Route complete
    return data.completed_route + ' route complete. Nice work!';
  }

  return null;
}

// Build output object
var output = {
  action: data.action,
  machine_complete: data.machine_complete || false,
  route_complete: data.route_complete || false,
  session_complete: data.session_complete || false
};

var slotSpoken = null;
var parsed = null;
var parsed2 = null;

if (data.action === 'next_item') {
  parsed = parseProduct(data.product_name);

  output.product_name = data.product_name;
  output.quantity = data.quantity;
  output.slot = data.slot;
  slotSpoken = formatSlotForTTS(data.slot);
  output.slot_spoken = slotSpoken;
  output.machine_name = data.machine_name || '';
  output.inventory_current = data.inventory_current || 0;
  output.inventory_parlevel = data.inventory_parlevel || 0;
  output.items_remaining = data.items_remaining;

  // Add parsed fields for AI context
  output.product_parsed = {
    name: parsed.name,
    size: parsed.size,
    type: parsed.type
  };

  // Handle item2 if count=2
  if (data.count === 2 && data.item2_product_name) {
    parsed2 = parseProduct(data.item2_product_name);

    output.item2 = {
      product_name: data.item2_product_name,
      quantity: data.item2_quantity,
      slot: data.item2_slot,
      slot_spoken: formatSlotForTTS(data.item2_slot),
      inventory_current: data.item2_inventory_current || 0,
      inventory_parlevel: data.item2_inventory_parlevel || 0,
      product_parsed: {
        name: parsed2.name,
        size: parsed2.size,
        type: parsed2.type
      }
    };
  }
}

if (data.action === 'next_machine') {
  output.completed_machine = data.completed_machine;
  output.completed_location = data.completed_location;
  output.next_location = data.next_location;
  output.next_machine = data.next_machine;
  output.next_machine_id = data.new_machine_id;
  output.next_machine_number = data.next_machine_number;
}

if (data.action === 'complete') {
  output.completed_route = data.completed_route;
  output.total_routes = data.total_routes;
  output.message = 'All routes finished';
}

// Add spoken field for fast path
output.spoken = generateSpoken(data.action, data, parsed, parsed2);

return [{ json: output }];
