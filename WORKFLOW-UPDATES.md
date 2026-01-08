# n8n Workflow Updates - Populate New Columns

After running the database migration, update these nodes in the workflow to populate the new columns:

---

## 1. UPDATE: "Flatten Data" Node

**What changed:** Added `route_name` to machines and `machine_name` to items

```javascript
var data = $input.first().json;
var date = $('Webhook').first().json.body.date;
var userId = $('Webhook').first().json.body.user_id || null;

var machines = [];
var items = [];
var machineSeq = 1;

var locations = data.locations || [];
for (var l = 0; l < locations.length; l++) {
  var loc = locations[l];
  var locMachines = loc.machines || [];

  for (var m = 0; m < locMachines.length; m++) {
    var machine = locMachines[m];
    var tempMachineId = 'temp_' + machineSeq;

    machines.push({
      temp_id: tempMachineId,
      machine_name: machine.machine_name,
      machine_number: machine.asset_number,
      location_name: loc.location_name,
      sequence: machineSeq,
      status: 'pending',
      total_items: machine.items.length,
      route_name: data.route_name  // NEW: Add route_name for troubleshooting
    });

    // NO SORTING - preserve PDF order (works for any slot format)
    var machineItems = machine.items || [];

    // Combine consecutive items with same product (adjacent in PDF = adjacent slots)
    var combinedItems = [];
    for (var i = 0; i < machineItems.length; i++) {
      var item = machineItems[i];
      var lastCombined = combinedItems.length > 0 ? combinedItems[combinedItems.length - 1] : null;

      // Combine if same product name and consecutive in list
      if (lastCombined && lastCombined.product_name === item.product_name) {
        lastCombined.quantity += item.quantity;
        lastCombined.slots.push(item.slot);
        // Sum inventory values when combining slots
        lastCombined.inventory_current += (item.inventory_current || 0);
        lastCombined.inventory_parlevel += (item.inventory_parlevel || 0);
        continue;
      }

      combinedItems.push({
        product_name: item.product_name,
        quantity: item.quantity,
        slots: [item.slot],
        inventory_current: item.inventory_current || 0,
        inventory_parlevel: item.inventory_parlevel || 0
      });
    }

    // Now create final items with sequence numbers (PDF order)
    for (var i = 0; i < combinedItems.length; i++) {
      var combined = combinedItems[i];
      var slotDisplay;
      if (combined.slots.length === 1) {
        slotDisplay = combined.slots[0];
      } else {
        // For combined slots, show range
        slotDisplay = combined.slots[0] + ' to ' + combined.slots[combined.slots.length - 1];
      }

      items.push({
        product_name: combined.product_name,
        quantity: combined.quantity,
        slot: slotDisplay,
        temp_machine_id: tempMachineId,
        machine_name: machine.machine_name,  // NEW: Add machine_name for visual reference
        sequence: i + 1,
        status: 'pending',
        inventory_current: combined.inventory_current,
        inventory_parlevel: combined.inventory_parlevel
      });
    }

    machines[machines.length - 1].total_items = combinedItems.length;
    machineSeq++;
  }
}

return [{
  json: {
    route: {
      user_id: userId,
      route_name: data.route_name,
      delivery_date: date,
      total_machines: machines.length,
      total_items: items.length
    },
    machines: machines,
    items: items,
    summary: {
      route: data.route_name,
      date: date,
      locations: locations.length,
      machines: machines.length,
      items: items.length
    }
  }
}];
```

---

## 2. UPDATE: "Insert Machines" Node (HTTP Request)

**What changed:** Added `route_name` to the JSON body mapping

**Current jsonBody:**
```javascript
={{ JSON.stringify($json.machines.map(function(m) { return { route_id: m.route_id, machine_name: m.machine_name, location_name: m.location_name, machine_number: m.machine_number, sequence: m.sequence, status: m.status, total_items: m.total_items }; })) }}
```

**NEW jsonBody:**
```javascript
={{ JSON.stringify($json.machines.map(function(m) { return { route_id: m.route_id, machine_name: m.machine_name, location_name: m.location_name, machine_number: m.machine_number, sequence: m.sequence, status: m.status, total_items: m.total_items, route_name: m.route_name }; })) }}
```

---

## 3. UPDATE: "Prepare Machines" Node

**What changed:** Added `route_name` to machines array

```javascript
var routeResult = $input.first().json;
var routeId = Array.isArray(routeResult) ? routeResult[0].id : routeResult.id;
var machines = $('Flatten Data').first().json.machines;

var machinesWithRouteId = [];
for (var i = 0; i < machines.length; i++) {
  machinesWithRouteId.push({
    route_id: routeId,
    machine_name: machines[i].machine_name,
    location_name: machines[i].location_name,
    machine_number: machines[i].machine_number,
    sequence: machines[i].sequence,
    status: machines[i].status,
    total_items: machines[i].total_items,
    route_name: machines[i].route_name,  // NEW: Pass through route_name
    temp_id: machines[i].temp_id
  });
}

return [{
  json: {
    route_id: routeId,
    machines: machinesWithRouteId
  }
}];
```

---

## 4. UPDATE: "Prepare Items" Node

**What changed:** Added `machine_name` to items mapping

```javascript
var insertedMachinesItems = $input.all();
var originalMachines = $('Prepare Machines').first().json.machines;
var items = $('Flatten Data').first().json.items;

// Build temp_id to real UUID mapping
var machineMap = {};
for (var m = 0; m < originalMachines.length; m++) {
  var tempId = originalMachines[m].temp_id;
  var realId = insertedMachinesItems[m].json.id;
  machineMap[tempId] = realId;
}

// Map items to real machine UUIDs
var itemsWithRealIds = [];
for (var i = 0; i < items.length; i++) {
  var item = items[i];
  itemsWithRealIds.push({
    machine_id: machineMap[item.temp_machine_id],
    product_name: item.product_name,
    quantity: item.quantity,
    slot: item.slot,
    sequence: item.sequence,
    status: item.status,
    inventory_current: item.inventory_current || 0,
    inventory_parlevel: item.inventory_parlevel || 0,
    machine_name: item.machine_name  // NEW: Add machine_name for visual reference
  });
}

return [{
  json: {
    items: itemsWithRealIds
  }
}];
```

---

## Summary of Changes

**4 nodes updated:**
1. ✅ Flatten Data - adds `route_name` to machines, `machine_name` to items
2. ✅ Prepare Machines - passes `route_name` through
3. ✅ Insert Machines - includes `route_name` in database insert
4. ✅ Prepare Items - includes `machine_name` in database insert

**New columns populated:**
- ✅ `routes.driver_name` - (Will be set by frontend when assigning driver)
- ✅ `routes.pdf_url` - (Will add PDF storage next)
- ✅ `machines.route_name` - Populated from parsed route name
- ✅ `items.machine_name` - Populated from parsed machine name

**Next:** Add PDF file upload to Supabase Storage
