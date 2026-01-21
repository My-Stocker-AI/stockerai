import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Upload,
  Route,
  Users,
  BarChart3,
  CreditCard,
  Settings,
  LogOut,
  ExternalLink,
  Mic,
  Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  breadcrumbs?: { label: string; href?: string }[];
}

const DashboardLayout = ({ children, title, breadcrumbs }: DashboardLayoutProps) => {
  const { user, userRole, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isPrimaryAdmin = userRole?.role === 'primary_admin';

  // Platform admin emails (same list as PlatformAdminRoute)
  const PLATFORM_ADMIN_EMAILS = ['russ@visionairy.biz'];
  const isPlatformAdmin = PLATFORM_ADMIN_EMAILS.includes(user?.email || '');

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // Show admin menu if database role is primary_admin OR if platform admin
  const showAdminMenu = isPrimaryAdmin || isPlatformAdmin;

  const navItems = [
    {
      label: "Voice App",
      href: "/app",
      icon: Mic,
      external: false,
      visible: true
    },
    {
      label: "Upload Routes",
      href: "/dashboard/upload-routes",
      icon: Upload,
      visible: showAdminMenu
    },
    {
      label: "My Routes",
      href: "/dashboard/my-routes",
      icon: Route,
      visible: true
    },
    {
      label: "Team",
      href: "/dashboard/team",
      icon: Users,
      visible: showAdminMenu
    },
    {
      label: "Usage",
      href: "/dashboard/usage",
      icon: BarChart3,
      visible: showAdminMenu
    },
    {
      label: "Billing",
      href: "/dashboard/billing",
      icon: CreditCard,
      visible: showAdminMenu
    },
    {
      label: "Settings",
      href: "/dashboard/settings",
      icon: Settings,
      visible: true
    },
    {
      label: "Platform Admin",
      href: "/admin",
      icon: Shield,
      visible: isPlatformAdmin
    },
  ];

  const visibleNavItems = navItems.filter(item => item.visible);

  const Sidebar = () => (
    <div className="flex flex-col h-full w-64 bg-dashboard-bg border-r border-dashboard-border">
      {/* Logo */}
      <div className="p-6 border-b border-dashboard-border">
        <div className="flex flex-col items-center gap-3">
          <img src="/stocker-ai-logo-square.jpg" alt="Stocker AI" className="h-48 w-48 object-contain" />
          <span className="text-xl font-bold text-dashboard-text text-center">Stocker AI</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {visibleNavItems.map((item) => {
          const isActive = location.pathname === item.href;
          const Icon = item.icon;
          
          if (item.external) {
            return (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  "text-dashboard-text-secondary hover:text-dashboard-text hover:bg-dashboard-card"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
                <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
              </a>
            );
          }
          
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive 
                  ? "bg-primary/10 text-primary" 
                  : "text-dashboard-text-secondary hover:text-dashboard-text hover:bg-dashboard-card"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User Info & Logout */}
      <div className="p-4 border-t border-dashboard-border">
        <div className="mb-3">
          <p className="text-sm font-medium text-dashboard-text truncate">
            {user?.email}
          </p>
          <p className="text-xs text-dashboard-text-secondary capitalize">
            {userRole?.role?.replace('_', ' ') || 'Loading...'}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="w-full justify-start text-dashboard-text-secondary hover:text-dashboard-text hover:bg-dashboard-card"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-dashboard-bg-alt">
      {/* Mobile Header - Simple, no hamburger */}
      <header className="lg:hidden flex items-center justify-center p-4 bg-dashboard-bg border-b border-dashboard-border">
        <Link to="/dashboard" className="flex items-center gap-3">
          <img src="/stocker-ai-logo-square.jpg" alt="Stocker AI" className="h-16 w-16 object-contain" />
          <span className="text-lg font-bold text-dashboard-text">Stocker AI</span>
        </Link>
      </header>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block fixed left-0 top-0 h-screen">
          <Sidebar />
        </aside>

        {/* Main Content */}
        <main className="flex-1 lg:ml-64 min-h-screen">
          {/* Page Header */}
          <header className="bg-dashboard-bg border-b border-dashboard-border p-6">
            {breadcrumbs && breadcrumbs.length > 0 && (
              <nav className="text-sm text-dashboard-text-secondary mb-2">
                {breadcrumbs.map((crumb, index) => (
                  <span key={index}>
                    {index > 0 && <span className="mx-2">/</span>}
                    {crumb.href ? (
                      <Link to={crumb.href} className="hover:text-dashboard-text">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="text-dashboard-text">{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            )}
            <h1 className="text-2xl font-bold text-dashboard-text">{title}</h1>
          </header>

          {/* Page Content */}
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
