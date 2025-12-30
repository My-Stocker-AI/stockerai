import { useState } from "react";
import { format, isToday, isFuture, isPast } from "date-fns";
import { Route, Play, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface RouteData {
  id: string;
  route_name: string;
  delivery_date: string;
  total_machines: number | null;
  total_items: number | null;
}

interface Session {
  id: string;
  current_route_id: string | null;
  status: string | null;
  current_item_index: number | null;
}

const MyRoutes = () => {
  const { user, userRole } = useAuth();
  const [pastRoutesOpen, setPastRoutesOpen] = useState(false);

  const isPrimaryAdmin = userRole?.role === 'primary_admin';
  const canViewAllRoutes = userRole?.can_view_all_routes || isPrimaryAdmin;

  // Fetch routes based on role
  const { data: routes = [], isLoading } = useQuery({
    queryKey: ['my-routes', user?.id, canViewAllRoutes],
    queryFn: async () => {
      if (!user) return [];

      if (canViewAllRoutes) {
        // Admin or user with can_view_all_routes - fetch all routes for the user
        const { data, error } = await supabase
          .from('routes')
          .select('*')
          .eq('user_id', user.id)
          .order('delivery_date', { ascending: true });
        
        if (error) throw error;
        return data as RouteData[];
      } else {
        // Driver - fetch only assigned routes
        const { data: assignments, error: assignError } = await supabase
          .from('route_assignments')
          .select('route_id')
          .eq('user_id', user.id);
        
        if (assignError) throw assignError;
        
        if (assignments.length === 0) return [];
        
        const routeIds = assignments.map(a => a.route_id);
        const { data, error } = await supabase
          .from('routes')
          .select('*')
          .in('id', routeIds)
          .order('delivery_date', { ascending: true });
        
        if (error) throw error;
        return data as RouteData[];
      }
    },
    enabled: !!user,
  });

  // Fetch sessions to get progress
  const { data: sessions = [] } = useQuery({
    queryKey: ['sessions', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('sessions')
        .select('id, current_route_id, status, current_item_index')
        .eq('user_id', user.id);
      
      if (error) throw error;
      return data as Session[];
    },
    enabled: !!user,
  });

  const getRouteStatus = (route: RouteData) => {
    const session = sessions.find(s => s.current_route_id === route.id);
    if (!session) return { status: 'not_started', progress: 0 };
    if (session.status === 'completed') return { status: 'completed', progress: 100 };
    if (session.status === 'in_progress') {
      const progress = route.total_items 
        ? Math.round(((session.current_item_index || 0) / route.total_items) * 100)
        : 0;
      return { status: 'in_progress', progress };
    }
    return { status: 'not_started', progress: 0 };
  };

  const getStatusBadge = (status: string, progress: number) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-success/20 text-success border-0">Completed</Badge>;
      case 'in_progress':
        return <Badge className="bg-warning/20 text-warning border-0">In Progress ({progress}%)</Badge>;
      default:
        return <Badge variant="secondary" className="bg-dashboard-card text-dashboard-text-secondary border-0">Not Started</Badge>;
    }
  };

  // Group routes
  const todayRoutes = routes.filter(r => isToday(new Date(r.delivery_date)));
  const futureRoutes = routes.filter(r => isFuture(new Date(r.delivery_date)));
  const pastRoutes = routes.filter(r => isPast(new Date(r.delivery_date)) && !isToday(new Date(r.delivery_date)));

  const RouteCard = ({ route, highlighted = false }: { route: RouteData; highlighted?: boolean }) => {
    const { status, progress } = getRouteStatus(route);
    
    return (
      <Card className={`bg-dashboard-card border-dashboard-border ${highlighted ? 'ring-2 ring-primary' : ''}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h4 className="font-medium text-dashboard-text">{route.route_name}</h4>
              <p className="text-sm text-dashboard-text-secondary">
                {route.total_machines || 0} machines · {route.total_items || 0} items
              </p>
            </div>
            {getStatusBadge(status, progress)}
          </div>
          
          {status === 'in_progress' && (
            <Progress value={progress} className="h-2 mb-3" />
          )}
          
          <Button
            asChild
            className={`w-full ${highlighted ? 'bg-primary hover:bg-primary-hover' : 'bg-dashboard-bg hover:bg-dashboard-card border border-dashboard-border text-dashboard-text'}`}
          >
            <a href={`/app?route=${route.id}`}>
              <Play className="mr-2 h-4 w-4" />
              {status === 'in_progress' ? 'Continue Picking' : 'Start Picking'}
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <DashboardLayout 
        title="My Routes" 
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "My Routes" }]}
      >
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title="My Routes" 
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "My Routes" }]}
    >
      <div className="space-y-8">
        {/* Today's Routes - Highlighted */}
        {todayRoutes.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-dashboard-text">Today's Routes</h2>
              <Badge className="bg-primary/20 text-primary border-0">
                {todayRoutes.length} route{todayRoutes.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {todayRoutes.map((route) => (
                <RouteCard key={route.id} route={route} highlighted />
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Routes */}
        {futureRoutes.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-dashboard-text">Upcoming Routes</h2>
            {Object.entries(
              futureRoutes.reduce((acc, route) => {
                const date = route.delivery_date;
                if (!acc[date]) acc[date] = [];
                acc[date].push(route);
                return acc;
              }, {} as Record<string, RouteData[]>)
            ).map(([date, dateRoutes]) => (
              <div key={date} className="space-y-3">
                <h3 className="text-sm font-medium text-dashboard-text-secondary uppercase tracking-wider">
                  {format(new Date(date), "EEEE, MMMM d")}
                </h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {dateRoutes.map((route) => (
                    <RouteCard key={route.id} route={route} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Past/Completed Routes - Collapsible */}
        {pastRoutes.length > 0 && (
          <Collapsible open={pastRoutesOpen} onOpenChange={setPastRoutesOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between text-dashboard-text-secondary hover:text-dashboard-text hover:bg-dashboard-card"
              >
                <span>Past Routes ({pastRoutes.length})</span>
                {pastRoutesOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4">
              {Object.entries(
                pastRoutes.reduce((acc, route) => {
                  const date = route.delivery_date;
                  if (!acc[date]) acc[date] = [];
                  acc[date].push(route);
                  return acc;
                }, {} as Record<string, RouteData[]>)
              ).map(([date, dateRoutes]) => (
                <div key={date} className="space-y-3">
                  <h3 className="text-sm font-medium text-dashboard-text-secondary uppercase tracking-wider">
                    {format(new Date(date), "EEEE, MMMM d")}
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {dateRoutes.map((route) => (
                      <RouteCard key={route.id} route={route} />
                    ))}
                  </div>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Empty State */}
        {routes.length === 0 && (
          <Card className="bg-dashboard-card border-dashboard-border">
            <CardContent className="py-16 text-center">
              <Route className="h-12 w-12 mx-auto text-dashboard-text-secondary mb-4" />
              <h3 className="text-lg font-medium text-dashboard-text mb-2">No routes assigned</h3>
              <p className="text-dashboard-text-secondary">
                {isPrimaryAdmin 
                  ? "Upload routes to get started"
                  : "Contact your admin to get routes assigned"
                }
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default MyRoutes;
