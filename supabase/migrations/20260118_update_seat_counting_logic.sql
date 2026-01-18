-- Migration: Update seat counting logic for new billing model
-- Date: 2026-01-18
-- Purpose: Implement billable seat logic based on operational permissions
--
-- NEW BILLING MODEL:
-- - Billable seat = driver OR (admin with can_upload_routes=true)
-- - Non-billable = admin with can_upload_routes=false (billing/team mgmt only)
-- - Minimum 2 billable seats required per account
--
-- FORMULA:
-- billable_seats = COUNT(role='driver') + COUNT(role='admin' AND can_upload_routes=true)
-- Constraint: billable_seats >= 2

CREATE OR REPLACE FUNCTION check_seat_availability(
  p_account_id UUID,
  p_role TEXT DEFAULT 'driver',
  p_can_upload_routes BOOLEAN DEFAULT NULL
)
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
  v_billable_seats INTEGER;
  v_will_be_billable BOOLEAN;
BEGIN
  -- Get seat limit from accounts table
  -- Layer 1 Defense: Lock row to prevent race condition
  SELECT driver_count INTO v_driver_count
  FROM accounts
  WHERE id = p_account_id
  FOR UPDATE;  -- Locks row until transaction commits

  IF v_driver_count IS NULL THEN
    RAISE EXCEPTION 'Account not found: %', p_account_id;
  END IF;

  -- NEW LOGIC: Count billable seats
  -- Billable = drivers + admins with can_upload_routes=true
  SELECT COUNT(*) INTO v_billable_seats
  FROM account_users
  WHERE account_id = p_account_id
    AND (
      role = 'driver'
      OR (role = 'primary_admin' AND can_upload_routes = TRUE)
    );

  -- Determine if the new user will be billable
  IF p_role = 'driver' THEN
    v_will_be_billable := TRUE;
  ELSIF p_role = 'primary_admin' THEN
    -- Admin is billable if they have can_upload_routes=true
    v_will_be_billable := COALESCE(p_can_upload_routes, FALSE);
  ELSE
    v_will_be_billable := FALSE;
  END IF;

  -- SPECIAL CASE: 2-seat minimum enforcement
  -- If account has fewer than 2 billable seats, always allow (up to 2)
  IF v_billable_seats < 2 THEN
    RETURN QUERY SELECT
      v_driver_count AS total_seats,
      v_billable_seats AS used_seats,
      GREATEST(2 - v_billable_seats, v_driver_count - v_billable_seats) AS available_seats,
      TRUE AS can_add,
      CASE
        WHEN v_billable_seats = 0 THEN 'Account requires minimum 2 billable seats (0/2 used)'
        WHEN v_billable_seats = 1 THEN 'Account requires minimum 2 billable seats (1/2 used)'
      END AS reason;
    RETURN;
  END IF;

  -- Non-billable users (admins with can_upload_routes=false) are always allowed
  IF NOT v_will_be_billable THEN
    RETURN QUERY SELECT
      v_driver_count AS total_seats,
      v_billable_seats AS used_seats,
      (v_driver_count - v_billable_seats) AS available_seats,
      TRUE AS can_add,
      'Non-billable admin (billing/management only) - does not count against seat limit' AS reason;
    RETURN;
  END IF;

  -- Billable user: Check if we have available seats
  IF v_billable_seats >= v_driver_count THEN
    RETURN QUERY SELECT
      v_driver_count AS total_seats,
      v_billable_seats AS used_seats,
      0 AS available_seats,
      FALSE AS can_add,
      'Billable seat limit reached. Upgrade plan to add more operational users.' AS reason;
    RETURN;
  ELSE
    RETURN QUERY SELECT
      v_driver_count AS total_seats,
      v_billable_seats AS used_seats,
      (v_driver_count - v_billable_seats) AS available_seats,
      TRUE AS can_add,
      'Seat available' AS reason;
    RETURN;
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION check_seat_availability(UUID, TEXT, BOOLEAN) TO authenticated;

-- Comments for documentation
COMMENT ON FUNCTION check_seat_availability IS 'Check if account can add more team members based on billable seat limits. Billable seats = drivers + admins with can_upload_routes=true. Minimum 2 billable seats per account.';
