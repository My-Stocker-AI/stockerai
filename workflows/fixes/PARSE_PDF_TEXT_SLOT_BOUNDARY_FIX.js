// CRITICAL FIX: PDF Parser - Slot Boundary Detection
// Issue: Slot content bleeds into adjacent slots, causing malformed item names
// Root Cause: Regex patterns fail to detect slot boundaries in normalized text
// Fix: Use line-based parsing instead of normalized text for slot content extraction

var text = $input.first().json.text;
var date = $('Webhook').first().json.body.date;

var routeName = '';
var locations = {};

console.log('[PARSER] Processing PDF with', text.length, 'characters');

// Step 1: Remove page break junk (URLs, dates, page numbers)
text = text.replace(/https:\/\/[^\s]+/g, ' ');
text = text.replace(/\d{1,2}\/\d{1,2}\/\d{2},?\s*\d{1,2}:\d{2}\s*(AM|PM)/gi, ' ');
text = text.replace(/Page\s+\d+\s+of\s+\d+/gi, ' ');

// Find all machine headers
var headerPattern = /([A-Za-z]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*[^|]+\s*\|\s*ID:\s*(\w+)/g;

var headers = [];
var match;
while ((match = headerPattern.exec(text)) !== null) {
  headers.push({
    index: match.index,
    endIndex: match.index + match[0].length,
    route: match[1].trim(),
    location: match[2].trim(),
    machine: match[3].trim(),
    id: match[4]
  });
}

console.log('[PARSER] Found', headers.length, 'machine headers');

// Process each machine section
for (var h = 0; h < headers.length; h++) {
  var header = headers[h];
  var nextIndex = (h + 1 < headers.length) ? headers[h + 1].index : text.length;

  var sectionText = text.substring(header.endIndex, nextIndex);

  routeName = header.route;
  var locationName = header.location;

  var assetMatch = header.machine.match(/(.+?)\s*\((\d+)\)/);
  var machineName = assetMatch ? assetMatch[1].trim() : header.machine;
  var assetNumber = assetMatch ? parseInt(assetMatch[2]) : 0;

  console.log('[PARSER] Machine', h + 1, ':', machineName, 'at', locationName);

  if (!locations[locationName]) {
    locations[locationName] = {
      location_name: locationName,
      machines: []
    };
  }

  var machine = {
    machine_name: machineName,
    asset_number: assetNumber,
    items: []
  };

  // ===== CRITICAL FIX: Parse line-by-line instead of normalized text =====
  // Split section into lines BEFORE normalization to preserve structure
  var lines = sectionText.split('\n');

  // Pattern to detect item rows: starts with slot number, contains "None" at end
  var itemRowPattern = /^\s*(0?\d{1,3}|[A-Z]\d{1,2}|Drink Cooler[\d-]+|Fresh Food[\d-]+|Snack Rack[\s-]*(?:Small)?[\d-]+)\s+(.+)\s+(\d+)\s+(\d+)\s*\/\s*(\d+)\s+([\d.]+)\s+None\s*$/;

  var parsedItems = 0;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.length < 10) continue; // Skip empty/short lines

    var itemMatch = itemRowPattern.exec(line);

    if (itemMatch) {
      var slot = itemMatch[1].trim();
      var productName = itemMatch[2].trim();
      var quantity = parseInt(itemMatch[3]);
      var inventoryCurrent = parseInt(itemMatch[4]);
      var inventoryParlevel = parseInt(itemMatch[5]);
      var price = parseFloat(itemMatch[6]);

      // Validation: ensure product name has letters and is reasonable length
      if (/[a-zA-Z]/.test(productName) &&
          quantity > 0 &&
          productName.length > 2 &&
          productName.length < 150) {

        machine.items.push({
          product_name: productName,
          quantity: quantity,
          slot: slot,
          inventory_current: inventoryCurrent,
          inventory_parlevel: inventoryParlevel
        });
        parsedItems++;
      } else {
        console.log('[PARSER]   SKIP slot', slot, '- invalid product:', productName.substring(0, 50));
      }
    }
  }

  console.log('[PARSER]   Parsed', parsedItems, 'items from', lines.length, 'lines');

  if (parsedItems === 0 && lines.length > 5) {
    console.log('[PARSER]   WARNING: Found', lines.length, 'lines but parsed 0 items!');
    console.log('[PARSER]   Sample lines:');
    for (var i = 0; i < Math.min(5, lines.length); i++) {
      if (lines[i].trim().length > 0) {
        console.log('[PARSER]     Line', i + ':', lines[i].substring(0, 100));
      }
    }
  }

  // CRITICAL FIX: Skip machines with 0 items to avoid database constraint violation
  if (machine.items.length === 0) {
    console.log('[PARSER]   SKIP machine with 0 items:', machineName);
  } else {
    locations[locationName].machines.push(machine);
  }
}

var locationsArray = [];
for (var loc in locations) {
  locationsArray.push(locations[loc]);
}

console.log('[PARSER] FINAL: Route', routeName, 'with', locationsArray.length, 'locations');

return [{
  json: {
    route_name: routeName,
    delivery_date: date,
    locations: locationsArray
  }
}];
