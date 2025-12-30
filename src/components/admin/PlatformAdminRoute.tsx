import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// Platform admin emails - only these users can access /admin routes
const PLATFORM_ADMIN_EMAILS = [
  'russ@visionairy.biz',
  // Add additional platform admin emails here
];

interface PlatformAdminRouteProps {
  children: ReactNode;
}

const PlatformAdminRoute = ({ children }: PlatformAdminRouteProps) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isPlatformAdmin = PLATFORM_ADMIN_EMAILS.includes(user.email || '');

  if (!isPlatformAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default PlatformAdminRoute;
