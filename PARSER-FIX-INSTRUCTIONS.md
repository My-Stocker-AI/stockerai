# Parser Fix - Manual Update Instructions

## What to Update
**Workflow:** Stocker - PDF Upload (ID: j83ZLnXCritd8k0s)
**Node to Edit:** "Parse PDF Text" (JavaScript code node)

## How to Update

1. Open n8n workflow "Stocker - PDF Upload"
2. Click on the "Parse PDF Text" node
3. Select all the existing JavaScript code
4. Replace it with the code below
5. Click "Save" on the node
6. Click "Save" on the workflow

---

## FIXED JAVASCRIPT CODE (Copy everything below this line)

```javascript
var text = $input.first().json.text;
var date = $('Webhook').first().json.body.date;

var routeName = '';
var locations = {};

// DEBUG: Log total text length
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

  // Normalize whitespace
  var content = sectionText.replace(/\n/g, ' ').replace(/\s+/g, ' ');

  // DEBUG: Log section preview
  console.log('[PARSER]   Section preview:', content.substring(0, 200));

  // Find all slot positions using multiple patterns
  var slotPositions = [];

  // Pattern 1: IMPROVED Numeric slots - handles 1-999, 01-99, 001-999
  // Examples: 1, 27, 012, 058, 123
  var numericSlotFinder = /\b(0?\d{1,3})\s+/g;
  var slotMatch;
  while ((slotMatch = numericSlotFinder.exec(content)) !== null) {
    var slotNum = slotMatch[1];
    var afterSlot = content.substring(slotMatch.index + slotMatch[0].length, slotMatch.index + slotMatch[0].length + 100);
    // Must be followed by a product name (letter) or numbers (qty inventory/par)
    if (/^[A-Za-z]|^\d+\s+\d+\s*\//.test(afterSlot)) {
      slotPositions.push({
        slot: slotNum,
        index: slotMatch.index,
        endIndex: slotMatch.index + slotMatch[0].length,
        pattern: 'numeric'
      });
    }
  }

  // Pattern 2: IMPROVED Letter+number slots - handles A-Z with 1-99
  // Examples: A1, B2, C3, Z99
  var letterSlotFinder = /\b([A-Z]\d{1,2})\s+/g;
  while ((slotMatch = letterSlotFinder.exec(content)) !== null) {
    slotPositions.push({
      slot: slotMatch[1],
      index: slotMatch.index,
      endIndex: slotMatch.index + slotMatch[0].length,
      pattern: 'letter'
    });
  }

  // Pattern 3: Text-based slots like "Drink Cooler1-3", "Fresh Food1-1", "Snack Rack1-1"
  var textSlotFinder = /(Drink Cooler[\d-]+|Fresh Food[\d-]+|Snack Rack[\s-]*(?:Small)?[\d-]+)\s+/gi;
  while ((slotMatch = textSlotFinder.exec(content)) !== null) {
    slotPositions.push({
      slot: slotMatch[1].trim(),
      index: slotMatch.index,
      endIndex: slotMatch.index + slotMatch[0].length,
      pattern: 'text'
    });
  }

  console.log('[PARSER]   Found', slotPositions.length, 'potential slots');

  // Sort by position in text to maintain PDF order
  slotPositions.sort(function(a, b) { return a.index - b.index; });

  // Remove duplicates (same index)
  var uniqueSlots = [];
  for (var i = 0; i < slotPositions.length; i++) {
    if (i === 0 || slotPositions[i].index !== slotPositions[i-1].index) {
      uniqueSlots.push(slotPositions[i]);
    }
  }
  slotPositions = uniqueSlots;

  console.log('[PARSER]   After dedup:', slotPositions.length, 'unique slots');
  if (slotPositions.length > 0) {
    console.log('[PARSER]   First 5 slots:', slotPositions.slice(0, 5).map(function(s) { return s.slot + ' (' + s.pattern + ')'; }).join(', '));
  }

  // Process each slot
  var parsedItems = 0;
  for (var s = 0; s < slotPositions.length; s++) {
    var slotInfo = slotPositions[s];
    var nextSlotIndex = (s + 1 < slotPositions.length) ? slotPositions[s + 1].index : content.length;

    var slotContent = content.substring(slotInfo.endIndex, nextSlotIndex).trim();

    // Pattern A: Normal format - Product Name followed by numbers
    // Example: "Sun Chips Garden Salsa 1.5 oz 5 4 / 9 1.75 None"
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

    // Pattern B: Page-break format - Numbers first, then "None", then Product Name
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

    // Pattern C: Split differently - try to find product name after None
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
    console.log('[PARSER]   Sample slot content:', slotPositions.length > 0 ? content.substring(slotPositions[0].endIndex, Math.min(slotPositions[0].endIndex + 300, content.length)) : 'N/A');
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
```

---

## What Changed

### Bug Fixes:
1. **Numeric slot pattern**: Changed from `/(0\d{2})\s/g` to `/\b(0?\d{1,3})\s+/g`
   - OLD: Only matched 001-099 (with leading zero)
   - NEW: Matches 1, 27, 012, 058, 123 (all numeric formats)

2. **Letter slot pattern**: Changed from `/\b([A-E]\d)\s+([A-Z])/g` to `/\b([A-Z]\d{1,2})\s+/g`
   - OLD: Only A-E letters, single digit only
   - NEW: All A-Z letters, 1-99 digits

### Debug Logging Added:
- Total PDF character count
- Number of machine headers found
- Per-machine: name, location, section preview
- Slot detection: count before/after dedup, first 5 slots with pattern types
- Parse results: items parsed vs slots found
- Warning when slots detected but no items parsed (with sample content)

## After Update

1. Have Davy re-upload the North route PDF
2. Check n8n execution logs - you'll see detailed [PARSER] output showing:
   - How many slots were detected for Woodsprings Snack Machine
   - Which pattern matched each slot (numeric/letter/text)
   - How many items were successfully parsed
3. This should fix the "no items" bug for machines using slots like 1, 27, etc.
