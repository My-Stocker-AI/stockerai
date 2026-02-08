// ============================================================================
// get_next_item (Optimized) workflow → Increment Completed Items node
// FIX: Atomic increment + Remove hardcoded API keys
// ============================================================================
// Date: 2026-02-08
// Node Position: Between "Switch Action output [1]" and "Merge All Paths input [1]"
//
// FIXES APPLIED:
// 1. Race Condition: Uses atomic RPC function instead of read-then-write
// 2. Security: Uses n8n credentials instead of hardcoded API keys
//
// DEPLOYMENT:
// 1. Run migration: supabase/migrations/20260208_atomic_increment_machine_items.sql
// 2. Replace this node's code in n8n UI
// 3. Test: Say "next" twice rapidly - should increment correctly both times
// ============================================================================

var input = $input.first().json;

// Only increment if action is next_item
if (input.action !== 'next_item') {
  return $input.all();
}

var machineId = input.machine_id;
var itemsToIncrement = input.items_to_increment;

if (!machineId) {
  throw new Error('machine_id missing from input');
}

if (!itemsToIncrement || itemsToIncrement < 1) {
  throw new Error('items_to_increment invalid: ' + itemsToIncrement);
}

// ============================================================================
// ATOMIC INCREMENT via RPC (prevents race conditions)
// ============================================================================
// Instead of:
//   1. Read completed_items = 5
//   2. Calculate new = 5 + 1 = 6
//   3. Write completed_items = 6
//
// Now does:
//   1. UPDATE completed_items = completed_items + 1 (atomic, single operation)
//
// Benefits:
// - PostgreSQL locks the row during update
// - Two concurrent requests get sequential locks, not race condition
// - Guaranteed correct increment even with rapid double-taps
// ============================================================================

var result = await this.helpers.httpRequest({
  method: 'POST',
  url: 'https://wvtkuposrlvadyeixlke.supabase.co/rest/v1/rpc/increment_machine_items',
  authentication: 'predefinedCredentialType',
  nodeCredentialType: 'supabaseApi',  // ✅ Uses stored credentials (no hardcoded keys)
  sendBody: true,
  specifyBody: 'json',
  jsonBody: JSON.stringify({
    p_machine_id: machineId,
    p_increment: itemsToIncrement
  }),
  options: {}
});

// ============================================================================
// VERIFICATION (optional but recommended)
// ============================================================================
// RPC returns updated values - we can verify the increment worked correctly
var updatedData = result;

// Handle array response (Supabase RPC returns array even for single row)
if (Array.isArray(updatedData) && updatedData.length > 0) {
  updatedData = updatedData[0];
}

// Verify completed_items matches expected value
// (Note: This is defensive - the atomic operation should always be correct)
var expectedCompleted = input.new_completed_items;
if (updatedData && updatedData.completed_items !== expectedCompleted) {
  // Log warning but don't fail - database is source of truth
  console.warn(
    'Completed items mismatch. Expected: ' + expectedCompleted +
    ', Actual: ' + updatedData.completed_items +
    '. Database value is correct (workflow calculation may have been off).'
  );
}

// ============================================================================
// RETURN ORIGINAL INPUT (unchanged)
// ============================================================================
// Downstream nodes (Merge All Paths → Update Session → Format Output)
// expect the original calculated values, not database response
// The database update is a side effect - main data flow continues unchanged
return [{
  json: input
}];
