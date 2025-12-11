import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Heart, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock, MessageCircle, FileCheck, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ClientHealth {
  id: string;
  business_name: string;
  tier: string;
  status: string;
  healthScore: number;
  factors: {
    engagement: number;
    taskCompletion: number;
    responsiveness: number;
    meetingAttendance: number;
  };
  lastActivity: string | null;
  openRequests: number;
  pendingDeliverables: number;
}

export default function ClientHealthDashboard() {
  const { data: clients, isLoading } = useQuery({
    queryKey: ["client-health"],
    queryFn: async () => {
      const { data: clientAccounts, error } = await supabase
        .from("client_accounts")
        .select("id, business_name, tier, status")
        .eq("status", "active");
      
      if (error) throw error;
      
      const healthData: ClientHealth[] = await Promise.all(
        (clientAccounts || []).map(async (client) => {
          // Get task completion rate
          const { data: tasks } = await supabase
            .from("client_tasks")
            .select("status")
            .eq("client_account_id", client.id);
          
          const completedTasks = tasks?.filter(t => t.status === "completed").length || 0;
          const totalTasks = tasks?.length || 1;
          const taskCompletion = Math.round((completedTasks / totalTasks) * 100);

          // Get message activity (responsiveness)
          const { data: messages } = await supabase
            .from("client_messages")
            .select("created_at, sender_type")
            .eq("client_account_id", client.id)
            .order("created_at", { ascending: false })
            .limit(20);
          
          const clientMessages = messages?.filter(m => m.sender_type === "client").length || 0;
          const responsiveness = Math.min(100, clientMessages * 10);

          // Get meeting attendance
          const { data: meetings } = await supabase
            .from("client_meetings")
            .select("status")
            .eq("client_account_id", client.id);
          
          const completedMeetings = meetings?.filter(m => m.status === "completed").length || 0;
          const totalMeetings = meetings?.length || 1;
          const meetingAttendance = Math.round((completedMeetings / totalMeetings) * 100);

          // Get engagement from activity feed
          const { data: activities } = await supabase
            .from("activity_feed")
            .select("created_at")
            .eq("client_account_id", client.id)
            .order("created_at", { ascending: false })
            .limit(1);
          
          const lastActivity = activities?.[0]?.created_at || null;
          const daysSinceActivity = lastActivity 
            ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24))
            : 30;
          const engagement = Math.max(0, 100 - (daysSinceActivity * 5));

          // Get open requests
          const { count: openRequests } = await supabase
            .from("client_requests")
            .select("*", { count: "exact", head: true })
            .eq("client_account_id", client.id)
            .in("status", ["pending", "in_progress"]);

          // Get pending deliverables
          const { count: pendingDeliverables } = await supabase
            .from("deliverables")
            .select("*", { count: "exact", head: true })
            .eq("client_account_id", client.id)
            .eq("status", "pending_review");

          const healthScore = Math.round(
            (engagement * 0.3) + 
            (taskCompletion * 0.25) + 
            (responsiveness * 0.25) + 
            (meetingAttendance * 0.2)
          );

          return {
            id: client.id,
            business_name: client.business_name,
            tier: client.tier,
            status: client.status,
            healthScore,
            factors: {
              engagement,
              taskCompletion,
              responsiveness,
              meetingAttendance
            },
            lastActivity,
            openRequests: openRequests || 0,
            pendingDeliverables: pendingDeliverables || 0
          };
        })
      );

      return healthData.sort((a, b) => a.healthScore - b.healthScore);
    }
  });

  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    if (score >= 40) return "text-orange-500";
    return "text-red-500";
  };

  const getHealthBadge = (score: number) => {
    if (score >= 80) return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Healthy</Badge>;
    if (score >= 60) return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Fair</Badge>;
    if (score >= 40) return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20">At Risk</Badge>;
    return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Critical</Badge>;
  };

  const getHealthIcon = (score: number) => {
    if (score >= 80) return <CheckCircle className="h-5 w-5 text-green-500" />;
    if (score >= 60) return <TrendingUp className="h-5 w-5 text-yellow-500" />;
    if (score >= 40) return <TrendingDown className="h-5 w-5 text-orange-500" />;
    return <AlertTriangle className="h-5 w-5 text-red-500" />;
  };

  const avgHealth = clients?.length 
    ? Math.round(clients.reduce((sum, c) => sum + c.healthScore, 0) / clients.length)
    : 0;

  const atRiskCount = clients?.filter(c => c.healthScore < 60).length || 0;
  const healthyCount = clients?.filter(c => c.healthScore >= 80).length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Client Health Dashboard</h2>
        <p className="text-muted-foreground">Monitor client engagement and satisfaction</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Heart className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{avgHealth}%</p>
                <p className="text-sm text-muted-foreground">Avg Health Score</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{healthyCount}</p>
                <p className="text-sm text-muted-foreground">Healthy Clients</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{atRiskCount}</p>
                <p className="text-sm text-muted-foreground">At Risk</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{clients?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Total Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Loading client health data...</p>
          </Card>
        ) : clients?.length === 0 ? (
          <Card className="p-8 text-center">
            <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No active clients to analyze</p>
          </Card>
        ) : (
          clients?.map(client => (
            <Card key={client.id}>
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex items-center gap-3 min-w-[200px]">
                    {getHealthIcon(client.healthScore)}
                    <div>
                      <h3 className="font-semibold">{client.business_name}</h3>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{client.tier}</Badge>
                        {getHealthBadge(client.healthScore)}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Engagement</span>
                        <span className={getHealthColor(client.factors.engagement)}>{client.factors.engagement}%</span>
                      </div>
                      <Progress value={client.factors.engagement} className="h-2" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Tasks</span>
                        <span className={getHealthColor(client.factors.taskCompletion)}>{client.factors.taskCompletion}%</span>
                      </div>
                      <Progress value={client.factors.taskCompletion} className="h-2" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Response</span>
                        <span className={getHealthColor(client.factors.responsiveness)}>{client.factors.responsiveness}%</span>
                      </div>
                      <Progress value={client.factors.responsiveness} className="h-2" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Meetings</span>
                        <span className={getHealthColor(client.factors.meetingAttendance)}>{client.factors.meetingAttendance}%</span>
                      </div>
                      <Progress value={client.factors.meetingAttendance} className="h-2" />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1" title="Open Requests">
                      <MessageCircle className="h-4 w-4" />
                      <span>{client.openRequests}</span>
                    </div>
                    <div className="flex items-center gap-1" title="Pending Deliverables">
                      <FileCheck className="h-4 w-4" />
                      <span>{client.pendingDeliverables}</span>
                    </div>
                    {client.lastActivity && (
                      <div className="flex items-center gap-1" title="Last Activity">
                        <Calendar className="h-4 w-4" />
                        <span>{formatDistanceToNow(new Date(client.lastActivity), { addSuffix: true })}</span>
                      </div>
                    )}
                  </div>

                  <div className={`text-3xl font-bold ${getHealthColor(client.healthScore)}`}>
                    {client.healthScore}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
