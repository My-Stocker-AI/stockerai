const fs = require('fs');

// Parse .env
const envContent = fs.readFileSync('.env', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
});

// Get first 20 items from execution data
const execData = JSON.parse(fs.readFileSync('/home/visionairy/.claude/projects/-home-visionairy-StockerAI/6c11749f-be0d-4390-8396-acbf2d7a82cf/tool-results/mcp-synta-mcp-n8n_manage_executions-1770263079187.txt', 'utf8'));
const text = JSON.parse(execData[0].text);
const allItems = text.data.nodes['Prepare Items'].data.output[0][0].json.items;

// Test with different batch sizes
const testBatch = allItems.slice(0, 20).map(item => ({
  machine_id: item.machine_id,
  product_name: item.product_name,
  quantity: item.quantity,
  slot: item.slot,
  sequence: item.sequence,
  status: item.status,
  inventory_current: item.inventory_current,
  inventory_parlevel: item.inventory_parlevel
}));

(async () => {
  const url = `${envVars.VITE_SUPABASE_URL}/rest/v1/items`;

  console.log('Testing bulk insert of 20 items...');
  console.log('URL:', url);
  console.log('Payload size:', JSON.stringify(testBatch).length, 'bytes');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': envVars.VITE_SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${envVars.VITE_SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(testBatch)
  });

  console.log('Response status:', response.status, response.statusText);
  const responseText = await response.text();
  console.log('Response body:', responseText.substring(0, 500));

  if (!response.ok) {
    console.log('\n⚠️ INSERT FAILED');
  } else {
    console.log('\n✓ INSERT SUCCEEDED');

    // Check how many were actually inserted
    const checkResponse = await fetch(`${url}?machine_id=in.(${[...new Set(testBatch.map(i => i.machine_id))].map(id => `"${id}"`).join(',')})&select=id`, {
      headers: {
        'apikey': envVars.VITE_SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${envVars.VITE_SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    const inserted = await checkResponse.json();
    console.log('Items actually in database:', inserted.length);
  }
})();
