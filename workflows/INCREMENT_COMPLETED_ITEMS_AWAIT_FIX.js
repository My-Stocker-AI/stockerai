// ============================================================================
// Increment Completed Items - COMPLETE FIX
// BUG: Node returned before HTTP request completed, database not updating
// FIX: Await the async IIFE to block until HTTP PATCH completes
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

// AWAIT the async IIFE to block until HTTP request completes
await (async function() {
  await $this.helpers.httpRequest({
    method: 'PATCH',
    url: 'https://wvtkuposrlvadyeixlke.supabase.co/rest/v1/machines?id=eq.' + machineId,
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2dGt1cG9zcmx2YWR5ZWl4bGtlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjczMjcwNSwiZXhwIjoyMDgyMzA4NzA1fQ.S0Ykz0czr-pn-UPA_d-BTZU3cxkX4c77z80vHNl6xg8',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2dGt1cG9zcmx2YWR5ZWl4bGtlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjczMjcwNSwiZXhwIjoyMDgyMzA4NzA1fQ.S0Ykz0czr-pn-UPA_d-BTZU3cxkX4c77z80vHNl6xg8',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      completed_items: newCompletedItems
    })
  });
})();

// Return original input data unchanged
return [{
  json: input
}];
