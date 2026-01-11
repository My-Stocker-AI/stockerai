import { useState } from "react";
import { Users, Plus, Pencil, Trash2, Loader2, Shield, Truck } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface TeamMember {
  id: string;
  user_id: string;
  role: 'primary_admin' | 'driver';
  can_view_all_routes: boolean | null;
  profiles: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
}

const Team = () => {
  const { user, userRole, userProfile, loading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteRole, setInviteRole] = useState<'driver' | 'primary_admin'>('driver');
  const [inviteCanViewAll, setInviteCanViewAll] = useState(false);

  // Edit form state
  const [editRole, setEditRole] = useState<'driver' | 'primary_admin'>('driver');
  const [editCanViewAll, setEditCanViewAll] = useState(false);

  // Fetch team members
  const { data: teamMembers = [], isLoading } = useQuery({
    queryKey: ['team-members', userRole?.account_id],
    queryFn: async () => {
      if (!userRole?.account_id) return [];
      const { data, error } = await supabase
        .from('account_users')
        .select(`
          id,
          user_id,
          role,
          can_view_all_routes,
          profiles:user_id (
            first_name,
            last_name,
            email
          )
        `)
        .eq('account_id', userRole.account_id);
      
      if (error) throw error;
      return data as unknown as TeamMember[];
    },
    enabled: !!userRole?.account_id,
  });

  // Count admins
  const adminCount = teamMembers.filter(m => m.role === 'primary_admin').length;

  // Invite member mutation - uses Supabase Edge Function
  const inviteMemberMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('invite-team-member', {
        body: {
          email: inviteEmail,
          first_name: inviteFirstName,
          last_name: inviteLastName,
          account_id: userRole?.account_id,
          role: inviteRole,
          can_view_all_routes: inviteCanViewAll,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to invite team member');
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to invite team member');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({ title: "Team member invited", description: "They will receive an email to set their password." });
      setInviteModalOpen(false);
      resetInviteForm();
    },
    onError: (error) => {
      toast({ title: "Error inviting member", description: error.message, variant: "destructive" });
    },
  });

  // Update member mutation
  const updateMemberMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMember) throw new Error('No member selected');
      
      const { error } = await supabase
        .from('account_users')
        .update({
          role: editRole,
          can_view_all_routes: editCanViewAll,
        })
        .eq('id', selectedMember.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({ title: "Member updated successfully" });
      setEditModalOpen(false);
      setSelectedMember(null);
    },
    onError: (error) => {
      toast({ title: "Error updating member", description: error.message, variant: "destructive" });
    },
  });

  // Delete member mutation
  const deleteMemberMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMember) throw new Error('No member selected');
      
      const { error } = await supabase
        .from('account_users')
        .delete()
        .eq('id', selectedMember.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({ title: "Team member removed" });
      setDeleteDialogOpen(false);
      setSelectedMember(null);
    },
    onError: (error) => {
      toast({ title: "Error removing member", description: error.message, variant: "destructive" });
    },
  });

  const resetInviteForm = () => {
    setInviteEmail("");
    setInviteFirstName("");
    setInviteLastName("");
    setInviteRole('driver');
    setInviteCanViewAll(false);
  };

  const openEditModal = (member: TeamMember) => {
    setSelectedMember(member);
    setEditRole(member.role);
    setEditCanViewAll(member.can_view_all_routes || false);
    setEditModalOpen(true);
  };

  const openDeleteDialog = (member: TeamMember) => {
    setSelectedMember(member);
    setDeleteDialogOpen(true);
  };

  const canDeleteMember = (member: TeamMember) => {
    // Can't delete yourself
    if (member.user_id === user?.id) return false;
    // Can't delete the only admin
    if (member.role === 'primary_admin' && adminCount <= 1) return false;
    return true;
  };

  const canChangeRole = (member: TeamMember) => {
    // Can't change the only admin's role
    if (member.role === 'primary_admin' && adminCount <= 1) return false;
    return true;
  };

  // Show loading state if auth is still loading or userRole is not available
  if (loading || !userRole) {
    return (
      <DashboardLayout
        title="Team"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Team" }]}
      >
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-3 text-dashboard-text-secondary">Loading team data...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title="Team" 
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Team" }]}
    >
      <div className="space-y-6">
        {/* Header with Add Button */}
        <div className="flex items-center justify-between">
          <p className="text-dashboard-text-secondary">
            {teamMembers.length} team member{teamMembers.length !== 1 ? 's' : ''}
          </p>
          <Button 
            onClick={() => setInviteModalOpen(true)}
            className="bg-primary hover:bg-primary-hover"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Team Member
          </Button>
        </div>

        {/* Team Members List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : teamMembers.length === 0 ? (
          <Card className="bg-dashboard-card border-dashboard-border">
            <CardContent className="py-16 text-center">
              <Users className="h-12 w-12 mx-auto text-dashboard-text-secondary mb-4" />
              <h3 className="text-lg font-medium text-dashboard-text mb-2">No team members</h3>
              <p className="text-dashboard-text-secondary">Add your first team member to get started</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {teamMembers.map((member) => (
              <Card key={member.id} className="bg-dashboard-card border-dashboard-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-dashboard-bg flex items-center justify-center">
                        {member.role === 'primary_admin' ? (
                          <Shield className="h-5 w-5 text-primary" />
                        ) : (
                          <Truck className="h-5 w-5 text-dashboard-text-secondary" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-dashboard-text">
                            {member.profiles?.first_name || member.profiles?.last_name
                              ? `${member.profiles?.first_name || ''} ${member.profiles?.last_name || ''}`.trim()
                              : member.profiles?.email || 'Unknown User'}
                            {member.user_id === user?.id && (
                              <span className="text-dashboard-text-secondary ml-1">(you)</span>
                            )}
                          </h4>
                          <Badge 
                            variant="secondary" 
                            className={member.role === 'primary_admin' 
                              ? 'bg-primary/20 text-primary border-0' 
                              : 'bg-dashboard-bg text-dashboard-text-secondary border-0'
                            }
                          >
                            {member.role === 'primary_admin' ? 'Admin' : 'Driver'}
                          </Badge>
                        </div>
                        <p className="text-sm text-dashboard-text-secondary">
                          {member.profiles?.email}
                          {member.can_view_all_routes && member.role !== 'primary_admin' && (
                            <span className="ml-2">· Can view all routes</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditModal(member)}
                        className="text-dashboard-text-secondary hover:text-dashboard-text hover:bg-dashboard-bg"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {canDeleteMember(member) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(member)}
                          className="text-dashboard-text-secondary hover:text-error hover:bg-dashboard-bg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Invite Modal */}
      <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
        <DialogContent className="bg-dashboard-card border-dashboard-border">
          <DialogHeader>
            <DialogTitle className="text-primary">Add Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-primary">Email</Label>
              <Input
                id="email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="driver@company.com"
                className="bg-white border-dashboard-border text-gray-900 placeholder:text-gray-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-primary">First Name</Label>
                <Input
                  id="firstName"
                  value={inviteFirstName}
                  onChange={(e) => setInviteFirstName(e.target.value)}
                  className="bg-white border-dashboard-border text-gray-900 placeholder:text-gray-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-primary">Last Name</Label>
                <Input
                  id="lastName"
                  value={inviteLastName}
                  onChange={(e) => setInviteLastName(e.target.value)}
                  className="bg-white border-dashboard-border text-gray-900 placeholder:text-gray-500"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role" className="text-primary">Role</Label>
              <Select value={inviteRole} onValueChange={(v: 'driver' | 'primary_admin') => setInviteRole(v)}>
                <SelectTrigger className="bg-white border-dashboard-border text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-dashboard-border">
                  <SelectItem value="driver" className="text-gray-900 hover:bg-gray-100">Driver</SelectItem>
                  <SelectItem value="primary_admin" className="text-gray-900 hover:bg-gray-100">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="canViewAll" className="text-primary">Can view all routes</Label>
              <Switch
                id="canViewAll"
                checked={inviteCanViewAll}
                onCheckedChange={setInviteCanViewAll}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setInviteModalOpen(false); resetInviteForm(); }}
              className="border-gray-300 text-gray-700 bg-white hover:bg-gray-100"
            >
              Cancel
            </Button>
            <Button
              onClick={() => inviteMemberMutation.mutate()}
              disabled={!inviteEmail || !inviteFirstName || !inviteLastName || inviteMemberMutation.isPending}
              className="bg-primary hover:bg-primary-hover"
            >
              {inviteMemberMutation.isPending ? "Sending..." : "Send Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="bg-dashboard-card border-dashboard-border">
          <DialogHeader>
            <DialogTitle className="text-primary">
              Edit {selectedMember?.profiles?.first_name} {selectedMember?.profiles?.last_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editRole" className="text-primary">Role</Label>
              <Select
                value={editRole}
                onValueChange={(v: 'driver' | 'primary_admin') => setEditRole(v)}
                disabled={!selectedMember || !canChangeRole(selectedMember)}
              >
                <SelectTrigger className="bg-white border-dashboard-border text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-dashboard-border">
                  <SelectItem value="driver" className="text-gray-900 hover:bg-gray-100">Driver</SelectItem>
                  <SelectItem value="primary_admin" className="text-gray-900 hover:bg-gray-100">Admin</SelectItem>
                </SelectContent>
              </Select>
              {selectedMember && !canChangeRole(selectedMember) && (
                <p className="text-xs text-warning">Cannot change role of the only admin</p>
              )}
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="editCanViewAll" className="text-primary">Can view all routes</Label>
              <Switch
                id="editCanViewAll"
                checked={editCanViewAll}
                onCheckedChange={setEditCanViewAll}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditModalOpen(false)}
              className="border-gray-300 text-gray-700 bg-white hover:bg-gray-100"
            >
              Cancel
            </Button>
            <Button
              onClick={() => updateMemberMutation.mutate()}
              disabled={updateMemberMutation.isPending}
              className="bg-primary hover:bg-primary-hover"
            >
              {updateMemberMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-dashboard-card border-dashboard-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-primary">Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600">
              Are you sure you want to remove {selectedMember?.profiles?.first_name} {selectedMember?.profiles?.last_name} from your team? They will lose access to all routes and data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-300 text-gray-700 bg-white hover:bg-gray-100">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMemberMutation.mutate()}
              className="bg-error hover:bg-error/90"
            >
              {deleteMemberMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Team;
