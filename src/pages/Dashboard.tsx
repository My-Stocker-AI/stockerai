import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Route, Users, BarChart3, CreditCard, Settings, LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const Dashboard = () => {
  const { user, userRole, signOut } = useAuth();
  const navigate = useNavigate();
  const isPrimaryAdmin = userRole?.role === 'primary_admin';

  // Platform admin check
  const PLATFORM_ADMIN_EMAILS = ['russ@visionairy.biz'];
  const isPlatformAdmin = PLATFORM_ADMIN_EMAILS.includes(user?.email || '');
  const showAdminMenu = isPrimaryAdmin || isPlatformAdmin;

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const quickActions = [
    {
      label: "Upload Routes",
      description: "Upload route PDFs",
      href: "/dashboard/upload-routes",
      icon: Upload,
      color: "bg-blue-600",
      visible: showAdminMenu
    },
    {
      label: "My Routes",
      description: "View your routes",
      href: "/dashboard/my-routes",
      icon: Route,
      color: "bg-purple-600",
      visible: true
    },
    {
      label: "Team",
      description: "Manage team members",
      href: "/dashboard/team",
      icon: Users,
      color: "bg-orange-600",
      visible: showAdminMenu
    },
    {
      label: "Usage",
      description: "View usage stats",
      href: "/dashboard/usage",
      icon: BarChart3,
      color: "bg-cyan-600",
      visible: showAdminMenu
    },
    {
      label: "Billing",
      description: "Manage subscription",
      href: "/dashboard/billing",
      icon: CreditCard,
      color: "bg-green-600",
      visible: showAdminMenu
    },
    {
      label: "Settings",
      description: "Account settings",
      href: "/dashboard/settings",
      icon: Settings,
      color: "bg-gray-600",
      visible: true
    },
    {
      label: "Logout",
      description: "Sign out",
      href: "#",
      icon: LogOut,
      color: "bg-red-600",
      visible: true,
      isAction: true
    },
  ];

  const visibleActions = quickActions.filter(a => a.visible);

  return (
    <DashboardLayout title="Dashboard">
      <div className="space-y-6">
        {/* Quick Actions Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {visibleActions.map((action) => {
            const Icon = action.icon;
            const cardContent = (
              <CardContent className="flex flex-col items-center text-center p-4 gap-3">
                <div className={`p-3 ${action.color} rounded-xl`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-dashboard-text text-sm">{action.label}</h3>
                  <p className="text-xs text-dashboard-text-secondary hidden md:block">{action.description}</p>
                </div>
              </CardContent>
            );

            if (action.isAction) {
              return (
                <button key={action.label} onClick={handleLogout} className="text-left">
                  <Card className="bg-dashboard-card border-dashboard-border hover:border-primary/50 transition-colors cursor-pointer h-full">
                    {cardContent}
                  </Card>
                </button>
              );
            }

            return (
              <Link key={action.href} to={action.href}>
                <Card className="bg-dashboard-card border-dashboard-border hover:border-primary/50 transition-colors cursor-pointer h-full">
                  {cardContent}
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
