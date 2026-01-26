-- ============================================================================
-- PHASE 4: Add machines.completed_items Column - Contract Implementation
-- ============================================================================
-- Date: 2026-01-25
-- Purpose: Implement foundational contract for per-machine completion tracking
--
-- CRITICAL: This column is the PRIMARY source of truth for progress
-- - Persistent across machine transitions
-- - Enables resuming skipped machines
-- - Prevents cross-machine contamination
--
-- Fixes:
-- - Bug #2: Machine 2 shows "2/5" instead of "0/5"
-- - Bug #3: Machine finishes after 3 items (should be 5)
-- ============================================================================

-- 1. Add completed_items column
ALTER TABLE machines
ADD COLUMN IF NOT EXISTS completed_items INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN machines.completed_items IS 'Number of items picked from this machine (0 to total_items). MUTABLE counter, ISOLATED per machine, NEVER carries over to next machine.';

-- 2. Add skipped_at_item column (for resume functionality)
ALTER TABLE machines
ADD COLUMN IF NOT EXISTS skipped_at_item INTEGER;

COMMENT ON COLUMN machines.skipped_at_item IS 'Item count when machine was skipped. Used to resume from correct position when going back to skipped machine.';

-- 3. Add constraints - completed_items non-negative
ALTER TABLE machines
DROP CONSTRAINT IF EXISTS completed_items_non_negative;

ALTER TABLE machines
ADD CONSTRAINT completed_items_non_negative
  CHECK (completed_items >= 0);

-- 4. Add constraints - completed_items <= total_items
ALTER TABLE machines
DROP CONSTRAINT IF EXISTS completed_items_within_total;

ALTER TABLE machines
ADD CONSTRAINT completed_items_within_total
  CHECK (completed_items <= total_items);

-- 5. Add constraint - skipped_at_item validation
ALTER TABLE machines
DROP CONSTRAINT IF EXISTS skipped_at_item_valid;

ALTER TABLE machines
ADD CONSTRAINT skipped_at_item_valid
  CHECK (
    skipped_at_item IS NULL
    OR (skipped_at_item >= 0 AND skipped_at_item <= total_items)
  );

-- 6. Add index for performance (queries filter by route and check completion)
CREATE INDEX IF NOT EXISTS idx_machines_completed_items
ON machines(route_id, completed_items);

-- 7. Add trigger to prevent total_items modification (IMMUTABILITY)
CREATE OR REPLACE FUNCTION prevent_total_items_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow total_items to be set on INSERT
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Prevent total_items changes on UPDATE
  IF TG_OP = 'UPDATE' AND OLD.total_items IS DISTINCT FROM NEW.total_items THEN
    RAISE EXCEPTION 'Contract Violation: machines.total_items is IMMUTABLE (cannot be changed after creation). Attempted change: % → %', OLD.total_items, NEW.total_items;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_total_items_immutable ON machines;

CREATE TRIGGER enforce_total_items_immutable
BEFORE UPDATE ON machines
FOR EACH ROW
EXECUTE FUNCTION prevent_total_items_change();

-- 8. Add trigger to auto-set skipped_at_item when status changes to 'skipped'
CREATE OR REPLACE FUNCTION auto_set_skipped_at_item()
RETURNS TRIGGER AS $$
BEGIN
  -- When marking machine as skipped, save current completed_items
  IF NEW.status = 'skipped' AND OLD.status != 'skipped' THEN
    IF NEW.skipped_at_item IS NULL THEN
      NEW.skipped_at_item := NEW.completed_items;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_save_skip_progress ON machines;

CREATE TRIGGER auto_save_skip_progress
BEFORE UPDATE ON machines
FOR EACH ROW
WHEN (NEW.status = 'skipped')
EXECUTE FUNCTION auto_set_skipped_at_item();

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify column added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'machines' AND column_name = 'completed_items'
  ) THEN
    RAISE EXCEPTION 'Migration failed: completed_items column not created';
  END IF;

  RAISE NOTICE 'SUCCESS: machines.completed_items column exists';
END $$;

-- Verify constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'machines' AND constraint_name = 'completed_items_non_negative'
  ) THEN
    RAISE EXCEPTION 'Migration failed: completed_items_non_negative constraint not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'machines' AND constraint_name = 'completed_items_within_total'
  ) THEN
    RAISE EXCEPTION 'Migration failed: completed_items_within_total constraint not created';
  END IF;

  RAISE NOTICE 'SUCCESS: All constraints created';
END $$;

-- Verify trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'enforce_total_items_immutable'
  ) THEN
    RAISE EXCEPTION 'Migration failed: enforce_total_items_immutable trigger not created';
  END IF;

  RAISE NOTICE 'SUCCESS: Immutability trigger created';
END $$;

-- ============================================================================
-- TEST DATA VERIFICATION (Test Route)
-- ============================================================================

-- Check test route machines have completed_items = 0
SELECT
  machine_name,
  total_items,
  completed_items,
  status,
  skipped_at_item
FROM machines
WHERE route_id = '69676322-6abf-41e3-b364-bb64c72402b9'
ORDER BY sequence;

-- Should show all machines with completed_items = 0

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================

-- UNCOMMENT TO ROLLBACK:
/*
DROP TRIGGER IF EXISTS enforce_total_items_immutable ON machines;
DROP TRIGGER IF EXISTS auto_save_skip_progress ON machines;
DROP FUNCTION IF EXISTS prevent_total_items_change();
DROP FUNCTION IF EXISTS auto_set_skipped_at_item();
ALTER TABLE machines DROP CONSTRAINT IF EXISTS completed_items_non_negative;
ALTER TABLE machines DROP CONSTRAINT IF EXISTS completed_items_within_total;
ALTER TABLE machines DROP CONSTRAINT IF EXISTS skipped_at_item_valid;
DROP INDEX IF EXISTS idx_machines_completed_items;
ALTER TABLE machines DROP COLUMN IF EXISTS skipped_at_item;
ALTER TABLE machines DROP COLUMN IF EXISTS completed_items;
*/

-- ============================================================================
-- SUMMARY
-- ============================================================================

-- ✅ Added machines.completed_items (INTEGER, DEFAULT 0)
-- ✅ Added machines.skipped_at_item (INTEGER, NULLABLE)
-- ✅ Added CHECK: completed_items >= 0
-- ✅ Added CHECK: completed_items <= total_items
-- ✅ Added CHECK: skipped_at_item validation
-- ✅ Added INDEX: (route_id, completed_items)
-- ✅ Added TRIGGER: prevent total_items modification
-- ✅ Added TRIGGER: auto-save skip progress
-- ✅ Verified migration successful

-- NEXT STEPS: Phase 2 - Update workflows to use completed_items
