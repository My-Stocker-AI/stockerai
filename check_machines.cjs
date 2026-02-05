const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Parse .env file
const envContent = fs.readFileSync('/home/visionairy/StockerAI/.env', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
});

const supabase = createClient(
  envVars.VITE_SUPABASE_URL,
  envVars.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const { data: machines, error } = await supabase
    .from('machines')
    .select('id, machine_name, sequence')
    .eq('route_id', '7c5dcee7-ac56-4797-8331-dde8087c0514')
    .order('sequence');

  if (error) {
    console.log('ERROR:', error);
    return;
  }

  console.log('Total machines:', machines.length);
  machines.forEach((m, i) => {
    console.log(`${i+1}. ${m.machine_name} - ${m.id}`);
  });

  const machine1 = 'ce73897a-759e-4c75-bfc7-59b7dc282976';
  const machine2 = 'fd26567b-cb8e-4ccc-af31-05f7085ef686';

  console.log('\n=== CRITICAL CHECK ===');
  console.log('Machine 1 (items 1-17):', machines.find(m => m.id === machine1) ? '✓ EXISTS' : '✗ MISSING');
  console.log('Machine 2 (item 18+):', machines.find(m => m.id === machine2) ? '✓ EXISTS' : '✗ MISSING');
})();
