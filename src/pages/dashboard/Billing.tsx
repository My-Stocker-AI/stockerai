import { useState } from "react";
import { Loader2, CreditCard, FileText, ExternalLink } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, differenceInDays } from "date-fns";

interface Account {
  id: string;
  name: string;
  driver_count: number | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
}

const Billing = () => {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [changeDriversOpen, setChangeDriversOpen] = useState(false);
  const [newDriverCount, setNewDriverCount] = useState(2);

  // Fetch account
  const { data: account, isLoading } = useQuery({
    queryKey: ['account', userRole?.account_id],
    queryFn: async () => {
      if (!userRole?.account_id) return null;
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', userRole.account_id)
        .single();
      
      if (error) throw error;
      return data as Account;
    },
    enabled: !!userRole?.account_id,
  });

  // Update driver count mutation
  const updateDriversMutation = useMutation({
    mutationFn: async (count: number) => {
      if (!userRole?.account_id) throw new Error('No account');
      
      const { error } = await supabase
        .from('accounts')
        .update({ driver_count: count })
        .eq('id', userRole.account_id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account'] });
      toast({ title: "Driver count updated", description: "Changes will apply at next billing cycle." });
      setChangeDriversOpen(false);
    },
    onError: (error) => {
      toast({ title: "Error updating driver count", description: error.message, variant: "destructive" });
    },
  });

  const getPricePerDriver = (count: number) => {
    if (count <= 5) return 20;
    if (count <= 20) return 18;
    return 15;
  };

  const getMonthlyPrice = (count: number) => {
    return count * getPricePerDriver(count);
  };

  const getPlanName = (count: number) => {
    if (count <= 5) return 'Starter';
    if (count <= 20) return 'Growth';
    return 'Scale';
  };

  const getStatusBadge = (status: string | null, trialEndsAt: string | null) => {
    if (status === 'trialing' && trialEndsAt) {
      const daysLeft = differenceInDays(new Date(trialEndsAt), new Date());
      return (
        <Badge className="bg-primary/20 text-primary border-0">
          Trial ({daysLeft} days left)
        </Badge>
      );
    }
    switch (status) {
      case 'active':
        return <Badge className="bg-success/20 text-success border-0">Active</Badge>;
      case 'past_due':
        return <Badge className="bg-error/20 text-error border-0">Past Due</Badge>;
      case 'canceled':
        return <Badge className="bg-dashboard-text-secondary/20 text-dashboard-text-secondary border-0">Canceled</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  // Placeholder invoices
  const invoices = [
    { id: '1', date: new Date(), amount: 100, status: 'paid' },
    { id: '2', date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), amount: 100, status: 'paid' },
    { id: '3', date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), amount: 100, status: 'paid' },
  ];

  const handleUpdatePaymentMethod = () => {
    // Placeholder - would redirect to Stripe portal
    toast({ title: "Coming soon", description: "Stripe integration will be added." });
  };

  if (isLoading) {
    return (
      <DashboardLayout 
        title="Billing" 
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Billing" }]}
      >
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const driverCount = account?.driver_count || 2;

  return (
    <DashboardLayout 
      title="Billing" 
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Billing" }]}
    >
      <div className="space-y-8">
        {/* Subscription Info */}
        <Card className="bg-dashboard-card border-dashboard-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-dashboard-text">Subscription</CardTitle>
                <CardDescription className="text-dashboard-text-secondary">
                  {getPlanName(driverCount)} Plan
                </CardDescription>
              </div>
              {getStatusBadge(account?.subscription_status || null, account?.trial_ends_at || null)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-dashboard-text-secondary">Drivers</p>
                <p className="text-2xl font-bold text-dashboard-text">{driverCount}</p>
              </div>
              <div>
                <p className="text-sm text-dashboard-text-secondary">Price per driver</p>
                <p className="text-2xl font-bold text-dashboard-text">${getPricePerDriver(driverCount)}/mo</p>
              </div>
              <div>
                <p className="text-sm text-dashboard-text-secondary">Monthly total</p>
                <p className="text-2xl font-bold text-primary">${getMonthlyPrice(driverCount)}/mo</p>
              </div>
            </div>
            
            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => {
                  setNewDriverCount(driverCount);
                  setChangeDriversOpen(true);
                }}
                variant="outline"
                className="border-dashboard-border text-dashboard-text hover:bg-dashboard-bg"
              >
                Change Driver Count
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Payment Method */}
        <Card className="bg-dashboard-card border-dashboard-border">
          <CardHeader>
            <CardTitle className="text-dashboard-text flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Method
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {account?.stripe_customer_id ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-16 bg-dashboard-bg rounded flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-dashboard-text-secondary" />
                  </div>
                  <div>
                    <p className="text-dashboard-text">•••• •••• •••• 4242</p>
                    <p className="text-sm text-dashboard-text-secondary">Expires 12/25</p>
                  </div>
                </div>
                <Button
                  onClick={handleUpdatePaymentMethod}
                  variant="outline"
                  className="border-dashboard-border text-dashboard-text hover:bg-dashboard-bg"
                >
                  Update
                </Button>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-dashboard-text-secondary mb-4">No payment method on file</p>
                <Button
                  onClick={handleUpdatePaymentMethod}
                  className="bg-primary hover:bg-primary-hover"
                >
                  Add Payment Method
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Billing History */}
        <Card className="bg-dashboard-card border-dashboard-border">
          <CardHeader>
            <CardTitle className="text-dashboard-text flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Billing History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dashboard-border">
                    <th className="text-left py-3 px-4 text-sm font-medium text-dashboard-text-secondary">Date</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-dashboard-text-secondary">Amount</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-dashboard-text-secondary">Status</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-dashboard-text-secondary">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-dashboard-border/50">
                      <td className="py-3 px-4 text-dashboard-text">
                        {format(invoice.date, 'MMM d, yyyy')}
                      </td>
                      <td className="py-3 px-4 text-dashboard-text">
                        ${invoice.amount.toFixed(2)}
                      </td>
                      <td className="py-3 px-4">
                        <Badge className="bg-success/20 text-success border-0 capitalize">
                          {invoice.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-primary hover:text-primary-hover"
                        >
                          View
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-dashboard-text-secondary mt-4 text-center">
              Invoice history will be available after Stripe integration
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Change Driver Count Modal */}
      <Dialog open={changeDriversOpen} onOpenChange={setChangeDriversOpen}>
        <DialogContent className="bg-dashboard-bg border-dashboard-border">
          <DialogHeader>
            <DialogTitle className="text-dashboard-text">Change Driver Count</DialogTitle>
            <DialogDescription className="text-dashboard-text-secondary">
              Adjust the number of drivers on your plan
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="driverCount" className="text-dashboard-text">Number of Drivers</Label>
              <Input
                id="driverCount"
                type="number"
                min={2}
                max={50}
                value={newDriverCount}
                onChange={(e) => setNewDriverCount(Math.max(2, parseInt(e.target.value) || 2))}
                className="bg-dashboard-bg border-dashboard-border text-dashboard-text"
              />
              <p className="text-xs text-dashboard-text-secondary">Minimum 2 drivers</p>
            </div>

            <div className="bg-dashboard-bg rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-dashboard-text-secondary">Current</span>
                <span className="text-dashboard-text">{driverCount} drivers × ${getPricePerDriver(driverCount)} = ${getMonthlyPrice(driverCount)}/mo</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span className="text-dashboard-text-secondary">New</span>
                <span className="text-primary">{newDriverCount} drivers × ${getPricePerDriver(newDriverCount)} = ${getMonthlyPrice(newDriverCount)}/mo</span>
              </div>
            </div>

            <p className="text-xs text-dashboard-text-secondary">
              Changes will apply at your next billing cycle
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setChangeDriversOpen(false)}
              className="border-dashboard-border text-dashboard-text"
            >
              Cancel
            </Button>
            <Button
              onClick={() => updateDriversMutation.mutate(newDriverCount)}
              disabled={newDriverCount === driverCount || updateDriversMutation.isPending}
              className="bg-primary hover:bg-primary-hover"
            >
              {updateDriversMutation.isPending ? "Updating..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Billing;
