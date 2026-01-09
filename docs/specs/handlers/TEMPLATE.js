// Handler Template
//
// Copy this file and rename to YOUR_HANDLER_NAME_V1.js
// Version in filename for tracking changes
//
// n8n Code Node Rules:
// - NO optional chaining (data?.field)
// - NO nullish coalescing (data ?? 'default')
// - NO require() or imports
// - NO fetch() - use HTTP Request node instead
// - NO console.log() - use return instead

var items = $input.all();
var results = [];

for (var i = 0; i < items.length; i++) {
  var data = items[i].json;

  // Access body if webhook input
  var body = data.body || data;

  // Extract fields with defaults
  var userId = body.user_id || null;
  var action = body.action || null;

  // Validation example
  if (!userId) {
    throw new Error('HANDLER_NAME: user_id is required');
  }

  // Build output
  results.push({
    json: {
      // Output fields here
      user_id: userId,
      action: action,
      processed_at: new Date().toISOString()
    }
  });
}

return results;
