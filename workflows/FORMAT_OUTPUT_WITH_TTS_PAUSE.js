var data = $('Merge All Paths').first().json;

function parseProduct(productName) {
  if (!productName) return { name: '', size: '', type: '' };

  var text = productName.trim();

  var sizePattern = /(\d+(?:\.\d+)?)\s*(oz|ounce|ml|g|gram|ct|count|pk|pack)/gi;
  var sizeMatch = sizePattern.exec(text);
  var size = sizeMatch ? sizeMatch[0] : '';

  var typePattern = /\b(can|bottle|bag|box|bar|pouch|packet|pack)\b/gi;
  var typeMatch = typePattern.exec(text);
  var type = typeMatch ? typeMatch[0] : '';

  var name = text;
  if (size) {
    name = name.replace(sizePattern, '').trim();
  }
  if (type) {
    var typeWord = typeMatch[0];
    name = name.replace(new RegExp('\\s*' + typeWord + '\\s*$', 'gi'), '');
    name = name.replace(new RegExp('\\s*' + typeWord + '\\s*-', 'gi'), ' -');
  }

  name = name.replace(/\s+/g, ' ').trim();
  name = name.replace(/\s*-\s*$/, '').trim();
  name = name.replace(/\(\s*\)/, '').trim();

  return {
    name: name,
    size: size,
    type: type
  };
}

function fixPronunciation(text) {
  if (!text) return text;
  text = text.replace(/\bCan\b/g, 'Kan');
  text = text.replace(/\bCAN\b/g, 'KAN');
  text = text.replace(/\boz\b/gi, 'ounce');
  text = text.replace(/\bct\b/gi, 'count');
  text = text.replace(/\bpk\b/gi, 'pack');
  return text;
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

function generateDisplayText(action, data, parsed, parsed2) {
  if (action === 'next_item') {
    var items = [];

    // First item
    if (parsed && parsed.name) {
      var parts = [];
      parts.push(parsed.name);
      if (parsed.size) {
        parts.push('(' + parsed.size + ')');
      }
      var productText = parts.join(' ');
      items.push(productText + ' X ' + data.quantity);
    }

    // Second item (if exists)
    if (data.product_name2 && parsed2 && parsed2.name) {
      var parts2 = [];
      parts2.push(parsed2.name);
      if (parsed2.size) {
        parts2.push('(' + parsed2.size + ')');
      }
      var productText2 = parts2.join(' ');
      items.push(productText2 + ' X ' + data.quantity2);
    }

    return items.join(', ');
  }
  if (action === 'next_machine') {
    return data.completed_machine + ' complete. Next is ' + data.next_machine + ' at ' + data.next_location + '. Top or bottom?';
  }
  if (action === 'complete') {
    return data.completed_route + ' route complete. Nice work!';
  }
  return null;
}

function generateVoiceText(action, data, parsed, parsed2) {
  if (action === 'next_item') {
    var items = [];

    // First item
    if (parsed) {
      var parts = [];
      if (parsed.name) {
        parts.push(fixPronunciation(parsed.name));
      }
      if (parsed.size) {
        parts.push(fixPronunciation(parsed.size));
      }
      if (parsed.type) {
        var typeLower = parsed.type.toLowerCase();
        var nameLower = parsed.name ? parsed.name.toLowerCase() : '';
        var sizeLower = parsed.size ? parsed.size.toLowerCase() : '';
        if (nameLower.indexOf(typeLower) === -1 && sizeLower.indexOf(typeLower) === -1) {
          parts.push(fixPronunciation(parsed.type));
        }
      }
      // ADD PAUSE: Use period before count to create natural TTS pause
      parts.push('. ' + data.quantity + ' count');
      items.push(parts.join(' '));
    }

    // Second item (if exists)
    if (data.product_name2 && parsed2) {
      var parts2 = [];
      if (parsed2.name) {
        parts2.push(fixPronunciation(parsed2.name));
      }
      if (parsed2.size) {
        parts2.push(fixPronunciation(parsed2.size));
      }
      if (parsed2.type) {
        var typeLower2 = parsed2.type.toLowerCase();
        var nameLower2 = parsed2.name ? parsed2.name.toLowerCase() : '';
        var sizeLower2 = parsed2.size ? parsed2.size.toLowerCase() : '';
        if (nameLower2.indexOf(typeLower2) === -1 && sizeLower2.indexOf(typeLower2) === -1) {
          parts2.push(fixPronunciation(parsed2.type));
        }
      }
      // ADD PAUSE: Use period before count to create natural TTS pause
      parts2.push('. ' + data.quantity2 + ' count');
      items.push(parts2.join(' '));
    }

    return items.join(', ');
  }
  if (action === 'next_machine') {
    return data.completed_machine + ' complete. Next is ' + data.next_machine + ' at ' + data.next_location + '. Top or bottom?';
  }
  if (action === 'complete') {
    return data.completed_route + ' route complete. Nice work!';
  }
  return null;
}

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

  // Handle second item if exists
  if (data.product_name2) {
    parsed2 = parseProduct(data.product_name2);

    output.product_name2 = data.product_name2;
    output.quantity2 = data.quantity2;
    output.slot2 = data.slot2;

    output.product_parsed2 = {
      name: parsed2.name,
      size: parsed2.size,
      type: parsed2.type
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

output.display_text = generateDisplayText(data.action, data, parsed, parsed2);
output.voice_text = generateVoiceText(data.action, data, parsed, parsed2);
output.spoken = output.voice_text;

return [{ json: output }];
