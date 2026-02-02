import { useState, useEffect } from "react";
import { Loader2, User, Lock, Trash2, Building2, Users, Zap, Volume2 } from "lucide-react";
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

  // Voice & Picking settings state
  const [callTwoItems, setCallTwoItems] = useState(false);
  const [ttsVolume, setTtsVolume] = useState(1.5);
  const [currentEnvironment, setCurrentEnvironment] = useState<'quiet' | 'moderate' | 'loud' | 'unknown'>('unknown');
  const [isDetecting, setIsDetecting] = useState(false);

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

  // Load voice & picking settings from localStorage
  useEffect(() => {
    const savedTwoItems = localStorage.getItem('stocker-call-two-items');
    if (savedTwoItems !== null) {
      setCallTwoItems(savedTwoItems === 'true');
    }

    const savedVolume = localStorage.getItem('stocker-tts-volume');
    if (savedVolume !== null) {
      setTtsVolume(parseFloat(savedVolume));
    }

    const savedEnvironment = localStorage.getItem('stocker-environment-type');
    if (savedEnvironment && ['quiet', 'moderate', 'loud'].includes(savedEnvironment)) {
      setCurrentEnvironment(savedEnvironment as 'quiet' | 'moderate' | 'loud');
    }
  }, []);

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

  // Voice & Picking settings handlers
  const handleToggleTwoItems = (enabled: boolean) => {
    setCallTwoItems(enabled);
    localStorage.setItem('stocker-call-two-items', enabled.toString());
    toast({ title: enabled ? "2-pick mode enabled" : "2-pick mode disabled" });
  };

  const handleVolumeChange = (value: number) => {
    setTtsVolume(value);
    localStorage.setItem('stocker-tts-volume', value.toString());
  };

  const handleSetEnvironment = (type: 'quiet' | 'moderate' | 'loud') => {
    setCurrentEnvironment(type);
    localStorage.setItem('stocker-environment-type', type);
    toast({ title: `Environment set to ${type}` });
  };

  const handleDetectEnvironment = async () => {
    setIsDetecting(true);
    toast({ title: "Detecting environment...", description: "Please wait 5 seconds" });

    // Simulate detection (in real app, this would use audio analysis)
    setTimeout(() => {
      const detected = 'moderate' as const;
      setCurrentEnvironment(detected);
      localStorage.setItem('stocker-environment-type', detected);
      setIsDetecting(false);
      toast({ title: `Environment detected: ${detected}` });
    }, 5000);
  };

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

        {/* Voice & Picking Settings */}
        <Card className="bg-dashboard-card border-dashboard-border">
          <CardHeader>
            <CardTitle className="text-dashboard-text flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Voice & Picking Settings
            </CardTitle>
            <CardDescription className="text-dashboard-text-secondary">
              Configure voice recognition and picking behavior
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 2-Pick Toggle */}
            <div className="bg-dashboard-bg rounded-xl p-4 border border-dashboard-border">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-dashboard-text font-semibold mb-1">Call 2 Items at Once</h3>
                  <p className="text-sm text-dashboard-text-secondary">
                    When enabled, the AI will call out two items together instead of one at a time.
                    Example: "5 Snickers, 3 Coca-Cola" instead of just "5 Snickers"
                  </p>
                </div>

                {/* Toggle Switch */}
                <button
                  onClick={() => handleToggleTwoItems(!callTwoItems)}
                  className={`
                    relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0
                    ${callTwoItems ? 'bg-primary' : 'bg-gray-700'}
                  `}
                >
                  <span
                    className={`
                      inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                      ${callTwoItems ? 'translate-x-6' : 'translate-x-1'}
                    `}
                  />
                </button>
              </div>

              {/* Status indicator */}
              <div className="mt-3 text-xs text-dashboard-text-secondary">
                Status: <span className={callTwoItems ? 'text-primary' : 'text-gray-400'}>
                  {callTwoItems ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>

            {/* Voice Volume Control */}
            <div className="bg-dashboard-bg rounded-xl p-4 border border-dashboard-border">
              <div className="mb-3">
                <h3 className="text-dashboard-text font-semibold mb-1">Voice Volume</h3>
                <p className="text-sm text-dashboard-text-secondary">
                  Adjust how loud the AI voice speaks. Use this if speakerphone volume buttons aren't working.
                </p>
              </div>

              {/* Volume Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-dashboard-text-secondary">Quiet</span>
                  <span className="text-primary font-semibold">{Math.round(ttsVolume * 100)}%</span>
                  <span className="text-dashboard-text-secondary">Loud</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.1"
                  value={ttsVolume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="text-xs text-dashboard-text-secondary text-center">
                  {ttsVolume < 1 ? 'Quieter than normal' : ttsVolume === 1 ? 'Normal volume' : 'Louder than normal'}
                </div>
              </div>
            </div>

            {/* Environmental Detection */}
            <div className="bg-dashboard-bg rounded-xl p-4 border border-dashboard-border">
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Volume2 className="h-4 w-4 text-primary" />
                  <h3 className="text-dashboard-text font-semibold">Environment Type</h3>
                </div>
                <p className="text-sm text-dashboard-text-secondary">
                  Automatically adjust voice recognition for your environment. Improves accuracy in noisy warehouses.
                </p>
              </div>

              {/* Current Environment Display */}
              <div className="mb-3 p-3 bg-gray-800/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-dashboard-text-secondary">Current:</span>
                  <span className={`text-sm font-semibold ${
                    currentEnvironment === 'quiet' ? 'text-green-400' :
                    currentEnvironment === 'moderate' ? 'text-yellow-400' :
                    currentEnvironment === 'loud' ? 'text-orange-400' :
                    'text-gray-400'
                  }`}>
                    {currentEnvironment === 'quiet' && '🏡 Quiet (Garage, Small Room)'}
                    {currentEnvironment === 'moderate' && '🏢 Moderate (Office, Small Warehouse)'}
                    {currentEnvironment === 'loud' && '🏭 Loud (Large Warehouse, Factory)'}
                    {currentEnvironment === 'unknown' && '❓ Not Detected'}
                  </span>
                </div>
              </div>

              {/* Auto-Detect Button */}
              <Button
                onClick={handleDetectEnvironment}
                disabled={isDetecting}
                className="w-full mb-3 bg-primary hover:bg-primary-hover disabled:opacity-50"
              >
                {isDetecting ? '📊 Detecting...' : '🔍 Auto-Detect Environment'}
              </Button>

              {/* Manual Override */}
              <div className="space-y-2">
                <p className="text-xs text-dashboard-text-secondary">Or choose manually:</p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleSetEnvironment('quiet')}
                    className={`p-3 rounded-lg text-sm font-bold transition-all ${
                      currentEnvironment === 'quiet'
                        ? 'bg-green-500/30 text-green-300 border-2 border-green-400 shadow-[0_0_20px_rgba(34,197,94,0.4)] scale-105'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                    }`}
                  >
                    🏡<br/>Quiet
                  </button>
                  <button
                    onClick={() => handleSetEnvironment('moderate')}
                    className={`p-3 rounded-lg text-sm font-bold transition-all ${
                      currentEnvironment === 'moderate'
                        ? 'bg-yellow-500/30 text-yellow-300 border-2 border-yellow-400 shadow-[0_0_20px_rgba(234,179,8,0.4)] scale-105'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                    }`}
                  >
                    🏢<br/>Moderate
                  </button>
                  <button
                    onClick={() => handleSetEnvironment('loud')}
                    className={`p-3 rounded-lg text-sm font-bold transition-all ${
                      currentEnvironment === 'loud'
                        ? 'bg-orange-500/30 text-orange-300 border-2 border-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.4)] scale-105'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                    }`}
                  >
                    🏭<br/>Loud
                  </button>
                </div>
              </div>

              {/* Helpful Info */}
              <div className="mt-3 p-2 bg-gray-800/30 rounded text-xs text-dashboard-text-secondary">
                💡 Tip: Configure this before starting a route for best voice recognition accuracy.
              </div>
            </div>
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
