import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { VersionIndicator } from "@/components/VersionIndicator";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import Home from "./pages/Home";
import Pricing from "./pages/Pricing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import SetPassword from "./pages/SetPassword";
import Dashboard from "./pages/Dashboard";
import UploadRoutes from "./pages/dashboard/UploadRoutes";
import MyRoutes from "./pages/dashboard/MyRoutes";
import Team from "./pages/dashboard/Team";
import Usage from "./pages/dashboard/Usage";
import Billing from "./pages/dashboard/Billing";
import Settings from "./pages/dashboard/Settings";
import NotFound from "./pages/NotFound";
import StockerApp from "./pages/StockerApp";
import ProtectedRoute from "@/components/dashboard/ProtectedRoute";
import PlatformAdminRoute from "@/components/admin/PlatformAdminRoute";
import AdminOverview from "./pages/admin/AdminOverview";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminSubscriptions from "./pages/admin/AdminSubscriptions";
import AdminMetrics from "./pages/admin/AdminMetrics";
import AdminDiscounts from "./pages/admin/AdminDiscounts";
import Guide from "./pages/Guide";
import Demo from "./pages/Demo";
import DemoLive from "./pages/DemoLive";
import Troubleshooting from "./pages/Troubleshooting";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <VersionIndicator />
      <PWAInstallBanner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/troubleshooting" element={<Troubleshooting />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/demo" element={<Demo />} />
            <Route path="/demo/live" element={<DemoLive />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/set-password" element={<SetPassword />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/dashboard/upload-routes" element={<ProtectedRoute adminOnly><UploadRoutes /></ProtectedRoute>} />
            <Route path="/dashboard/my-routes" element={<ProtectedRoute><MyRoutes /></ProtectedRoute>} />
            <Route path="/dashboard/team" element={<ProtectedRoute adminOnly><Team /></ProtectedRoute>} />
            <Route path="/dashboard/usage" element={<ProtectedRoute adminOnly><Usage /></ProtectedRoute>} />
            <Route path="/dashboard/billing" element={<ProtectedRoute adminOnly><Billing /></ProtectedRoute>} />
            <Route path="/dashboard/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/app" element={<ProtectedRoute><StockerApp /></ProtectedRoute>} />

            {/* Redirects for short URLs */}
            <Route path="/my-routes" element={<Navigate to="/dashboard/my-routes" replace />} />
            <Route path="/upload-routes" element={<Navigate to="/dashboard/upload-routes" replace />} />
            <Route path="/team" element={<Navigate to="/dashboard/team" replace />} />
            <Route path="/usage" element={<Navigate to="/dashboard/usage" replace />} />
            <Route path="/billing" element={<Navigate to="/dashboard/billing" replace />} />
            <Route path="/settings" element={<Navigate to="/dashboard/settings" replace />} />

            {/* Platform Admin Routes */}
            <Route path="/admin" element={<PlatformAdminRoute><AdminOverview /></PlatformAdminRoute>} />
            <Route path="/admin/users" element={<PlatformAdminRoute><AdminUsers /></PlatformAdminRoute>} />
            <Route path="/admin/subscriptions" element={<PlatformAdminRoute><AdminSubscriptions /></PlatformAdminRoute>} />
            <Route path="/admin/metrics" element={<PlatformAdminRoute><AdminMetrics /></PlatformAdminRoute>} />
            <Route path="/admin/discounts" element={<PlatformAdminRoute><AdminDiscounts /></PlatformAdminRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
