import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2, Mail, Briefcase } from "lucide-react";
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
}

interface SelectedClientHeaderProps {
  client: ClientAccount;
  onChangeClient: () => void;
}

export function SelectedClientHeader({ client, onChangeClient }: SelectedClientHeaderProps) {
  // Tier badge now handled by TierBadge component

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

  const getInitials = () => {
    if (client.first_name && client.last_name) {
      return `${client.first_name[0]}${client.last_name[0]}`.toUpperCase();
    }
    return client.business_name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="bg-card border-b sticky top-14 z-10">
      <div className="px-4 py-3 flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onChangeClient}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Switch Client</span>
        </Button>
        
        <div className="h-6 w-px bg-border" />
        
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar className="h-9 w-9 border-2 border-primary/20">
            <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
              {getInitials()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold truncate">{client.business_name}</h2>
              <TierBadge tier={(client as any).plan_tier || client.tier} />
              <Badge variant="secondary" className={cn("text-xs", getStatusColor(client.status))}>
                {client.status}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Mail className="w-3 h-3" />
                {client.email}
              </span>
              {client.industry && (
                <span className="hidden sm:flex items-center gap-1">
                  <Briefcase className="w-3 h-3" />
                  {client.industry}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
