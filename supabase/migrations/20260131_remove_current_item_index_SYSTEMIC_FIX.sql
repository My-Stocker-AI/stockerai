-- ============================================================================
-- SYSTEMIC FIX: Remove current_item_index (Dual-Counter Architecture Debt)
-- ============================================================================
-- Date: 2026-01-31
-- Purpose: Eliminate dual-counter system that caused counting bugs for weeks
--
-- PROBLEM: System had TWO counters that could diverge:
--   1. sessions.current_item_index (sequence position: 0-4)
--   2. machines.completed_items (pick count: 0-5)
--
-- Bugs caused by divergence:
--   - Boundary over-increment (picking count=2 when only 1 item remains)
--   - Under-counting completed_items (itemsToIncrement = item2 ? 2 : 1)
--   - Wrong sequence calculation in reverse mode
--   - Resume from skip uses stale index
--
-- SOLUTION: Use ONLY machines.completed_items for everything
--   - Calculate target sequence FROM completed_items
--   - Forward: sequence = completed_items + 1
--   - Reverse: sequence = total_items - completed_items
--   - No divergence possible with single counter
-- ============================================================================

-- 1. Remove current_item_index from sessions table
ALTER TABLE sessions
DROP COLUMN IF EXISTS current_item_index;

COMMENT ON TABLE sessions IS 'User stocking sessions. Uses machines.completed_items for progress tracking (NOT session-level index).';

-- 2. Verify machines.completed_items exists (should exist from 20260125 migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'machines' AND column_name = 'completed_items'
  ) THEN
    RAISE EXCEPTION 'Migration prerequisite failed: machines.completed_items does not exist. Run 20260125_add_machines_completed_items.sql first.';
  END IF;

  RAISE NOTICE 'SUCCESS: machines.completed_items exists (single counter ready)';
END $$;

-- 3. Verify machines.skipped_at_item exists (for resume functionality)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'machines' AND column_name = 'skipped_at_item'
  ) THEN
    RAISE EXCEPTION 'Migration prerequisite failed: machines.skipped_at_item does not exist. Run 20260125_add_machines_completed_items.sql first.';
  END IF;

  RAISE NOTICE 'SUCCESS: machines.skipped_at_item exists (resume from skip ready)';
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify current_item_index removed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'current_item_index'
  ) THEN
    RAISE EXCEPTION 'Migration failed: current_item_index still exists in sessions table';
  END IF;

  RAISE NOTICE 'SUCCESS: current_item_index removed from sessions table';
END $$;

-- Show sessions table columns (should NOT include current_item_index)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'sessions'
ORDER BY ordinal_position;

-- ============================================================================
-- IMPACT ASSESSMENT
-- ============================================================================
-- This migration removes the column from database schema.
-- Code updates required (separate commits):
--   1. Edge Function: supabase/functions/get-next-item-data/index.ts
--   2. Workflows: get_next_item (Determine Next State node)
--   3. Frontend: src/hooks/useSessionPersistence.ts
--   4. Types: src/integrations/supabase/types.ts
-- ============================================================================

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================
/*
-- DANGER: Only use if you need to restore dual-counter system (NOT RECOMMENDED)
ALTER TABLE sessions
ADD COLUMN current_item_index INTEGER;

COMMENT ON COLUMN sessions.current_item_index IS 'DEPRECATED: Do not use. Causes dual-counter bugs. Use machines.completed_items instead.';
*/
-- ============================================================================
