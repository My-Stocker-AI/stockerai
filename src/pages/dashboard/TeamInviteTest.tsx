import { useState } from "react";
import { Users, Send, AlertTriangle } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";

const TeamInviteTest = () => {
  const { user, userRole, userProfile } = useAuth();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteRole, setInviteRole] = useState<'driver' | 'primary_admin'>('driver');
  const [inviteCanViewAll, setInviteCanViewAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleInvite = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const adminName = userProfile?.first_name && userProfile?.last_name
        ? `${userProfile.first_name} ${userProfile.last_name}`
        : 'Your Team Admin';

      const payload = {
        email: inviteEmail,
        first_name: inviteFirstName,
        last_name: inviteLastName,
        account_id: userRole?.account_id,
        role: inviteRole,
        can_view_all_routes: inviteCanViewAll,
        admin_name: adminName,
        admin_email: userProfile?.email || user?.email || '',
      };

      console.log('[TEST] Sending invite:', payload);

      const response = await fetch('https://visionairy.app.n8n.cloud/webhook/invite-team-member-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      console.log('[TEST] Response:', data);

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to invite member');
      }

      setResult(data);

      // Don't clear form - allows testing same user multiple times
    } catch (err: any) {
      console.error('[TEST] Error:', err);
      setError(err.message || 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        {/* Warning Banner */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>TEST MODE</strong> - This page tests the new team invite workflow.
            Uses webhook: <code>/invite-team-member-test</code>
          </AlertDescription>
        </Alert>

        {/* Main Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Test Team Invite System
            </CardTitle>
            <CardDescription>
              Test the redesigned invite workflow with proper user existence checking
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Invite Form */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="role">Role *</Label>
                  <Select value={inviteRole} onValueChange={(v: any) => setInviteRole(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="driver">Driver</SelectItem>
                      <SelectItem value="primary_admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    placeholder="John"
                    value={inviteFirstName}
                    onChange={(e) => setInviteFirstName(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    value={inviteLastName}
                    onChange={(e) => setInviteLastName(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="viewAll"
                  checked={inviteCanViewAll}
                  onCheckedChange={setInviteCanViewAll}
                />
                <Label htmlFor="viewAll" className="cursor-pointer">
                  Can view all routes
                </Label>
              </div>

              <Button
                onClick={handleInvite}
                disabled={loading || !inviteEmail || !inviteFirstName || !inviteLastName}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Send className="h-4 w-4 mr-2 animate-spin" />
                    Sending Invite...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Test Invite
                  </>
                )}
              </Button>
            </div>

            {/* Result Display */}
            {result && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-semibold text-green-900 mb-2">✅ Success!</h4>
                <pre className="text-xs bg-white p-2 rounded overflow-auto">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <h4 className="font-semibold text-red-900 mb-2">❌ Error</h4>
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Test Context */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <h4 className="font-semibold mb-2">Test Context:</h4>
              <ul className="space-y-1 text-gray-700">
                <li><strong>Your Account ID:</strong> {userRole?.account_id}</li>
                <li><strong>Your Profile:</strong> {userProfile?.first_name} {userProfile?.last_name}</li>
                <li><strong>Your Email:</strong> {user?.email}</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Test Scenarios */}
        <Card>
          <CardHeader>
            <CardTitle>Test Scenarios</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              <li>
                <strong>Test 1: New User</strong>
                <p className="text-gray-600">Use an email that has never been invited before. Expect: User created, invite sent.</p>
              </li>
              <li>
                <strong>Test 2: Existing User</strong>
                <p className="text-gray-600">Re-invite the same email with different name. Expect: Metadata updated, re-invite sent.</p>
              </li>
              <li>
                <strong>Test 3: Admin Name</strong>
                <p className="text-gray-600">Check email shows admin name correctly (not "()").</p>
              </li>
              <li>
                <strong>Test 4: Multiple Invites</strong>
                <p className="text-gray-600">Invite same email twice quickly. Expect: Second updates first.</p>
              </li>
              <li>
                <strong>Test 5: Invalid Email</strong>
                <p className="text-gray-600">Try "not-an-email". Expect: Error message.</p>
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default TeamInviteTest;
