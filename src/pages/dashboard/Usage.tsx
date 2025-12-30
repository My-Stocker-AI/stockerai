import { Loader2, Users, Route, Package, Building2, AlertTriangle } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const Usage = () => {
  const { userRole } = useAuth();

  // Fetch usage stats for current month
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
      
      // Calculate stats (placeholder - real implementation would aggregate from items/machines)
      const activeDrivers = new Set(sessions?.map(s => s.user_id)).size;
      const routesCompleted = completedSessions.length;
      
      // These would come from actual item/machine data
      const itemsPicked = routesCompleted * 45; // Placeholder average
      const machinesServiced = routesCompleted * 8; // Placeholder average

      return {
        activeDrivers,
        routesCompleted,
        itemsPicked,
        machinesServiced,
      };
    },
    enabled: !!userRole?.account_id,
  });

  // Generate chart data (last 30 days)
  const { data: chartData = [] } = useQuery({
    queryKey: ['usage-chart', userRole?.account_id],
    queryFn: async () => {
      // Placeholder chart data - in production, this would aggregate from sessions/items
      const data = [];
      for (let i = 29; i >= 0; i--) {
        const date = subDays(new Date(), i);
        data.push({
          date: format(date, 'MMM d'),
          items: Math.floor(Math.random() * 100) + 20,
        });
      }
      return data;
    },
    enabled: !!userRole?.account_id,
  });

  // Fetch driver breakdown
  const { data: driverStats = [], isLoading: driversLoading } = useQuery({
    queryKey: ['driver-stats', userRole?.account_id],
    queryFn: async () => {
      if (!userRole?.account_id) return [];

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

      // Placeholder driver stats - in production, aggregate from sessions/items
      return (teamMembers || []).map((member: any) => ({
        user_id: member.user_id,
        first_name: member.profiles?.first_name,
        last_name: member.profiles?.last_name,
        routes_completed: Math.floor(Math.random() * 20) + 5,
        items_picked: Math.floor(Math.random() * 500) + 100,
        machines_serviced: Math.floor(Math.random() * 150) + 30,
        machines_per_day: Math.floor(Math.random() * 8) + 5,
      })) as DriverStats[];
    },
    enabled: !!userRole?.account_id,
  });

  const isLoading = statsLoading || driversLoading;

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

  return (
    <DashboardLayout 
      title="Usage" 
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Usage" }]}
    >
      <div className="space-y-8">
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
                {stats?.machinesServiced?.toLocaleString() || 0}
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
              * Drivers averaging more than 10 machines/day may need additional support
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Usage;
