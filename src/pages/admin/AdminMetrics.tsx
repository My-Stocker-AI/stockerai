import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Activity, Clock, Package, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const AdminMetrics = () => {
  const [metrics, setMetrics] = useState({
    totalRoutes: 0,
    totalSessions: 0,
    totalItems: 0,
    activeUsers: 0,
  });
  const [loading, setLoading] = useState(true);

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
    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

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

      {/* Usage Over Time */}
      <Card className="bg-slate-900 border-slate-800 mb-6">
        <CardHeader>
          <CardTitle className="text-white">Usage Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-slate-500">
            <p>Charts will be added when usage data is available</p>
          </div>
        </CardContent>
      </Card>

      {/* API Costs */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">API Cost Tracking</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-800 rounded-lg">
              <p className="text-slate-400 text-sm">OpenAI (GPT-4o-mini)</p>
              <p className="text-xl font-bold text-white">$—</p>
              <p className="text-xs text-slate-500">Per route: ~$0.02</p>
            </div>
            <div className="p-4 bg-slate-800 rounded-lg">
              <p className="text-slate-400 text-sm">OpenAI TTS</p>
              <p className="text-xl font-bold text-white">$—</p>
              <p className="text-xs text-slate-500">Per route: ~$0.15</p>
            </div>
            <div className="p-4 bg-slate-800 rounded-lg">
              <p className="text-slate-400 text-sm">Web Speech API (STT)</p>
              <p className="text-xl font-bold text-white">$0</p>
              <p className="text-xs text-slate-500">Free (browser native)</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default AdminMetrics;
