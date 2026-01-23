// =============================================================================
// CATASTROPHIC FAILURE FIX: Workflow Guard - Prevent Commands After Completion
// DATE: 2026-01-22
// =============================================================================
//
// CRITICAL: Add this guard at the TOP of the Determine Next State node
// BEFORE any processing logic
//
// COPY THIS INTO: get_next_item (Optimized) workflow → "Determine Next State" node
// LOCATION: After session fetch, BEFORE command processing
// =============================================================================

// Fetch session data (existing code - keep this)
var session = $('Get Session State').first().json;
var command = $input.item.json.command || '';

// =============================================================================
// NEW GUARD: Reject commands on completed machines
// =============================================================================

// Check if machine is already complete
var machineComplete = session.machine_complete || false;

if (machineComplete && (command === 'next' || command === 'back')) {
  console.log('[Guard] Rejected command on completed machine:', command);
  return [{
    json: {
      error: 'MACHINE_ALREADY_COMPLETE',
      message: 'This machine is already complete. Please start next machine or new route.',
      action: 'error',
      machine_complete: true
    }
  }];
}

// =============================================================================
// EXISTING LOGIC CONTINUES BELOW
// (Keep all existing Determine Next State code after this guard)
// =============================================================================
