-- Add reference columns for troubleshooting and driver assignment

-- 1. Add driver_name to routes table (for showing assigned driver)
ALTER TABLE routes
ADD COLUMN IF NOT EXISTS driver_name TEXT;

-- 2. Add pdf_url to routes table (for storing uploaded PDF file)
ALTER TABLE routes
ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- 3. Add route_name to machines table (for troubleshooting which route a machine belongs to)
ALTER TABLE machines
ADD COLUMN IF NOT EXISTS route_name TEXT;

-- 4. Add machine_name to items table (for visual reference of which machine an item belongs to)
ALTER TABLE items
ADD COLUMN IF NOT EXISTS machine_name TEXT;

-- Add comments explaining the columns
COMMENT ON COLUMN routes.driver_name IS 'Name of the driver assigned to this route';
COMMENT ON COLUMN routes.pdf_url IS 'URL to the uploaded PDF file in Supabase Storage';
COMMENT ON COLUMN machines.route_name IS 'Name of the route this machine belongs to (for troubleshooting)';
COMMENT ON COLUMN items.machine_name IS 'Name of the machine this item belongs to (for visual reference)';
