/**
 * SKIP MACHINE "SAVE PROGRESS" FEATURE - n8n WORKFLOW UPDATES
 * ============================================================
 *
 * Workflow: skip_current_machine (ID: ElCSMeguJNxwp0HO)
 * Webhook: /skip-machine
 *
 * INSTRUCTIONS FOR MANUAL UPDATE (n8n UI):
 * ========================================
 *
 * You need to ADD 3 new nodes to the workflow after "Skip confirmed" node:
 *
 * 1. "Ask Save Progress" (AI Workflow Call)
 * 2. "Parse Save Response" (Code)
 * 3. "Calculate Resume Point" (Code)
 *
 * Then UPDATE the existing "Update Route Status" node to include new fields.
 *
 * PRESERVATION Analysis: CHANGE_002 (EVOLUTION)
 * - Adds 3-10 second voice prompt
 * - Timeout defaults to "fresh" (preserves old behavior)
 * - Feature flag: ENABLE_SAVE_PROGRESS
 * - Rollback: 5 minutes
 */

// ============================================================================
// NODE 1: "Ask Save Progress" (HTTP Request to AI Workflow)
// ============================================================================
//
// Type: HTTP Request
// Position: After "Skip confirmed" node
// Method: POST
// URL: {{$env.N8N_WEBHOOK_BASE_URL}}/webhook/ai-prompt
//
// Headers:
// Content-Type: application/json
//
// Body (JSON):
{
  "session_id": "={{$json.session_id}}",
  "prompt": "Would you like to save your progress on this machine, or start fresh when you come back to it? Say save or fresh.",
  "timeout_seconds": 10,
  "timeout_default_response": "fresh",
  "context": "save_progress_prompt"
}

// Expected Response:
// {
//   "response": "save" or "fresh" or timeout → "fresh"
// }
//
// Timeout Handling:
// - If user doesn't respond in 10 seconds, AI returns "fresh"
// - This preserves old behavior (start from beginning)
//
// ============================================================================


// ============================================================================
// NODE 2: "Parse Save Response" (Code)
// ============================================================================
//
// Type: Code
// Position: After "Ask Save Progress"
//
// Purpose: Parse AI response and determine if user wants to save progress
//
// Code:
var response = $input.item.json.response || 'fresh';
var responseText = String(response).toLowerCase().trim();

// Check if response contains "save"
var saveProgress = responseText.includes('save');

// Log for debugging
console.log('[Skip Machine] User response:', responseText);
console.log('[Skip Machine] Save progress:', saveProgress);

return {
  json: {
    save_progress: saveProgress,
    user_response: responseText
  }
};

// Output:
// {
//   "save_progress": true or false,
//   "user_response": "save" or "fresh"
// }
//
// ============================================================================


// ============================================================================
// NODE 3: "Calculate Resume Point" (Code)
// ============================================================================
//
// Type: Code
// Position: After "Parse Save Response"
//
// Purpose: Calculate where user should resume when returning to this machine
//
// Inputs needed from previous nodes:
// - $node["Get Current State"].json.current_sequence_number
// - $node["Get Current State"].json.pick_direction
// - $node["Parse Save Response"].json.save_progress
//
// Code:
var saveProgress = $json.save_progress;
var currentSequence = $node["Get Current State"].json.current_sequence_number;
var pickDirection = $node["Get Current State"].json.pick_direction;

var resumeFrom = null;
var skippedAtSequence = null;
var directionWhenSkipped = null;

if (saveProgress) {
  // User wants to save progress
  skippedAtSequence = currentSequence;
  directionWhenSkipped = pickDirection;

  // Calculate resume point based on direction
  if (pickDirection === 'forward') {
    resumeFrom = currentSequence + 1;  // Next item
  } else if (pickDirection === 'reverse') {
    resumeFrom = currentSequence - 1;  // Previous item
  } else {
    // Unknown direction - default to forward
    resumeFrom = currentSequence + 1;
  }

  console.log('[Skip Machine] Saving progress:');
  console.log('  Skipped at sequence:', skippedAtSequence);
  console.log('  Direction:', directionWhenSkipped);
  console.log('  Will resume from sequence:', resumeFrom);
} else {
  // User wants to start fresh (or timeout occurred)
  console.log('[Skip Machine] User chose fresh start (or timeout)');
  // resumeFrom stays null - signals "start from beginning"
}

return {
  json: {
    save_progress: saveProgress,
    skipped_at_sequence: skippedAtSequence,
    resume_from_sequence: resumeFrom,
    direction_when_skipped: directionWhenSkipped
  }
};

// Output:
// {
//   "save_progress": true or false,
//   "skipped_at_sequence": 5 or null,
//   "resume_from_sequence": 6 or null,
//   "direction_when_skipped": "forward" or "reverse" or null
// }
//
// ============================================================================


// ============================================================================
// NODE 4 (UPDATE EXISTING): "Update Route Status" (Supabase Update)
// ============================================================================
//
// This node already exists - you need to UPDATE it to include new fields
//
// Type: Supabase Node (Update)
// Table: routes
//
// OLD machine_history structure:
// {
//   "machine_id": "={{$json.machine_id}}",
//   "skipped_at": "={{$now}}",
//   "reason": "={{$json.skip_reason || 'skipped'}}"
// }
//
// NEW machine_history structure (ADD these fields):
{
  "machine_id": "={{$json.machine_id}}",
  "skipped_at": "={{$now}}",
  "reason": "={{$json.skip_reason || 'skipped'}}",

  // NEW FIELDS (from "Calculate Resume Point" node):
  "save_progress": "={{$node['Calculate Resume Point'].json.save_progress}}",
  "skipped_at_sequence": "={{$node['Calculate Resume Point'].json.skipped_at_sequence}}",
  "resume_from_sequence": "={{$node['Calculate Resume Point'].json.resume_from_sequence}}",
  "direction_when_skipped": "={{$node['Calculate Resume Point'].json.direction_when_skipped}}"
}

// These new fields are optional - if null, old behavior is preserved
//
// ============================================================================


// ============================================================================
// TESTING THE CHANGES
// ============================================================================
//
// Test 1: Save Progress Flow
// ---------------------------
// 1. Start a machine and pick a few items (say 5 items)
// 2. Say "skip"
// 3. When prompted "save or fresh?", say "save"
// 4. Check n8n execution for "Calculate Resume Point":
//    - save_progress: true
//    - skipped_at_sequence: 5
//    - resume_from_sequence: 6 (forward) or 4 (reverse)
// 5. Say "back to skipped"
// 6. Next item should be item #6 (or #4 if reverse)
//
// Test 2: Fresh Start Flow
// -------------------------
// 1. Start a machine and pick a few items
// 2. Say "skip"
// 3. When prompted, say "fresh"
// 4. Check execution:
//    - save_progress: false
//    - resume_from_sequence: null
// 5. Say "back to skipped"
// 6. Next item should be item #0 (first item)
//
// Test 3: Timeout Flow (Old Behavior)
// ------------------------------------
// 1. Start a machine and pick items
// 2. Say "skip"
// 3. When prompted, DON'T respond (wait 10 seconds)
// 4. Check execution:
//    - save_progress: false (timeout default)
//    - resume_from_sequence: null
// 5. Say "back to skipped"
// 6. Next item should be item #0 (preserves old behavior)
//
// Test 4: Backward Compatibility
// -------------------------------
// 1. Create old skip record (before feature):
//    - Should have machine_id, skipped_at, reason
//    - Should NOT have save_progress, etc.
// 2. Say "back to skipped"
// 3. Should start from item #0 (old behavior preserved)
//
// ============================================================================


// ============================================================================
// FEATURE FLAG (Optional - For Easy Disable)
// ============================================================================
//
// To make feature easy to disable, add this node at the very beginning:
//
// NODE: "Check Feature Flag" (Code)
// Position: Before "Ask Save Progress"
//
var ENABLE_SAVE_PROGRESS = true;  // Change to false to disable feature

if (!ENABLE_SAVE_PROGRESS) {
  // Skip the prompt, use default behavior (fresh start)
  return {
    json: {
      save_progress: false,
      user_response: 'feature_disabled',
      skip_prompt: true  // Signal to skip "Ask Save Progress" node
    }
  };
}

// Feature enabled - continue to prompt
return {
  json: {
    skip_prompt: false
  }
};

// Then add an IF node after this:
// - If skip_prompt === false → Go to "Ask Save Progress"
// - If skip_prompt === true → Go directly to "Calculate Resume Point" with defaults
//
// This allows instant rollback: Just set ENABLE_SAVE_PROGRESS = false
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
// 1. Set ENABLE_SAVE_PROGRESS = false in "Check Feature Flag" node
// 2. Save workflow
// 3. Test that skip works without prompt
// 4. All skips will default to "fresh" behavior
//
// Option 2: Complete Removal (30 minutes)
// ----------------------------------------
// 1. Delete "Ask Save Progress" node
// 2. Delete "Parse Save Response" node
// 3. Delete "Calculate Resume Point" node
// 4. Delete "Check Feature Flag" node
// 5. Revert "Update Route Status" to old machine_history structure
// 6. Save workflow
// 7. Old skip behavior fully restored
//
// Data Impact: NONE
// - Old records still work
// - New records with save_progress fields are harmless (ignored)
//
// ============================================================================


// ============================================================================
// SUMMARY
// ============================================================================
//
// Changes to skip_current_machine workflow:
//
// ADD 3 new nodes:
//   1. "Ask Save Progress" (HTTP Request)
//   2. "Parse Save Response" (Code)
//   3. "Calculate Resume Point" (Code)
//
// UPDATE 1 existing node:
//   1. "Update Route Status" (add 4 new fields to machine_history)
//
// OPTIONAL (for easy rollback):
//   1. "Check Feature Flag" (Code) + IF node
//
// Total implementation time: 1 hour
// Rollback time: 5 minutes (feature flag) or 30 minutes (complete removal)
// Risk: MEDIUM (user-facing change, but safe defaults)
//
// ============================================================================
