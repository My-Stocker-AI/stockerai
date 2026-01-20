var extractData = $('Extract Session').first().json;
if (extractData.error) {
  return [{ json: extractData }];
}

var sessionData = extractData;
var itemsData = $input.all();

// Get count parameter from webhook
var input = $('Webhook').first().json.body;
var count = input.count || 1;

var items = [];
for (var i = 0; i < itemsData.length; i++) {
  var item = itemsData[i].json;
  if (item && item.id) {
    items.push(item);
  }
}

if (items.length === 0) {
  return [{
    json: {
      error: 'No items found in machine',
      session_id: sessionData.session_id
    }
  }];
}

var selectedItem;
var itemIndex;
var item2 = null;

if (sessionData.pick_direction === 'reverse') {
  selectedItem = items[items.length - 1];
  itemIndex = selectedItem.sequence;  // FIX: Use actual sequence number, not array length

  // Get item2 if count=2 and there are at least 2 items
  if (count === 2 && items.length >= 2) {
    item2 = items[items.length - 2];
    itemIndex = item2.sequence;  // FIX: Use actual sequence number, not array index
  }
} else {
  selectedItem = items[0];
  itemIndex = selectedItem.sequence;  // FIX: Use actual sequence number for consistency

  // Get item2 if count=2 and there are at least 2 items
  if (count === 2 && items.length >= 2) {
    item2 = items[1];
    itemIndex = item2.sequence;  // FIX: Use actual sequence number for consistency
  }
}

return [{
  json: {
    session_id: sessionData.session_id,
    current_route_id: sessionData.current_route_id,
    pick_direction: sessionData.pick_direction,
    current_item_index: itemIndex,
    product_name: selectedItem.product_name,
    quantity: selectedItem.quantity,
    slot: selectedItem.slot,
    inventory_current: selectedItem.inventory_current || 0,
    inventory_parlevel: selectedItem.inventory_parlevel || 0,
    total_items: items.length,
    item2_product_name: item2 ? item2.product_name : null,
    item2_quantity: item2 ? item2.quantity : null,
    item2_slot: item2 ? item2.slot : null,
    item2_inventory_current: item2 ? (item2.inventory_current || 0) : null,
    item2_inventory_parlevel: item2 ? (item2.inventory_parlevel || 0) : null,
    count: count
  }
}];
