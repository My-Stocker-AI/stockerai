-- Migration: Add can_upload_routes permission
-- Date: 2026-01-18
-- Purpose: Support flexible billing model where operational work = billable seat
--
-- BUSINESS LOGIC:
-- - Billable seat = anyone who can upload, assign, or pick routes
-- - Non-billable = people who ONLY do billing + team management
-- - Minimum 2 billable seats required per account
--
-- SCENARIOS:
-- 1. Small shop: Owner (admin with can_upload_routes=true) = 1 billable seat
-- 2. Medium shop: Billing admin (can_upload_routes=false) + Dispatcher (can_upload_routes=true) + Drivers
-- 3. Large shop: Multiple managers (can_upload_routes=false) + Dispatcher (can_upload_routes=true) + Drivers

-- Add can_upload_routes column to account_users
ALTER TABLE account_users
ADD COLUMN IF NOT EXISTS can_upload_routes BOOLEAN NOT NULL DEFAULT FALSE;

-- Set sensible defaults based on existing roles:
-- - Drivers: TRUE (they need to pick routes)
-- - Primary admins: FALSE (conservative default - must explicitly grant)
UPDATE account_users
SET can_upload_routes = CASE
  WHEN role = 'driver' THEN TRUE
  WHEN role = 'primary_admin' THEN FALSE
  ELSE FALSE
END
WHERE can_upload_routes IS NULL;

-- Add index for performance (seat counting queries will filter on this)
CREATE INDEX IF NOT EXISTS idx_account_users_can_upload_routes
ON account_users(can_upload_routes)
WHERE can_upload_routes = TRUE;

-- Add comment explaining the column
COMMENT ON COLUMN account_users.can_upload_routes IS
'Permission flag for operational work (upload/assign/pick routes). Users with this=true count as billable seats. Users with this=false only do billing/team management and are non-billable.';
