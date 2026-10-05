import { useState, useEffect } from "react";
import { Loader2, CreditCard, FileText, ExternalLink, RefreshCw, CheckCircle, AlertCircle, AlertTriangle } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, differenceInDays } from "date-fns";
import { useSearchParams } from "react-router-dom";
import {
  BILLING_TERMS,
  FREE_TRIAL_DAYS,
  type BillingTerm,
  calculatePricingQuote,
  formatCurrency,
} from "@/lib/pricing";
import { TrialCancellationNotice } from "@/components/billing/TrialCancellationNotice";

interface SubscriptionData {
  subscribed: boolean;
  driver_count: number;
  subscription_status: string | null;
  subscription_end: string | null;
  stripe_customer_id: string | null;
  price_per_driver?: number;
  monthly_total?: number;
  term_total?: number;
  billing_months?: number;
  billing_term?: BillingTerm | "legacy";
  pricing_version?: string | null;
  trial_ends_at?: string | null;
  cancel_at_period_end?: boolean;
}

interface Account {
  id: string;
  name: string;
  driver_count: number | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  min_drivers_required: number | null;
  is_platform_account: boolean | null;
  billing_onboarding_required: boolean;
  billing_term: string | null;
  pricing_version: string | null;
}

const Billing = () => {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  
  const [changeDriversOpen, setChangeDriversOpen] = useState(false);
  const [newDriverCount, setNewDriverCount] = useState(2);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const preferredTerm = user?.user_metadata?.billing_term;
  const [billingTerm, setBillingTerm] = useState<BillingTerm>(
    preferredTerm === "monthly" || preferredTerm === "semiannual" || preferredTerm === "annual"
      ? preferredTerm
      : "annual",
  );

  // Handle success/cancel URL params from Stripe checkout
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      toast({ 
        title: "Card saved — trial activating",
        description: "Stripe is confirming your seven-day trial. This page will update automatically.",
      });
      queryClient.invalidateQueries({ queryKey: ['subscription', userRole?.account_id] });
      queryClient.invalidateQueries({ queryKey: ['account'] });
    }
    if (searchParams.get('canceled') === 'true') {
      toast({ 
        title: "Checkout canceled", 
        description: "No changes were made to your subscription.",
        variant: "destructive"
      });
    }
  }, [searchParams, toast, queryClient, userRole?.account_id]);

  // Fetch account from database
  const { data: account, isLoading: accountLoading } = useQuery({
    queryKey: ['account', userRole?.account_id],
    queryFn: async () => {
      if (!userRole?.account_id) return null;
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, driver_count, subscription_status, trial_ends_at, stripe_customer_id, min_drivers_required, is_platform_account, billing_onboarding_required, billing_term, pricing_version')
        .eq('id', userRole.account_id)
        .single();
      
      if (error) throw error;
      return data as Account;
    },
    enabled: !!userRole?.account_id,
    refetchInterval: (query) => {
      const current = query.state.data as Account | null | undefined;
      const accessConfirmed = current?.is_platform_account === true ||
        current?.subscription_status === "trialing" ||
        current?.subscription_status === "active";
      return searchParams.get("success") === "true" && !accessConfirmed ? 2_000 : false;
    },
  });

  useEffect(() => {
    const accessConfirmed = account?.is_platform_account === true ||
      account?.subscription_status === "trialing" ||
      account?.subscription_status === "active";
    if (accessConfirmed) {
      queryClient.invalidateQueries({ queryKey: ["billing-access", userRole?.account_id] });
    }
  }, [account?.is_platform_account, account?.subscription_status, queryClient, userRole?.account_id]);

  // Fetch subscription status from Stripe
  const { data: subscription, isLoading: subscriptionLoading, refetch: refetchSubscription } = useQuery({
    queryKey: ['subscription', userRole?.account_id],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Error checking subscription:', error);
        // Don't throw - just return null so page still renders
        return null;
      }

      return data as SubscriptionData;
    },
    enabled: !!userRole?.account_id,
    refetchInterval: 60000, // Refresh every minute
  });

  const getStatusBadge = (status: string | null, trialEndsAt: string | null) => {
    if (status === 'trialing' && trialEndsAt) {
      const daysLeft = differenceInDays(new Date(trialEndsAt), new Date());
      return (
        <Badge className="bg-primary/20 text-primary border-0">
          Trial ({Math.max(0, daysLeft)} days left)
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
        return <Badge variant="secondary">No Subscription</Badge>;
    }
  };

  const handleCheckout = async (driverCount: number, term: BillingTerm = billingTerm) => {
    setIsCheckingOut(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Please log in", description: "You must be logged in to subscribe.", variant: "destructive" });
        return;
      }

      if (!userRole?.account_id) throw new Error("Company account is not available.");
      const operationKey = `stockerai-checkout:${userRole.account_id}:${driverCount}:${term}`;
      let operationId = sessionStorage.getItem(operationKey);
      if (!operationId) {
        operationId = crypto.randomUUID();
        sessionStorage.setItem(operationKey, operationId);
      }

      const { data, error } = await supabase.functions.invoke('create-checkout', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: { driver_count: driverCount, billing_term: term, operation_id: operationId },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.assign(data.url);
      }
    } catch (error: unknown) {
      console.error('Checkout error:', error);
      toast({ 
        title: "Checkout failed", 
        description: error instanceof Error && error.message ? error.message : "Please try again.",
        variant: "destructive" 
      });
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleManageSubscription = async () => {
    setIsOpeningPortal(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Please log in", description: "You must be logged in.", variant: "destructive" });
        return;
      }

      const { data, error } = await supabase.functions.invoke('customer-portal', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error: unknown) {
      console.error('Portal error:', error);
      toast({ 
        title: "Could not open billing portal", 
        description: error instanceof Error && error.message ? error.message : "Please try again.",
        variant: "destructive" 
      });
    } finally {
      setIsOpeningPortal(false);
    }
  };

  if (accountLoading || subscriptionLoading) {
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

  const isPlatformAccount = account?.is_platform_account === true;
  const driverCount = isPlatformAccount ? 0 : (subscription?.driver_count || account?.driver_count || 2);
  const hasActiveSubscription = isPlatformAccount || subscription?.subscribed || false;
  const subscriptionStatus = isPlatformAccount ? 'active' : (subscription?.subscription_status || account?.subscription_status);
  const minDriversRequired = account?.min_drivers_required || 2;
  const effectiveMinimum = Math.max(2, minDriversRequired);
  const isBelowMinimum = newDriverCount < effectiveMinimum;
  const quote = calculatePricingQuote(driverCount, billingTerm);
  const newQuote = calculatePricingQuote(newDriverCount, billingTerm);
  const requiresCardSetup = account?.billing_onboarding_required === true && !hasActiveSubscription;
  const trialEndsAt = subscription?.trial_ends_at || account?.trial_ends_at;
  const isPrimaryAdmin = userRole?.role === "primary_admin";

  return (
    <DashboardLayout 
      title="Billing" 
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Billing" }]}
    >
      <div className="space-y-8">
        {requiresCardSetup && (
          <Alert className="bg-primary/10 border-primary/30">
            <CreditCard className="h-4 w-4 text-primary" />
            <AlertTitle className="text-dashboard-text">Complete card setup to start your free trial</AlertTitle>
            <AlertDescription className="text-dashboard-text-secondary">
              A valid card is required, but the subscription charge today is $0. Your selected plan is charged after {FREE_TRIAL_DAYS} days unless you cancel first.
            </AlertDescription>
          </Alert>
        )}
        {/* Subscription Status Alert */}
        {!hasActiveSubscription && subscriptionStatus !== 'trialing' && (
          <Card className="bg-primary/10 border-primary/30">
            <CardContent className="flex items-center gap-4 py-4">
              <AlertCircle className="h-6 w-6 text-primary" />
              <div className="flex-1">
                <p className="font-medium text-dashboard-text">No active subscription</p>
                <p className="text-sm text-dashboard-text-secondary">
                  Choose a billing term and securely save a card to start your {FREE_TRIAL_DAYS}-day trial.
                </p>
              </div>
              <Button 
                onClick={() => {
                  setNewDriverCount(driverCount);
                  setChangeDriversOpen(true);
                }}
                disabled={isCheckingOut}
                className="bg-primary hover:bg-primary-hover"
              >
                {isCheckingOut ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Subscribe Now
              </Button>
            </CardContent>
          </Card>
        )}

        {isPlatformAccount && (
          <Card className="bg-primary/10 border-primary/30">
            <CardContent className="flex items-center gap-4 py-4">
              <CheckCircle className="h-6 w-6 text-primary" />
              <div className="flex-1">
                <p className="font-medium text-dashboard-text">Platform Account</p>
                <p className="text-sm text-dashboard-text-secondary">
                  Unlimited access - No billing required
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!isPlatformAccount && subscriptionStatus === "trialing" && trialEndsAt && (
          <TrialCancellationNotice
            trialEndsAt={trialEndsAt}
            cancelAtPeriodEnd={subscription?.cancel_at_period_end === true}
            isPrimaryAdmin={isPrimaryAdmin}
            isOpeningPortal={isOpeningPortal}
            onManageSubscription={handleManageSubscription}
          />
        )}

        {!isPlatformAccount && hasActiveSubscription && (
          <Card className="bg-success/10 border-success/30">
            <CardContent className="flex items-center gap-4 py-4">
              <CheckCircle className="h-6 w-6 text-success" />
              <div className="flex-1">
                <p className="font-medium text-dashboard-text">
                  {subscriptionStatus === "trialing"
                    ? subscription?.cancel_at_period_end
                      ? "Trial cancellation scheduled"
                      : "Free trial active"
                    : "Subscription active"}
                </p>
                <p className="text-sm text-dashboard-text-secondary">
                  {subscriptionStatus === "trialing" && trialEndsAt
                    ? subscription?.cancel_at_period_end
                      ? `Access continues through ${format(new Date(trialEndsAt), "MMMM d, yyyy")}`
                      : `First charge is scheduled for ${format(new Date(trialEndsAt), "MMMM d, yyyy")} unless you cancel first`
                    : subscription?.subscription_end
                    ? `Renews on ${format(new Date(subscription.subscription_end), 'MMMM d, yyyy')}`
                    : 'Your subscription is active'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Subscription Info */}
        {isPlatformAccount ? (
          <Card className="bg-dashboard-card border-dashboard-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-dashboard-text">Platform Account</CardTitle>
                  <CardDescription className="text-dashboard-text-secondary">
                    Unlimited Access
                  </CardDescription>
                </div>
                <Badge className="bg-primary/20 text-primary border-0">Platform</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm text-dashboard-text-secondary">Drivers</p>
                  <p className="text-2xl font-bold text-dashboard-text">Unlimited</p>
                </div>
                <div>
                  <p className="text-sm text-dashboard-text-secondary">Access Level</p>
                  <p className="text-2xl font-bold text-dashboard-text">Full</p>
                </div>
                <div>
                  <p className="text-sm text-dashboard-text-secondary">Cost</p>
                  <p className="text-2xl font-bold text-primary">$0/mo</p>
                </div>
              </div>
              <p className="text-sm text-dashboard-text-secondary pt-4">
                This is a platform administrator account with unlimited access. No billing is required.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-dashboard-card border-dashboard-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-dashboard-text">Subscription</CardTitle>
                  <CardDescription className="text-dashboard-text-secondary">
                    Graduated per-driver pricing
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(subscriptionStatus, trialEndsAt || null)}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => refetchSubscription()}
                    className="text-dashboard-text-secondary hover:text-dashboard-text"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm text-dashboard-text-secondary">Drivers</p>
                  <p className="text-2xl font-bold text-dashboard-text">{driverCount}</p>
                </div>
                <div>
                  <p className="text-sm text-dashboard-text-secondary">Billing</p>
                  <p className="text-2xl font-bold text-dashboard-text">
                    {subscription?.billing_term === "semiannual" ? "6 months" : subscription?.billing_term === "annual" ? "Annual" : "Monthly"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-dashboard-text-secondary">Monthly total</p>
                  <p className="text-2xl font-bold text-primary">
                    {formatCurrency(Math.round((subscription?.monthly_total ?? quote.monthlyCents / 100) * 100))}/mo
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                {hasActiveSubscription ? (
                  <>
                    <Button
                      onClick={handleManageSubscription}
                      disabled={isOpeningPortal}
                      variant="outline"
                      className="border-dashboard-border text-dashboard-text hover:bg-dashboard-bg"
                    >
                      {isOpeningPortal ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Manage Subscription
                    </Button>
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
                  </>
                ) : (
                  <Button
                    onClick={() => {
                      setNewDriverCount(driverCount);
                      setChangeDriversOpen(true);
                    }}
                    className="bg-primary hover:bg-primary-hover"
                  >
                    Choose Plan & Subscribe
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payment Method - Hidden for platform accounts */}
        {!isPlatformAccount && (
          <Card className="bg-dashboard-card border-dashboard-border">
            <CardHeader>
              <CardTitle className="text-dashboard-text flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payment Method
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {subscription?.stripe_customer_id ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-16 bg-dashboard-bg rounded flex items-center justify-center">
                      <CreditCard className="h-5 w-5 text-dashboard-text-secondary" />
                    </div>
                    <div>
                      <p className="text-dashboard-text">Payment method on file</p>
                <p className="text-sm text-dashboard-text-secondary">Managed securely by Stripe</p>
                    </div>
                  </div>
                  <Button
                    onClick={handleManageSubscription}
                    disabled={isOpeningPortal}
                    variant="outline"
                    className="border-dashboard-border text-dashboard-text hover:bg-dashboard-bg"
                  >
                    Update
                  </Button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-dashboard-text-secondary mb-4">A card is required to start the free trial</p>
                  <Button
                    onClick={() => {
                      setNewDriverCount(driverCount);
                      setChangeDriversOpen(true);
                    }}
                    disabled={isCheckingOut}
                    className="bg-primary hover:bg-primary-hover"
                  >
                    {isCheckingOut ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Start Secure Card Setup
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Billing History - Hidden for platform accounts */}
        {!isPlatformAccount && (
          <Card className="bg-dashboard-card border-dashboard-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-dashboard-text flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Billing History
                </CardTitle>
                {subscription?.stripe_customer_id && (
                  <Button
                    onClick={handleManageSubscription}
                    disabled={isOpeningPortal}
                    variant="ghost"
                    size="sm"
                    className="text-primary hover:text-primary-hover"
                  >
                    View All Invoices
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {subscription?.stripe_customer_id ? (
                <p className="text-sm text-dashboard-text-secondary text-center py-4">
                  View your complete billing history in the Stripe portal.
                </p>
              ) : (
                <p className="text-sm text-dashboard-text-secondary text-center py-4">
                  Your billing history will appear here after you subscribe.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Change Driver Count / Checkout Modal */}
      <Dialog open={changeDriversOpen} onOpenChange={setChangeDriversOpen}>
        <DialogContent className="bg-dashboard-bg border-dashboard-border">
          <DialogHeader>
            <DialogTitle className="text-dashboard-text">
              {hasActiveSubscription ? 'Change Driver Count' : 'Choose Your Plan'}
            </DialogTitle>
            <DialogDescription className="text-dashboard-text-secondary">
              {hasActiveSubscription 
                ? 'Adjust the number of drivers on your plan'
                : 'Select the number of drivers you need'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="driverCount" className="text-dashboard-text">Number of Drivers</Label>
              <Input
                id="driverCount"
                type="number"
                min={effectiveMinimum}
                max={100}
                value={newDriverCount}
                onChange={(e) => setNewDriverCount(Math.max(effectiveMinimum, parseInt(e.target.value) || effectiveMinimum))}
                className="bg-dashboard-bg border-dashboard-border text-dashboard-text"
              />
              <p className="text-xs text-dashboard-text-secondary">
                Minimum {effectiveMinimum} drivers {minDriversRequired > 2 ? '(based on your usage)' : ''}
              </p>
            </div>

            {!hasActiveSubscription && (
              <div className="space-y-2">
                <Label htmlFor="checkoutBillingTerm" className="text-dashboard-text">Billing frequency</Label>
                <select
                  id="checkoutBillingTerm"
                  value={billingTerm}
                  onChange={(event) => setBillingTerm(event.target.value as BillingTerm)}
                  className="flex h-10 w-full rounded-md border border-dashboard-border bg-dashboard-bg px-3 py-2 text-sm text-dashboard-text"
                >
                  <option value="annual">Annual — Best value, save 10%</option>
                  <option value="monthly">Monthly — Maximum flexibility</option>
                  <option value="semiannual">Every 6 months — Save 5%</option>
                </select>
              </div>
            )}

            {/* Usage-based minimum warning */}
            {isBelowMinimum && minDriversRequired > 2 && (
              <Alert className="bg-warning/10 border-warning/30">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertTitle className="text-warning text-sm font-medium">Cannot reduce below usage</AlertTitle>
                <AlertDescription className="text-dashboard-text-secondary text-sm">
                  Your peak usage this month required {minDriversRequired} drivers. Reduce usage to lower your plan.
                </AlertDescription>
              </Alert>
            )}

            {/* Pricing tiers */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div 
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  newDriverCount <= 5 
                    ? 'border-primary bg-primary/10' 
                    : 'border-dashboard-border hover:border-dashboard-text-secondary'
                }`}
                onClick={() => setNewDriverCount(Math.max(effectiveMinimum, 2))}
              >
                <p className="text-xs text-dashboard-text-secondary">Starter</p>
                <p className="text-lg font-bold text-dashboard-text">$24</p>
                <p className="text-xs text-dashboard-text-secondary">first 5</p>
              </div>
              <div 
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  newDriverCount >= 6 && newDriverCount <= 20 
                    ? 'border-primary bg-primary/10' 
                    : 'border-dashboard-border hover:border-dashboard-text-secondary'
                }`}
                onClick={() => setNewDriverCount(Math.max(effectiveMinimum, 6))}
              >
                <p className="text-xs text-dashboard-text-secondary">Growth</p>
                <p className="text-lg font-bold text-dashboard-text">$21</p>
                <p className="text-xs text-dashboard-text-secondary">drivers 6–20</p>
              </div>
              <div 
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  newDriverCount >= 21 
                    ? 'border-primary bg-primary/10' 
                    : 'border-dashboard-border hover:border-dashboard-text-secondary'
                }`}
                onClick={() => setNewDriverCount(Math.max(effectiveMinimum, 21))}
              >
                <p className="text-xs text-dashboard-text-secondary">Scale</p>
                <p className="text-lg font-bold text-dashboard-text">$18</p>
                <p className="text-xs text-dashboard-text-secondary">drivers 21+</p>
              </div>
            </div>

            <div className="bg-dashboard-bg rounded-lg p-4 space-y-2">
              {hasActiveSubscription && (
                <div className="flex justify-between text-sm">
                  <span className="text-dashboard-text-secondary">Current</span>
                  <span className="text-dashboard-text">{driverCount} drivers · {formatCurrency(quote.monthlyCents)}/mo value</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-medium">
                <span className="text-dashboard-text-secondary">
                  {hasActiveSubscription ? 'New' : 'Total'}
                </span>
                <span className="text-primary">
                  {hasActiveSubscription
                    ? `${newDriverCount} drivers · ${formatCurrency(newQuote.monthlyCents)}/mo value`
                    : `${formatCurrency(newQuote.dueAfterTrialCents)} due after the ${FREE_TRIAL_DAYS}-day trial`}
                </span>
              </div>
              {!hasActiveSubscription && newQuote.discountCents > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-dashboard-text-secondary">{BILLING_TERMS[billingTerm].label} savings</span>
                  <span className="text-primary">{formatCurrency(newQuote.discountCents)}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-dashboard-text-secondary">
              {hasActiveSubscription 
                ? 'Changes will be prorated and applied immediately'
                : `You will enter a card securely in Stripe. The subscription charge today is $0; cancel before the ${FREE_TRIAL_DAYS}-day trial ends to avoid the first charge.`}
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
              onClick={() => {
                if (hasActiveSubscription) {
                  handleManageSubscription();
                } else {
                  handleCheckout(newDriverCount, billingTerm);
                }
                setChangeDriversOpen(false);
              }}
              disabled={isCheckingOut || isOpeningPortal || isBelowMinimum}
              className="bg-primary hover:bg-primary-hover"
            >
              {isCheckingOut || isOpeningPortal ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {hasActiveSubscription ? 'Update in Stripe' : 'Continue to Checkout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Billing;
