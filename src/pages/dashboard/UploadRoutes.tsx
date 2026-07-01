import { useState } from "react";
import { format, addDays } from "date-fns";
import { Upload, Calendar, Trash2, Users, Loader2 } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface Route {
  id: string;
  route_name: string;
  delivery_date: string;
  total_machines: number | null;
  total_items: number | null;
  user_id: string;
  profiles?: {
    first_name: string;
    last_name: string;
  };
}

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  profiles: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
}

interface RouteAssignment {
  user_id: string;
}

const UploadRoutes = () => {
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [file, setFile] = useState<File | null>(null);
  const [vendor, setVendor] = useState<string>(''); // Which vending system the report is from
  const [deliveryDate, setDeliveryDate] = useState<Date>(addDays(new Date(), 1));
  const [selectedDriverId, setSelectedDriverId] = useState<string>(''); // Driver to assign route to
  const [uploading, setUploading] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  // delivery_date is stored as "YYYY-MM-DD". Parsing with `new Date("YYYY-MM-DD")` treats it as UTC,
  // which can display as the previous day in some timezones. Always parse as a local date.
  const parseDeliveryDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Fetch routes for the account
  const { data: routes = [], isLoading: routesLoading } = useQuery({
    queryKey: ['routes', userRole?.account_id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('routes')
        .select('*, profiles(first_name, last_name)')
        .eq('user_id', user.id)
        .order('delivery_date', { ascending: false });

      if (error) throw error;
      return data as Route[];
    },
    enabled: !!user,
  });

  // Fetch team members for assignment
  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members', userRole?.account_id],
    queryFn: async () => {
      if (!userRole?.account_id) return [];
      const { data, error } = await supabase
        .from('account_users')
        .select(`
          id,
          user_id,
          role,
          profiles (
            first_name,
            last_name,
            email
          )
        `)
        .eq('account_id', userRole.account_id);
      
      if (error) throw error;
      return data as unknown as TeamMember[];
    },
    enabled: !!userRole?.account_id,
  });

  // Fetch assignments for selected route
  const { data: routeAssignments = [] } = useQuery({
    queryKey: ['route-assignments', selectedRoute?.id],
    queryFn: async () => {
      if (!selectedRoute?.id) return [];
      const { data, error } = await supabase
        .from('route_assignments')
        .select('user_id')
        .eq('route_id', selectedRoute.id);
      
      if (error) throw error;
      return data as RouteAssignment[];
    },
    enabled: !!selectedRoute?.id,
  });

  // Delete route mutation
  const deleteRouteMutation = useMutation({
    mutationFn: async (routeId: string) => {
      // Delete items first (cascade should handle this, but being explicit)
      const { error: itemsError } = await supabase
        .from('items')
        .delete()
        .in('machine_id', 
          (await supabase.from('machines').select('id').eq('route_id', routeId)).data?.map(m => m.id) || []
        );
      
      // Delete machines
      const { error: machinesError } = await supabase
        .from('machines')
        .delete()
        .eq('route_id', routeId);
      
      // Delete assignments
      const { error: assignmentsError } = await supabase
        .from('route_assignments')
        .delete()
        .eq('route_id', routeId);
      
      // Delete route
      const { error } = await supabase
        .from('routes')
        .delete()
        .eq('id', routeId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routes'] });
      toast({ title: "Route deleted successfully" });
      setDeleteDialogOpen(false);
      setSelectedRoute(null);
    },
    onError: (error) => {
      toast({ title: "Error deleting route", description: error.message, variant: "destructive" });
    },
  });

  // Save assignments mutation
  const saveAssignmentsMutation = useMutation({
    mutationFn: async ({ routeId, userIds }: { routeId: string; userIds: string[] }) => {
      // Delete existing assignments
      await supabase
        .from('route_assignments')
        .delete()
        .eq('route_id', routeId);
      
      // Insert new assignments
      if (userIds.length > 0) {
        const { error } = await supabase
          .from('route_assignments')
          .insert(
            userIds.map(userId => ({
              route_id: routeId,
              user_id: userId,
              assigned_by: user?.id,
            }))
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-assignments'] });
      toast({ title: "Assignments saved successfully" });
      setAssignModalOpen(false);
      setSelectedRoute(null);
    },
    onError: (error) => {
      toast({ title: "Error saving assignments", description: error.message, variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please select a PDF file",
        variant: "destructive",
      });
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({ title: "Please select a file", variant: "destructive" });
      return;
    }

    if (!user) {
      toast({ title: "Please log in first", variant: "destructive" });
      return;
    }

    if (!vendor) {
      toast({ title: "Which system is this report from?", description: "Pick your vending system so we read it correctly.", variant: "destructive" });
      return;
    }

    setUploading(true);

    try {
      // Determine driver ID (self = current user, otherwise selected driver)
      const driverId = selectedDriverId === 'self' || !selectedDriverId ? user.id : selectedDriverId;

      // Create FormData with PDF and metadata
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('date', format(deliveryDate, 'yyyy-MM-dd'));
      formData.append('user_id', driverId); // Use selected driver ID
      formData.append('vendor', vendor); // Which vending system the report is from

      // Send to API (Python or n8n based on env var)
      const uploadUrl = import.meta.env.VITE_API_BACKEND === 'python'
        ? 'https://stockerai-api.onrender.com/api/upload-pdf'
        : 'https://visionairy.app.n8n.cloud/webhook/upload';

      // Mobile's FIRST request after the radio's been idle often fails to connect
      // (DNS/TLS/radio wake) and the retry succeeds — confirmed in the server logs:
      // a driver's first upload never arrived, the second returned 200. Auto-retry
      // the connection so that transient drop never surfaces as "Failed to fetch".
      // Safe to retry: the backend de-dupes routes by name+date before inserting.
      let response: Response | null = null;
      let lastNetErr: any = null;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          response = await fetch(uploadUrl, { method: 'POST', body: formData });
          break;
        } catch (netErr: any) {
          lastNetErr = netErr;
          if (attempt < 4) {
            await new Promise((r) => setTimeout(r, 700 * attempt));
          }
        }
      }
      if (!response) {
        const build = typeof __BUILD_TIME__ !== 'undefined'
          ? new Date(__BUILD_TIME__).toLocaleString()
          : 'unknown';
        throw new Error(
          `Couldn't reach the server after several tries · Address: ${uploadUrl} · Reason: ${lastNetErr?.message || lastNetErr} · App build: ${build}`
        );
      }

      if (!response.ok) {
        const errorText = await response.text();
        // Parse the detail from the JSON error response for clearer messages
        let errorMsg = 'Upload failed';
        try {
          const errorJson = JSON.parse(errorText);
          errorMsg = errorJson.detail || errorJson.error || errorText;
        } catch {
          errorMsg = errorText || 'Upload failed';
        }
        throw new Error(errorMsg);
      }

      const result = await response.json();

      // Capture-and-wait: the report is a format we don't parse yet (or "Other").
      // We've saved it and alerted the team — tell the operator warmly, no error.
      if (result.status === 'pending_format') {
        toast({
          title: "Got your report — we're on it",
          description: result.message || "We're setting up support for your format and will email you when it's ready.",
          duration: 12000,
        });
        setFile(null);
        setVendor('');
        setSelectedDriverId('');
        return;
      }

      // Retry logic to find the newly created route (n8n may take time to insert)
      let newRoute = null;
      const maxRetries = 5;
      const deliveryDateStr = format(deliveryDate, 'yyyy-MM-dd');

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // Wait with exponential backoff: 1s, 2s, 4s, 8s, 16s
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));

        const { data } = await supabase
          .from('routes')
          .select('id')
          .eq('route_name', result.route)
          .eq('delivery_date', deliveryDateStr)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (data) {
          newRoute = data;
          break;
        }

        console.log(`[Upload] Route not found, attempt ${attempt}/${maxRetries}`);
      }

      if (newRoute && driverId) {
        // Create route assignment for the selected driver
        await supabase
          .from('route_assignments')
          .insert({
            route_id: newRoute.id,
            user_id: driverId,
            assigned_by: user.id,
          });
      } else if (!newRoute) {
        console.warn('[Upload] Route created but could not find it for assignment');
      }

      const driverName = selectedDriverId === 'self' || !selectedDriverId
        ? 'yourself'
        : teamMembers.find(m => m.user_id === selectedDriverId)?.profiles?.first_name || 'driver';

      toast({
        title: "Route uploaded successfully!",
        description: `${result.route || 'Route'} for ${result.date || format(deliveryDate, 'MMM d, yyyy')}: ${result.machines || 0} machines, ${result.items || 0} items. Assigned to ${driverName}.`,
      });

      // Show info if parser couldn't parse some items (page breaks, line wraps)
      // NOTE: Upload succeeded — these are minor parsing casualties, not failures
      if (result.warnings && result.warnings.length > 0) {
        toast({
          title: `Upload complete — ${result.warnings.length} item(s) skipped`,
          description: `These items had formatting issues (page breaks): ${result.warnings.join(' | ')}`,
          duration: 10000,
        });
      }

      setFile(null);
      setSelectedDriverId('');
      queryClient.invalidateQueries({ queryKey: ['routes'] });
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const openAssignModal = (route: Route) => {
    setSelectedRoute(route);
    setSelectedMembers(routeAssignments.map(a => a.user_id));
    setAssignModalOpen(true);
  };

  const openDeleteDialog = (route: Route) => {
    setSelectedRoute(route);
    setDeleteDialogOpen(true);
  };

  const toggleMember = (userId: string) => {
    setSelectedMembers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const saveAssignments = () => {
    if (selectedRoute) {
      saveAssignmentsMutation.mutate({
        routeId: selectedRoute.id,
        userIds: selectedMembers,
      });
    }
  };

  // Group routes by date
  const routesByDate = routes.reduce((acc, route) => {
    const date = route.delivery_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(route);
    return acc;
  }, {} as Record<string, Route[]>);

  return (
    <DashboardLayout 
      title="Upload Routes" 
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Upload Routes" }]}
    >
      <div className="space-y-8">
        {/* Upload Section */}
        <Card className="bg-dashboard-card border-dashboard-border">
          <CardHeader>
            <CardTitle className="text-dashboard-text">Upload New Route</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pdf" className="text-dashboard-text">Route PDF</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="pdf"
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="bg-dashboard-bg border-dashboard-border text-dashboard-text file:bg-dashboard-card file:text-dashboard-text file:border-0"
                  />
                </div>
                {file && (
                  <p className="text-sm text-dashboard-text-secondary">
                    Selected: {file.name}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-dashboard-text">Delivery Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal bg-dashboard-bg border-dashboard-border text-dashboard-text",
                        !deliveryDate && "text-dashboard-text-secondary"
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {deliveryDate ? format(deliveryDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent style={{ backgroundColor: '#161b22' }} className="w-auto p-0 border-dashboard-border" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={deliveryDate}
                      onSelect={(date) => date && setDeliveryDate(date)}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label className="text-dashboard-text">Assign to Driver</Label>
                <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                  <SelectTrigger className="bg-dashboard-bg border-dashboard-border text-dashboard-text">
                    <SelectValue placeholder="Select driver..." />
                  </SelectTrigger>
                  <SelectContent style={{ backgroundColor: '#161b22' }} className="border-dashboard-border">
                    <SelectItem value="self" className="text-dashboard-text">
                      Myself
                    </SelectItem>
                    {teamMembers.map((member) => (
                      <SelectItem
                        key={member.user_id}
                        value={member.user_id}
                        className="text-dashboard-text"
                      >
                        {member.profiles?.first_name} {member.profiles?.last_name} ({member.profiles?.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-dashboard-text">Vending System</Label>
                <Select value={vendor} onValueChange={setVendor}>
                  <SelectTrigger className="bg-dashboard-bg border-dashboard-border text-dashboard-text">
                    <SelectValue placeholder="Which system is this report from?" />
                  </SelectTrigger>
                  <SelectContent style={{ backgroundColor: '#161b22' }} className="border-dashboard-border">
                    {['Parlevel', 'Nayax', 'Cantaloupe/Seed', 'Gimme', 'VendSoft', 'VendSys', 'Vagabond', 'Vend-Trak', 'VendMAX', 'Other'].map((v) => (
                      <SelectItem key={v} value={v} className="text-dashboard-text">
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-dashboard-text-secondary">
                  We read Parlevel reports today. Using another system? Pick it (or "Other") and we'll set up your format.
                </p>
              </div>
            </div>

            <Button
              onClick={handleUpload} 
              disabled={!file || !vendor || uploading}
              className="bg-primary hover:bg-primary-hover text-primary-foreground"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Route
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Existing Routes */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-dashboard-text">Existing Routes</h2>
          
          {routesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : Object.keys(routesByDate).length === 0 ? (
            <Card className="bg-dashboard-card border-dashboard-border">
              <CardContent className="py-8 text-center">
                <p className="text-dashboard-text-secondary">No routes uploaded yet</p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(routesByDate).map(([date, dateRoutes]) => (
              <div key={date} className="space-y-3">
                <h3 className="text-sm font-medium text-dashboard-text-secondary uppercase tracking-wider">
                  {format(parseDeliveryDate(date), "EEEE, MMMM d, yyyy")}
                </h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {dateRoutes.map((route) => (
                    <Card key={route.id} className="bg-dashboard-card border-dashboard-border">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-medium text-dashboard-text">{route.route_name}</h4>
                            <p className="text-sm text-dashboard-text-secondary">
                              {route.total_machines || 0} machines · {route.total_items || 0} items
                              {route.profiles && (
                                <span className="ml-2">· Created by: {route.profiles.first_name} {route.profiles.last_name}</span>
                              )}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openAssignModal(route)}
                              className="text-dashboard-text-secondary hover:text-dashboard-text hover:bg-dashboard-bg"
                            >
                              <Users className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDeleteDialog(route)}
                              className="text-dashboard-text-secondary hover:text-error hover:bg-dashboard-bg"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Assign Modal */}
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent className="bg-dashboard-bg border-dashboard-border">
          <DialogHeader>
            <DialogTitle className="text-dashboard-text">
              Assign Route: {selectedRoute?.route_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {teamMembers.length === 0 ? (
              <p className="text-dashboard-text-secondary text-center py-4">
                No team members found
              </p>
            ) : (
              teamMembers.map((member) => (
                <div key={member.id} className="flex items-center space-x-3">
                  <Checkbox
                    id={member.id}
                    checked={selectedMembers.includes(member.user_id)}
                    onCheckedChange={() => toggleMember(member.user_id)}
                  />
                  <label
                    htmlFor={member.id}
                    className="flex-1 text-sm font-medium text-dashboard-text cursor-pointer"
                  >
                    {member.profiles?.first_name} {member.profiles?.last_name}
                    <span className="text-dashboard-text-secondary ml-2">
                      ({member.profiles?.email})
                    </span>
                  </label>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAssignModalOpen(false)}
              className="border-dashboard-border text-dashboard-text"
            >
              Cancel
            </Button>
            <Button
              onClick={saveAssignments}
              disabled={saveAssignmentsMutation.isPending}
              className="bg-primary hover:bg-primary-hover"
            >
              {saveAssignmentsMutation.isPending ? "Saving..." : "Save Assignments"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-dashboard-bg border-dashboard-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="!text-teal">Delete Route</AlertDialogTitle>
            <AlertDialogDescription className="!text-teal">
              Are you sure you want to delete "{selectedRoute?.route_name}"? This will also delete all machines and items in this route. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-dashboard-border !text-teal">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedRoute && deleteRouteMutation.mutate(selectedRoute.id)}
              className="bg-error hover:bg-error/90"
            >
              {deleteRouteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default UploadRoutes;
