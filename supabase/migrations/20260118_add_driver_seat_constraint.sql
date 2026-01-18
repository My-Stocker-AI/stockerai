-- Migration: Add driver seat limit constraint
-- Date: 2026-01-18
-- Purpose: Prevent seat limit bypass via race condition (database-level enforcement)
-- System Impact Audit: /docs/audits/AUDIT_2026-01-18_seat_limit_race_condition.md

-- Layer 2 Defense: Database-level constraint (final safety net)
-- Ensures driver count NEVER exceeds driver_count limit, regardless of application code bugs
ALTER TABLE accounts
ADD CONSTRAINT check_driver_seat_limit
CHECK (
  (SELECT COUNT(*)
   FROM account_users
   WHERE account_users.account_id = accounts.id
     AND account_users.role = 'driver') <= driver_count
);

-- Comment for documentation
COMMENT ON CONSTRAINT check_driver_seat_limit ON accounts IS
  'Ensures driver count never exceeds driver_count limit. Enforced at database level to prevent race conditions. If violated, indicates concurrent invite race condition was caught.';
