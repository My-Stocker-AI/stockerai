import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Route, Users, BarChart3, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const Dashboard = () => {
  const { userRole } = useAuth();
  const isPrimaryAdmin = userRole?.role === 'primary_admin';

  return (
    <DashboardLayout title="Dashboard" breadcrumbs={[{ label: "Dashboard" }]}>
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-dashboard-card border-dashboard-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-dashboard-text-secondary">Today's Routes</CardTitle>
              <Route className="h-4 w-4 text-dashboard-text-secondary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-dashboard-text">0</div>
              <p className="text-xs text-dashboard-text-secondary">No routes scheduled</p>
            </CardContent>
          </Card>
          <Card className="bg-dashboard-card border-dashboard-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-dashboard-text-secondary">Items Picked</CardTitle>
              <BarChart3 className="h-4 w-4 text-dashboard-text-secondary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-dashboard-text">0</div>
              <p className="text-xs text-dashboard-text-secondary">Start picking to track</p>
            </CardContent>
          </Card>
        </div>
        <Card className="bg-dashboard-card border-dashboard-border">
          <CardHeader><CardTitle className="text-dashboard-text">Getting Started</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-dashboard-text-secondary">Upload a route PDF and start picking with voice guidance.</p>
            {isPrimaryAdmin && (
              <Button asChild className="btn-primary"><Link to="/dashboard/upload">Upload Route</Link></Button>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
