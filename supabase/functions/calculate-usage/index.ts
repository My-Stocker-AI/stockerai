import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get request body
    const body = await req.json().catch(() => ({}));
    let targetMonth = body.month; // Expected format: YYYY-MM-01

    // Default to current month if not provided
    if (!targetMonth) {
      const now = new Date();
      targetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }

    console.log(`Calculating usage for month: ${targetMonth}, user: ${user.id}`);

    // Get user's account
    const { data: accountUser, error: accountError } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', user.id)
      .single();

    if (accountError || !accountUser) {
      console.error('Account error:', accountError);
      return new Response(JSON.stringify({ error: 'Account not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accountId = accountUser.account_id;
    console.log(`Account ID: ${accountId}`);

    // Get all user IDs in this account
    const { data: accountUsers, error: usersError } = await supabase
      .from('account_users')
      .select('user_id')
      .eq('account_id', accountId);

    if (usersError) {
      console.error('Users error:', usersError);
      return new Response(JSON.stringify({ error: 'Failed to get account users' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userIds = accountUsers?.map(u => u.user_id) || [];
    console.log(`Found ${userIds.length} users in account`);

    // Calculate month boundaries
    const monthStart = new Date(targetMonth);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    // Get all routes for users in this account
    const { data: routes, error: routesError } = await supabase
      .from('routes')
      .select('id')
      .in('user_id', userIds);

    if (routesError) {
      console.error('Routes error:', routesError);
      return new Response(JSON.stringify({ error: 'Failed to get routes' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const routeIds = routes?.map(r => r.id) || [];
    console.log(`Found ${routeIds.length} routes`);

    // Query machines completed in the month
    let dailyStats: { day: string; machines_completed: number }[] = [];
    
    if (routeIds.length > 0) {
      const { data: machines, error: machinesError } = await supabase
        .from('machines')
        .select('id, updated_at')
        .in('route_id', routeIds)
        .eq('status', 'completed')
        .gte('updated_at', monthStart.toISOString())
        .lt('updated_at', monthEnd.toISOString());

      if (machinesError) {
        console.error('Machines error:', machinesError);
        return new Response(JSON.stringify({ error: 'Failed to get machines' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Group by day
      const dailyMap = new Map<string, number>();
      for (const machine of machines || []) {
        const day = machine.updated_at?.split('T')[0] || '';
        if (day) {
          dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
        }
      }

      dailyStats = Array.from(dailyMap.entries()).map(([day, count]) => ({
        day,
        machines_completed: count,
      }));
    }

    console.log(`Daily stats: ${JSON.stringify(dailyStats)}`);

    // Calculate metrics
    const totalMachinesCompleted = dailyStats.reduce((sum, d) => sum + d.machines_completed, 0);
    const workingDays = dailyStats.length;
    const peakDailyMachines = dailyStats.length > 0 
      ? Math.max(...dailyStats.map(d => d.machines_completed))
      : 0;
    const calculatedDriversNeeded = Math.max(2, Math.ceil(peakDailyMachines / 10));

    console.log(`Metrics: total=${totalMachinesCompleted}, working=${workingDays}, peak=${peakDailyMachines}, needed=${calculatedDriversNeeded}`);

    // Get current account data
    const { data: account, error: accFetchError } = await supabase
      .from('accounts')
      .select('driver_count, min_drivers_required')
      .eq('id', accountId)
      .single();

    if (accFetchError) {
      console.error('Account fetch error:', accFetchError);
      return new Response(JSON.stringify({ error: 'Failed to get account' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const declaredDrivers = account?.driver_count || 2;

    // Upsert to monthly_usage
    const { error: upsertError } = await supabase
      .from('monthly_usage')
      .upsert({
        account_id: accountId,
        month: targetMonth,
        declared_drivers: declaredDrivers,
        total_machines_completed: totalMachinesCompleted,
        working_days: workingDays,
        peak_daily_machines: peakDailyMachines,
        calculated_drivers_needed: calculatedDriversNeeded,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'account_id,month',
      });

    if (upsertError) {
      console.error('Upsert error:', upsertError);
      return new Response(JSON.stringify({ error: 'Failed to save usage data' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update min_drivers_required if calculated > current
    const currentMinRequired = account?.min_drivers_required || 2;
    if (calculatedDriversNeeded > currentMinRequired) {
      const { error: updateError } = await supabase
        .from('accounts')
        .update({ min_drivers_required: calculatedDriversNeeded })
        .eq('id', accountId);

      if (updateError) {
        console.error('Update min_drivers error:', updateError);
        // Non-fatal, continue
      }
    }

    const response = {
      account_id: accountId,
      month: targetMonth,
      declared_drivers: declaredDrivers,
      total_machines_completed: totalMachinesCompleted,
      working_days: workingDays,
      peak_daily_machines: peakDailyMachines,
      calculated_drivers_needed: calculatedDriversNeeded,
      min_drivers_required: Math.max(currentMinRequired, calculatedDriversNeeded),
      capacity: declaredDrivers * 10,
      exceeds_capacity: calculatedDriversNeeded > declaredDrivers,
    };

    console.log(`Response: ${JSON.stringify(response)}`);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
