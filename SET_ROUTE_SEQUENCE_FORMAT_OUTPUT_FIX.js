// Fix for set_route_sequence Format Output node
// Add the 'date' field to the response so session persistence works

var data = $('Update Session Machine').first().json;
var prepInput = $('Prepare Input').first().json;

// Build machine list
var machines = [];
var machineData = $('Get All Machines').all();
for (var i = 0; i < machineData.length; i++) {
  var m = machineData[i].json;
  machines.push({
    id: m.id,
    name: m.machine_name,
    location: m.location_name,
    sequence: m.sequence,
    totalItems: m.total_items || 0,
    completedItems: m.completed_items || 0,
    status: m.status || 'pending'
  });
}

// Sort by sequence
machines.sort(function(a, b) { return a.sequence - b.sequence; });

var firstMachine = machines[0];
var totalItems = machines.reduce(function(sum, m) { return sum + m.totalItems; }, 0);

return [{
  json: {
    action: 'machine_ready',
    route_name: prepInput.route_name,
    date: prepInput.date || data.delivery_date,  // FIX: Add date field
    location_name: firstMachine.location,
    machine_name: firstMachine.name,
    machine_number: firstMachine.sequence,
    total_items_in_machine: firstMachine.totalItems,
    total_machines: machines.length,
    total_items_in_route: totalItems,
    machine_index: 1,
    machine_id: firstMachine.id,
    machines: machines,
    spoken: 'Starting ' + prepInput.route_name + ' route. First up is ' + firstMachine.name + ' at ' + firstMachine.location + ' with ' + firstMachine.totalItems + ' items. Would you like to start at the top of the list for this machine, or the bottom?'
  }
}];
