import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { requiresBillingSetup } from "@/lib/billingAccess";

// Platform admin emails (same list as PlatformAdminRoute and DashboardLayout)
const PLATFORM_ADMIN_EMAILS = ['russ@visionairy.biz'];

interface ProtectedRouteProps {
  children: ReactNode;
  adminOnly?: boolean;
  allowBillingSetup?: boolean;
}

const ProtectedRoute = ({ children, adminOnly = false, allowBillingSetup = false }: ProtectedRouteProps) => {
  const { user, userRole, loading, authError, retryAuth } = useAuth();
  const {
    data: billingAccess,
    isLoading: billingAccessLoading,
    error: billingAccessError,
    refetch: retryBillingAccess,
  } = useQuery({
    queryKey: ["billing-access", userRole?.account_id],
    enabled: Boolean(user && userRole?.account_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("billing_onboarding_required, is_platform_account, subscription_status")
        .eq("id", userRole!.account_id)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });

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

  if (billingAccessLoading) {
    return (
      <div className="min-h-screen bg-dashboard-bg-alt flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (billingAccessError) {
    return (
      <div className="min-h-screen bg-dashboard-bg-alt flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-lg border bg-background p-6 text-center shadow-sm">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">We could not verify account access</h1>
          <p className="text-dashboard-text-secondary mb-6">
            Check your connection and try again. No billing change was made.
          </p>
          <Button onClick={() => void retryBillingAccess()} className="w-full">Try again</Button>
        </div>
      </div>
    );
  }

  // Operational screens require either a Stripe-confirmed trial/paid
  // subscription or an explicit complimentary platform account. This fails
  // closed for canceled, past-due, and incomplete billing states.
  const needsBillingSetup = requiresBillingSetup(billingAccess);
  if (needsBillingSetup && !allowBillingSetup) {
    return <Navigate to="/dashboard/billing?setup=required" replace />;
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
