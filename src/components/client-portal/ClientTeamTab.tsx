import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Mail, Phone, Linkedin } from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  specialties: string[];
}

// Static team data - can be made dynamic later with a team_members table
const teamMembers: TeamMember[] = [
  {
    id: "1",
    name: "Marketing Strategist",
    role: "Account Lead",
    email: "strategy@orangedoor.com",
    specialties: ["Strategy", "Planning", "Analytics"],
  },
  {
    id: "2",
    name: "Content Specialist",
    role: "Content Manager",
    email: "content@orangedoor.com",
    specialties: ["Content", "SEO", "Social Media"],
  },
  {
    id: "3",
    name: "Design Lead",
    role: "Creative Director",
    email: "design@orangedoor.com",
    specialties: ["Branding", "Web Design", "Graphics"],
  },
];

interface ClientTeamTabProps {
  clientAccountId: string;
}

export function ClientTeamTab({ clientAccountId }: ClientTeamTabProps) {
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Your Team</h2>
        <p className="text-muted-foreground">Meet your dedicated marketing team</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {teamMembers.map((member) => (
          <Card key={member.id} className="overflow-hidden hover:shadow-lg transition-shadow">
            <CardHeader className="pb-4">
              <div className="flex items-start gap-4">
                <Avatar className="h-14 w-14 ring-2 ring-primary/20">
                  <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground text-lg font-bold">
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
              <div className="flex flex-wrap gap-1">
                {member.specialties.map((specialty, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {specialty}
                  </Badge>
                ))}
              </div>

              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  asChild
                >
                  <a href={`mailto:${member.email}`}>
                    <Mail className="h-4 w-4 mr-2" />
                    Contact
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Need to schedule a call?</h3>
              <p className="text-sm text-muted-foreground">
                Head to the Meetings tab to book time with your team.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
