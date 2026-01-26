// =============================================================================
// get_next_item (Optimized) workflow - Format Output node
// FIXES: next_machine field, typo on line 44
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
    name = name.replace(new RegExp('\\s*' + typeWord + '\\s*$', 'gi'), '');  // ← TYPO FIXED
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

// Generate optimized spoken response with ".... X count" format
function generateSpoken(action, data, parsed, parsed2) {
  if (action === 'next_item') {
    if (data.product_name2 && parsed2) {
      var item1Parts = [];
      if (parsed.name) item1Parts.push(fixPronunciation(parsed.name));
      if (parsed.size) item1Parts.push(fixPronunciation(parsed.size));
      if (parsed.type && parsed.name.toLowerCase().indexOf(parsed.type.toLowerCase()) === -1) {
        item1Parts.push(fixPronunciation(parsed.type));
      }
      item1Parts.push('.... ' + data.quantity + ' count');

      var item2Parts = [];
      if (parsed2.name) item2Parts.push(fixPronunciation(parsed2.name));
      if (parsed2.size) item2Parts.push(fixPronunciation(parsed2.size));
      if (parsed2.type && parsed2.name.toLowerCase().indexOf(parsed2.type.toLowerCase()) === -1) {
        item2Parts.push(fixPronunciation(parsed2.type));
      }
      item2Parts.push('.... ' + data.quantity2 + ' count');

      return item1Parts.join(' ') + ', ' + item2Parts.join(' ');
    } else {
      var parts = [];
      if (parsed.name) parts.push(fixPronunciation(parsed.name));
      if (parsed.size) parts.push(fixPronunciation(parsed.size));
      if (parsed.type && parsed.name.toLowerCase().indexOf(parsed.type.toLowerCase()) === -1) {
        parts.push(fixPronunciation(parsed.type));
      }
      parts.push('.... ' + data.quantity + ' count');
      return parts.join(' ');
    }
  }

  if (action === 'next_machine') {
    return data.completed_machine + ' complete. Next is ' + data.next_machine + ' at ' + data.next_location + '. Top or bottom?';
  }

  if (action === 'complete') {
    return data.completed_route + ' route complete. Nice work!';
  }

  return null;
}

// Generate display text (no pause needed - UI only)
function generateDisplayText(data, parsed, parsed2) {
  if (data.action === 'next_item') {
    if (data.product_name2 && parsed2) {
      var item1 = parsed.name + (parsed.size ? ' (' + parsed.size + ')' : '') + ' X ' + data.quantity;
      var item2 = parsed2.name + (parsed2.size ? ' (' + parsed2.size + ')' : '') + ' X ' + data.quantity2;
      return item1 + ', ' + item2;
    } else {
      return parsed.name + (parsed.size ? ' (' + parsed.size + ')' : '') + ' X ' + data.quantity;
    }
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

  output.product_parsed = {
    name: parsed.name,
    size: parsed.size,
    type: parsed.type
  };

  if (data.product_name2) {
    parsed2 = parseProduct(data.product_name2);

    output.item2 = {
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

  output.display_text = generateDisplayText(data, parsed, parsed2);
}

if (data.action === 'next_machine') {
  output.completed_machine = data.completed_machine;
  output.completed_location = data.completed_location;
  output.next_location = data.next_location;
  output.next_machine = data.next_machine;  // ← FIX: Added missing field
  output.next_machine_id = data.new_machine_id;
  output.next_machine_number = data.next_machine_number;
}

if (data.action === 'complete') {
  output.completed_route = data.completed_route;
  output.total_routes = data.total_routes;
  output.message = 'All routes finished';
}

output.voice_text = generateSpoken(data.action, data, parsed, parsed2);
output.spoken = output.voice_text;

return [{ json: output }];
