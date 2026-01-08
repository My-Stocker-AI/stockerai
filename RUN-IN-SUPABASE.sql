-- ============================================
-- RUN THIS IN SUPABASE SQL EDITOR
-- ============================================
-- Dashboard > SQL Editor > New Query > Paste this and click RUN
--
-- This adds the reference columns we need for:
-- 1. Driver assignment display
-- 2. PDF storage
-- 3. Troubleshooting (showing route/machine names on items)
-- ============================================

-- 1. Add driver_name to routes table
ALTER TABLE routes
ADD COLUMN IF NOT EXISTS driver_name TEXT;

-- 2. Add pdf_url to routes table
ALTER TABLE routes
ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- 3. Add route_name to machines table
ALTER TABLE machines
ADD COLUMN IF NOT EXISTS route_name TEXT;

-- 4. Add machine_name to items table
ALTER TABLE items
ADD COLUMN IF NOT EXISTS machine_name TEXT;

-- Add helpful comments
COMMENT ON COLUMN routes.driver_name IS 'Name of the driver assigned to this route';
COMMENT ON COLUMN routes.pdf_url IS 'URL to the uploaded PDF file in Supabase Storage';
COMMENT ON COLUMN machines.route_name IS 'Name of the route this machine belongs to';
COMMENT ON COLUMN items.machine_name IS 'Name of the machine this item belongs to';

-- ============================================
-- DONE! The columns are now added.
-- ============================================
