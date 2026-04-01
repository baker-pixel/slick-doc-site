import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { format, differenceInHours, differenceInDays, addHours } from "date-fns";
import {
  ClipboardCheck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Target,
  Users,
  Calendar,
  Timer,
  ArrowRight,
  Lock,
  Unlock,
  RefreshCw,
  BarChart3,
  Shield,
  Zap
} from "lucide-react";

interface SOPCommandCenterProps {
  adminPassword: string;
}

interface TaskWithSLA {
  id: string;
  name: string;
  category: string;
  status: string;
  created_at: string;
  due_date: string | null;
  completed_at: string | null;
  started_at: string | null;
  depends_on: string[] | null;
  blocked_reason: string | null;
  order_index: number;
  client_accounts: {
    id: string;
    business_name: string;
    tier: string;
  };
  sla_target_hours?: number;
  sla_warning_hours?: number;
  sla_status?: 'on_track' | 'warning' | 'breached' | 'completed';
  hours_remaining?: number;
}

interface SLAConfig {
  id: string;
  tier: string;
  task_category: string;
  target_hours: number;
  warning_hours: number;
  description: string | null;
}

export function SOPCommandCenter({ adminPassword }: SOPCommandCenterProps) {
  const queryClient = useQueryClient();
  const [selectedTier, setSelectedTier] = useState<string>("all");

  // Fetch SLA configurations
  const { data: slaConfigs = [] } = useQuery({
    queryKey: ["sla-configs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sla_configurations")
        .select("*")
        .order("tier", { ascending: true });
      if (error) throw error;
      return data as SLAConfig[];
    }
  });

  // Fetch all active tasks with client info
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["sop-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_tasks")
        .select(`
          *,
          client_accounts!inner (id, business_name, tier)
        `)
        .in("status", ["pending", "in_progress"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  // Calculate SLA status for each task
  const tasksWithSLA: TaskWithSLA[] = useMemo(() => {
    return tasks.map(task => {
      const clientTier = task.client_accounts?.tier || "foundation";
      const slaConfig = slaConfigs.find(
        c => c.tier === clientTier && c.task_category === task.category
      );

      const targetHours = slaConfig?.target_hours || 48;
      const warningHours = slaConfig?.warning_hours || 24;
      
      const startTime = task.started_at ? new Date(task.started_at) : new Date(task.created_at);
      const now = new Date();
      const hoursElapsed = differenceInHours(now, startTime);
      const hoursRemaining = targetHours - hoursElapsed;

      let slaStatus: 'on_track' | 'warning' | 'breached' | 'completed' = 'on_track';
      if (task.status === 'completed') {
        slaStatus = 'completed';
      } else if (hoursRemaining <= 0) {
        slaStatus = 'breached';
      } else if (hoursRemaining <= warningHours) {
        slaStatus = 'warning';
      }

      return {
        ...task,
        sla_target_hours: targetHours,
        sla_warning_hours: warningHours,
        sla_status: slaStatus,
        hours_remaining: hoursRemaining
      };
    });
  }, [tasks, slaConfigs]);

  // Filter by tier
  const filteredTasks = useMemo(() => {
    if (selectedTier === "all") return tasksWithSLA;
    return tasksWithSLA.filter(t => t.client_accounts?.tier === selectedTier);
  }, [tasksWithSLA, selectedTier]);

  // Group tasks by client
  const tasksByClient = useMemo(() => {
    const grouped: Record<string, TaskWithSLA[]> = {};
    filteredTasks.forEach(task => {
      const clientId = task.client_accounts?.id || "unknown";
      if (!grouped[clientId]) grouped[clientId] = [];
      grouped[clientId].push(task);
    });
    return grouped;
  }, [filteredTasks]);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = filteredTasks.length;
    const onTrack = filteredTasks.filter(t => t.sla_status === 'on_track').length;
    const warning = filteredTasks.filter(t => t.sla_status === 'warning').length;
    const breached = filteredTasks.filter(t => t.sla_status === 'breached').length;
    const blocked = filteredTasks.filter(t => t.blocked_reason || (t.depends_on && t.depends_on.length > 0)).length;
    
    const compliance = total > 0 ? Math.round(((onTrack + warning) / total) * 100) : 100;

    return { total, onTrack, warning, breached, blocked, compliance };
  }, [filteredTasks]);

  // Check if task dependencies are met
  const checkDependencies = (task: TaskWithSLA, allTasks: TaskWithSLA[]) => {
    if (!task.depends_on || task.depends_on.length === 0) return { met: true, blockers: [] };
    
    const blockers: string[] = [];
    task.depends_on.forEach(depId => {
      const depTask = allTasks.find(t => t.id === depId);
      if (depTask && depTask.status !== 'completed') {
        blockers.push(depTask.name);
      }
    });
    
    return { met: blockers.length === 0, blockers };
  };

  const getSLAColor = (status: string) => {
    switch (status) {
      case 'on_track': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'breached': return 'text-red-500';
      case 'completed': return 'text-blue-500';
      default: return 'text-muted-foreground';
    }
  };

  const getSLABadge = (status: string) => {
    switch (status) {
      case 'on_track': return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">On Track</Badge>;
      case 'warning': return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Warning</Badge>;
      case 'breached': return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">SLA Breached</Badge>;
      case 'completed': return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Completed</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getTierBadge = (tier: string) => {
    const colors: Record<string, string> = {
      foundation: "bg-blue-500/10 text-blue-500",
      growth: "bg-purple-500/10 text-purple-500",
      scale: "bg-orange-500/10 text-orange-500"
    };
    return <Badge className={colors[tier] || "bg-muted"}>{tier}</Badge>;
  };

  const formatTimeRemaining = (hours: number) => {
    if (hours < 0) return `${Math.abs(Math.round(hours))}h overdue`;
    if (hours < 24) return `${Math.round(hours)}h remaining`;
    return `${Math.round(hours / 24)}d remaining`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">SOP Command Center</h2>
          <p className="text-muted-foreground">
            Real-time SLA tracking, task dependencies, and compliance monitoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={selectedTier === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedTier("all")}
          >
            All Tiers
          </Button>
          <Button
            variant={selectedTier === "foundation" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedTier("foundation")}
          >
            Foundation
          </Button>
          <Button
            variant={selectedTier === "growth" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedTier("growth")}
          >
            Growth
          </Button>
          <Button
            variant={selectedTier === "scale" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedTier("scale")}
          >
            Scale
          </Button>
        </div>
      </div>

      {/* Compliance Overview */}
      <div className="grid grid-cols-6 gap-4">
        <Card className="col-span-2">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">SLA Compliance</p>
                <p className={`text-4xl font-bold ${stats.compliance >= 90 ? 'text-green-500' : stats.compliance >= 70 ? 'text-yellow-500' : 'text-red-500'}`}>
                  {stats.compliance}%
                </p>
              </div>
              <Shield className={`h-12 w-12 ${stats.compliance >= 90 ? 'text-green-500' : stats.compliance >= 70 ? 'text-yellow-500' : 'text-red-500'}`} />
            </div>
            <Progress value={stats.compliance} className="mt-4 h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats.onTrack}</p>
                <p className="text-sm text-muted-foreground">On Track</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{stats.warning}</p>
                <p className="text-sm text-muted-foreground">At Risk</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{stats.breached}</p>
                <p className="text-sm text-muted-foreground">Breached</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Lock className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{stats.blocked}</p>
                <p className="text-sm text-muted-foreground">Blocked</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="by-client" className="space-y-4">
        <TabsList>
          <TabsTrigger value="by-client">By Client</TabsTrigger>
          <TabsTrigger value="at-risk">At Risk</TabsTrigger>
          <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
          <TabsTrigger value="sla-config">SLA Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="by-client">
          <div className="space-y-4">
            {Object.entries(tasksByClient).map(([clientId, clientTasks]) => {
              const client = clientTasks[0]?.client_accounts;
              const completedCount = clientTasks.filter(t => t.status === 'completed').length;
              const progress = Math.round((completedCount / clientTasks.length) * 100);
              const hasIssues = clientTasks.some(t => t.sla_status === 'breached' || t.sla_status === 'warning');

              return (
                <Card key={clientId} className={hasIssues ? "border-l-4 border-l-orange-500" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-lg">{client?.business_name}</CardTitle>
                        {getTierBadge(client?.tier || 'foundation')}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-medium">{completedCount}/{clientTasks.length} tasks</p>
                          <Progress value={progress} className="w-24 h-2 mt-1" />
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {clientTasks.sort((a, b) => (a.order_index || 0) - (b.order_index || 0)).map(task => {
                        const deps = checkDependencies(task, tasksWithSLA);
                        
                        return (
                          <div 
                            key={task.id} 
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                              task.sla_status === 'breached' ? 'bg-red-500/5 border-red-500/20' :
                              task.sla_status === 'warning' ? 'bg-yellow-500/5 border-yellow-500/20' :
                              'bg-muted/30'
                            }`}
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <div className="flex items-center gap-2">
                                {!deps.met ? (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <Lock className="h-4 w-4 text-orange-500" />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Blocked by: {deps.blockers.join(", ")}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : task.status === 'in_progress' ? (
                                  <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
                                ) : task.status === 'completed' ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Clock className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                              <div className="flex-1">
                                <p className="font-medium">{task.name}</p>
                                <p className="text-xs text-muted-foreground">{task.category}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {getSLABadge(task.sla_status || 'on_track')}
                              <div className={`text-sm font-medium ${getSLAColor(task.sla_status || 'on_track')}`}>
                                {task.hours_remaining !== undefined && formatTimeRemaining(task.hours_remaining)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="at-risk">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Tasks Requiring Immediate Attention
              </CardTitle>
              <CardDescription>
                Tasks that are at risk of breaching SLA or already overdue
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredTasks
                  .filter(t => t.sla_status === 'breached' || t.sla_status === 'warning')
                  .sort((a, b) => (a.hours_remaining || 0) - (b.hours_remaining || 0))
                  .map(task => (
                    <div 
                      key={task.id}
                      className={`flex items-center justify-between p-4 rounded-lg ${
                        task.sla_status === 'breached' ? 'bg-red-500/10 border border-red-500/20' : 'bg-yellow-500/10 border border-yellow-500/20'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        {task.sla_status === 'breached' ? (
                          <XCircle className="h-6 w-6 text-red-500" />
                        ) : (
                          <AlertTriangle className="h-6 w-6 text-yellow-500" />
                        )}
                        <div>
                          <p className="font-medium">{task.name}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{task.client_accounts?.business_name}</span>
                            <ArrowRight className="h-3 w-3" />
                            <span>{task.category}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {getTierBadge(task.client_accounts?.tier || 'foundation')}
                        <div className={`text-lg font-bold ${getSLAColor(task.sla_status || 'on_track')}`}>
                          {task.hours_remaining !== undefined && formatTimeRemaining(task.hours_remaining)}
                        </div>
                      </div>
                    </div>
                  ))}
                {filteredTasks.filter(t => t.sla_status === 'breached' || t.sla_status === 'warning').length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                    <p>All tasks are on track! 🎉</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dependencies">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Task Dependencies & Sequencing
              </CardTitle>
              <CardDescription>
                Tasks blocked by incomplete dependencies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredTasks
                  .filter(t => t.depends_on && t.depends_on.length > 0)
                  .map(task => {
                    const deps = checkDependencies(task, tasksWithSLA);
                    
                    return (
                      <div key={task.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {deps.met ? (
                              <Unlock className="h-4 w-4 text-green-500" />
                            ) : (
                              <Lock className="h-4 w-4 text-orange-500" />
                            )}
                            <span className="font-medium">{task.name}</span>
                            <Badge variant="outline">{task.client_accounts?.business_name}</Badge>
                          </div>
                          {deps.met ? (
                            <Badge className="bg-green-500/10 text-green-500">Ready</Badge>
                          ) : (
                            <Badge className="bg-orange-500/10 text-orange-500">Blocked</Badge>
                          )}
                        </div>
                        {!deps.met && (
                          <div className="ml-6 text-sm text-muted-foreground">
                            <p>Waiting for: {deps.blockers.join(", ")}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                {filteredTasks.filter(t => t.depends_on && t.depends_on.length > 0).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No tasks with dependencies configured</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sla-config">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Timer className="h-5 w-5" />
                SLA Configuration by Tier
              </CardTitle>
              <CardDescription>
                Target response and delivery times for each service tier
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6">
                {['foundation', 'growth', 'scale'].map(tier => (
                  <div key={tier} className="space-y-3">
                    <h3 className="font-semibold capitalize flex items-center gap-2">
                      {getTierBadge(tier)}
                    </h3>
                    <div className="space-y-2">
                      {slaConfigs
                        .filter(c => c.tier === tier)
                        .map(config => (
                          <div key={config.id} className="p-3 bg-muted rounded-lg">
                            <div className="flex items-center justify-between">
                              <span className="capitalize font-medium">{config.task_category}</span>
                              <span className="text-sm">
                                {config.target_hours < 24 
                                  ? `${config.target_hours}h` 
                                  : `${Math.round(config.target_hours / 24)}d`
                                }
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-2 bg-muted-foreground/20 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-yellow-500" 
                                  style={{ width: `${(config.warning_hours / config.target_hours) * 100}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground">
                                ⚠️ {config.warning_hours}h
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
