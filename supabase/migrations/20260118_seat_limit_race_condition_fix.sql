-- Migration: Fix seat limit race condition
-- Date: 2026-01-18
-- Purpose: Prevent concurrent invites from bypassing seat limits
-- System Impact Audit: /docs/audits/AUDIT_2026-01-18_seat_limit_race_condition.md

-- Layer 1 Defense: Update check_seat_availability to use SELECT FOR UPDATE
-- This locks the accounts row during seat check, preventing concurrent reads
DROP FUNCTION IF EXISTS check_seat_availability(UUID, TEXT);

CREATE OR REPLACE FUNCTION check_seat_availability(p_account_id UUID, p_role TEXT DEFAULT 'driver')
RETURNS TABLE (
  total_seats INTEGER,
  used_seats INTEGER,
  available_seats INTEGER,
  can_add BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_count INTEGER;
  v_active_drivers INTEGER;
BEGIN
  -- Get seat limit from accounts table
  -- Layer 1 Defense: Lock row to prevent race condition
  -- Second concurrent request will WAIT for this lock, then see updated count
  SELECT driver_count INTO v_driver_count
  FROM accounts
  WHERE id = p_account_id
  FOR UPDATE;  -- Locks row until transaction commits

  IF v_driver_count IS NULL THEN
    RAISE EXCEPTION 'Account not found: %', p_account_id;
  END IF;

  -- DECISION Q1: Admins don't count against seat limit
  -- Only count drivers
  SELECT COUNT(*) INTO v_active_drivers
  FROM account_users
  WHERE account_id = p_account_id
    AND role = 'driver';

  -- If inviting an admin, always allowed (unlimited admins)
  IF p_role = 'primary_admin' THEN
    RETURN QUERY SELECT
      v_driver_count AS total_seats,
      v_active_drivers AS used_seats,
      (v_driver_count - v_active_drivers) AS available_seats,
      TRUE AS can_add,
      'Admins are unlimited' AS reason;
    RETURN;
  END IF;

  -- If inviting a driver, check seat availability
  IF v_active_drivers >= v_driver_count THEN
    RETURN QUERY SELECT
      v_driver_count AS total_seats,
      v_active_drivers AS used_seats,
      0 AS available_seats,
      FALSE AS can_add,
      'Driver seat limit reached. Upgrade plan to add more drivers.' AS reason;
    RETURN;
  ELSE
    RETURN QUERY SELECT
      v_driver_count AS total_seats,
      v_active_drivers AS used_seats,
      (v_driver_count - v_active_drivers) AS available_seats,
      TRUE AS can_add,
      'Seat available' AS reason;
    RETURN;
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION check_seat_availability(UUID, TEXT) TO authenticated;

-- Comment for documentation
COMMENT ON FUNCTION check_seat_availability IS 'Check if account can add more team members based on seat limits. Uses SELECT FOR UPDATE to prevent race conditions. Admins are unlimited, drivers are limited by driver_count.';

-- Layer 2 Defense: Database-level constraint (final safety net)
-- Ensures driver count NEVER exceeds driver_count limit, regardless of application code bugs
ALTER TABLE accounts
ADD CONSTRAINT IF NOT EXISTS check_driver_seat_limit
CHECK (
  (SELECT COUNT(*)
   FROM account_users
   WHERE account_users.account_id = accounts.id
     AND account_users.role = 'driver') <= driver_count
);

-- Comment for documentation
COMMENT ON CONSTRAINT check_driver_seat_limit ON accounts IS
  'Ensures driver count never exceeds driver_count limit. Enforced at database level to prevent race conditions. If violated, indicates concurrent invite race condition was caught.';
