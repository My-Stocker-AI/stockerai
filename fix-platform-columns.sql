-- HOTFIX: Add platform columns to fix production blank screen
-- Run this directly in Supabase SQL Editor or via CLI

-- Add route_platform column (allows NULL, defaults to 'parlevel')
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS route_platform TEXT DEFAULT 'parlevel';

-- Add platform setup tracking columns
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS platform_setup_pending BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS platform_setup_requested_at TIMESTAMPTZ;

-- Add comments for documentation
COMMENT ON COLUMN accounts.route_platform IS 'Route management platform used by this account (parlevel, vendsoft, nayax, other)';
COMMENT ON COLUMN accounts.platform_setup_pending IS 'True if user selected non-Parlevel platform but has not submitted sample PDF yet';
COMMENT ON COLUMN accounts.platform_setup_requested_at IS 'Timestamp when user submitted sample PDF for platform setup';

-- Verify columns were added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'accounts'
AND column_name IN ('route_platform', 'platform_setup_pending', 'platform_setup_requested_at');
