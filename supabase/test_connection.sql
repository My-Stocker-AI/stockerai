-- Simple connection test
-- If this returns no rows, database connection is broken
-- Date: 2026-02-08

SELECT 'Database connection OK' as status, NOW() as current_time;

SELECT 'Tables exist check:' as test;

SELECT 'sessions' as table_name, COUNT(*) as row_count FROM sessions
UNION ALL
SELECT 'machines', COUNT(*) FROM machines
UNION ALL
SELECT 'items', COUNT(*) FROM items
UNION ALL
SELECT 'routes', COUNT(*) FROM routes;
