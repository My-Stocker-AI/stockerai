import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, RefreshCw, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Subscription {
  id: string;
  account_name: string;
  driver_count: number;
  status: string;
  monthly_amount: number;
  created_at: string;
  primary_admin_email: string;
}

const AdminSubscriptions = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const calculateMonthlyAmount = (driverCount: number) => {
    if (driverCount <= 5) return driverCount * 20;
    if (driverCount <= 20) return driverCount * 18;
    if (driverCount <= 50) return driverCount * 15;
    return driverCount * 12; // Enterprise
  };

  const fetchSubscriptions = async () => {
    setLoading(true);
    try {
      const { data: accountsData, error } = await supabase
        .from('accounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch primary admin for each account
      const subsWithAdmin = await Promise.all(
        (accountsData || []).map(async (account) => {
          const { data: adminData } = await supabase
            .from('account_users')
            .select(`
              profiles:user_id (email)
            `)
            .eq('account_id', account.id)
            .eq('role', 'primary_admin')
            .single();

          return {
            id: account.id,
            account_name: account.name,
            driver_count: account.driver_count,
            status: 'active', // TODO: Get from Stripe
            monthly_amount: calculateMonthlyAmount(account.driver_count),
            created_at: account.created_at,
            primary_admin_email: adminData?.profiles?.email || 'N/A',
          };
        })
      );

      setSubscriptions(subsWithAdmin);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const filteredSubs = subscriptions.filter(sub =>
    sub.account_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sub.primary_admin_email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalMRR = subscriptions.reduce((sum, sub) => sum + sub.monthly_amount, 0);

  return (
    <AdminLayout title="Subscriptions">
      {/* MRR Card */}
      <Card className="bg-gradient-to-r from-amber-600 to-amber-500 border-0 mb-6">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-lg">
              <DollarSign className="h-8 w-8 text-white" />
            </div>
            <div>
              <p className="text-amber-100 text-sm">Monthly Recurring Revenue</p>
              <p className="text-3xl font-bold text-white">${totalMRR.toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-white">All Subscriptions</CardTitle>
            <div className="flex gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Input
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-slate-800 border-slate-700 text-white w-full sm:w-64"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={fetchSubscriptions}
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
          ) : filteredSubs.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No subscriptions found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800">
                    <TableHead className="text-slate-400">Account</TableHead>
                    <TableHead className="text-slate-400">Admin Email</TableHead>
                    <TableHead className="text-slate-400">Drivers</TableHead>
                    <TableHead className="text-slate-400">Monthly</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubs.map((sub) => (
                    <TableRow key={sub.id} className="border-slate-800">
                      <TableCell className="text-white font-medium">
                        {sub.account_name}
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm">
                        {sub.primary_admin_email}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-slate-800 text-slate-300">
                          {sub.driver_count}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-white font-medium">
                        ${sub.monthly_amount}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-green-500/20 text-green-400 border-0">
                          {sub.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-amber-500 hover:text-amber-400 hover:bg-slate-800"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300 hover:bg-slate-800"
                          >
                            Refund
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default AdminSubscriptions;
