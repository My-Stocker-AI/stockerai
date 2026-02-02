-- Add defensive constraints to machines table for failsafe operation
-- Ensures data integrity at database level to prevent null/invalid values

-- 1. Ensure total_items is always positive
ALTER TABLE machines
ADD CONSTRAINT machines_total_items_positive
CHECK (total_items > 0);

-- 2. Ensure completed_items is non-negative and not null
ALTER TABLE machines
ALTER COLUMN completed_items SET NOT NULL,
ALTER COLUMN completed_items SET DEFAULT 0;

ALTER TABLE machines
ADD CONSTRAINT machines_completed_items_nonnegative
CHECK (completed_items >= 0);

-- 3. Ensure completed_items never exceeds total_items
ALTER TABLE machines
ADD CONSTRAINT machines_completed_lte_total
CHECK (completed_items <= total_items);

-- 4. Ensure status has valid values
ALTER TABLE machines
ADD CONSTRAINT machines_status_valid
CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped'));

-- 5. Ensure sequence is positive
ALTER TABLE machines
ADD CONSTRAINT machines_sequence_positive
CHECK (sequence > 0);

-- Verify constraints were created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'machines_total_items_positive'
  ) THEN
    RAISE EXCEPTION 'Migration failed: machines_total_items_positive constraint not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'machines_completed_items_nonnegative'
  ) THEN
    RAISE EXCEPTION 'Migration failed: machines_completed_items_nonnegative constraint not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'machines_completed_lte_total'
  ) THEN
    RAISE EXCEPTION 'Migration failed: machines_completed_lte_total constraint not created';
  END IF;

  RAISE NOTICE 'All machines table constraints created successfully';
END $$;
