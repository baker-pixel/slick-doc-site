import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Play, FileText, TrendingUp, Mail, Loader2, Users, Send, UserPlus, Copy, ExternalLink, Trash2, Clock } from "lucide-react";
import { format } from "date-fns";

interface ClientAccount {
  id: string;
  email: string;
  business_name: string;
  first_name: string | null;
  last_name: string | null;
  tier: string;
  status: string;
  onboarded_at: string | null;
  created_at: string;
}

interface ClientInvitation {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  client_account_id: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  invited_by: string | null;
}

interface ClientPortalUser {
  id: string;
  user_id: string;
  client_account_id: string;
  first_name: string | null;
  last_name: string | null;
  last_login_at: string | null;
  created_at: string;
}

export function ClientManagementPanel() {
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [invitations, setInvitations] = useState<ClientInvitation[]>([]);
  const [portalUsers, setPortalUsers] = useState<ClientPortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [selectedClientForInvite, setSelectedClientForInvite] = useState<ClientAccount | null>(null);
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  const [sendingInvite, setSendingInvite] = useState(false);
  
  const [newClient, setNewClient] = useState({
    email: "",
    business_name: "",
    first_name: "",
    last_name: "",
    tier: "foundation",
  });

  const [newInvite, setNewInvite] = useState({
    email: "",
    first_name: "",
    last_name: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchClients(), fetchInvitations(), fetchPortalUsers()]);
    setLoading(false);
  };

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from("client_accounts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to fetch clients");
      console.error(error);
    } else {
      setClients(data || []);
    }
  };

  const fetchInvitations = async () => {
    const { data, error } = await supabase
      .from("client_invitations")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch invitations:", error);
    } else {
      setInvitations(data || []);
    }
  };

  const fetchPortalUsers = async () => {
    const { data, error } = await supabase
      .from("client_portal_users")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch portal users:", error);
    } else {
      setPortalUsers(data || []);
    }
  };

  const addClient = async () => {
    if (!newClient.email || !newClient.business_name) {
      toast.error("Email and business name are required");
      return;
    }

    const { error } = await supabase.from("client_accounts").insert({
      email: newClient.email,
      business_name: newClient.business_name,
      first_name: newClient.first_name || null,
      last_name: newClient.last_name || null,
      tier: newClient.tier,
      status: "active",
    });

    if (error) {
      toast.error("Failed to add client: " + error.message);
    } else {
      toast.success("Client added successfully");
      setAddDialogOpen(false);
      setNewClient({ email: "", business_name: "", first_name: "", last_name: "", tier: "foundation" });
      fetchClients();
    }
  };

  const openInviteDialog = (client: ClientAccount) => {
    setSelectedClientForInvite(client);
    setNewInvite({
      email: "",
      first_name: "",
      last_name: "",
    });
    setInviteDialogOpen(true);
  };

  const sendInvitation = async () => {
    if (!selectedClientForInvite || !newInvite.email) {
      toast.error("Email is required");
      return;
    }

    setSendingInvite(true);
    try {
      // Create the invitation in the database
      const { data: invitation, error: insertError } = await supabase
        .from("client_invitations")
        .insert({
          client_account_id: selectedClientForInvite.id,
          email: newInvite.email,
          first_name: newInvite.first_name || null,
          last_name: newInvite.last_name || null,
          invited_by: "Admin",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Send the invitation email
      const { error: emailError } = await supabase.functions.invoke("send-client-invite", {
        body: {
          invitationId: invitation.id,
          email: newInvite.email,
          firstName: newInvite.first_name,
          businessName: selectedClientForInvite.business_name,
          token: invitation.token,
        },
      });

      if (emailError) {
        console.error("Email send error:", emailError);
        toast.warning("Invitation created but email may not have sent");
      } else {
        toast.success("Invitation sent successfully!");
      }

      setInviteDialogOpen(false);
      setNewInvite({ email: "", first_name: "", last_name: "" });
      fetchInvitations();
    } catch (err) {
      toast.error(`Failed to send invitation: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSendingInvite(false);
    }
  };

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/portal/auth?invite=${token}`;
    navigator.clipboard.writeText(link);
    toast.success("Invite link copied to clipboard");
  };

  const deleteInvitation = async (id: string) => {
    const { error } = await supabase.from("client_invitations").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete invitation");
    } else {
      toast.success("Invitation deleted");
      fetchInvitations();
    }
  };

  const runAutomation = async (clientId: string, jobType: "email_sequence" | "content_generation" | "report") => {
    const jobKey = `${clientId}-${jobType}`;
    setRunningJobs((prev) => new Set([...prev, jobKey]));

    try {
      const { data, error } = await supabase.functions.invoke("run-automation", {
        body: { clientId, jobType },
      });

      if (error) throw error;

      toast.success(`${jobType.replace("_", " ")} completed successfully`);
      console.log("Automation result:", data);
    } catch (err) {
      toast.error(`Failed to run ${jobType}: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRunningJobs((prev) => {
        const next = new Set(prev);
        next.delete(jobKey);
        return next;
      });
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "foundation": return "bg-slate-500";
      case "growth": return "bg-blue-500";
      case "scale": return "bg-purple-500";
      case "dominate": return "bg-amber-500";
      default: return "bg-gray-500";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500";
      case "paused": return "bg-yellow-500";
      case "cancelled": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  const getClientName = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    return client?.business_name || "Unknown";
  };

  const isInviteExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Client Management
        </CardTitle>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
              <DialogDescription>Create a new client account. You can then invite users to access their portal.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input
                    value={newClient.first_name}
                    onChange={(e) => setNewClient({ ...newClient, first_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input
                    value={newClient.last_name}
                    onChange={(e) => setNewClient({ ...newClient, last_name: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Business Name *</Label>
                <Input
                  value={newClient.business_name}
                  onChange={(e) => setNewClient({ ...newClient, business_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={newClient.email}
                  onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Tier</Label>
                <Select value={newClient.tier} onValueChange={(v) => setNewClient({ ...newClient, tier: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="foundation">Foundation</SelectItem>
                    <SelectItem value="growth">Growth</SelectItem>
                    <SelectItem value="scale">Scale</SelectItem>
                    <SelectItem value="dominate">Dominate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={addClient} className="w-full">Add Client</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="clients">
          <TabsList className="mb-4">
            <TabsTrigger value="clients">Clients ({clients.length})</TabsTrigger>
            <TabsTrigger value="invitations">Invitations ({invitations.filter(i => !i.accepted_at).length})</TabsTrigger>
            <TabsTrigger value="portal-users">Portal Users ({portalUsers.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="clients">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : clients.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No clients yet. Add your first client to get started.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Portal Access</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => {
                    const hasPortalAccess = portalUsers.some(u => u.client_account_id === client.id);
                    const pendingInvites = invitations.filter(i => i.client_account_id === client.id && !i.accepted_at).length;
                    
                    return (
                      <TableRow key={client.id}>
                        <TableCell className="font-medium">{client.business_name}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {client.first_name} {client.last_name}
                          </div>
                          <div className="text-xs text-muted-foreground">{client.email}</div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getTierColor(client.tier)}>
                            {client.tier}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getStatusColor(client.status)}>
                            {client.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {hasPortalAccess ? (
                            <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                              Active
                            </Badge>
                          ) : pendingInvites > 0 ? (
                            <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-300">
                              {pendingInvites} Pending
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              No Access
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openInviteDialog(client)}
                              title="Invite to Portal"
                            >
                              <UserPlus className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => runAutomation(client.id, "email_sequence")}
                              disabled={runningJobs.has(`${client.id}-email_sequence`)}
                              title="Run Email Sequence"
                            >
                              {runningJobs.has(`${client.id}-email_sequence`) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Mail className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => runAutomation(client.id, "content_generation")}
                              disabled={runningJobs.has(`${client.id}-content_generation`)}
                              title="Generate Content"
                            >
                              {runningJobs.has(`${client.id}-content_generation`) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <FileText className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => runAutomation(client.id, "report")}
                              disabled={runningJobs.has(`${client.id}-report`)}
                              title="Generate Report"
                            >
                              {runningJobs.has(`${client.id}-report`) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <TrendingUp className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="invitations">
            {invitations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No invitations yet. Invite users from the Clients tab.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell className="font-medium">{invite.email}</TableCell>
                      <TableCell>
                        {invite.first_name} {invite.last_name}
                      </TableCell>
                      <TableCell>{getClientName(invite.client_account_id)}</TableCell>
                      <TableCell>
                        {invite.accepted_at ? (
                          <Badge className="bg-green-500">Accepted</Badge>
                        ) : isInviteExpired(invite.expires_at) ? (
                          <Badge variant="destructive">Expired</Badge>
                        ) : (
                          <Badge variant="outline" className="text-yellow-600 border-yellow-400">
                            <Clock className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(invite.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {!invite.accepted_at && !isInviteExpired(invite.expires_at) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyInviteLink(invite.token)}
                              title="Copy Invite Link"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteInvitation(invite.id)}
                            title="Delete Invitation"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="portal-users">
            {portalUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No portal users yet. Users will appear here after accepting their invitations.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {portalUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.first_name} {user.last_name}
                      </TableCell>
                      <TableCell>{getClientName(user.client_account_id)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.last_login_at 
                          ? format(new Date(user.last_login_at), "MMM d, yyyy h:mm a")
                          : "Never"
                        }
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(user.created_at), "MMM d, yyyy")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>

        {/* Invite Dialog */}
        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite to Client Portal</DialogTitle>
              <DialogDescription>
                Send an invitation to access {selectedClientForInvite?.business_name}'s portal.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input
                    value={newInvite.first_name}
                    onChange={(e) => setNewInvite({ ...newInvite, first_name: e.target.value })}
                    placeholder="John"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input
                    value={newInvite.last_name}
                    onChange={(e) => setNewInvite({ ...newInvite, last_name: e.target.value })}
                    placeholder="Doe"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={newInvite.email}
                  onChange={(e) => setNewInvite({ ...newInvite, email: e.target.value })}
                  placeholder="john@example.com"
                />
              </div>
              <Button onClick={sendInvitation} className="w-full" disabled={sendingInvite}>
                {sendingInvite ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Invitation
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
