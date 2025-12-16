import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import {
  TrendingUp,
  Clock,
  CheckCircle2,
  Target,
  Award,
  Users,
  BarChart3,
  Calendar
} from "lucide-react";

interface TeamPerformanceMetricsProps {
  adminPassword: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
}

export function TeamPerformanceMetrics({ adminPassword }: TeamPerformanceMetricsProps) {
  const today = new Date();
  const last7Days = subDays(today, 7);
  const last30Days = subDays(today, 30);

  // Fetch team members
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["perf-team-members"],
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

  // Fetch all tasks for performance calculation
  const { data: allTasks = [] } = useQuery({
    queryKey: ["perf-all-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_tasks")
        .select("*")
        .gte("created_at", last30Days.toISOString());
      if (error) throw error;
      return data;
    }
  });

  // Fetch deliverables for client satisfaction
  const { data: deliverables = [] } = useQuery({
    queryKey: ["perf-deliverables"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliverables")
        .select("*")
        .gte("created_at", last30Days.toISOString());
      if (error) throw error;
      return data;
    }
  });

  // Calculate performance metrics per team member
  const performanceData = useMemo(() => {
    return teamMembers.map(member => {
      const memberTasks = allTasks.filter(t => t.team_member_id === member.id);
      const completedTasks = memberTasks.filter(t => t.status === "completed");
      const onTimeTasks = completedTasks.filter(t => {
        if (!t.due_date || !t.completed_at) return true;
        return new Date(t.completed_at) <= new Date(t.due_date);
      });

      // Calculate average completion time in hours
      let totalCompletionTime = 0;
      let tasksWithTime = 0;
      completedTasks.forEach(task => {
        if (task.completed_at) {
          const created = new Date(task.created_at);
          const completed = new Date(task.completed_at);
          const hours = (completed.getTime() - created.getTime()) / (1000 * 60 * 60);
          totalCompletionTime += hours;
          tasksWithTime++;
        }
      });

      const avgCompletionTime = tasksWithTime > 0 ? totalCompletionTime / tasksWithTime : 0;
      const completionRate = memberTasks.length > 0 ? (completedTasks.length / memberTasks.length) * 100 : 0;
      const onTimeRate = completedTasks.length > 0 ? (onTimeTasks.length / completedTasks.length) * 100 : 0;

      // Calculate tasks completed in last 7 days
      const last7DaysTasks = completedTasks.filter(t => 
        t.completed_at && new Date(t.completed_at) >= last7Days
      ).length;

      return {
        member,
        tasksAssigned: memberTasks.length,
        tasksCompleted: completedTasks.length,
        completionRate,
        onTimeRate,
        avgCompletionTime,
        last7DaysTasks,
        score: Math.round((completionRate * 0.4) + (onTimeRate * 0.4) + (last7DaysTasks * 2))
      };
    }).sort((a, b) => b.score - a.score);
  }, [teamMembers, allTasks]);

  // Team totals
  const teamTotals = useMemo(() => {
    const totalAssigned = allTasks.length;
    const totalCompleted = allTasks.filter(t => t.status === "completed").length;
    const avgCompletionRate = performanceData.length > 0
      ? performanceData.reduce((sum, p) => sum + p.completionRate, 0) / performanceData.length
      : 0;
    const avgOnTimeRate = performanceData.length > 0
      ? performanceData.reduce((sum, p) => sum + p.onTimeRate, 0) / performanceData.length
      : 0;

    return { totalAssigned, totalCompleted, avgCompletionRate, avgOnTimeRate };
  }, [allTasks, performanceData]);

  // Daily completion trends
  const dailyTrends = useMemo(() => {
    const trends: { date: string; completed: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = subDays(today, i);
      const completed = allTasks.filter(t => {
        if (!t.completed_at) return false;
        const completedDate = new Date(t.completed_at);
        return completedDate >= startOfDay(date) && completedDate <= endOfDay(date);
      }).length;
      trends.push({ date: format(date, "EEE"), completed });
    }
    return trends;
  }, [allTasks]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    if (score >= 40) return "text-orange-500";
    return "text-red-500";
  };

  const getRankBadge = (index: number) => {
    switch (index) {
      case 0: return <Badge className="bg-yellow-500">🥇 Top Performer</Badge>;
      case 1: return <Badge className="bg-gray-400">🥈 Runner Up</Badge>;
      case 2: return <Badge className="bg-orange-400">🥉 Third Place</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Team Performance</h2>
          <p className="text-muted-foreground">
            Track completion rates, response times, and team productivity
          </p>
        </div>
      </div>

      {/* Team Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Target className="h-8 w-8 text-blue-500" />
              <div>
                <div className="text-3xl font-bold">{teamTotals.totalAssigned}</div>
                <div className="text-sm text-muted-foreground">Tasks Assigned (30d)</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-3xl font-bold">{teamTotals.totalCompleted}</div>
                <div className="text-sm text-muted-foreground">Tasks Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-purple-500" />
              <div>
                <div className="text-3xl font-bold">{Math.round(teamTotals.avgCompletionRate)}%</div>
                <div className="text-sm text-muted-foreground">Avg Completion Rate</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-orange-500" />
              <div>
                <div className="text-3xl font-bold">{Math.round(teamTotals.avgOnTimeRate)}%</div>
                <div className="text-sm text-muted-foreground">On-Time Delivery</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="leaderboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="details">Detailed Metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Performance Leaderboard
              </CardTitle>
              <CardDescription>Based on completion rate, on-time delivery, and recent activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {performanceData.map((data, index) => (
                  <div key={data.member.id} className="flex items-center gap-4 p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-muted-foreground w-8">
                      #{index + 1}
                    </div>
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={data.member.avatar_url || undefined} />
                      <AvatarFallback>
                        {data.member.name.split(" ").map(n => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{data.member.name}</span>
                        {getRankBadge(index)}
                      </div>
                      <div className="text-sm text-muted-foreground">{data.member.role}</div>
                    </div>
                    <div className="grid grid-cols-4 gap-6 text-center">
                      <div>
                        <div className="text-lg font-bold">{data.tasksCompleted}</div>
                        <div className="text-xs text-muted-foreground">Completed</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold">{Math.round(data.completionRate)}%</div>
                        <div className="text-xs text-muted-foreground">Rate</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold">{Math.round(data.onTimeRate)}%</div>
                        <div className="text-xs text-muted-foreground">On-Time</div>
                      </div>
                      <div>
                        <div className={`text-2xl font-bold ${getScoreColor(data.score)}`}>
                          {data.score}
                        </div>
                        <div className="text-xs text-muted-foreground">Score</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends">
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Daily Completions (Last 7 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dailyTrends.map((day, index) => {
                    const maxCompleted = Math.max(...dailyTrends.map(d => d.completed), 1);
                    const barWidth = (day.completed / maxCompleted) * 100;
                    
                    return (
                      <div key={day.date} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{day.date}</span>
                          <span>{day.completed} tasks</span>
                        </div>
                        <div className="h-6 bg-muted rounded-md overflow-hidden">
                          <div 
                            className="h-full bg-primary transition-all duration-300"
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
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Team Activity This Week
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {performanceData.slice(0, 5).map(data => (
                    <div key={data.member.id} className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={data.member.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {data.member.name.split(" ").map(n => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{data.member.name}</span>
                          <span className="text-sm font-bold">{data.last7DaysTasks} tasks</span>
                        </div>
                        <Progress value={(data.last7DaysTasks / 20) * 100} className="h-2 mt-1" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>Detailed Performance Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3">Team Member</th>
                      <th className="text-center p-3">Assigned</th>
                      <th className="text-center p-3">Completed</th>
                      <th className="text-center p-3">Completion Rate</th>
                      <th className="text-center p-3">On-Time Rate</th>
                      <th className="text-center p-3">Avg Time (hrs)</th>
                      <th className="text-center p-3">Last 7 Days</th>
                      <th className="text-center p-3">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performanceData.map(data => (
                      <tr key={data.member.id} className="border-b hover:bg-muted/50">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={data.member.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">
                                {data.member.name.split(" ").map(n => n[0]).join("")}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{data.member.name}</div>
                              <div className="text-xs text-muted-foreground">{data.member.role}</div>
                            </div>
                          </div>
                        </td>
                        <td className="text-center p-3">{data.tasksAssigned}</td>
                        <td className="text-center p-3">{data.tasksCompleted}</td>
                        <td className="text-center p-3">
                          <Badge variant={data.completionRate >= 70 ? "default" : "secondary"}>
                            {Math.round(data.completionRate)}%
                          </Badge>
                        </td>
                        <td className="text-center p-3">
                          <Badge variant={data.onTimeRate >= 80 ? "default" : "secondary"}>
                            {Math.round(data.onTimeRate)}%
                          </Badge>
                        </td>
                        <td className="text-center p-3">
                          {data.avgCompletionTime > 0 ? Math.round(data.avgCompletionTime) : "-"}
                        </td>
                        <td className="text-center p-3 font-medium">{data.last7DaysTasks}</td>
                        <td className="text-center p-3">
                          <span className={`text-lg font-bold ${getScoreColor(data.score)}`}>
                            {data.score}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}