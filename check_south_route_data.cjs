const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkRoute() {
  const routeId = '7c5dcee7-ac56-4797-8331-dde8087c0514';

  // Get route
  const { data: route, error: routeError } = await supabase
    .from('routes')
    .select('id, route_name, delivery_date, total_machines, total_items')
    .eq('id', routeId)
    .single();

  if (routeError) {
    console.log('ERROR fetching route:', routeError);
    return;
  }

  console.log('=== ROUTE ===');
  console.log(JSON.stringify(route, null, 2));

  // Get machines
  const { data: machines, error: machinesError } = await supabase
    .from('machines')
    .select('id, machine_name, total_items, status, completed_items')
    .eq('route_id', routeId)
    .order('machine_name');

  if (machinesError) {
    console.log('ERROR fetching machines:', machinesError);
    return;
  }

  console.log('\n=== MACHINES (count: ' + machines.length + ') ===');
  machines.forEach((m, i) => {
    console.log((i + 1) + '. ' + m.machine_name + ' (ID: ' + m.id + ')');
    console.log('   total_items: ' + m.total_items + ', completed: ' + m.completed_items + ', status: ' + m.status);
  });

  // Check first machine items
  if (machines.length > 0) {
    const firstMachine = machines[0];
    const { data: items, error: itemsError } = await supabase
      .from('items')
      .select('slot_number, product_name, quantity_to_add, status')
      .eq('machine_id', firstMachine.id)
      .order('slot_number', { ascending: true });

    if (itemsError) {
      console.log('ERROR fetching items:', itemsError);
      return;
    }

    console.log('\n=== FIRST MACHINE: ' + firstMachine.machine_name + ' ===');
    console.log('Machine ID: ' + firstMachine.id);
    console.log('Total items in database: ' + items.length);
    console.log('Expected from PDF: ~40 items (slots 010-059)');

    console.log('\nFirst 10 slots:');
    items.slice(0, 10).forEach(i => {
      console.log('  Slot ' + i.slot_number + ': ' + i.product_name + ' (qty: ' + i.quantity_to_add + ', status: ' + i.status + ')');
    });

    console.log('\nLast 10 slots:');
    items.slice(-10).forEach(i => {
      console.log('  Slot ' + i.slot_number + ': ' + i.product_name + ' (qty: ' + i.quantity_to_add + ', status: ' + i.status + ')');
    });

    // Check specific slots mentioned by user
    const slot059 = items.find(i => i.slot_number === '059');
    const slot048 = items.find(i => i.slot_number === '048');

    console.log('\n=== CRITICAL SLOTS ===');
    console.log('Slot 059 (should be last/bottom): ' + (slot059 ? 'EXISTS - ' + slot059.product_name : 'MISSING'));
    console.log('Slot 048 (user reported started here): ' + (slot048 ? 'EXISTS - ' + slot048.product_name : 'MISSING'));

    // Show all slot numbers to identify pattern
    console.log('\n=== ALL SLOT NUMBERS (to identify gaps) ===');
    const slotNumbers = items.map(i => i.slot_number).join(', ');
    console.log(slotNumbers);
  }
}

checkRoute().catch(console.error);
