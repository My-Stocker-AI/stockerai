const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
  const routeId = '7c5dcee7-ac56-4797-8331-dde8087c0514';
  
  const { data: route } = await supabase.from('routes').select('*').eq('id', routeId).single();
  console.log('=== ROUTE ===');
  console.log(JSON.stringify(route, null, 2));
  
  const { data: machines } = await supabase.from('machines').select('*').eq('route_id', routeId).order('machine_name');
  console.log('\n=== MACHINES: ' + machines.length + ' ===');
  machines.forEach((m, i) => console.log((i+1) + '. ' + m.machine_name + ' - ' + m.total_items + ' items'));
  
  if (machines[0]) {
    const { data: items } = await supabase.from('items').select('slot_number, product_name, quantity_to_add').eq('machine_id', machines[0].id).order('slot_number');
    console.log('\n=== FIRST MACHINE (' + machines[0].machine_name + '): ' + items.length + ' items in DB ===');
    console.log('PDF shows ~40 items (slots 010-059)');
    console.log('\nFirst 5:', items.slice(0,5).map(i => i.slot_number + ': ' + i.product_name).join('\n'));
    console.log('\nLast 5:', items.slice(-5).map(i => i.slot_number + ': ' + i.product_name).join('\n'));
    
    const has048 = items.find(i => i.slot_number === '048');
    const has059 = items.find(i => i.slot_number === '059');
    console.log('\nSlot 048 (user saw first):', has048 ? has048.product_name : 'MISSING');
    console.log('Slot 059 (should be bottom):', has059 ? has059.product_name : 'MISSING');
  }
}

main().catch(console.error);
