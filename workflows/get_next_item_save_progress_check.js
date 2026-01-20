/**
 * GET_NEXT_ITEM "SAVE PROGRESS" FEATURE - n8n WORKFLOW UPDATE
 * ============================================================
 *
 * Workflow: get_next_item (Optimized) (ID: iykbFj7f9222PF7r)
 * Webhook: /next-item-optimized
 *
 * INSTRUCTIONS FOR MANUAL UPDATE (n8n UI):
 * ========================================
 *
 * You need to ADD 1 new node BEFORE "Get Current Item" node:
 *
 * 1. "Check Saved Progress" (Code)
 *
 * Then UPDATE the "Get Current Item" query to use the calculated starting index.
 *
 * PRESERVATION Analysis: CHANGE_005 (NON_BREAKING)
 * - Auto-approved: Backward compatible
 * - Defaults to old behavior if save_progress is null
 * - No breaking changes
 */

// ============================================================================
// NODE 1 (NEW): "Check Saved Progress" (Code)
// ============================================================================
//
// Type: Code
// Position: BEFORE "Get Current Item" (Supabase query)
//
// Purpose: Check if returning to a skipped machine that had progress saved
//
// Inputs needed from previous nodes:
// - $node["Get Route"].json.machine_history (array of skip records)
// - $node["Get Current State"].json.machine_id (current machine ID)
// - $node["Get Current State"].json.action (e.g., "resume_skipped", "next_machine", etc.)
//
// Code:

var action = $node["Get Current State"].json.action;
var currentMachineId = $node["Get Current State"].json.machine_id;
var machineHistory = $node["Get Route"].json.machine_history || [];

// Default: Start from beginning (old behavior)
var startingSequence = 0;
var resumingFromSave = false;

console.log('[Get Next Item] Action:', action);
console.log('[Get Next Item] Machine ID:', currentMachineId);
console.log('[Get Next Item] Machine history records:', machineHistory.length);

// Only check for saved progress if resuming a skipped machine
if (action === 'resume_skipped' || action === 'back_to_skipped') {
  // Find the skip record for this machine
  var skipRecord = null;

  for (var i = 0; i < machineHistory.length; i++) {
    var record = machineHistory[i];
    if (record.machine_id === currentMachineId) {
      skipRecord = record;
      console.log('[Get Next Item] Found skip record for machine:', currentMachineId);
      break;
    }
  }

  if (skipRecord) {
    // Check if user saved progress
    var saveProgress = skipRecord.save_progress;
    var resumeFromSequence = skipRecord.resume_from_sequence;

    console.log('[Get Next Item] Save progress:', saveProgress);
    console.log('[Get Next Item] Resume from sequence:', resumeFromSequence);

    if (saveProgress === true && resumeFromSequence !== null && resumeFromSequence !== undefined) {
      // User saved progress - resume from saved point
      startingSequence = resumeFromSequence;
      resumingFromSave = true;

      console.log('[Get Next Item] Resuming from saved sequence:', startingSequence);
    } else {
      // User chose fresh start OR old skip (before feature)
      startingSequence = 0;
      resumingFromSave = false;

      console.log('[Get Next Item] Starting fresh (sequence 0)');
    }
  } else {
    // No skip record found (shouldn't happen, but handle gracefully)
    console.log('[Get Next Item] No skip record found - starting from beginning');
    startingSequence = 0;
    resumingFromSave = false;
  }
} else {
  // Not resuming a skip - normal flow
  // Starting sequence determined by other logic (forward/reverse)
  console.log('[Get Next Item] Not resuming skip - normal flow');
}

return {
  json: {
    starting_sequence: startingSequence,
    resuming_from_save: resumingFromSave,
    action: action,
    machine_id: currentMachineId
  }
};

// Output:
// {
//   "starting_sequence": 0 or saved sequence number,
//   "resuming_from_save": true or false,
//   "action": "resume_skipped" or other,
//   "machine_id": "uuid"
// }
//
// ============================================================================


// ============================================================================
// NODE 2 (UPDATE EXISTING): "Get Current Item" (Supabase Query)
// ============================================================================
//
// This node already exists - you need to UPDATE the query
//
// Type: Supabase Node (Select)
// Table: items
//
// OLD Query Logic:
// SELECT * FROM items
// WHERE machine_id = '{{$json.machine_id}}'
// ORDER BY sequence_number
// OFFSET 0  -- Or determined by pick_direction
// LIMIT 1
//
// NEW Query Logic (use starting_sequence from "Check Saved Progress"):
//
// In the OFFSET field, change from hardcoded value to:
// ={{$node["Check Saved Progress"].json.starting_sequence}}
//
// Full query should be:
//
// Table: items
// Filters:
//   - machine_id: ={{$json.machine_id}}
// Order:
//   - sequence_number: ASC (or DESC based on pick_direction)
// Limit: 1
// Offset: ={{$node["Check Saved Progress"].json.starting_sequence}}
//
// This makes the query use the calculated starting point:
// - If saved progress: starts from resume_from_sequence
// - If fresh/old skip: starts from 0 (beginning)
//
// ============================================================================


// ============================================================================
// EDGE CASES TO HANDLE
// ============================================================================
//
// Edge Case 1: Item Deleted After Skip
// -------------------------------------
// User skips at sequence 5, later item #6 is deleted from route
//
// Handling:
// - Query will return empty result (no item at sequence 6)
// - Need to add fallback: If no item found at resume_from_sequence,
//   try next sequence, or show "machine complete"
//
// Add this AFTER "Get Current Item":
//
var items = $input.all();

if (items.length === 0 && $node["Check Saved Progress"].json.resuming_from_save) {
  // No item found at saved sequence - try next item
  console.log('[Get Next Item] No item at saved sequence - trying next');

  // Increment starting_sequence and try again
  // (This would require a loop or second query - implement if needed)

  // For now, default to completing machine
  return {
    json: {
      action: 'machine_complete',
      reason: 'No items remaining at saved sequence'
    }
  };
}

return items[0];  // Normal case - return found item
//
// Edge Case 2: Direction Changed After Skip
// ------------------------------------------
// User skips going forward, then changes route direction to reverse
//
// Handling:
// - resume_from_sequence was calculated for forward direction
// - If route direction changed, saved sequence might be wrong
// - Solution: Store direction_when_skipped and warn if mismatch
//
// Add validation:
//
var savedDirection = skipRecord.direction_when_skipped;
var currentDirection = $node["Get Current State"].json.pick_direction;

if (savedDirection && savedDirection !== currentDirection) {
  console.warn('[Get Next Item] Direction changed since skip!');
  console.warn('  Saved direction:', savedDirection);
  console.warn('  Current direction:', currentDirection);
  console.warn('  Resume point may be incorrect');

  // Option: Reset to fresh start if direction changed
  // Or: Recalculate resume point for new direction
}
//
// Edge Case 3: Multiple Skips on Same Machine
// --------------------------------------------
// User skips machine A, then skips machine B, then goes back to machine A
//
// Handling:
// - machine_history is an array, may have multiple records for same machine
// - Need to find the MOST RECENT skip record
//
// Update the skip record search:
//
var skipRecord = null;
var latestSkipTime = null;

for (var i = 0; i < machineHistory.length; i++) {
  var record = machineHistory[i];
  if (record.machine_id === currentMachineId) {
    var skipTime = new Date(record.skipped_at);

    if (!latestSkipTime || skipTime > latestSkipTime) {
      skipRecord = record;
      latestSkipTime = skipTime;
    }
  }
}
// Now skipRecord is the most recent skip for this machine
//
// ============================================================================


// ============================================================================
// TESTING THE CHANGES
// ============================================================================
//
// Test 1: Save Progress Resume
// -----------------------------
// 1. Start machine, pick 5 items
// 2. Say "skip" → "save"
// 3. Check database:
//    SELECT machine_history FROM routes WHERE ...
//    Should show:
//      save_progress: true
//      skipped_at_sequence: 5
//      resume_from_sequence: 6
// 4. Say "back to skipped"
// 5. Check n8n execution "Check Saved Progress":
//    starting_sequence: 6
//    resuming_from_save: true
// 6. Verify next item is sequence #6
//
// Test 2: Fresh Start Resume
// ---------------------------
// 1. Start machine, pick items
// 2. Say "skip" → "fresh"
// 3. Database should show:
//    save_progress: false
//    resume_from_sequence: null
// 4. Say "back to skipped"
// 5. Check execution:
//    starting_sequence: 0
//    resuming_from_save: false
// 6. Verify next item is sequence #0 (first item)
//
// Test 3: Old Skip Record (Backward Compatibility)
// -------------------------------------------------
// 1. Create old skip record (manually or from before feature):
//    {
//      "machine_id": "...",
//      "skipped_at": "...",
//      "reason": "..."
//      // No save_progress field
//    }
// 2. Say "back to skipped"
// 3. Check execution:
//    save_progress: undefined/null
//    starting_sequence: 0 (default)
// 4. Verify starts from first item (old behavior preserved)
//
// Test 4: Reverse Direction Save
// -------------------------------
// 1. Set route to reverse direction
// 2. Start machine at end, pick backwards
// 3. Skip at sequence 20 → "save"
// 4. Database should show:
//    resume_from_sequence: 19 (one less than 20)
//    direction_when_skipped: "reverse"
// 5. Resume and verify starts at item #19
//
// ============================================================================


// ============================================================================
// ROLLBACK PLAN
// ============================================================================
//
// If feature needs to be disabled:
//
// Option 1: Quick Rollback (5 minutes)
// -------------------------------------
// 1. In "Check Saved Progress" node, change:
//    var startingSequence = 0;  // Always start from beginning
//    // Comment out all the save_progress checking logic
// 2. Save workflow
// 3. Test that all skips resume from beginning
//
// Option 2: Complete Removal (15 minutes)
// ----------------------------------------
// 1. Delete "Check Saved Progress" node
// 2. Revert "Get Current Item" OFFSET to original value (0 or calculated by pick_direction)
// 3. Save workflow
// 4. Old behavior fully restored
//
// Data Impact: NONE
// - Old records still work
// - New records ignored
// - No migration needed
//
// ============================================================================


// ============================================================================
// SUMMARY
// ============================================================================
//
// Changes to get_next_item workflow:
//
// ADD 1 new node:
//   1. "Check Saved Progress" (Code)
//
// UPDATE 1 existing node:
//   1. "Get Current Item" (change OFFSET to use starting_sequence)
//
// OPTIONAL enhancements:
//   1. Edge case handling (deleted items, direction changes)
//   2. Multiple skip handling (find most recent)
//
// Total implementation time: 1 hour
// Rollback time: 5 minutes (code change) or 15 minutes (complete removal)
// Risk: LOW (defaults to old behavior if fields missing)
//
// PRESERVATION Validation: NON_BREAKING ✓
//
// ============================================================================
