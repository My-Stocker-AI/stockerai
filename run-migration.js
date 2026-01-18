#!/usr/bin/env node
/**
 * Run Supabase migration manually
 * Usage: node run-migration.js <migration-file>
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: node run-migration.js <migration-file>');
  process.exit(1);
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wvtkuposrlvadyeixlke.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable not set');
  console.error('You need the service role key to run migrations');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const migrationPath = path.join(__dirname, migrationFile);
const sql = fs.readFileSync(migrationPath, 'utf8');

console.log(`Running migration: ${migrationFile}`);
console.log('SQL:', sql.substring(0, 200) + '...\n');

// Execute the SQL
(async () => {
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }

    console.log('✅ Migration completed successfully!');
    console.log('Result:', data);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
})();
