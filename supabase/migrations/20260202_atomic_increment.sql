-- Fix race condition in machine item counting
-- This function performs atomic increment to prevent concurrent update issues

CREATE OR REPLACE FUNCTION increment_machine_items(
  p_machine_id UUID,
  p_increment INT
) RETURNS INT AS $$
  UPDATE machines
  SET completed_items = completed_items + p_increment
  WHERE id = p_machine_id
  RETURNING completed_items;
$$ LANGUAGE sql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION increment_machine_items(UUID, INT) TO authenticated;
