import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, RefreshCw, DollarSign, Edit2, Loader2, Users, CreditCard, Calendar, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Account {
  id: string;
  name: string;
  driver_count: number | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  trial_ends_at: string | null;
  is_platform_account: boolean | null;
  created_at: string | null;
  primary_admin_email?: string;
  primary_admin_name?: string;
}

const AdminSubscriptions = () => {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [saving, setSaving] = useState(false);

  const [editForm, setEditForm] = useState({
    subscription_status: 'active',
    driver_count: 2,
    is_platform_account: false,
  });

  const calculateMonthlyAmount = (driverCount: number, isPlatform: boolean) => {
    if (isPlatform) return 0;
    if (driverCount <= 5) return driverCount * 20;
    if (driverCount <= 20) return driverCount * 18;
    return driverCount * 15;
  };

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const { data: accountsData, error: accountsError } = await supabase
        .from('accounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (accountsError) throw accountsError;

      // Fetch primary admin for each account using account_users_view
      const accountsWithAdmins = await Promise.all(
        (accountsData || []).map(async (account) => {
          const { data: adminData } = await supabase
            .from('account_users_view')
            .select('email, first_name, last_name')
            .eq('account_id', account.id)
            .eq('role', 'primary_admin')
            .single();

          return {
            ...account,
            primary_admin_email: adminData?.email || 'N/A',
            primary_admin_name: adminData
              ? `${adminData.first_name || ''} ${adminData.last_name || ''}`.trim() || adminData.email
              : 'N/A',
          };
        })
      );

      setAccounts(accountsWithAdmins as Account[]);
    } catch (error: any) {
      console.error('Error fetching accounts:', error);
      toast({
        title: "Error loading accounts",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const openEditModal = (account: Account) => {
    setSelectedAccount(account);
    setEditForm({
      subscription_status: account.subscription_status || 'active',
      driver_count: account.driver_count || 2,
      is_platform_account: account.is_platform_account || false,
    });
    setEditModalOpen(true);
  };

  const handleSave = async () => {
    if (!selectedAccount) return;

    setSaving(true);
    try {
      const { error } = await supabase.rpc('admin_update_account_access', {
        p_account_id: selectedAccount.id,
        p_driver_count: editForm.driver_count,
        p_is_complimentary: editForm.is_platform_account,
        p_subscription_status: editForm.subscription_status,
      });

      if (error) throw error;

      toast({
        title: "Account updated",
        description: `${selectedAccount.name} subscription has been updated`,
      });

      setEditModalOpen(false);
      await fetchAccounts();
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: string | null, isPlatform: boolean | null) => {
    if (isPlatform) {
      return <Badge className="bg-purple-500/20 text-purple-400 border-0">Platform</Badge>;
    }
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500/20 text-green-400 border-0">Active</Badge>;
      case 'trialing':
        return <Badge className="bg-blue-500/20 text-blue-400 border-0">Trial</Badge>;
      case 'past_due':
        return <Badge className="bg-red-500/20 text-red-400 border-0">Past Due</Badge>;
      case 'canceled':
        return <Badge className="bg-slate-700 text-slate-400 border-0">Canceled</Badge>;
      case 'paused':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-0">Paused</Badge>;
      default:
        return <Badge className="bg-slate-700 text-slate-400 border-0">No Sub</Badge>;
    }
  };

  const filteredAccounts = accounts.filter(account =>
    account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.primary_admin_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.primary_admin_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Stats
  const activeCount = accounts.filter(a => a.subscription_status === 'active' && !a.is_platform_account).length;
  const trialCount = accounts.filter(a => a.subscription_status === 'trialing').length;
  const totalDrivers = accounts.filter(a => !a.is_platform_account).reduce((sum, a) => sum + (a.driver_count || 0), 0);
  const platformCount = accounts.filter(a => a.is_platform_account).length;
  const totalMRR = accounts
    .filter(a => a.subscription_status === 'active' && !a.is_platform_account)
    .reduce((sum, a) => sum + calculateMonthlyAmount(a.driver_count || 0, false), 0);

  return (
    <AdminLayout title="Subscription Management">
      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <Card className="bg-gradient-to-r from-amber-600 to-amber-500 border-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <DollarSign className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-amber-100 text-xs">Monthly Revenue</p>
                <p className="text-xl font-bold text-white">${totalMRR.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <CreditCard className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Active</p>
                <p className="text-xl font-bold text-white">{activeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Calendar className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Trials</p>
                <p className="text-xl font-bold text-white">{trialCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <Users className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Paid Drivers</p>
                <p className="text-xl font-bold text-white">{totalDrivers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Shield className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Platform</p>
                <p className="text-xl font-bold text-white">{platformCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Accounts Table */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-white">All Subscriptions</CardTitle>
            <div className="flex gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Input
                  placeholder="Search accounts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-slate-800 border-slate-700 text-white w-full sm:w-64"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={fetchAccounts}
                className="border-slate-700 text-slate-400 hover:text-white"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-slate-400">Loading subscriptions...</div>
          ) : filteredAccounts.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No accounts found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800">
                    <TableHead className="text-slate-400">Account</TableHead>
                    <TableHead className="text-slate-400">Admin</TableHead>
                    <TableHead className="text-slate-400">Drivers</TableHead>
                    <TableHead className="text-slate-400">Monthly</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Created</TableHead>
                    <TableHead className="text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.map((account) => (
                    <TableRow key={account.id} className="border-slate-800">
                      <TableCell className="text-white font-medium">
                        {account.name}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="text-white text-sm">{account.primary_admin_name}</div>
                          <div className="text-slate-500 text-xs">{account.primary_admin_email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-slate-800 text-slate-300">
                          {account.is_platform_account ? '∞' : account.driver_count || 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-white font-medium">
                        {account.is_platform_account ? (
                          <span className="text-purple-400">Free</span>
                        ) : (
                          `$${calculateMonthlyAmount(account.driver_count || 0, false)}`
                        )}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(account.subscription_status, account.is_platform_account)}
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm">
                        {account.created_at ? format(new Date(account.created_at), 'MMM d, yyyy') : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(account)}
                          className="text-amber-500 hover:text-amber-400 hover:bg-slate-800"
                        >
                          <Edit2 className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Subscription</DialogTitle>
            <DialogDescription className="text-slate-400">
              Manage subscription for {selectedAccount?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-slate-400">Subscription Status</Label>
              <Select
                value={editForm.subscription_status}
                onValueChange={(v) => setEditForm({ ...editForm, subscription_status: v })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="active">Active - Full access</SelectItem>
                  <SelectItem value="trialing">Trialing - Limited time</SelectItem>
                  <SelectItem value="past_due">Past Due - Payment failed</SelectItem>
                  <SelectItem value="canceled">Canceled - No access</SelectItem>
                  <SelectItem value="paused">Paused - Temporary hold</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-400">Driver Count</Label>
              <Input
                type="number"
                min="1"
                max="999"
                value={editForm.driver_count}
                onChange={(e) => setEditForm({ ...editForm, driver_count: parseInt(e.target.value) || 2 })}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">
                Monthly: ${calculateMonthlyAmount(editForm.driver_count, editForm.is_platform_account)}
              </p>
            </div>

            <div className="flex items-center space-x-2 p-3 bg-slate-800/50 rounded-lg">
              <input
                type="checkbox"
                id="isPlatform"
                checked={editForm.is_platform_account}
                onChange={(e) => setEditForm({ ...editForm, is_platform_account: e.target.checked })}
                className="rounded border-slate-700 bg-slate-800 text-purple-500"
              />
              <Label htmlFor="isPlatform" className="text-slate-300 cursor-pointer">
                Platform Account
                <span className="block text-xs text-slate-500">Unlimited access, no billing, never expires</span>
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditModalOpen(false)}
              className="border-slate-700 text-slate-400"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminSubscriptions;
