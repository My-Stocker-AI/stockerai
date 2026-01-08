// UPDATED "Flatten Data" Node - WITH PDF URL Support
// This version includes pdf_url in the route object

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
      route_name: data.route_name
    });

    var machineItems = machine.items || [];

    var combinedItems = [];
    for (var i = 0; i < machineItems.length; i++) {
      var item = machineItems[i];
      var lastCombined = combinedItems.length > 0 ? combinedItems[combinedItems.length - 1] : null;

      if (lastCombined && lastCombined.product_name === item.product_name) {
        lastCombined.quantity += item.quantity;
        lastCombined.slots.push(item.slot);
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

    for (var i = 0; i < combinedItems.length; i++) {
      var combined = combinedItems[i];
      var slotDisplay;
      if (combined.slots.length === 1) {
        slotDisplay = combined.slots[0];
      } else {
        slotDisplay = combined.slots[0] + ' to ' + combined.slots[combined.slots.length - 1];
      }

      items.push({
        product_name: combined.product_name,
        quantity: combined.quantity,
        slot: slotDisplay,
        temp_machine_id: tempMachineId,
        machine_name: machine.machine_name,
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

// Get PDF URL from Upload PDF to Storage node (if it exists)
var pdfPath = null;
var pdfUrl = null;

try {
  pdfPath = $('Upload PDF to Storage').first().json.path || null;
  if (pdfPath) {
    pdfUrl = 'https://wvtkuposrlvadyeixlke.supabase.co/storage/v1/object/public/route-pdfs/' + pdfPath;
  }
} catch (e) {
  // Upload PDF to Storage node doesn't exist yet - that's ok
  console.log('[INFO] No PDF storage node found - pdf_url will be null');
}

return [{
  json: {
    route: {
      user_id: userId,
      route_name: data.route_name,
      delivery_date: date,
      total_machines: machines.length,
      total_items: items.length,
      pdf_url: pdfUrl  // NEW: Include PDF URL (will be null if storage not set up yet)
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
