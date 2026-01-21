import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, Upload, Route, Users, BarChart3, CreditCard, Settings, LogOut } from "lucide-react";
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
      label: "Voice App",
      description: "Start stocking with voice",
      href: "/app",
      icon: Mic,
      color: "bg-primary",
      visible: true,
      primary: true
    },
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
  const primaryAction = visibleActions.find(a => a.primary);
  const otherActions = visibleActions.filter(a => !a.primary);

  return (
    <DashboardLayout title="Dashboard">
      <div className="space-y-6">
        {/* Primary Action - Voice App */}
        {primaryAction && (
          <Link to={primaryAction.href}>
            <Card className="bg-primary hover:bg-primary/90 border-0 transition-colors cursor-pointer">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="p-4 bg-white/20 rounded-xl">
                  <primaryAction.icon className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{primaryAction.label}</h2>
                  <p className="text-white/80">{primaryAction.description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Other Actions Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {otherActions.map((action) => {
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
