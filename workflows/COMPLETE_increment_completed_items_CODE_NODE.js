// ============================================================================
// PHASE 2: Increment Completed Items - Code Node
// ============================================================================
//
// PURPOSE: Increment machines.completed_items in database after item picked
//
// INPUT (from Determine Next State):
//   - machine_id: UUID of current machine
//   - items_to_increment: How many items to add (1 or 2)
//   - All other fields from Determine Next State
//
// OUTPUT: Passes through all input fields + increment confirmation
//
// WHY CODE NODE (not HTTP Request):
//   - HTTP Request REPLACES input data with response
//   - Code node can PRESERVE input and add response data
//   - Format Output needs all fields from Determine Next State
//
// Workflow: get_next_item (Optimized) - ID: iykbFj7f9222PF7r
// Node: "Increment Completed Items" (Code node)
// Position: AFTER "Determine Next State", BEFORE "Format Output"
// ============================================================================

// Get input data from Determine Next State
var input = $input.first().json;

// Only increment if action is next_item (not next_machine or complete)
if (input.action !== 'next_item') {
  // Pass through unchanged for other actions
  return $input.all();
}

// Extract required fields
var machineId = input.machine_id;
var itemsToIncrement = input.items_to_increment || 1;

// Validate required fields
if (!machineId) {
  throw new Error('machine_id missing from input');
}

// Increment completed_items in database
var response = await this.helpers.httpRequest({
  method: 'PATCH',
  url: 'https://wvtkuposrlvadyeixlke.supabase.co/rest/v1/machines',
  headers: {
    'Content-Type': 'application/json',
    'apikey': '{{$credentials.supabaseApi.serviceRole}}',
    'Authorization': 'Bearer {{$credentials.supabaseApi.serviceRole}}',
    'Prefer': 'return=representation'
  },
  qs: {
    'id': 'eq.' + machineId
  },
  body: {
    // Use PostgreSQL expression to increment atomically
    // This prevents race conditions if multiple requests arrive
    completed_items: input.completed_items + itemsToIncrement
  }
});

// Return original input data with increment confirmation
return [{
  json: {
    ...input,  // Preserve all fields from Determine Next State
    increment_response: response,
    incremented: true,
    new_completed_items: input.completed_items + itemsToIncrement
  }
}];
