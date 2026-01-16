-- Migration: Add critical performance indexes
-- Date: 2026-01-16
-- Purpose: Fix N+1 query problems and slow JOINs
-- Impact: 10-100x performance improvement on common queries
-- Note: Using CONCURRENTLY to avoid table locks during creation

-- Foreign key indexes (CRITICAL - these should always exist)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_machines_route_id
  ON machines(route_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_machine_id
  ON items(machine_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_route_assignments_route_id
  ON route_assignments(route_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_route_assignments_user_id
  ON route_assignments(user_id);

-- Composite indexes for common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_routes_user_date
  ON routes(user_id, delivery_date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_user_status
  ON sessions(user_id, status)
  WHERE status = 'stocking';  -- Partial index for active sessions only

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_machines_route_sequence
  ON machines(route_id, sequence);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_machine_sequence
  ON items(machine_id, sequence);

-- Account users indexes for RLS policy performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_account_users_user_id
  ON account_users(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_account_users_account_id
  ON account_users(account_id);

COMMENT ON INDEX idx_machines_route_id IS 'Performance: get_next_item_data JOIN optimization';
COMMENT ON INDEX idx_items_machine_id IS 'Performance: get_next_item_data JOIN optimization';
COMMENT ON INDEX idx_routes_user_date IS 'Performance: route listing by user and date';
COMMENT ON INDEX idx_sessions_user_status IS 'Performance: active session lookups (partial index)';
COMMENT ON INDEX idx_machines_route_sequence IS 'Performance: next machine lookup';
COMMENT ON INDEX idx_items_machine_sequence IS 'Performance: next item lookup';
