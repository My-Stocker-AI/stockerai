const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function main() {
  const routeId = '7c5dcee7-ac56-4797-8331-dde8087c0514';
  
  const { data: route } = await supabase.from('routes').select('*').eq('id', routeId).single();
  console.log('ROUTE:', JSON.stringify(route, null, 2));
  
  const { data: machines } = await supabase.from('machines').select('*').eq('route_id', routeId).order('machine_name');
  console.log('\nMACHINES:', machines.length);
  machines.forEach((m, i) => console.log(`${i+1}. ${m.machine_name} - ${m.total_items} items`));
  
  if (machines[0]) {
    const { data: items } = await supabase.from('items').select('slot_number, product_name, quantity_to_add').eq('machine_id', machines[0].id).order('slot_number');
    console.log(`\nFIRST MACHINE: ${items.length} items in DB`);
    console.log('First 3:', items.slice(0,3).map(i => `${i.slot_number}: ${i.product_name}`));
    console.log('Last 3:', items.slice(-3).map(i => `${i.slot_number}: ${i.product_name}`));
  }
}

main().catch(console.error);
