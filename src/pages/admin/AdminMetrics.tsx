import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Activity, Clock, Package, Users, DollarSign, TrendingUp, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";

interface UsageByAccount {
  accountId: string;
  accountName: string;
  sessions: number;
  routes: number;
  estimatedCost: number;
}

interface DailyUsage {
  date: string;
  sessions: number;
  routes: number;
  uniqueUsers: number;
}

const AdminMetrics = () => {
  const [metrics, setMetrics] = useState({
    totalRoutes: 0,
    totalSessions: 0,
    totalItems: 0,
    activeUsers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [usageByAccount, setUsageByAccount] = useState<UsageByAccount[]>([]);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [dateRange, setDateRange] = useState('30'); // Last 30 days

  // Cost estimates per session
  const GPT_COST_PER_SESSION = 0.02; // ~$0.02 per route for GPT-4o-mini
  const TTS_COST_PER_SESSION = 0.15; // ~$0.15 per route for TTS
  const TOTAL_COST_PER_SESSION = GPT_COST_PER_SESSION + TTS_COST_PER_SESSION;

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      // Get route count
      const { count: routeCount } = await supabase
        .from('routes')
        .select('*', { count: 'exact', head: true });

      // Get session count
      const { count: sessionCount } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true });

      // Get items count
      const { count: itemCount } = await supabase
        .from('items')
        .select('*', { count: 'exact', head: true });

      // Get active users (profiles count)
      const { count: userCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      setMetrics({
        totalRoutes: routeCount || 0,
        totalSessions: sessionCount || 0,
        totalItems: itemCount || 0,
        activeUsers: userCount || 0,
      });

      // Fetch usage breakdown by account
      await fetchUsageByAccount();

      // Fetch daily usage for the selected period
      await fetchDailyUsage();
    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsageByAccount = async () => {
    try {
      // Get all accounts with their usage
      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, name');

      if (!accounts) return;

      const usageData: UsageByAccount[] = [];

      for (const account of accounts) {
        // Get users for this account
        const { data: accountUsers } = await supabase
          .from('account_users')
          .select('user_id')
          .eq('account_id', account.id);

        if (!accountUsers || accountUsers.length === 0) continue;

        const userIds = accountUsers.map(u => u.user_id);

        // Get session count for these users
        const { count: sessionCount } = await supabase
          .from('sessions')
          .select('*', { count: 'exact', head: true })
          .in('user_id', userIds);

        // Get route count for these users
        const { count: routeCount } = await supabase
          .from('routes')
          .select('*', { count: 'exact', head: true })
          .in('user_id', userIds);

        if ((sessionCount || 0) > 0 || (routeCount || 0) > 0) {
          usageData.push({
            accountId: account.id,
            accountName: account.name,
            sessions: sessionCount || 0,
            routes: routeCount || 0,
            estimatedCost: (sessionCount || 0) * TOTAL_COST_PER_SESSION,
          });
        }
      }

      // Sort by sessions descending
      usageData.sort((a, b) => b.sessions - a.sessions);
      setUsageByAccount(usageData);
    } catch (error) {
      console.error('Error fetching usage by account:', error);
    }
  };

  const fetchDailyUsage = async () => {
    try {
      const days = parseInt(dateRange);
      const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

      // Get sessions grouped by date
      const { data: sessions } = await supabase
        .from('sessions')
        .select('created_at, user_id')
        .gte('created_at', startDate);

      if (!sessions) return;

      // Group by date
      const dailyMap = new Map<string, { sessions: number; users: Set<string> }>();

      sessions.forEach(session => {
        const date = format(new Date(session.created_at), 'yyyy-MM-dd');
        if (!dailyMap.has(date)) {
          dailyMap.set(date, { sessions: 0, users: new Set() });
        }
        const day = dailyMap.get(date)!;
        day.sessions++;
        if (session.user_id) day.users.add(session.user_id);
      });

      // Get routes grouped by date
      const { data: routes } = await supabase
        .from('routes')
        .select('delivery_date')
        .gte('delivery_date', startDate);

      const routesByDate = new Map<string, number>();
      routes?.forEach(route => {
        const date = route.delivery_date;
        routesByDate.set(date, (routesByDate.get(date) || 0) + 1);
      });

      // Build daily usage array
      const dailyData: DailyUsage[] = [];
      dailyMap.forEach((value, date) => {
        dailyData.push({
          date,
          sessions: value.sessions,
          routes: routesByDate.get(date) || 0,
          uniqueUsers: value.users.size,
        });
      });

      // Sort by date descending
      dailyData.sort((a, b) => b.date.localeCompare(a.date));
      setDailyUsage(dailyData.slice(0, 14)); // Show last 14 days with activity
    } catch (error) {
      console.error('Error fetching daily usage:', error);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  useEffect(() => {
    fetchDailyUsage();
  }, [dateRange]);

  const metricCards = [
    {
      title: "Total Routes",
      value: metrics.totalRoutes,
      icon: Activity,
      color: "text-blue-400",
      bgColor: "bg-blue-400/20",
    },
    {
      title: "Total Sessions",
      value: metrics.totalSessions,
      icon: Clock,
      color: "text-green-400",
      bgColor: "bg-green-400/20",
    },
    {
      title: "Items Picked",
      value: metrics.totalItems,
      icon: Package,
      color: "text-purple-400",
      bgColor: "bg-purple-400/20",
    },
    {
      title: "Total Users",
      value: metrics.activeUsers,
      icon: Users,
      color: "text-amber-400",
      bgColor: "bg-amber-400/20",
    },
  ];

  // Calculate total estimated costs
  const totalGPTCost = metrics.totalSessions * GPT_COST_PER_SESSION;
  const totalTTSCost = metrics.totalSessions * TTS_COST_PER_SESSION;
  const totalCost = totalGPTCost + totalTTSCost;

  return (
    <AdminLayout title="Usage & Metrics">
      <div className="flex justify-end mb-6">
        <Button
          variant="outline"
          onClick={fetchMetrics}
          className="border-slate-700 text-slate-400 hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {metricCards.map((metric) => (
          <Card key={metric.title} className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-lg ${metric.bgColor}`}>
                  <metric.icon className={`h-6 w-6 ${metric.color}`} />
                </div>
                <div>
                  <p className="text-slate-400 text-sm">{metric.title}</p>
                  <p className="text-2xl font-bold text-white">
                    {loading ? '...' : metric.value.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* API Costs - Now with estimated values */}
      <Card className="bg-slate-900 border-slate-800 mb-6">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-400" />
            API Cost Tracking (Estimated)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gradient-to-r from-green-600 to-green-500 rounded-lg">
              <p className="text-green-100 text-sm">Total Estimated</p>
              <p className="text-2xl font-bold text-white">${totalCost.toFixed(2)}</p>
              <p className="text-xs text-green-200">All time</p>
            </div>
            <div className="p-4 bg-slate-800 rounded-lg">
              <p className="text-slate-400 text-sm">OpenAI GPT-4o-mini</p>
              <p className="text-xl font-bold text-white">${totalGPTCost.toFixed(2)}</p>
              <p className="text-xs text-slate-500">{metrics.totalSessions} sessions @ ${GPT_COST_PER_SESSION}</p>
            </div>
            <div className="p-4 bg-slate-800 rounded-lg">
              <p className="text-slate-400 text-sm">OpenAI TTS</p>
              <p className="text-xl font-bold text-white">${totalTTSCost.toFixed(2)}</p>
              <p className="text-xs text-slate-500">{metrics.totalSessions} sessions @ ${TTS_COST_PER_SESSION}</p>
            </div>
            <div className="p-4 bg-slate-800 rounded-lg">
              <p className="text-slate-400 text-sm">Web Speech API (STT)</p>
              <p className="text-xl font-bold text-green-400">$0</p>
              <p className="text-xs text-slate-500">Free (browser native)</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-4">
            * Costs are estimated based on average usage per session. Actual costs may vary based on conversation length.
          </p>
        </CardContent>
      </Card>

      {/* Usage by Account */}
      <Card className="bg-slate-900 border-slate-800 mb-6">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-400" />
            Usage by Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usageByAccount.length === 0 ? (
            <p className="text-slate-400 text-sm">No usage data available</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800">
                    <TableHead className="text-slate-400">Account</TableHead>
                    <TableHead className="text-slate-400 text-right">Sessions</TableHead>
                    <TableHead className="text-slate-400 text-right">Routes</TableHead>
                    <TableHead className="text-slate-400 text-right">Est. Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usageByAccount.map((account) => (
                    <TableRow key={account.accountId} className="border-slate-800">
                      <TableCell className="text-white font-medium">{account.accountName}</TableCell>
                      <TableCell className="text-slate-300 text-right">{account.sessions}</TableCell>
                      <TableCell className="text-slate-300 text-right">{account.routes}</TableCell>
                      <TableCell className="text-green-400 text-right">${account.estimatedCost.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily Usage */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-400" />
              Daily Activity
            </CardTitle>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {dailyUsage.length === 0 ? (
            <p className="text-slate-400 text-sm">No activity in the selected period</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800">
                    <TableHead className="text-slate-400">Date</TableHead>
                    <TableHead className="text-slate-400 text-right">Sessions</TableHead>
                    <TableHead className="text-slate-400 text-right">Routes</TableHead>
                    <TableHead className="text-slate-400 text-right">Unique Users</TableHead>
                    <TableHead className="text-slate-400 text-right">Est. Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyUsage.map((day) => (
                    <TableRow key={day.date} className="border-slate-800">
                      <TableCell className="text-white font-medium">
                        {format(new Date(day.date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-slate-300 text-right">{day.sessions}</TableCell>
                      <TableCell className="text-slate-300 text-right">{day.routes}</TableCell>
                      <TableCell className="text-slate-300 text-right">{day.uniqueUsers}</TableCell>
                      <TableCell className="text-green-400 text-right">
                        ${(day.sessions * TOTAL_COST_PER_SESSION).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default AdminMetrics;
