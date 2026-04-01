import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Building2, Heart, Search, Star, Clock } from "lucide-react";

interface QuickClientSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectClient: (clientId: string) => void;
}

interface ClientAccount {
  id: string;
  business_name: string;
  email: string;
  tier: string;
  status: string;
  industry: string | null;
  created_at: string;
}

export function QuickClientSwitcher({ open, onOpenChange, onSelectClient }: QuickClientSwitcherProps) {
  const [recentClients, setRecentClients] = useState<string[]>([]);

  // Load recent clients from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("recentClients");
    if (stored) {
      setRecentClients(JSON.parse(stored));
    }
  }, []);

  // Fetch all clients
  const { data: clients = [] } = useQuery({
    queryKey: ["quick-switch-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_accounts")
        .select("*")
        .order("business_name");
      if (error) throw error;
      return data as ClientAccount[];
    }
  });

  // Health scores placeholder
  const healthScores: { client_account_id: string; overall_score: number }[] = [];

  // Fetch pending tasks count per client
  const { data: taskCounts = [] } = useQuery({
    queryKey: ["quick-switch-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_tasks")
        .select("client_account_id")
        .eq("status", "pending");
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data.forEach(t => {
        counts[t.client_account_id] = (counts[t.client_account_id] || 0) + 1;
      });
      return counts;
    }
  });

  const recentClientsList = useMemo(() => {
    return recentClients
      .map(id => clients.find(c => c.id === id))
      .filter(Boolean) as ClientAccount[];
  }, [recentClients, clients]);

  const clientsNeedingAttention = useMemo(() => {
    return clients.filter(c => {
      const health = healthScores.find(h => h.client_account_id === c.id);
      return health && health.overall_score < 50;
    }).slice(0, 5);
  }, [clients, healthScores]);

  const getHealthScore = (clientId: string) => {
    const health = healthScores.find(h => h.client_account_id === clientId);
    return health?.overall_score;
  };

  const getPendingTaskCount = (clientId: string) => {
    return (taskCounts as Record<string, number>)[clientId] || 0;
  };

  const getHealthColor = (score: number | undefined) => {
    if (!score) return "text-muted-foreground";
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    if (score >= 40) return "text-orange-500";
    return "text-red-500";
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "transformation": return "bg-purple-100 text-purple-800";
      case "growth": return "bg-blue-100 text-blue-800";
      case "foundation": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const handleSelectClient = (clientId: string) => {
    // Update recent clients
    const newRecent = [clientId, ...recentClients.filter(id => id !== clientId)].slice(0, 5);
    setRecentClients(newRecent);
    localStorage.setItem("recentClients", JSON.stringify(newRecent));
    
    onSelectClient(clientId);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search clients..." />
      <CommandList>
        <CommandEmpty>No clients found.</CommandEmpty>
        
        {recentClientsList.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recentClientsList.map(client => (
                <CommandItem
                  key={client.id}
                  value={client.business_name}
                  onSelect={() => handleSelectClient(client.id)}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{client.business_name}</span>
                    <Badge variant="secondary" className={`text-xs ${getTierColor(client.tier)}`}>
                      {client.tier}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {getPendingTaskCount(client.id) > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {getPendingTaskCount(client.id)} tasks
                      </Badge>
                    )}
                    <Heart className={`h-4 w-4 ${getHealthColor(getHealthScore(client.id))}`} />
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {clientsNeedingAttention.length > 0 && (
          <>
            <CommandGroup heading="Needs Attention">
              {clientsNeedingAttention.map(client => {
                const health = getHealthScore(client.id);
                return (
                  <CommandItem
                    key={client.id}
                    value={`attention-${client.business_name}`}
                    onSelect={() => handleSelectClient(client.id)}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Heart className="h-4 w-4 text-red-500" />
                      <span>{client.business_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-red-500">Health: {health}</span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="All Clients">
          {clients.map(client => (
            <CommandItem
              key={client.id}
              value={client.business_name}
              onSelect={() => handleSelectClient(client.id)}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span>{client.business_name}</span>
                <Badge variant="secondary" className={`text-xs ${getTierColor(client.tier)}`}>
                  {client.tier}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {getPendingTaskCount(client.id) > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {getPendingTaskCount(client.id)} tasks
                  </Badge>
                )}
                <Heart className={`h-4 w-4 ${getHealthColor(getHealthScore(client.id))}`} />
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}