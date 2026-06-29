import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { VersionIndicator } from "@/components/VersionIndicator";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
// Entry points stay eager so the landing + auth screens paint instantly (no flash).
import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";
// Route guards must be eager — they decide what renders.
import ProtectedRoute from "@/components/dashboard/ProtectedRoute";
import PlatformAdminRoute from "@/components/admin/PlatformAdminRoute";
// Everything else loads on demand, so a first visit no longer downloads the
// whole app (the 2,400-line picking screen + Deepgram voice stack + admin) up front.
const Pricing = lazy(() => import("./pages/Pricing"));
const SetPassword = lazy(() => import("./pages/SetPassword"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const UploadRoutes = lazy(() => import("./pages/dashboard/UploadRoutes"));
const MyRoutes = lazy(() => import("./pages/dashboard/MyRoutes"));
const Team = lazy(() => import("./pages/dashboard/Team"));
const Usage = lazy(() => import("./pages/dashboard/Usage"));
const Billing = lazy(() => import("./pages/dashboard/Billing"));
const Settings = lazy(() => import("./pages/dashboard/Settings"));
const StockerApp = lazy(() => import("./pages/StockerApp"));
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminSubscriptions = lazy(() => import("./pages/admin/AdminSubscriptions"));
const AdminMetrics = lazy(() => import("./pages/admin/AdminMetrics"));
const AdminDiscounts = lazy(() => import("./pages/admin/AdminDiscounts"));
const Guide = lazy(() => import("./pages/Guide"));
const Demo = lazy(() => import("./pages/Demo"));
const DemoLive = lazy(() => import("./pages/DemoLive"));
const Troubleshooting = lazy(() => import("./pages/Troubleshooting"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-[#0d1117]">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <VersionIndicator />
      <PWAInstallBanner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
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
            <Route path="/auth/callback" element={<AuthCallback />} />
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
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
