import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Plus, Copy, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DiscountCode {
  id: string;
  code: string;
  discount_percent: number;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  active: boolean;
}

const AdminDiscounts = () => {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newCode, setNewCode] = useState({
    code: '',
    discount_percent: 10,
    max_uses: 100,
  });

  // TODO: Fetch from database
  const [discounts, setDiscounts] = useState<DiscountCode[]>([
    {
      id: '1',
      code: 'LAUNCH20',
      discount_percent: 20,
      max_uses: 100,
      used_count: 0,
      expires_at: null,
      active: true,
    },
  ]);

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

  const handleCreate = () => {
    // TODO: Save to database
    const newDiscount: DiscountCode = {
      id: Date.now().toString(),
      code: newCode.code,
      discount_percent: newCode.discount_percent,
      max_uses: newCode.max_uses,
      used_count: 0,
      expires_at: null,
      active: true,
    };
    setDiscounts([newDiscount, ...discounts]);
    setShowCreate(false);
    setNewCode({ code: '', discount_percent: 10, max_uses: 100 });
    toast({
      title: "Created!",
      description: `Discount code ${newCode.code} created`,
    });
  };

  return (
    <AdminLayout title="Discount Codes">
      {/* Create New */}
      <Card className="bg-slate-900 border-slate-800 mb-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-white">Create Discount Code</CardTitle>
            <Button
              onClick={() => setShowCreate(!showCreate)}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Code
            </Button>
          </div>
        </CardHeader>
        {showCreate && (
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                    className="border-slate-700 text-slate-400"
                  >
                    Generate
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
                  onChange={(e) => setNewCode({ ...newCode, discount_percent: parseInt(e.target.value) })}
                  className="bg-slate-800 border-slate-700 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-slate-400">Max Uses</Label>
                <Input
                  type="number"
                  min="1"
                  value={newCode.max_uses}
                  onChange={(e) => setNewCode({ ...newCode, max_uses: parseInt(e.target.value) })}
                  className="bg-slate-800 border-slate-700 text-white mt-1"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleCreate}
                  disabled={!newCode.code}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  Create Code
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Existing Codes */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Active Codes</CardTitle>
        </CardHeader>
        <CardContent>
          {discounts.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No discount codes yet</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800">
                    <TableHead className="text-slate-400">Code</TableHead>
                    <TableHead className="text-slate-400">Discount</TableHead>
                    <TableHead className="text-slate-400">Usage</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discounts.map((discount) => (
                    <TableRow key={discount.id} className="border-slate-800">
                      <TableCell>
                        <code className="text-amber-400 bg-slate-800 px-2 py-1 rounded">
                          {discount.code}
                        </code>
                      </TableCell>
                      <TableCell className="text-white font-medium">
                        {discount.discount_percent}% off
                      </TableCell>
                      <TableCell className="text-slate-400">
                        {discount.used_count} / {discount.max_uses}
                      </TableCell>
                      <TableCell>
                        <Badge className={discount.active
                          ? "bg-green-500/20 text-green-400 border-0"
                          : "bg-slate-700 text-slate-400 border-0"
                        }>
                          {discount.active ? 'Active' : 'Inactive'}
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
                            className="text-red-400 hover:text-red-300 hover:bg-slate-800"
                          >
                            <Trash2 className="h-4 w-4" />
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

export default AdminDiscounts;
