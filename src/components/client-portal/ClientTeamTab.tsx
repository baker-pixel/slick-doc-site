import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Mail, Phone } from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  is_active: boolean;
  display_order: number;
}

interface ClientTeamTabProps {
  clientAccountId: string;
}

// Compact "who's my rep" card embedded on the Home tab — a client looks this
// up once, so it doesn't need its own permanent nav destination.
export function ClientTeamTab({ clientAccountId }: ClientTeamTabProps) {
  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return data as TeamMember[];
    },
  });

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Your Team
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!teamMembers || teamMembers.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Your Team
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your Orange Door team will show up here once they're added.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Your Team
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {teamMembers.map((member) => (
          <div key={member.id} className="flex items-center gap-3">
            <Avatar className="h-10 w-10 ring-2 ring-primary/20 shrink-0">
              {member.photo_url ? <AvatarImage src={member.photo_url} alt={member.name} /> : null}
              <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground text-sm font-bold">
                {getInitials(member.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{member.name}</p>
              <p className="text-xs text-muted-foreground truncate">{member.role}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              {member.email && (
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                  <a href={`mailto:${member.email}`} aria-label={`Email ${member.name}`}>
                    <Mail className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
              {member.phone && (
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                  <a href={`tel:${member.phone}`} aria-label={`Call ${member.name}`}>
                    <Phone className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
