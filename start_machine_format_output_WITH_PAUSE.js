// =============================================================================
// COPY THIS CODE INTO: start_machine workflow → "Format Output" node
// FIX: Adds machine_id + 4-period pause before count
// =============================================================================

// Get session data (includes machine_id)
var sessionData = $('Extract Session').first().json;

// Get item data from Select Item node
var itemData = $('Select Item').first().json;

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

// Format slot for TTS
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

// Parse products
var parsed = parseProduct(itemData.product_name);
var parsed2 = itemData.item2_product_name ? parseProduct(itemData.item2_product_name) : null;

// Generate voice text for 2-pick mode
function generateVoiceText(itemData, parsed, parsed2) {
  var directionPrefix = itemData.pick_direction === 'reverse'
    ? 'Starting from bottom. '
    : 'Starting from top. ';

  if (itemData.count === 2 && parsed2) {
    // Two items: "Product1 size type.... X count, Product2 size type.... X count"
    var item1Parts = [];
    if (parsed.name) item1Parts.push(fixPronunciation(parsed.name));
    if (parsed.size) item1Parts.push(fixPronunciation(parsed.size));
    if (parsed.type && parsed.name.toLowerCase().indexOf(parsed.type.toLowerCase()) === -1) {
      item1Parts.push(fixPronunciation(parsed.type));
    }
    item1Parts.push('.... ' + itemData.quantity + ' count');

    var item2Parts = [];
    if (parsed2.name) item2Parts.push(fixPronunciation(parsed2.name));
    if (parsed2.size) item2Parts.push(fixPronunciation(parsed2.size));
    if (parsed2.type && parsed2.name.toLowerCase().indexOf(parsed2.type.toLowerCase()) === -1) {
      item2Parts.push(fixPronunciation(parsed2.type));
    }
    item2Parts.push('.... ' + itemData.item2_quantity + ' count');

    return directionPrefix + item1Parts.join(' ') + ', ' + item2Parts.join(' ');
  } else {
    // Single item: "Product size type.... X count"
    var parts = [];
    if (parsed.name) parts.push(fixPronunciation(parsed.name));
    if (parsed.size) parts.push(fixPronunciation(parsed.size));
    if (parsed.type && parsed.name.toLowerCase().indexOf(parsed.type.toLowerCase()) === -1) {
      parts.push(fixPronunciation(parsed.type));
    }
    parts.push('.... ' + itemData.quantity + ' count');

    return directionPrefix + parts.join(' ');
  }
}

// Generate display text for 2-pick mode
function generateDisplayText(itemData, parsed, parsed2) {
  var directionPrefix = itemData.pick_direction === 'reverse'
    ? 'Starting from bottom. '
    : 'Starting from top. ';

  if (itemData.count === 2 && parsed2) {
    // Two items
    var item1 = parsed.name + (parsed.size ? ' (' + parsed.size + ')' : '') + ' X ' + itemData.quantity;
    var item2 = parsed2.name + (parsed2.size ? ' (' + parsed2.size + ')' : '') + ' X ' + itemData.item2_quantity;
    return directionPrefix + item1 + ', ' + item2;
  } else {
    // Single item
    var item = parsed.name + (parsed.size ? ' (' + parsed.size + ')' : '') + ' X ' + itemData.quantity;
    return directionPrefix + item;
  }
}

// Build output
var output = {
  action: 'item_ready',
  machine_complete: false,
  route_complete: false,
  session_complete: false,
  machine_id: sessionData.machine_id,  // ✅ CRITICAL FIX: Include machine_id for progress bar
  product_name: itemData.product_name,
  quantity: itemData.quantity,
  slot: itemData.slot,
  slot_spoken: formatSlotForTTS(itemData.slot),
  machine_name: '',
  inventory_current: itemData.inventory_current || 0,
  inventory_parlevel: itemData.inventory_parlevel || 0,
  items_remaining: itemData.total_items,
  direction: itemData.pick_direction,
  product_parsed: {
    name: parsed.name,
    size: parsed.size,
    type: parsed.type
  }
};

// Add item2 if present (2-pick mode)
if (itemData.count === 2 && itemData.item2_product_name) {
  output.item2 = {
    product_name: itemData.item2_product_name,
    quantity: itemData.item2_quantity,
    slot: itemData.item2_slot,
    slot_spoken: formatSlotForTTS(itemData.item2_slot),
    inventory_current: itemData.item2_inventory_current || 0,
    inventory_parlevel: itemData.item2_inventory_parlevel || 0,
    product_parsed: {
      name: parsed2.name,
      size: parsed2.size,
      type: parsed2.type
    }
  };
}

// Add display and voice text
output.display_text = generateDisplayText(itemData, parsed, parsed2);
output.voice_text = generateVoiceText(itemData, parsed, parsed2);
output.spoken = output.voice_text;

return [{ json: output }];
