import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Platform admin emails (same list as PlatformAdminRoute and DashboardLayout)
const PLATFORM_ADMIN_EMAILS = ['russ@visionairy.biz'];

interface ProtectedRouteProps {
  children: ReactNode;
  adminOnly?: boolean;
}

const ProtectedRoute = ({ children, adminOnly = false }: ProtectedRouteProps) => {
  const { user, userRole, loading, authError, retryAuth } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-dashboard-bg-alt flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-dashboard-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen bg-dashboard-bg-alt flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-lg border bg-background p-6 text-center shadow-sm">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">We could not finish signing you in</h1>
          <p className="text-dashboard-text-secondary mb-6">{authError}</p>
          <Button onClick={retryAuth} className="w-full">Try again</Button>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Platform admins can access all admin routes
  const isPlatformAdmin = PLATFORM_ADMIN_EMAILS.includes(user.email || '');
  const isPrimaryAdmin = userRole?.role === 'primary_admin';
  const hasAdminAccess = isPlatformAdmin || isPrimaryAdmin;

  if (adminOnly && !hasAdminAccess) {
    return <Navigate to="/dashboard/my-routes" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
