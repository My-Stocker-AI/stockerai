// Generate optimized spoken response with "X count" format
function generateSpoken(action, data, parsed, parsed2) {
  if (action === 'next_item') {
    // Check if count=2 and we have item2
    if (data.count === 2 && data.item2_product_name) {
      // Format: "Coke Zero 12 ounce Kan 4 count, Dr Pepper 12 ounce Kan 2 count"
      var item1Parts = [];
      if (parsed.name) item1Parts.push(fixPronunciation(parsed.name));
      if (parsed.size) item1Parts.push(fixPronunciation(parsed.size));
      if (parsed.type && parsed.name.toLowerCase().indexOf(parsed.type.toLowerCase()) === -1) {
        item1Parts.push(fixPronunciation(parsed.type));
      }
      item1Parts.push(data.quantity + ' count');

      var item2Parts = [];
      if (parsed2.name) item2Parts.push(fixPronunciation(parsed2.name));
      if (parsed2.size) item2Parts.push(fixPronunciation(parsed2.size));
      if (parsed2.type && parsed2.name.toLowerCase().indexOf(parsed2.type.toLowerCase()) === -1) {
        item2Parts.push(fixPronunciation(parsed2.type));
      }
      item2Parts.push(data.item2_quantity + ' count');

      return item1Parts.join(' ') + ', ' + item2Parts.join(' ');
    } else {
      // Single item: "Product name size type X count"
      var parts = [];
      if (parsed.name) parts.push(fixPronunciation(parsed.name));
      if (parsed.size) parts.push(fixPronunciation(parsed.size));
      if (parsed.type && parsed.name.toLowerCase().indexOf(parsed.type.toLowerCase()) === -1) {
        parts.push(fixPronunciation(parsed.type));
      }
      parts.push(data.quantity + ' count');
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
