import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { 
  AudioWaveform, 
  Upload, 
  Route, 
  Users, 
  BarChart3, 
  CreditCard, 
  Settings, 
  LogOut,
  Menu,
  X,
  ExternalLink
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, userRole, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isPrimaryAdmin = userRole?.role === 'primary_admin';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const navItems = [
    {
      label: "Voice App",
      href: "https://my-stocker-ai.com",
      icon: AudioWaveform,
      external: true,
      visible: true
    },
    { 
      label: "Upload Routes", 
      href: "/dashboard/upload", 
      icon: Upload, 
      visible: isPrimaryAdmin 
    },
    { 
      label: "My Routes", 
      href: "/dashboard/routes", 
      icon: Route, 
      visible: true 
    },
    { 
      label: "Team", 
      href: "/dashboard/team", 
      icon: Users, 
      visible: isPrimaryAdmin 
    },
    { 
      label: "Usage", 
      href: "/dashboard/usage", 
      icon: BarChart3, 
      visible: isPrimaryAdmin 
    },
    { 
      label: "Billing", 
      href: "/dashboard/billing", 
      icon: CreditCard, 
      visible: isPrimaryAdmin 
    },
    { 
      label: "Settings", 
      href: "/dashboard/settings", 
      icon: Settings, 
      visible: true 
    },
  ];

  const visibleNavItems = navItems.filter(item => item.visible);

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={cn(
      "flex flex-col h-full bg-dashboard-bg border-r border-dashboard-border",
      mobile ? "w-full" : "w-64"
    )}>
      {/* Logo */}
      <div className="p-4 border-b border-dashboard-border">
        <Link to="/" className="flex items-center gap-2">
          <AudioWaveform className="h-7 w-7 text-primary" />
          <span className="text-xl font-bold text-dashboard-text">Stocker</span>
        </Link>
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
                onClick={() => mobile && setSidebarOpen(false)}
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
              onClick={() => mobile && setSidebarOpen(false)}
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
      {/* Mobile Header */}
      <header className="lg:hidden flex items-center justify-between p-4 bg-dashboard-bg border-b border-dashboard-border">
        <Link to="/" className="flex items-center gap-2">
          <AudioWaveform className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold text-dashboard-text">Stocker</span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-dashboard-text"
        >
          {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        >
          <div 
            className="absolute left-0 top-0 h-full w-64 bg-dashboard-bg"
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar mobile />
          </div>
        </div>
      )}

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
