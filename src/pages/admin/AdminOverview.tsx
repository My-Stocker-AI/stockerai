import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, CreditCard, BarChart3, Activity, RefreshCw, TrendingUp, Package, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface PlatformStats {
  totalAccounts: number;
  activeSubscriptions: number;
  platformAccounts: number;
  monthlyRevenue: number;
  routesToday: number;
  totalUsers: number;
  totalRoutes: number;
  totalSessions: number;
}

const AdminOverview = () => {
  const [stats, setStats] = useState<PlatformStats>({
    totalAccounts: 0,
    activeSubscriptions: 0,
    platformAccounts: 0,
    monthlyRevenue: 0,
    routesToday: 0,
    totalUsers: 0,
    totalRoutes: 0,
    totalSessions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  const calculateMonthlyAmount = (driverCount: number) => {
    if (driverCount <= 5) return driverCount * 20;
    if (driverCount <= 20) return driverCount * 18;
    return driverCount * 15;
  };

  const fetchStats = async () => {
    setLoading(true);
    try {
      // Get all accounts
      const { data: accounts, error: accountsError } = await supabase
        .from('accounts')
        .select('id, subscription_status, driver_count, is_platform_account');

      if (accountsError) throw accountsError;

      const totalAccounts = accounts?.length || 0;
      const activeSubscriptions = accounts?.filter(a =>
        a.subscription_status === 'active' && !a.is_platform_account
      ).length || 0;
      const platformAccounts = accounts?.filter(a => a.is_platform_account).length || 0;

      // Calculate MRR
      const monthlyRevenue = accounts
        ?.filter(a => a.subscription_status === 'active' && !a.is_platform_account)
        .reduce((sum, a) => sum + calculateMonthlyAmount(a.driver_count || 0), 0) || 0;

      // Get routes for today
      const today = format(new Date(), 'yyyy-MM-dd');
      const { count: routesToday } = await supabase
        .from('routes')
        .select('*', { count: 'exact', head: true })
        .eq('delivery_date', today);

      // Get total users
      const { count: totalUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Get total routes
      const { count: totalRoutes } = await supabase
        .from('routes')
        .select('*', { count: 'exact', head: true });

      // Get total sessions
      const { count: totalSessions } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true });

      setStats({
        totalAccounts,
        activeSubscriptions,
        platformAccounts,
        monthlyRevenue,
        routesToday: routesToday || 0,
        totalUsers: totalUsers || 0,
        totalRoutes: totalRoutes || 0,
        totalSessions: totalSessions || 0,
      });

      // Fetch recent activity (latest sessions)
      const { data: recentSessions } = await supabase
        .from('sessions')
        .select(`
          id,
          created_at,
          status,
          profiles:user_id (first_name, last_name, email)
        `)
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentActivity(recentSessions || []);
    } catch (error) {
      console.error('Error fetching platform stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const statCards = [
    {
      title: "Total Accounts",
      value: stats.totalAccounts,
      icon: Users,
      change: `${stats.platformAccounts} platform`,
    },
    {
      title: "Active Subscriptions",
      value: stats.activeSubscriptions,
      icon: CreditCard,
      change: "Paying accounts",
    },
    {
      title: "Monthly Revenue",
      value: `$${stats.monthlyRevenue.toLocaleString()}`,
      icon: BarChart3,
      change: "Estimated MRR",
    },
    {
      title: "Routes Today",
      value: stats.routesToday,
      icon: Activity,
      change: format(new Date(), 'MMM d, yyyy'),
    },
  ];

  return (
    <AdminLayout title="Platform Overview">
      {/* Refresh Button */}
      <div className="flex justify-end mb-6">
        <Button
          variant="outline"
          onClick={fetchStats}
          className="border-slate-700 text-slate-400 hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat) => (
          <Card key={stat.title} className="bg-slate-900 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {loading ? '...' : stat.value}
              </div>
              <p className="text-xs text-slate-500 mt-1">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Users className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-slate-400 text-xs">Total Users</p>
              <p className="text-lg font-bold text-white">{loading ? '...' : stats.totalUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <TrendingUp className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-slate-400 text-xs">Total Routes</p>
              <p className="text-lg font-bold text-white">{loading ? '...' : stats.totalRoutes}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Clock className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <p className="text-slate-400 text-xs">Total Sessions</p>
              <p className="text-lg font-bold text-white">{loading ? '...' : stats.totalSessions}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20">
              <Package className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-slate-400 text-xs">Platform Accounts</p>
              <p className="text-lg font-bold text-white">{loading ? '...' : stats.platformAccounts}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Recent Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-slate-400 text-sm">No recent sessions</p>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((session) => (
                  <div key={session.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <div>
                      <p className="text-white text-sm">
                        {session.profiles?.first_name || session.profiles?.email || 'Unknown user'}
                      </p>
                      <p className="text-slate-500 text-xs">
                        {session.created_at ? format(new Date(session.created_at), 'MMM d, h:mm a') : 'N/A'}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      session.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      session.status === 'active' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-slate-700 text-slate-400'
                    }`}>
                      {session.status || 'unknown'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Quick Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <a href="/admin/users" className="block p-3 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors">
              <p className="text-white text-sm">Users & Accounts</p>
              <p className="text-slate-500 text-xs">View all registered users and accounts</p>
            </a>
            <a href="/admin/subscriptions" className="block p-3 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors">
              <p className="text-white text-sm">Subscription Management</p>
              <p className="text-slate-500 text-xs">Manage billing, platform accounts, drivers</p>
            </a>
            <a href="/admin/metrics" className="block p-3 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors">
              <p className="text-white text-sm">Usage Metrics</p>
              <p className="text-slate-500 text-xs">View detailed usage and API costs</p>
            </a>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminOverview;
