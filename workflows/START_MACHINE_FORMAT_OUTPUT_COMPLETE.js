// =============================================================================
// start_machine workflow - Format Output node (COMPLETE)
// FIX: Return item1/item2 nested structure (contract compliance)
// =============================================================================

var data = $input.first().json;

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

// Generate voice text for start_machine
function generateVoiceText(data, parsed, parsed2) {
  var voiceText = 'Starting from ' + data.direction + '. ';

  // Item 1
  var parts = [];
  if (parsed.name) parts.push(fixPronunciation(parsed.name));
  if (parsed.size) parts.push(fixPronunciation(parsed.size));
  if (parsed.type && parsed.name.toLowerCase().indexOf(parsed.type.toLowerCase()) === -1) {
    parts.push(fixPronunciation(parsed.type));
  }
  parts.push('.... ' + data.quantity + ' count');
  voiceText += parts.join(' ');

  // Item 2 (if present)
  if (data.product_name2 && parsed2) {
    var parts2 = [];
    if (parsed2.name) parts2.push(fixPronunciation(parsed2.name));
    if (parsed2.size) parts2.push(fixPronunciation(parsed2.size));
    if (parsed2.type && parsed2.name.toLowerCase().indexOf(parsed2.type.toLowerCase()) === -1) {
      parts2.push(fixPronunciation(parsed2.type));
    }
    parts2.push('.... ' + data.quantity2 + ' count');
    voiceText += ', ' + parts2.join(' ');
  }

  return voiceText;
}

// Generate display text (UI only)
function generateDisplayText(data, parsed, parsed2) {
  var displayText = 'Starting from ' + data.direction + '. ';
  displayText += parsed.name + (parsed.size ? ' (' + parsed.size + ')' : '') + ' X ' + data.quantity;

  if (data.product_name2 && parsed2) {
    displayText += ', ' + parsed2.name + (parsed2.size ? ' (' + parsed2.size + ')' : '') + ' X ' + data.quantity2;
  }

  return displayText;
}

// Parse first item
var parsed = parseProduct(data.product_name);

// Build item1 object (always present)
var item1 = {
  product_name: data.product_name,
  quantity: data.quantity,
  slot: data.slot,
  slot_spoken: formatSlotForTTS(data.slot),
  inventory_current: data.inventory_current || 0,
  inventory_parlevel: data.inventory_parlevel || 0,
  product_parsed: {
    name: parsed.name,
    size: parsed.size,
    type: parsed.type
  }
};

// Build item2 object if present (2-pick mode)
var item2 = null;
var parsed2 = null;
if (data.product_name2) {
  parsed2 = parseProduct(data.product_name2);

  item2 = {
    product_name: data.product_name2,
    quantity: data.quantity2,
    slot: data.slot2,
    slot_spoken: formatSlotForTTS(data.slot2),
    inventory_current: data.inventory_current2 || 0,
    inventory_parlevel: data.inventory_parlevel2 || 0,
    product_parsed: {
      name: parsed2.name,
      size: parsed2.size,
      type: parsed2.type
    }
  };
}

// Build output with contract-compliant structure
var output = {
  machine_id: data.machine_id,
  machine_name: data.machine_name,
  direction: data.direction,
  items_remaining: data.items_remaining,
  new_item_index: data.new_item_index,
  item1: item1,  // ← CONTRACT COMPLIANCE
  item2: item2,  // ← CONTRACT COMPLIANCE (null if not present)
  voice_text: generateVoiceText(data, parsed, parsed2),
  display_text: generateDisplayText(data, parsed, parsed2)
};

// Add spoken field (alias for voice_text)
output.spoken = output.voice_text;

return [{ json: output }];
