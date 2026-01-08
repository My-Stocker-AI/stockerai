// Parse PDF Text - FIXED VERSION
// Detects slot positions BEFORE whitespace normalization to avoid false positives

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

  // CRITICAL FIX: Find slot positions in RAW text (before normalization)
  // Slots appear at line starts: "\n010 Product..." or "\nA1 Product..."
  var slotPositions = [];

  // Pattern 1: Numeric slots at line start (1-999, 01-99, 001-999)
  var numericSlotPattern = /\n\s*(0?\d{1,3})\s+([A-Z])/g;
  var slotMatch;
  while ((slotMatch = numericSlotPattern.exec(sectionText)) !== null) {
    slotPositions.push({
      slot: slotMatch[1],
      index: slotMatch.index,
      rawIndex: slotMatch.index,
      pattern: 'numeric'
    });
  }

  // Pattern 2: Letter+number slots at line start (A1-Z99)
  var letterSlotPattern = /\n\s*([A-Z]\d{1,2})\s+/g;
  while ((slotMatch = letterSlotPattern.exec(sectionText)) !== null) {
    slotPositions.push({
      slot: slotMatch[1],
      index: slotMatch.index,
      rawIndex: slotMatch.index,
      pattern: 'letter'
    });
  }

  // Pattern 3: Text-based slots like "Drink Cooler1-3"
  var textSlotPattern = /\n\s*(Drink Cooler[\d-]+|Fresh Food[\d-]+|Snack Rack[\s-]*(?:Small)?[\d-]+)\s+/gi;
  while ((slotMatch = textSlotPattern.exec(sectionText)) !== null) {
    slotPositions.push({
      slot: slotMatch[1].trim(),
      index: slotMatch.index,
      rawIndex: slotMatch.index,
      pattern: 'text'
    });
  }

  // Sort by position
  slotPositions.sort(function(a, b) { return a.index - b.index; });

  // Remove duplicates
  var uniqueSlots = [];
  for (var i = 0; i < slotPositions.length; i++) {
    if (i === 0 || slotPositions[i].index !== slotPositions[i-1].index) {
      uniqueSlots.push(slotPositions[i]);
    }
  }
  slotPositions = uniqueSlots;

  console.log('[PARSER]   Found', slotPositions.length, 'slots');
  if (slotPositions.length > 0) {
    console.log('[PARSER]   First 5 slots:', slotPositions.slice(0, 5).map(function(s) { return s.slot + ' (' + s.pattern + ')'; }).join(', '));
  }

  // Now normalize whitespace for parsing
  var content = sectionText.replace(/\n/g, ' ').replace(/\s+/g, ' ');

  // Parse each slot's content
  var parsedItems = 0;
  for (var s = 0; s < slotPositions.length; s++) {
    var slotInfo = slotPositions[s];

    // Find this slot in normalized content
    var slotPattern = new RegExp('\\b' + slotInfo.slot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+');
    var slotInContent = slotPattern.exec(content);

    if (!slotInContent) continue;

    var slotStartIndex = slotInContent.index + slotInContent[0].length;

    // Find next slot position
    var nextSlotIndex = content.length;
    if (s + 1 < slotPositions.length) {
      var nextSlotPattern = new RegExp('\\b' + slotPositions[s + 1].slot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+');
      var nextSlotMatch = nextSlotPattern.exec(content);
      if (nextSlotMatch) {
        nextSlotIndex = nextSlotMatch.index;
      }
    }

    var slotContent = content.substring(slotStartIndex, nextSlotIndex).trim();

    // Pattern A: Product Name followed by numbers
    var normalMatch = slotContent.match(/^(.+?)\s+(\d+)\s+(\d+)\s*\/\s*(\d+)\s+([\d.]+)\s+None/);

    if (normalMatch) {
      var productName = normalMatch[1].trim();
      var quantity = parseInt(normalMatch[2]);
      var inventoryCurrent = parseInt(normalMatch[3]);
      var inventoryParlevel = parseInt(normalMatch[4]);

      if (/[a-zA-Z]/.test(productName) && quantity > 0 && productName.length < 100) {
        machine.items.push({
          product_name: productName,
          quantity: quantity,
          slot: slotInfo.slot,
          inventory_current: inventoryCurrent,
          inventory_parlevel: inventoryParlevel
        });
        parsedItems++;
        continue;
      }
    }

    // Pattern B: Page-break format - Numbers first
    var brokenMatch = slotContent.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)\s+([\d.]+)\s+None\s+(.+)$/);

    if (brokenMatch) {
      var quantity = parseInt(brokenMatch[1]);
      var inventoryCurrent = parseInt(brokenMatch[2]);
      var inventoryParlevel = parseInt(brokenMatch[3]);
      var productName = brokenMatch[5].trim();
      productName = productName.replace(/\s+\d+\s+\d+\s*\/.*$/, '').trim();

      if (/[a-zA-Z]/.test(productName) && quantity > 0 && productName.length > 2 && productName.length < 100) {
        machine.items.push({
          product_name: productName,
          quantity: quantity,
          slot: slotInfo.slot,
          inventory_current: inventoryCurrent,
          inventory_parlevel: inventoryParlevel
        });
        parsedItems++;
        continue;
      }
    }

    // Pattern C: Split by "None"
    var noneIndex = slotContent.indexOf('None');
    if (noneIndex > 0) {
      var beforeNone = slotContent.substring(0, noneIndex).trim();
      var afterNone = slotContent.substring(noneIndex + 4).trim();

      var numbersMatch = beforeNone.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)\s+([\d.]+)$/);
      if (numbersMatch && afterNone.length > 0) {
        var quantity = parseInt(numbersMatch[1]);
        var inventoryCurrent = parseInt(numbersMatch[2]);
        var inventoryParlevel = parseInt(numbersMatch[3]);
        var productName = afterNone.trim();

        if (/[a-zA-Z]/.test(productName) && quantity > 0 && productName.length > 2 && productName.length < 100) {
          machine.items.push({
            product_name: productName,
            quantity: quantity,
            slot: slotInfo.slot,
            inventory_current: inventoryCurrent,
            inventory_parlevel: inventoryParlevel
          });
          parsedItems++;
        }
      }
    }
  }

  console.log('[PARSER]   Parsed', parsedItems, 'items from', slotPositions.length, 'slots');
  if (parsedItems === 0 && slotPositions.length > 0) {
    console.log('[PARSER]   WARNING: Found slots but failed to parse any items!');
  }

  locations[locationName].machines.push(machine);
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
