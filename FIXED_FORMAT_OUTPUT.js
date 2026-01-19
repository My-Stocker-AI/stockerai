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

function generateDisplayText(action, data, parsed) {
  if (action === 'next_item') {
    var parts = [];
    if (parsed.name) {
      parts.push(parsed.name);
    }
    if (parsed.size) {
      parts.push('(' + parsed.size + ')');
    }
    var productText = parts.join(' ');
    return productText + ' X ' + data.quantity;
  }
  if (action === 'next_machine') {
    return data.completed_machine + ' complete. Next is ' + data.next_machine + ' at ' + data.next_location + '. Top or bottom?';
  }
  if (action === 'complete') {
    return data.completed_route + ' route complete. Nice work!';
  }
  return null;
}

function generateVoiceText(action, data, parsed) {
  if (action === 'next_item') {
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
    parts.push(data.quantity + ' count');
    return parts.join(' ');
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

output.display_text = generateDisplayText(data.action, data, parsed);
output.voice_text = generateVoiceText(data.action, data, parsed);
output.spoken = output.voice_text;

return [{ json: output }];
