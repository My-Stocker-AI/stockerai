import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Copy, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface DiscountCode {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  max_uses: number | null;
  times_used: number | null;
  duration_months: number | null;
  expires_at: string | null;
  stripe_coupon_id?: string;
  stripe_promo_code_id?: string;
  created_at: string | null;
}

const AdminDiscounts = () => {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [discounts, setDiscounts] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [newCode, setNewCode] = useState({
    code: '',
    discount_percent: 10,
    max_uses: 100,
    duration_type: 'forever' as 'once' | 'repeating' | 'forever',
    duration_months: 12,
  });

  // Fetch discount codes from database
  const fetchDiscounts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('discount_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDiscounts(data || []);
    } catch (error: any) {
      console.error('Error fetching discounts:', error);
      toast({
        title: "Error loading discounts",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiscounts();
  }, []);

  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewCode({ ...newCode, code });
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: "Copied!",
      description: `${code} copied to clipboard`,
    });
  };

  const handleCreate = async () => {
    if (!newCode.code) {
      toast({
        title: "Code required",
        description: "Please enter or generate a code",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const { data, error } = await supabase.functions.invoke('create-coupon', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          code: newCode.code,
          discount_percent: newCode.discount_percent,
          max_uses: newCode.max_uses || null,
          duration_type: newCode.duration_type,
          duration_months: newCode.duration_type === 'repeating' ? newCode.duration_months : null,
        },
      });

      if (error) throw error;

      toast({
        title: "Coupon created!",
        description: `${newCode.code} is now active in Stripe`,
      });

      // Refresh the list
      await fetchDiscounts();
      setShowCreate(false);
      setNewCode({ code: '', discount_percent: 10, max_uses: 100, duration_type: 'forever', duration_months: 12 });
    } catch (error: any) {
      console.error('Error creating coupon:', error);
      toast({
        title: "Failed to create coupon",
        description: error.message || "Check console for details",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (discount: DiscountCode) => {
    // For now, just remove from database
    // TODO: Also delete from Stripe
    try {
      const { error } = await supabase
        .from('discount_codes')
        .delete()
        .eq('id', discount.id);

      if (error) throw error;

      toast({
        title: "Deleted",
        description: `${discount.code} has been removed`,
      });

      await fetchDiscounts();
    } catch (error: any) {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getDurationLabel = (discount: DiscountCode) => {
    if (discount.duration_months === null && discount.expires_at === null) {
      return 'Forever';
    }
    if (discount.duration_months) {
      return `${discount.duration_months} months`;
    }
    return 'One-time';
  };

  const isExpired = (discount: DiscountCode) => {
    if (!discount.expires_at) return false;
    return new Date(discount.expires_at) < new Date();
  };

  const isMaxedOut = (discount: DiscountCode) => {
    if (!discount.max_uses) return false;
    return (discount.times_used || 0) >= discount.max_uses;
  };

  const getStatus = (discount: DiscountCode) => {
    if (isExpired(discount)) return { label: 'Expired', color: 'bg-slate-700 text-slate-400' };
    if (isMaxedOut(discount)) return { label: 'Max Used', color: 'bg-slate-700 text-slate-400' };
    return { label: 'Active', color: 'bg-green-500/20 text-green-400' };
  };

  return (
    <AdminLayout title="Discount Codes">
      {/* Create New */}
      <Card className="bg-slate-900 border-slate-800 mb-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-white">Create Stripe Coupon</CardTitle>
              <p className="text-sm text-slate-400 mt-1">
                Creates a real coupon in Stripe that customers can use at checkout
              </p>
            </div>
            <Button
              onClick={() => setShowCreate(!showCreate)}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Coupon
            </Button>
          </div>
        </CardHeader>
        {showCreate && (
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <Label className="text-slate-400">Code</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={newCode.code}
                    onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })}
                    placeholder="SUMMER20"
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                  <Button
                    variant="outline"
                    onClick={generateCode}
                    className="border-slate-700 text-slate-400 shrink-0"
                  >
                    Auto
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-slate-400">Discount %</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={newCode.discount_percent}
                  onChange={(e) => setNewCode({ ...newCode, discount_percent: parseInt(e.target.value) || 10 })}
                  className="bg-slate-800 border-slate-700 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-slate-400">Duration</Label>
                <Select
                  value={newCode.duration_type}
                  onValueChange={(v: 'once' | 'repeating' | 'forever') => setNewCode({ ...newCode, duration_type: v })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="once">One-time (first payment)</SelectItem>
                    <SelectItem value="repeating">Repeating (X months)</SelectItem>
                    <SelectItem value="forever">Forever (lifetime)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newCode.duration_type === 'repeating' && (
                <div>
                  <Label className="text-slate-400">Months</Label>
                  <Select
                    value={newCode.duration_months.toString()}
                    onValueChange={(v) => setNewCode({ ...newCode, duration_months: parseInt(v) })}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="1">1 month</SelectItem>
                      <SelectItem value="3">3 months</SelectItem>
                      <SelectItem value="6">6 months</SelectItem>
                      <SelectItem value="12">12 months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-slate-400">Max Uses (0=unlimited)</Label>
                <Input
                  type="number"
                  min="0"
                  value={newCode.max_uses}
                  onChange={(e) => setNewCode({ ...newCode, max_uses: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800 border-slate-700 text-white mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <Button
                onClick={handleCreate}
                disabled={!newCode.code || creating}
                className="bg-green-600 hover:bg-green-700"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating in Stripe...
                  </>
                ) : (
                  'Create Coupon'
                )}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Existing Codes */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-white">Active Coupons</CardTitle>
            <Button
              variant="outline"
              size="icon"
              onClick={fetchDiscounts}
              className="border-slate-700 text-slate-400 hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-slate-400">Loading coupons...</div>
          ) : discounts.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              No coupons yet. Create one above to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800">
                    <TableHead className="text-slate-400">Code</TableHead>
                    <TableHead className="text-slate-400">Discount</TableHead>
                    <TableHead className="text-slate-400">Duration</TableHead>
                    <TableHead className="text-slate-400">Usage</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discounts.map((discount) => {
                    const status = getStatus(discount);
                    return (
                      <TableRow key={discount.id} className="border-slate-800">
                        <TableCell>
                          <code className="text-amber-400 bg-slate-800 px-2 py-1 rounded">
                            {discount.code}
                          </code>
                        </TableCell>
                        <TableCell className="text-white font-medium">
                          {discount.discount_value}% off
                        </TableCell>
                        <TableCell className="text-slate-400">
                          {getDurationLabel(discount)}
                        </TableCell>
                        <TableCell className="text-slate-400">
                          {discount.times_used || 0}
                          {discount.max_uses ? ` / ${discount.max_uses}` : ' (unlimited)'}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${status.color} border-0`}>
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => copyCode(discount.code)}
                              className="text-slate-400 hover:text-white hover:bg-slate-800"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(discount)}
                              className="text-red-400 hover:text-red-300 hover:bg-slate-800"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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

export default AdminDiscounts;
