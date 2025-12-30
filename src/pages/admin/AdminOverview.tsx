import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CreditCard, BarChart3, Activity } from "lucide-react";

const AdminOverview = () => {
  // TODO: Fetch real data from Supabase
  const stats = [
    {
      title: "Total Accounts",
      value: "—",
      icon: Users,
      change: "Loading...",
    },
    {
      title: "Active Subscriptions",
      value: "—",
      icon: CreditCard,
      change: "Loading...",
    },
    {
      title: "Monthly Revenue",
      value: "—",
      icon: BarChart3,
      change: "Loading...",
    },
    {
      title: "Routes Today",
      value: "—",
      icon: Activity,
      change: "Loading...",
    },
  ];

  return (
    <AdminLayout title="Platform Overview">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <Card key={stat.title} className="bg-slate-900 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <p className="text-xs text-slate-500 mt-1">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-400 text-sm">
              Activity feed will show here once connected to database.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-slate-400 text-sm">
              • View all users and accounts
            </p>
            <p className="text-slate-400 text-sm">
              • Manage subscriptions and billing
            </p>
            <p className="text-slate-400 text-sm">
              • Monitor usage metrics
            </p>
            <p className="text-slate-400 text-sm">
              • Create discount codes
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminOverview;
