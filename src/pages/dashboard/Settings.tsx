import { useState, useEffect } from "react";
import { Loader2, User, Lock, Trash2, Building2, Users } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

interface Account {
  id: string;
  name: string;
  driver_count: number | null;
  machines_per_driver: number | null;
}

const Settings = () => {
  const { user, userRole, signOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  const isPrimaryAdmin = userRole?.role === 'primary_admin';
  
  // Profile form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // Account settings state
  const [accountName, setAccountName] = useState("");
  const [driverCount, setDriverCount] = useState(2);
  const [machinesPerDriver, setMachinesPerDriver] = useState(10);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Delete account state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  // Fetch profile
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      return data as Profile;
    },
    enabled: !!user?.id,
  });

  // Fetch account (for admins)
  const { data: account, isLoading: accountLoading } = useQuery({
    queryKey: ['account', userRole?.account_id],
    queryFn: async () => {
      if (!userRole?.account_id) return null;
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, driver_count, machines_per_driver')
        .eq('id', userRole.account_id)
        .single();

      if (error) throw error;
      return data as Account;
    },
    enabled: !!userRole?.account_id && isPrimaryAdmin,
  });

  // Update form when profile loads
  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || "");
      setLastName(profile.last_name || "");
    }
  }, [profile]);

  // Update account form when account loads
  useEffect(() => {
    if (account) {
      setAccountName(account.name || "");
      setDriverCount(account.driver_count || 2);
      setMachinesPerDriver(account.machines_per_driver || 10);
    }
  }, [account]);

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');
      
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
        })
        .eq('id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast({ title: "Profile updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating profile", description: error.message, variant: "destructive" });
    },
  });

  // Update account settings mutation
  const updateAccountMutation = useMutation({
    mutationFn: async () => {
      if (!userRole?.account_id) throw new Error('No account found');

      const { error } = await supabase
        .from('accounts')
        .update({
          name: accountName,
          driver_count: driverCount,
          machines_per_driver: machinesPerDriver,
        })
        .eq('id', userRole.account_id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account'] });
      toast({ title: "Account settings updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating account", description: error.message, variant: "destructive" });
    },
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) {
        throw new Error('Passwords do not match');
      }
      if (newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Password changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error) => {
      toast({ title: "Error changing password", description: error.message, variant: "destructive" });
    },
  });

  // Delete account mutation
  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      if (!userRole?.account_id) throw new Error('No account found');

      // Delete account (cascades to account_users)
      const { error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', userRole.account_id);

      if (error) throw error;

      // Sign out
      await signOut();
    },
    onSuccess: () => {
      toast({ title: "Account deleted" });
      navigate('/');
    },
    onError: (error) => {
      toast({ title: "Error deleting account", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout 
        title="Settings" 
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings" }]}
      >
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title="Settings" 
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings" }]}
    >
      <div className="space-y-8 max-w-2xl">
        {/* Profile Section */}
        <Card className="bg-dashboard-card border-dashboard-border">
          <CardHeader>
            <CardTitle className="text-dashboard-text flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile
            </CardTitle>
            <CardDescription className="text-dashboard-text-secondary">
              Update your personal information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-dashboard-text">First Name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="bg-dashboard-bg border-dashboard-border text-dashboard-text"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-dashboard-text">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="bg-dashboard-bg border-dashboard-border text-dashboard-text"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email" className="text-dashboard-text">Email</Label>
              <Input
                id="email"
                type="email"
                value={profile?.email || ""}
                disabled
                className="bg-dashboard-bg border-dashboard-border text-dashboard-text-secondary cursor-not-allowed"
              />
              <p className="text-xs text-dashboard-text-secondary">Email cannot be changed</p>
            </div>

            <Button
              onClick={() => updateProfileMutation.mutate()}
              disabled={updateProfileMutation.isPending}
              className="bg-primary hover:bg-primary-hover"
            >
              {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        {/* Account Settings Section - Only for Primary Admin */}
        {isPrimaryAdmin && (
          <Card className="bg-dashboard-card border-dashboard-border">
            <CardHeader>
              <CardTitle className="text-dashboard-text flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Account Settings
              </CardTitle>
              <CardDescription className="text-dashboard-text-secondary">
                Configure your account's driver seats and usage limits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="accountName" className="text-dashboard-text">Company Name</Label>
                <Input
                  id="accountName"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Your company name"
                  className="bg-dashboard-bg border-dashboard-border text-dashboard-text"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="driverCount" className="text-dashboard-text flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Driver Seats
                  </Label>
                  <Input
                    id="driverCount"
                    type="number"
                    min="1"
                    max="999"
                    value={driverCount}
                    onChange={(e) => setDriverCount(parseInt(e.target.value) || 2)}
                    className="bg-dashboard-bg border-dashboard-border text-dashboard-text"
                  />
                  <p className="text-xs text-dashboard-text-secondary">
                    Number of drivers in your subscription. Current rate: ${driverCount <= 5 ? 20 : driverCount <= 20 ? 18 : 15}/driver/month
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="machinesPerDriver" className="text-dashboard-text">
                    Machines per Driver/Day
                  </Label>
                  <Input
                    id="machinesPerDriver"
                    type="number"
                    min="1"
                    max="100"
                    value={machinesPerDriver}
                    onChange={(e) => setMachinesPerDriver(parseInt(e.target.value) || 10)}
                    className="bg-dashboard-bg border-dashboard-border text-dashboard-text"
                  />
                  <p className="text-xs text-dashboard-text-secondary">
                    Expected machines each driver services daily (for usage tracking)
                  </p>
                </div>
              </div>

              <div className="p-4 bg-dashboard-bg rounded-lg border border-dashboard-border">
                <h4 className="font-medium text-dashboard-text mb-2">Monthly Estimate</h4>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-primary">
                    ${(driverCount <= 5 ? driverCount * 20 : driverCount <= 20 ? driverCount * 18 : driverCount * 15).toLocaleString()}
                  </span>
                  <span className="text-dashboard-text-secondary">/month for {driverCount} driver{driverCount > 1 ? 's' : ''}</span>
                </div>
              </div>

              <Button
                onClick={() => updateAccountMutation.mutate()}
                disabled={updateAccountMutation.isPending}
                className="bg-primary hover:bg-primary-hover"
              >
                {updateAccountMutation.isPending ? "Saving..." : "Save Account Settings"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Password Section */}
        <Card className="bg-dashboard-card border-dashboard-border">
          <CardHeader>
            <CardTitle className="text-dashboard-text flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Password
            </CardTitle>
            <CardDescription className="text-dashboard-text-secondary">
              Change your password
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword" className="text-dashboard-text">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="bg-dashboard-bg border-dashboard-border text-dashboard-text"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-dashboard-text">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-dashboard-bg border-dashboard-border text-dashboard-text"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-dashboard-text">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-dashboard-bg border-dashboard-border text-dashboard-text"
              />
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-error">Passwords do not match</p>
              )}
            </div>

            <Button
              onClick={() => changePasswordMutation.mutate()}
              disabled={!newPassword || !confirmPassword || changePasswordMutation.isPending}
              className="bg-primary hover:bg-primary-hover"
            >
              {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
            </Button>
          </CardContent>
        </Card>

        {/* Delete Account - Only for Primary Admin */}
        {isPrimaryAdmin && (
          <Card className="bg-dashboard-card border-error/50">
            <CardHeader>
              <CardTitle className="text-error flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Delete Account
              </CardTitle>
              <CardDescription className="text-dashboard-text-secondary">
                Permanently delete your account and all data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-dashboard-text-secondary mb-4">
                This will cancel your subscription and permanently delete all your routes, team members, and data. This action cannot be undone.
              </p>
              <Button
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
                className="bg-error hover:bg-error/90"
              >
                Delete Account
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Account Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-dashboard-bg border-dashboard-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-dashboard-text">Delete Account</AlertDialogTitle>
            <AlertDialogDescription className="text-dashboard-text-secondary">
              This action cannot be undone. This will permanently delete your account, cancel your subscription, and remove all your data including routes, team members, and usage history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="deleteConfirm" className="text-dashboard-text">
              Type <span className="font-bold">DELETE</span> to confirm
            </Label>
            <Input
              id="deleteConfirm"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              className="mt-2 bg-dashboard-bg border-dashboard-border text-dashboard-text"
              placeholder="DELETE"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => setDeleteConfirmation("")}
              className="border-dashboard-border text-dashboard-text"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAccountMutation.mutate()}
              disabled={deleteConfirmation !== 'DELETE' || deleteAccountMutation.isPending}
              className="bg-error hover:bg-error/90"
            >
              {deleteAccountMutation.isPending ? "Deleting..." : "Delete Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Settings;
