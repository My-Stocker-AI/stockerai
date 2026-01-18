-- Fix concurrent "next" command race condition
-- Problem: Two "next" commands read same state, both update, causing skips/premature completion
-- Solution: Optimistic locking - only update if current_item_index matches expected value

CREATE OR REPLACE FUNCTION update_session_with_lock(
  p_session_id UUID,
  p_expected_index INTEGER,
  p_new_index INTEGER,
  p_new_machine_id UUID,
  p_new_status TEXT
)
RETURNS TABLE(
  success BOOLEAN,
  actual_index INTEGER,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_index INTEGER;
BEGIN
  -- Get current index
  SELECT current_item_index INTO v_current_index
  FROM sessions
  WHERE id = p_session_id;

  -- Check if index matches expected (optimistic lock)
  IF v_current_index IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, 'Session not found';
    RETURN;
  END IF;

  IF v_current_index != p_expected_index THEN
    -- Someone else updated between read and write - reject this update
    RETURN QUERY SELECT FALSE, v_current_index, 'Concurrent update detected - index changed';
    RETURN;
  END IF;

  -- Index matches - safe to update
  UPDATE sessions
  SET
    current_item_index = p_new_index,
    current_machine_id = p_new_machine_id,
    status = COALESCE(p_new_status, status),
    updated_at = NOW()
  WHERE id = p_session_id
    AND current_item_index = p_expected_index;  -- Double-check in WHERE clause

  -- Verify update succeeded
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, v_current_index, 'Update failed - index changed during update';
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, p_new_index, 'Success';
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION update_session_with_lock TO anon, authenticated;

COMMENT ON FUNCTION update_session_with_lock IS 'Optimistic locking for concurrent session updates - prevents race conditions from double "next" commands';
