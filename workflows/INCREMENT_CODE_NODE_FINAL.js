// ============================================================================
// Increment Completed Items - Code Node
// ============================================================================
// POSITION: Between "Switch Action output [1]" and "Merge All Paths"
// REPLACES: The HTTP Request "Increment Completed Items" node
// ============================================================================

var input = $input.first().json;

// Only increment if action is next_item
if (input.action !== 'next_item') {
  return $input.all();
}

var machineId = input.machine_id;
var newCompletedItems = input.new_completed_items;

if (!machineId) {
  throw new Error('machine_id missing from input');
}

// Get credentials and increment
var credentials = await this.getCredentials('supabaseApi');

await this.helpers.httpRequest({
  method: 'PATCH',
  url: 'https://wvtkuposrlvadyeixlke.supabase.co/rest/v1/machines?id=eq.' + machineId,
  headers: {
    'Content-Type': 'application/json',
    'apikey': credentials.serviceRole,
    'Authorization': 'Bearer ' + credentials.serviceRole,
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({
    completed_items: newCompletedItems
  })
});

// Pass through all original data
return [{
  json: input
}];
