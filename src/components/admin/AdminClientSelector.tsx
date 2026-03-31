import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, Building2, Users, Plus, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { TierBadge } from "./TierBadge";

interface ClientAccount {
  id: string;
  business_name: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  tier: string;
  status: string;
  industry: string | null;
  created_at: string;
}

interface AdminClientSelectorProps {
  adminPassword: string;
  onSelectClient: (client: ClientAccount) => void;
  onAddClient: () => void;
}

export function AdminClientSelector({ adminPassword, onSelectClient, onAddClient }: AdminClientSelectorProps) {
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pendingTaskCounts, setPendingTaskCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchClients();
    fetchPendingTasks();
  }, [adminPassword]);

  const fetchClients = async () => {
    setIsLoading(true);

    const res = await supabase.functions.invoke("admin", {
      body: { action: "getClients", password: adminPassword },
    });

    if (res.error) {
      setClients([]);
      toast({ title: "Couldn't load clients", description: "Admin access not authorized." });
      setIsLoading(false);
      return;
    }

    const list = (res.data?.clients || []) as ClientAccount[];
    setClients(list);
    setIsLoading(false);
  };

  const fetchPendingTasks = async () => {
    const res = await supabase.functions.invoke("admin", {
      body: { action: "list", table: "client_tasks", password: adminPassword },
    });

    if (res.error) return;

    const rows = (res.data?.data || []) as Array<{ client_account_id: string; status: string }>;
    const counts: Record<string, number> = {};

    rows
      .filter((t) => t.status === "pending")
      .forEach((task) => {
        counts[task.client_account_id] = (counts[task.client_account_id] || 0) + 1;
      });

    setPendingTaskCounts(counts);
  };

  const filteredClients = clients.filter(
    (client) =>
      client.business_name.toLowerCase().includes(search.toLowerCase()) ||
      client.email.toLowerCase().includes(search.toLowerCase()) ||
      (client.first_name && client.first_name.toLowerCase().includes(search.toLowerCase()))
  );

  const getTierColor = (tier: string) => {
    switch (tier?.toLowerCase()) {
      case "foundation":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "growth":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "transformation":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
      case "onboarding":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
      case "paused":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getInitials = (client: ClientAccount) => {
    if (client.first_name && client.last_name) {
      return `${client.first_name[0]}${client.last_name[0]}`.toUpperCase();
    }
    return client.business_name.substring(0, 2).toUpperCase();
  };

  // Separate clients needing attention (have pending tasks)
  const clientsNeedingAttention = filteredClients.filter(
    (c) => (pendingTaskCounts[c.id] || 0) > 0
  );
  const otherClients = filteredClients.filter(
    (c) => (pendingTaskCounts[c.id] || 0) === 0
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3">
          <div className="p-3 rounded-full bg-primary/10">
            <Users className="w-8 h-8 text-primary" />
          </div>
        </div>
        <h1 className="text-2xl font-bold">Select a Client</h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          Choose a client to view and manage their account, tasks, and deliverables.
        </p>
      </div>

      {/* Search & Add */}
      <div className="flex gap-3 max-w-xl mx-auto">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={onAddClient} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Client
        </Button>
      </div>

      {/* Clients Needing Attention */}
      {clientsNeedingAttention.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm font-medium">Needs Attention ({clientsNeedingAttention.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clientsNeedingAttention.map((client) => (
              <Card
                key={client.id}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md hover:border-primary/50",
                  "border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10"
                )}
                onClick={() => onSelectClient(client)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10 bg-amber-100 dark:bg-amber-900/30">
                      <AvatarFallback className="text-amber-700 dark:text-amber-300 font-medium">
                        {getInitials(client)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{client.business_name}</h3>
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 text-xs">
                          {pendingTaskCounts[client.id]} tasks
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{client.email}</p>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="secondary" className={cn("text-xs", getTierColor(client.tier))}>
                          {client.tier}
                        </Badge>
                        <Badge variant="secondary" className={cn("text-xs", getStatusColor(client.status))}>
                          {client.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* All Other Clients */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Building2 className="w-4 h-4" />
          <span className="text-sm font-medium">
            {clientsNeedingAttention.length > 0 ? "Other Clients" : "All Clients"} ({otherClients.length})
          </span>
        </div>
        {otherClients.length === 0 && filteredClients.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <Building2 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <h3 className="font-medium mb-1">No clients found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {search ? "Try adjusting your search" : "Get started by adding your first client"}
              </p>
              {!search && (
                <Button onClick={onAddClient} variant="outline" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Your First Client
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {otherClients.map((client) => (
              <Card
                key={client.id}
                className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
                onClick={() => onSelectClient(client)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary font-medium">
                        {getInitials(client)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{client.business_name}</h3>
                      <p className="text-sm text-muted-foreground truncate">{client.email}</p>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="secondary" className={cn("text-xs", getTierColor(client.tier))}>
                          {client.tier}
                        </Badge>
                        <Badge variant="secondary" className={cn("text-xs", getStatusColor(client.status))}>
                          {client.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
