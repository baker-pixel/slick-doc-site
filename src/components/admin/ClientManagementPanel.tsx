import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Play, FileText, TrendingUp, Mail, Loader2, Users } from "lucide-react";

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

export function ClientManagementPanel() {
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  
  const [newClient, setNewClient] = useState({
    email: "",
    business_name: "",
    first_name: "",
    last_name: "",
    tier: "foundation",
  });

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    setLoading(true);
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
    setLoading(false);
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
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
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
                    <div className="flex gap-1">
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
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
