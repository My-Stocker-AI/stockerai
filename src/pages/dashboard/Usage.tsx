import { Loader2, Users, Route, Package, Building2, AlertTriangle, TrendingUp } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";

interface DriverStats {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  routes_completed: number;
  items_picked: number;
  machines_serviced: number;
  machines_per_day: number;
}

interface UsageData {
  account_id: string;
  month: string;
  declared_drivers: number;
  total_machines_completed: number;
  working_days: number;
  peak_daily_machines: number;
  calculated_drivers_needed: number;
  min_drivers_required: number;
  capacity: number;
  exceeds_capacity: boolean;
}

interface Account {
  id: string;
  is_platform_account: boolean | null;
  driver_count: number | null;
}

const Usage = () => {
  const { userRole } = useAuth();

  // Fetch account to check if platform account
  const { data: account, isLoading: accountLoading } = useQuery({
    queryKey: ['account', userRole?.account_id],
    queryFn: async () => {
      if (!userRole?.account_id) return null;
      const { data, error } = await supabase
        .from('accounts')
        .select('id, is_platform_account, driver_count')
        .eq('id', userRole.account_id)
        .single();

      if (error) return null;
      return data as Account;
    },
    enabled: !!userRole?.account_id,
  });

  const isPlatformAccount = account?.is_platform_account === true;

  // Fetch calculated usage from edge function
  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ['calculated-usage', userRole?.account_id],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const { data, error } = await supabase.functions.invoke('calculate-usage', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Error calculating usage:', error);
        return null;
      }

      return data as UsageData;
    },
    enabled: !!userRole?.account_id,
  });

  // Fetch usage stats for current month (for additional stats)
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['usage-stats', userRole?.account_id],
    queryFn: async () => {
      if (!userRole?.account_id) return null;

      const monthStart = startOfMonth(new Date());
      const monthEnd = endOfMonth(new Date());

      // Get team members
      const { data: teamMembers } = await supabase
        .from('account_users')
        .select('user_id')
        .eq('account_id', userRole.account_id);

      const userIds = teamMembers?.map(m => m.user_id) || [];

      // Get sessions for this month
      const { data: sessions } = await supabase
        .from('sessions')
        .select('*')
        .in('user_id', userIds)
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString());

      // Get routes completed
      const completedSessions = sessions?.filter(s => s.status === 'completed') || [];
      
      // Calculate stats
      const activeDrivers = new Set(sessions?.map(s => s.user_id)).size;
      const routesCompleted = completedSessions.length;
      
      // These would come from actual item/machine data
      const itemsPicked = routesCompleted * 45; // Placeholder average

      return {
        activeDrivers,
        routesCompleted,
        itemsPicked,
      };
    },
    enabled: !!userRole?.account_id,
  });

  // Generate chart data (last 30 days) - from actual sessions
  const { data: chartData = [] } = useQuery({
    queryKey: ['usage-chart', userRole?.account_id],
    queryFn: async () => {
      if (!userRole?.account_id) return [];

      // Get team member IDs
      const { data: teamMembers } = await supabase
        .from('account_users')
        .select('user_id')
        .eq('account_id', userRole.account_id);

      const userIds = teamMembers?.map(m => m.user_id) || [];
      if (userIds.length === 0) return [];

      // Get sessions for last 30 days
      const thirtyDaysAgo = subDays(new Date(), 30);
      const { data: sessions } = await supabase
        .from('sessions')
        .select('created_at, current_item_index')
        .in('user_id', userIds)
        .gte('created_at', thirtyDaysAgo.toISOString());

      // Aggregate by date
      const dateMap: Record<string, number> = {};
      for (let i = 29; i >= 0; i--) {
        const date = subDays(new Date(), i);
        dateMap[format(date, 'yyyy-MM-dd')] = 0;
      }

      sessions?.forEach((session: any) => {
        const dateKey = format(new Date(session.created_at), 'yyyy-MM-dd');
        if (dateMap[dateKey] !== undefined) {
          // Use current_item_index as a proxy for items completed
          dateMap[dateKey] += session.current_item_index || 0;
        }
      });

      return Object.entries(dateMap).map(([date, items]) => ({
        date: format(new Date(date), 'MMM d'),
        items,
      }));
    },
    enabled: !!userRole?.account_id,
  });

  // Fetch driver breakdown - from actual sessions
  const { data: driverStats = [], isLoading: driversLoading } = useQuery({
    queryKey: ['driver-stats', userRole?.account_id],
    queryFn: async () => {
      if (!userRole?.account_id) return [];

      const monthStart = startOfMonth(new Date());
      const monthEnd = endOfMonth(new Date());

      // Get team members with profiles
      const { data: teamMembers } = await supabase
        .from('account_users')
        .select(`
          user_id,
          profiles:user_id (
            first_name,
            last_name
          )
        `)
        .eq('account_id', userRole.account_id);

      if (!teamMembers || teamMembers.length === 0) return [];

      // Get sessions for this month for all team members
      const userIds = teamMembers.map((m: any) => m.user_id);
      const { data: sessions } = await supabase
        .from('sessions')
        .select('user_id, status, current_item_index')
        .in('user_id', userIds)
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString());

      // Aggregate stats per driver
      const statsMap: Record<string, { routes: number; items: number; machines: number; days: Set<string> }> = {};

      sessions?.forEach((session: any) => {
        if (!statsMap[session.user_id]) {
          statsMap[session.user_id] = { routes: 0, items: 0, machines: 0, days: new Set() };
        }
        if (session.status === 'completed') {
          statsMap[session.user_id].routes += 1;
        }
        // Use current_item_index as proxy for items picked
        statsMap[session.user_id].items += session.current_item_index || 0;
        // Estimate machines from routes (will be more accurate when proper tracking is added)
        statsMap[session.user_id].machines += session.status === 'completed' ? 1 : 0;
      });

      return teamMembers.map((member: any) => {
        const stats = statsMap[member.user_id] || { routes: 0, items: 0, machines: 0 };
        const workingDays = Math.max(1, new Date().getDate()); // Days in month so far
        return {
          user_id: member.user_id,
          first_name: member.profiles?.first_name,
          last_name: member.profiles?.last_name,
          routes_completed: stats.routes,
          items_picked: stats.items,
          machines_serviced: stats.machines,
          machines_per_day: stats.routes > 0 ? Math.round(stats.machines / stats.routes) : 0,
        };
      }) as DriverStats[];
    },
    enabled: !!userRole?.account_id,
  });

  const isLoading = accountLoading || usageLoading || statsLoading || driversLoading;

  if (isLoading) {
    return (
      <DashboardLayout 
        title="Usage" 
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Usage" }]}
      >
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const declaredDrivers = isPlatformAccount ? 0 : (usageData?.declared_drivers || 2);
  const capacity = isPlatformAccount ? Infinity : (declaredDrivers * 10);
  const exceedsCapacity = isPlatformAccount ? false : (usageData?.exceeds_capacity || false);
  const calculatedNeeded = usageData?.calculated_drivers_needed || 0;

  return (
    <DashboardLayout 
      title="Usage" 
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Usage" }]}
    >
      <div className="space-y-8">
        {/* Capacity Warning Banner */}
        {exceedsCapacity && (
          <Alert className="bg-warning/10 border-warning/30">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <AlertTitle className="text-warning font-semibold">Usage Exceeds Plan Capacity</AlertTitle>
            <AlertDescription className="text-dashboard-text-secondary">
              Your peak daily usage this month required {calculatedNeeded} drivers, but your plan only includes {declaredDrivers} drivers.
              Consider upgrading your plan to {calculatedNeeded} drivers to match your usage.
            </AlertDescription>
          </Alert>
        )}

        {/* Plan Summary Card */}
        <Card className="bg-dashboard-card border-dashboard-border">
          <CardHeader>
            <CardTitle className="text-dashboard-text flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Your Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isPlatformAccount ? (
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="text-sm text-dashboard-text-secondary mb-1">Plan Type</p>
                  <p className="text-2xl font-bold text-primary">
                    Platform Account
                  </p>
                  <p className="text-sm text-dashboard-text-secondary">
                    Unlimited access
                  </p>
                </div>
                <div>
                  <p className="text-sm text-dashboard-text-secondary mb-1">Capacity</p>
                  <p className="text-2xl font-bold text-dashboard-text">
                    Unlimited
                  </p>
                  <p className="text-sm text-dashboard-text-secondary">
                    No usage limits
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="text-sm text-dashboard-text-secondary mb-1">Plan Capacity</p>
                  <p className="text-2xl font-bold text-dashboard-text">
                    {declaredDrivers} drivers
                  </p>
                  <p className="text-sm text-dashboard-text-secondary">
                    Up to {capacity} machines/day capacity
                  </p>
                </div>
                <div>
                  <p className="text-sm text-dashboard-text-secondary mb-1">Drivers Needed (based on usage)</p>
                  <div className="flex items-center gap-2">
                    <p className={`text-2xl font-bold ${exceedsCapacity ? 'text-warning' : 'text-success'}`}>
                      {calculatedNeeded} drivers
                    </p>
                    {exceedsCapacity && (
                      <Badge className="bg-warning/20 text-warning border-0">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Upgrade recommended
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* This Month's Usage */}
        <Card className="bg-dashboard-card border-dashboard-border">
          <CardHeader>
            <CardTitle className="text-dashboard-text">This Month's Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-dashboard-text-secondary">Total Machines Completed</p>
                <p className="text-2xl font-bold text-dashboard-text">
                  {usageData?.total_machines_completed?.toLocaleString() || 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-dashboard-text-secondary">Working Days</p>
                <p className="text-2xl font-bold text-dashboard-text">
                  {usageData?.working_days || 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-dashboard-text-secondary">Peak Day</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold text-dashboard-text">
                    {usageData?.peak_daily_machines || 0} machines
                  </p>
                  {(usageData?.peak_daily_machines || 0) > capacity && (
                    <Badge className="bg-warning/20 text-warning border-0">
                      Over limit
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-dashboard-card border-dashboard-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-dashboard-text-secondary">
                Active Drivers
              </CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-dashboard-text">
                {stats?.activeDrivers || 0}
              </div>
              <p className="text-xs text-dashboard-text-secondary">This month</p>
            </CardContent>
          </Card>

          <Card className="bg-dashboard-card border-dashboard-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-dashboard-text-secondary">
                Routes Completed
              </CardTitle>
              <Route className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-dashboard-text">
                {stats?.routesCompleted || 0}
              </div>
              <p className="text-xs text-dashboard-text-secondary">This month</p>
            </CardContent>
          </Card>

          <Card className="bg-dashboard-card border-dashboard-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-dashboard-text-secondary">
                Items Picked
              </CardTitle>
              <Package className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-dashboard-text">
                {stats?.itemsPicked?.toLocaleString() || 0}
              </div>
              <p className="text-xs text-dashboard-text-secondary">This month</p>
            </CardContent>
          </Card>

          <Card className="bg-dashboard-card border-dashboard-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-dashboard-text-secondary">
                Machines Serviced
              </CardTitle>
              <Building2 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-dashboard-text">
                {usageData?.total_machines_completed?.toLocaleString() || 0}
              </div>
              <p className="text-xs text-dashboard-text-secondary">This month</p>
            </CardContent>
          </Card>
        </div>

        {/* Usage Chart */}
        <Card className="bg-dashboard-card border-dashboard-border">
          <CardHeader>
            <CardTitle className="text-dashboard-text">Daily Items Picked (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(48, 54, 61, 0.6)" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#7d8590" 
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#7d8590" 
                    fontSize={12}
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#161b22', 
                      border: '1px solid rgba(48, 54, 61, 0.6)',
                      borderRadius: '8px',
                      color: '#e6edf3'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="items" 
                    stroke="#4ecca3" 
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Driver Breakdown */}
        <Card className="bg-dashboard-card border-dashboard-border">
          <CardHeader>
            <CardTitle className="text-dashboard-text">Driver Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dashboard-border">
                    <th className="text-left py-3 px-4 text-sm font-medium text-dashboard-text-secondary">Driver</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-dashboard-text-secondary">Routes</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-dashboard-text-secondary">Items</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-dashboard-text-secondary">Machines</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-dashboard-text-secondary">Machines/Day</th>
                  </tr>
                </thead>
                <tbody>
                  {driverStats.map((driver) => (
                    <tr key={driver.user_id} className="border-b border-dashboard-border/50">
                      <td className="py-3 px-4">
                        <span className="text-dashboard-text">
                          {driver.first_name} {driver.last_name}
                        </span>
                      </td>
                      <td className="text-right py-3 px-4 text-dashboard-text">
                        {driver.routes_completed}
                      </td>
                      <td className="text-right py-3 px-4 text-dashboard-text">
                        {driver.items_picked.toLocaleString()}
                      </td>
                      <td className="text-right py-3 px-4 text-dashboard-text">
                        {driver.machines_serviced}
                      </td>
                      <td className="text-right py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-dashboard-text">{driver.machines_per_day}</span>
                          {driver.machines_per_day > 10 && (
                            <Badge className="bg-warning/20 text-warning border-0">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              High
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-dashboard-text-secondary mt-4">
              * Each driver can service up to 10 machines per day. Plans automatically adjust to match your usage.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Usage;
