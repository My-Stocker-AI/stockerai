-- ============================================================================
-- SKIP MACHINE "SAVE PROGRESS" FEATURE - DATABASE SCHEMA DOCUMENTATION
-- ============================================================================
-- Date: 2026-01-19
-- Status: BACKWARD COMPATIBLE (no migration needed)
--
-- The machine_history column is already JSONB, so we're just documenting
-- the new optional fields that will be used by the feature.
--
-- PRESERVATION Analysis: CHANGE_001 (NON_BREAKING)
-- - Auto-approved: Backward compatible
-- - No ALTER TABLE needed
-- - Old records continue to work (fields are optional)
-- ============================================================================

/*
EXISTING SCHEMA:
----------------
routes table has a machine_history JSONB column that stores skip history.

CURRENT STRUCTURE (before feature):
{
  "machine_id": "uuid",
  "skipped_at": "2026-01-19T14:30:00Z",
  "reason": "need more time"
}

NEW STRUCTURE (after feature):
{
  "machine_id": "uuid",
  "skipped_at": "2026-01-19T14:30:00Z",
  "reason": "need more time",

  -- NEW OPTIONAL FIELDS (backward compatible):
  "save_progress": true,                    -- User chose to save progress
  "skipped_at_sequence": 5,                 -- Sequence number when skipped
  "resume_from_sequence": 6,                -- Where to resume (calculated)
  "direction_when_skipped": "forward"       -- Pick direction at skip time
}

FIELD DESCRIPTIONS:
-------------------

save_progress (boolean, optional):
  - true: User said "save" (resume from where they left off)
  - false: User said "fresh" (start from beginning)
  - null/missing: Old skip (before feature) - default to fresh behavior

skipped_at_sequence (integer, optional):
  - The sequence_number of the item being worked on when skip happened
  - Used to calculate resume_from_sequence
  - Example: If skipping while on item 5, this is 5

resume_from_sequence (integer, optional):
  - The sequence_number to resume from when returning to this machine
  - Calculated based on direction:
    * Forward: skipped_at_sequence + 1 (next item)
    * Reverse: skipped_at_sequence - 1 (previous item)
  - Example: If skipped at sequence 5 going forward, resume from 6

direction_when_skipped (string, optional):
  - "forward" or "reverse"
  - Captures which direction user was going when they skipped
  - Used to calculate correct resume point
  - Important because direction can change between skip and resume

BACKWARD COMPATIBILITY:
-----------------------

✅ OLD RECORDS (without new fields):
   - save_progress is null → System treats as "fresh" (start from beginning)
   - Old behavior preserved exactly

✅ OLD QUERIES:
   - Queries that ignore new fields still work
   - JSONB allows missing fields without errors

✅ NO MIGRATION NEEDED:
   - Fields are optional in JSON
   - No schema changes required
   - No data migration required

VALIDATION:
-----------

Run this to verify old records still work:

SELECT
  route_id,
  machine_history,
  machine_history->>'save_progress' as save_progress,
  machine_history->>'skipped_at_sequence' as skipped_at_seq
FROM routes
WHERE machine_history IS NOT NULL
LIMIT 5;

-- Old records will show null for new fields (expected and OK)

TESTING:
--------

1. Create old-style skip record (without new fields):
INSERT INTO routes (session_id, route_id, machine_history)
VALUES (
  'test-session',
  'test-route',
  '{"machine_id": "test-machine", "skipped_at": "2026-01-19T14:00:00Z", "reason": "test"}'::jsonb
);

2. Query it:
SELECT machine_history->>'save_progress' FROM routes WHERE route_id = 'test-route';
-- Returns null (expected - field doesn't exist)

3. Verify no errors:
SELECT * FROM routes WHERE machine_history->>'save_progress' IS NULL;
-- Returns old records (works correctly)

4. Create new-style skip record (with new fields):
UPDATE routes
SET machine_history = jsonb_set(
  machine_history,
  '{save_progress}',
  'true'::jsonb
)
WHERE route_id = 'test-route';

5. Query new fields:
SELECT
  machine_history->>'save_progress' as save_progress,
  machine_history->>'skipped_at_sequence' as seq
FROM routes
WHERE route_id = 'test-route';
-- Returns new fields (works correctly)

ROLLBACK:
---------

If feature needs to be disabled:
- No database changes needed
- Just remove code that writes new fields
- Old records with new fields are harmless (ignored by old code)

SUMMARY:
--------

✅ No ALTER TABLE needed
✅ No data migration needed
✅ Backward compatible with all existing records
✅ Forward compatible (can add fields without breaking)
✅ Easy rollback (just stop writing new fields)

PRESERVATION Validation: NON_BREAKING ✓
*/

-- No SQL to execute - this is documentation only
-- The schema already supports what we need via JSONB flexibility
