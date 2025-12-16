import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import {
  Users,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  BarChart3
} from "lucide-react";

interface WorkloadBalancerProps {
  adminPassword: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  capacity_hours_per_week: number;
}

export function WorkloadBalancer({ adminPassword }: WorkloadBalancerProps) {
  // Fetch team members
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["workload-team-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as TeamMember[];
    }
  });

  // Fetch all tasks with team member assignments
  const { data: allTasks = [] } = useQuery({
    queryKey: ["workload-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_tasks")
        .select(`
          *,
          client_accounts (business_name)
        `)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  // Fetch performance metrics
  const { data: performanceMetrics = [] } = useQuery({
    queryKey: ["workload-performance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_performance_metrics")
        .select("*")
        .order("period_end", { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // Calculate workload statistics
  const workloadStats = useMemo(() => {
    const stats: Record<string, {
      pending: number;
      inProgress: number;
      completed: number;
      overdue: number;
      total: number;
      utilization: number;
    }> = {};

    const today = new Date();

    teamMembers.forEach(member => {
      const memberTasks = allTasks.filter(t => t.team_member_id === member.id);
      const pending = memberTasks.filter(t => t.status === "pending").length;
      const inProgress = memberTasks.filter(t => t.status === "in_progress").length;
      const completed = memberTasks.filter(t => t.status === "completed").length;
      const overdue = memberTasks.filter(t => 
        t.due_date && new Date(t.due_date) < today && t.status !== "completed"
      ).length;
      const total = pending + inProgress;
      
      // Assume each task is ~2 hours of work, calculate utilization
      const estimatedHours = total * 2;
      const utilization = Math.min(100, (estimatedHours / member.capacity_hours_per_week) * 100);

      stats[member.id] = { pending, inProgress, completed, overdue, total, utilization };
    });

    // Add unassigned stats
    const unassignedTasks = allTasks.filter(t => !t.team_member_id);
    stats["unassigned"] = {
      pending: unassignedTasks.filter(t => t.status === "pending").length,
      inProgress: unassignedTasks.filter(t => t.status === "in_progress").length,
      completed: 0,
      overdue: unassignedTasks.filter(t => 
        t.due_date && new Date(t.due_date) < today && t.status !== "completed"
      ).length,
      total: unassignedTasks.length,
      utilization: 0
    };

    return stats;
  }, [teamMembers, allTasks]);

  // Calculate team totals
  const teamTotals = useMemo(() => {
    let pending = 0, inProgress = 0, completed = 0, overdue = 0;
    Object.values(workloadStats).forEach(stat => {
      pending += stat.pending;
      inProgress += stat.inProgress;
      completed += stat.completed;
      overdue += stat.overdue;
    });
    return { pending, inProgress, completed, overdue };
  }, [workloadStats]);

  // Get utilization color
  const getUtilizationColor = (utilization: number) => {
    if (utilization >= 90) return "text-red-500";
    if (utilization >= 70) return "text-orange-500";
    if (utilization >= 40) return "text-green-500";
    return "text-blue-500";
  };

  const getUtilizationBg = (utilization: number) => {
    if (utilization >= 90) return "bg-red-500";
    if (utilization >= 70) return "bg-orange-500";
    if (utilization >= 40) return "bg-green-500";
    return "bg-blue-500";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Workload Balancer</h2>
          <p className="text-muted-foreground">
            Monitor team capacity and task distribution
          </p>
        </div>
      </div>

      {/* Team Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-orange-500" />
              <div>
                <div className="text-3xl font-bold">{teamTotals.pending}</div>
                <div className="text-sm text-muted-foreground">Pending Tasks</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-blue-500" />
              <div>
                <div className="text-3xl font-bold">{teamTotals.inProgress}</div>
                <div className="text-sm text-muted-foreground">In Progress</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-3xl font-bold">{teamTotals.completed}</div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <div>
                <div className="text-3xl font-bold">{teamTotals.overdue}</div>
                <div className="text-sm text-muted-foreground">Overdue</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Unassigned Tasks Alert */}
      {workloadStats["unassigned"]?.total > 0 && (
        <Card className="border-orange-300 bg-orange-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <span className="font-medium">
                {workloadStats["unassigned"].total} tasks are unassigned
              </span>
              <Badge variant="outline" className="ml-auto">
                {workloadStats["unassigned"].overdue} overdue
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Team Member Workload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Workload Distribution
          </CardTitle>
          <CardDescription>
            Task distribution and capacity utilization per team member
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {teamMembers.map(member => {
              const stats = workloadStats[member.id] || { pending: 0, inProgress: 0, completed: 0, overdue: 0, total: 0, utilization: 0 };
              
              return (
                <div key={member.id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={member.avatar_url || undefined} />
                        <AvatarFallback>
                          {member.name.split(" ").map(n => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{member.name}</div>
                        <div className="text-sm text-muted-foreground">{member.role}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <TooltipProvider>
                        <div className="flex items-center gap-2">
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className="bg-orange-100">
                                {stats.pending} pending
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>Pending tasks</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className="bg-blue-100">
                                {stats.inProgress} active
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>In progress tasks</TooltipContent>
                          </Tooltip>
                          {stats.overdue > 0 && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="destructive">
                                  {stats.overdue} overdue
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>Overdue tasks</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TooltipProvider>
                      <div className={`text-lg font-bold ${getUtilizationColor(stats.utilization)}`}>
                        {Math.round(stats.utilization)}%
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress 
                      value={stats.utilization} 
                      className="flex-1 h-2"
                    />
                    <span className="text-xs text-muted-foreground w-24 text-right">
                      {stats.total} / ~{Math.floor(member.capacity_hours_per_week / 2)} capacity
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Workload Visualization */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Task Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teamMembers.map(member => {
                const stats = workloadStats[member.id];
                const total = stats?.total || 0;
                const maxTasks = Math.max(...teamMembers.map(m => workloadStats[m.id]?.total || 0), 1);
                const barWidth = (total / maxTasks) * 100;
                
                return (
                  <div key={member.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{member.name}</span>
                      <span className="font-medium">{total} tasks</span>
                    </div>
                    <div className="h-6 bg-muted rounded-md overflow-hidden">
                      <div 
                        className={`h-full ${getUtilizationBg(stats?.utilization || 0)} transition-all duration-300`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Capacity Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teamMembers
                .filter(m => (workloadStats[m.id]?.utilization || 0) >= 90)
                .map(member => (
                  <div key={member.id} className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
                    <div>
                      <div className="font-medium">{member.name} is overloaded</div>
                      <p className="text-sm text-muted-foreground">
                        Consider reassigning {workloadStats[member.id]?.pending || 0} pending tasks
                      </p>
                    </div>
                  </div>
                ))}
              
              {teamMembers
                .filter(m => (workloadStats[m.id]?.utilization || 0) < 40)
                .map(member => (
                  <div key={member.id} className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                    <TrendingUp className="h-5 w-5 text-blue-500 mt-0.5" />
                    <div>
                      <div className="font-medium">{member.name} has capacity</div>
                      <p className="text-sm text-muted-foreground">
                        Can take on {Math.floor((member.capacity_hours_per_week / 2) - (workloadStats[member.id]?.total || 0))} more tasks
                      </p>
                    </div>
                  </div>
                ))}

              {teamMembers.every(m => {
                const util = workloadStats[m.id]?.utilization || 0;
                return util >= 40 && util < 90;
              }) && (
                <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <div className="font-medium">Workload is balanced</div>
                    <p className="text-sm text-muted-foreground">
                      All team members have healthy utilization levels
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}