import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Users,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Shield,
  Tag,
  Home
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
}

const AdminLayout = ({ children, title }: AdminLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const navItems = [
    {
      label: "Overview",
      href: "/admin",
      icon: Home
    },
    {
      label: "Users & Accounts",
      href: "/admin/users",
      icon: Users
    },
    {
      label: "Subscriptions",
      href: "/admin/subscriptions",
      icon: CreditCard
    },
    {
      label: "Usage & Metrics",
      href: "/admin/metrics",
      icon: BarChart3
    },
    {
      label: "Discount Codes",
      href: "/admin/discounts",
      icon: Tag
    },
  ];

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={cn(
      "flex flex-col h-full bg-slate-900 border-r border-slate-800",
      mobile ? "w-full" : "w-64"
    )}>
      {/* Logo */}
      <div className="p-4 border-b border-slate-800">
        <Link to="/admin" className="flex items-center gap-2">
          <Shield className="h-8 w-8 text-amber-500" />
          <div>
            <span className="text-xl font-bold text-white">Stocker AI</span>
            <span className="text-xs text-amber-500 block">Platform Admin</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-amber-500/20 text-amber-500"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
              onClick={() => mobile && setSidebarOpen(false)}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Back to Dashboard */}
      <div className="p-4 border-t border-slate-800">
        <Link
          to="/dashboard"
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-4"
        >
          ← Back to Customer Dashboard
        </Link>
        <div className="mb-3">
          <p className="text-sm font-medium text-white truncate">
            {user?.email}
          </p>
          <p className="text-xs text-amber-500">
            Platform Administrator
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="w-full justify-start text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Mobile Header */}
      <header className="lg:hidden flex items-center justify-between p-4 bg-slate-900 border-b border-slate-800">
        <Link to="/admin" className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-amber-500" />
          <span className="text-lg font-bold text-white">Admin</span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-white"
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
            className="absolute left-0 top-0 h-full w-64 bg-slate-900"
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
          <header className="bg-slate-900 border-b border-slate-800 p-6">
            <h1 className="text-2xl font-bold text-white">{title}</h1>
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

export default AdminLayout;
