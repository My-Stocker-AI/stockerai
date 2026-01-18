-- Migration: Prevent last admin removal (account lockout protection)
-- Date: 2026-01-18
-- Purpose: Defense-in-depth security to prevent accounts from having zero admins
-- System Impact Audit: /docs/audits/AUDIT_2026-01-18_permission_bypass.md

-- Bug #4.2 Fix - Layer 2: Database-level enforcement
-- This trigger prevents the last admin from being demoted, which would lock the account
-- Works in conjunction with application-level check in invite-team-member Edge Function

-- Trigger function to prevent last admin from being demoted
CREATE OR REPLACE FUNCTION prevent_last_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_admin_count INTEGER;
BEGIN
  -- Only check if role is being changed FROM admin TO non-admin
  IF TG_OP = 'UPDATE' AND OLD.role = 'primary_admin' AND NEW.role != 'primary_admin' THEN
    -- Count remaining admins (excluding this row being updated)
    SELECT COUNT(*) INTO v_admin_count
    FROM account_users
    WHERE account_id = OLD.account_id
      AND role = 'primary_admin'
      AND id != OLD.id;  -- Exclude the admin being demoted

    IF v_admin_count = 0 THEN
      RAISE EXCEPTION 'Cannot remove last admin from account. Promote another user to admin first.'
        USING ERRCODE = 'check_violation',
              HINT = 'At least one admin is required per account.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS prevent_last_admin_removal_trigger ON account_users;

-- Create trigger
CREATE TRIGGER prevent_last_admin_removal_trigger
  BEFORE UPDATE ON account_users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_last_admin_removal();

-- Comment for documentation
COMMENT ON FUNCTION prevent_last_admin_removal IS
  'SECURITY: Prevents last admin from being demoted, which would lock the account. Ensures every account always has at least one admin. Part of Bug #4.2 fix (Layer 2 - Database enforcement).';
