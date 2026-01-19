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

output.display_text = generateDisplayText(data.action, data, parsed);
output.voice_text = generateVoiceText(data.action, data, parsed);
output.spoken = output.voice_text;

return [{ json: output }];
