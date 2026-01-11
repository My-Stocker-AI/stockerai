-- Deploy seat management RPC function to Supabase
-- RUN THIS IN: Supabase Dashboard → SQL Editor → New Query
-- Project: wvtkuposrlvadyeixlke (my-stocker-ai)

-- Function: check_seat_availability
-- Returns seat usage information for an account
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
  SELECT driver_count INTO v_driver_count
  FROM accounts
  WHERE id = p_account_id;

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

-- Test the function (replace with your actual account_id)
-- SELECT * FROM check_seat_availability('<your-account-id>'::UUID, 'driver');
