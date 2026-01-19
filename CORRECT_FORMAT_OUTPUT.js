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
  return { name: name, size: size, type: type };
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

function generateDisplayText(parsed1, qty1, parsed2, qty2) {
  var items = [];
  if (parsed1 && parsed1.name) {
    var parts = [parsed1.name];
    if (parsed1.size) {
      parts.push('(' + parsed1.size + ')');
    }
    items.push(parts.join(' ') + ' X ' + qty1);
  }
  if (parsed2 && parsed2.name) {
    var parts2 = [parsed2.name];
    if (parsed2.size) {
      parts2.push('(' + parsed2.size + ')');
    }
    items.push(parts2.join(' ') + ' X ' + qty2);
  }
  return items.join(', ');
}

function generateVoiceText(parsed1, qty1, parsed2, qty2) {
  var items = [];
  if (parsed1) {
    var parts = [];
    if (parsed1.name) {
      parts.push(fixPronunciation(parsed1.name));
    }
    if (parsed1.size) {
      parts.push(fixPronunciation(parsed1.size));
    }
    if (parsed1.type) {
      var typeLower = parsed1.type.toLowerCase();
      var nameLower = parsed1.name ? parsed1.name.toLowerCase() : '';
      var sizeLower = parsed1.size ? parsed1.size.toLowerCase() : '';
      if (nameLower.indexOf(typeLower) === -1 && sizeLower.indexOf(typeLower) === -1) {
        parts.push(fixPronunciation(parsed1.type));
      }
    }
    parts.push(qty1 + ' count');
    items.push(parts.join(' '));
  }
  if (parsed2) {
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
    parts2.push(qty2 + ' count');
    items.push(parts2.join(' '));
  }
  return items.join(', ');
}

var output = {
  action: data.action,
  machine_complete: data.machine_complete || false,
  route_complete: data.route_complete || false,
  session_complete: data.session_complete || false
};

if (data.action === 'next_item') {
  var parsed = parseProduct(data.product_name);

  output.product_name = data.product_name;
  output.quantity = data.quantity;
  output.slot = data.slot;
  output.slot_spoken = formatSlotForTTS(data.slot);
  output.machine_name = data.machine_name || '';
  output.inventory_current = data.inventory_current || 0;
  output.inventory_parlevel = data.inventory_parlevel || 0;
  output.items_remaining = data.items_remaining;
  output.product_parsed = {
    name: parsed.name,
    size: parsed.size,
    type: parsed.type
  };

  // CRITICAL: item2 must be NESTED OBJECT (frontend expects result.item2.product_name)
  if (data.product_name2) {
    var parsed2 = parseProduct(data.product_name2);
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

    // Generate display/voice for 2 items
    output.display_text = generateDisplayText(parsed, data.quantity, parsed2, data.quantity2);
    output.voice_text = generateVoiceText(parsed, data.quantity, parsed2, data.quantity2);
  } else {
    // Generate display/voice for 1 item
    output.display_text = generateDisplayText(parsed, data.quantity, null, null);
    output.voice_text = generateVoiceText(parsed, data.quantity, null, null);
  }

  output.spoken = output.voice_text;
}

if (data.action === 'next_machine') {
  output.completed_machine = data.completed_machine;
  output.completed_location = data.completed_location;
  output.next_location = data.next_location;
  output.next_machine = data.next_machine;
  output.next_machine_id = data.new_machine_id;
  output.next_machine_number = data.next_machine_number;

  var machineText = data.completed_machine + ' complete. Next is ' + data.next_machine + ' at ' + data.next_location + '. Top or bottom?';
  output.display_text = machineText;
  output.voice_text = machineText;
  output.spoken = machineText;
}

if (data.action === 'complete') {
  output.completed_route = data.completed_route;
  output.total_routes = data.total_routes;
  output.message = 'All routes finished';

  var completeText = data.completed_route + ' route complete. Nice work!';
  output.display_text = completeText;
  output.voice_text = completeText;
  output.spoken = completeText;
}

return [{ json: output }];
