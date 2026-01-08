-- Rollback Migration: Remove reference columns
-- Date: 2026-01-06
-- WARNING: This will delete the columns and all data in them

-- Remove the added columns
ALTER TABLE routes
DROP COLUMN IF EXISTS driver_name;

ALTER TABLE routes
DROP COLUMN IF EXISTS pdf_url;

ALTER TABLE machines
DROP COLUMN IF EXISTS route_name;

ALTER TABLE items
DROP COLUMN IF EXISTS machine_name;
