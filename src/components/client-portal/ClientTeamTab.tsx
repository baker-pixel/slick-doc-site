import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Mail, Phone } from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  bio: string | null;
  specialties: string[] | null;
}

export function ClientTeamTab() {
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

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Your Team</h2>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-foreground">Your Team</h2>

      {!teamMembers || teamMembers.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No team members yet</p>
              <p className="text-sm">Your dedicated team will appear here.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {teamMembers.map((member) => (
            <Card key={member.id} className="overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex items-start gap-4">
                  <Avatar className="h-16 w-16 border-2 border-primary/20">
                    <AvatarImage src={member.photo_url || undefined} alt={member.name} />
                    <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                      {getInitials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg">{member.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{member.role}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {member.bio && (
                  <p className="text-sm text-muted-foreground line-clamp-3">{member.bio}</p>
                )}

                {member.specialties && member.specialties.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {member.specialties.map((specialty, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {specialty}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-2">
                  {member.email && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-start"
                      asChild
                    >
                      <a href={`mailto:${member.email}`}>
                        <Mail className="h-4 w-4 mr-2" />
                        {member.email}
                      </a>
                    </Button>
                  )}
                  {member.phone && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-start"
                      asChild
                    >
                      <a href={`tel:${member.phone}`}>
                        <Phone className="h-4 w-4 mr-2" />
                        {member.phone}
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
