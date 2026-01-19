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
import { Search, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Account {
  id: string;
  name: string;
  driver_count: number;
  created_at: string;
  users: {
    id: string;
    email: string;
    role: string;
    first_name: string;
    last_name: string;
  }[];
}

const AdminUsers = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      // Fetch accounts with their users
      const { data: accountsData, error: accountsError } = await supabase
        .from('accounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (accountsError) throw accountsError;

      // Fetch account_users with profile info for each account
      const accountsWithUsers = await Promise.all(
        (accountsData || []).map(async (account) => {
          const { data: usersData } = await supabase
            .from('account_users')
            .select(`
              user_id,
              role,
              profiles (
                id,
                email,
                first_name,
                last_name
              )
            `)
            .eq('account_id', account.id);

          const users = (usersData || []).map((u: any) => ({
            id: u.user_id,
            email: u.profiles?.email || 'N/A',
            role: u.role,
            first_name: u.profiles?.first_name || '',
            last_name: u.profiles?.last_name || '',
          }));

          return { ...account, users };
        })
      );

      setAccounts(accountsWithUsers);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const filteredAccounts = accounts.filter(account =>
    account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.users.some(u =>
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  return (
    <AdminLayout title="Users & Accounts">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-white">All Accounts</CardTitle>
            <div className="flex gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Input
                  placeholder="Search accounts or users..."
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
            <div className="text-center py-8 text-slate-400">Loading accounts...</div>
          ) : filteredAccounts.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No accounts found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800">
                    <TableHead className="text-slate-400">Account</TableHead>
                    <TableHead className="text-slate-400">Primary Admin</TableHead>
                    <TableHead className="text-slate-400">Drivers</TableHead>
                    <TableHead className="text-slate-400">Created</TableHead>
                    <TableHead className="text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.map((account) => {
                    const admin = account.users.find(u => u.role === 'primary_admin');
                    return (
                      <TableRow key={account.id} className="border-slate-800">
                        <TableCell className="text-white font-medium">
                          {account.name}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="text-white text-sm">
                              {admin ? `${admin.first_name} ${admin.last_name}`.trim() || admin.email : 'N/A'}
                            </div>
                            {admin && (
                              <div className="text-slate-500 text-xs">{admin.email}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-slate-800 text-slate-300">
                            {account.driver_count} drivers
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-400 text-sm">
                          {new Date(account.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-amber-500 hover:text-amber-400 hover:bg-slate-800"
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default AdminUsers;
