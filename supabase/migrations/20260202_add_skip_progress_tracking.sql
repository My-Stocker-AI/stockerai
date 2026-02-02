-- Add skip progress tracking to machines table
-- Records how many items were completed when machine was skipped
-- Allows resuming from partial progress instead of restarting

-- Add column for tracking progress at skip time
ALTER TABLE machines
ADD COLUMN IF NOT EXISTS skipped_at_item INTEGER DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN machines.skipped_at_item IS
'Records completed_items value when machine was skipped. NULL if never skipped or if resumed.';

-- Verify column was created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'machines'
    AND column_name = 'skipped_at_item'
  ) THEN
    RAISE EXCEPTION 'Migration failed: skipped_at_item column not created';
  END IF;

  RAISE NOTICE 'Skip progress tracking column created successfully';
END $$;
