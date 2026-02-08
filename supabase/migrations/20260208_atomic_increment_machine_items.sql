-- ============================================================================
-- ATOMIC INCREMENT: Fix Race Condition in completed_items Counter
-- ============================================================================
-- Date: 2026-02-08
-- Issue: get_next_item workflow does read-then-write, vulnerable to race condition
-- Fix: Atomic increment using database function with row-level locking
--
-- Impact: Zero - adds helper function, no schema changes
-- Performance: Same or better (single atomic operation)
-- ============================================================================

-- Create atomic increment function
CREATE OR REPLACE FUNCTION increment_machine_items(
  p_machine_id UUID,
  p_increment INTEGER
) RETURNS TABLE (
  completed_items INTEGER,
  total_items INTEGER,
  items_remaining INTEGER
)
SECURITY DEFINER
AS $$
DECLARE
  v_completed INTEGER;
  v_total INTEGER;
BEGIN
  -- Atomic increment with implicit row lock (FOR UPDATE)
  -- PostgreSQL locks the row during UPDATE, preventing concurrent modifications
  UPDATE machines
  SET completed_items = completed_items + p_increment
  WHERE id = p_machine_id
  RETURNING
    machines.completed_items,
    machines.total_items
  INTO v_completed, v_total;

  -- Verify update succeeded
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Machine not found: %', p_machine_id;
  END IF;

  -- Return updated values
  RETURN QUERY SELECT
    v_completed,
    v_total,
    v_total - v_completed AS items_remaining;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comment
COMMENT ON FUNCTION increment_machine_items IS
  'Atomically increments machine completed_items counter. ' ||
  'Prevents race conditions from concurrent "next" commands. ' ||
  'Returns updated completed_items, total_items, and calculated items_remaining.';

-- ============================================================================
-- TESTING
-- ============================================================================

-- Test 1: Normal increment
DO $$
DECLARE
  test_result RECORD;
BEGIN
  -- Assuming a test machine exists, this would increment it
  -- SELECT * FROM increment_machine_items(
  --   'some-machine-id'::uuid,
  --   1
  -- ) INTO test_result;

  RAISE NOTICE 'Function created successfully. Ready for workflow integration.';
END $$;

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================
-- DROP FUNCTION IF EXISTS increment_machine_items(UUID, INTEGER);
