import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Zap, 
  Play, 
  Pause, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Rocket,
  Bot,
  Calendar,
  Users,
  TrendingUp,
  Loader2,
  ChevronRight,
  Target,
  Sparkles,
  Timer,
  Activity
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";

interface AutomationControlCenterProps {
  adminPassword: string;
}

interface ClientAutomationStatus {
  id: string;
  business_name: string;
  tier: string;
  status: string;
  pendingTasks: number;
  completedTasks: number;
  totalTasks: number;
  lastAutomation: string | null;
  isRunning: boolean;
}

interface AutomationJob {
  id: string;
  client_id: string;
  job_type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  client_accounts?: { business_name: string };
}

interface ScheduleConfig {
  dailyEnabled: boolean;
  dailyTime: string;
  weeklyEnabled: boolean;
  weeklyDay: string;
  monthlyEnabled: boolean;
  monthlyDay: string;
}

export function AutomationControlCenter({ adminPassword }: AutomationControlCenterProps) {
  const [clients, setClients] = useState<ClientAutomationStatus[]>([]);
  const [recentJobs, setRecentJobs] = useState<AutomationJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [runningClients, setRunningClients] = useState<Set<string>>(new Set());
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>({
    dailyEnabled: false,
    dailyTime: "09:00",
    weeklyEnabled: false,
    weeklyDay: "monday",
    monthlyEnabled: false,
    monthlyDay: "1",
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch clients with their task counts
      const { data: clientsData } = await supabase.functions.invoke("admin", {
        body: { action: "getClients", password: adminPassword },
      });

      const { data: tasksData } = await supabase.functions.invoke("admin", {
        body: { action: "getClientTasks", password: adminPassword },
      });

      const { data: jobsData } = await supabase
        .from("automation_jobs")
        .select("*, client_accounts(business_name)")
        .order("created_at", { ascending: false })
        .limit(20);

      // Process client automation status
      const clientStatuses: ClientAutomationStatus[] = (clientsData?.clients || [])
        .filter((c: any) => c.status === "active")
        .map((client: any) => {
          const clientTasks = (tasksData?.tasks || []).filter(
            (t: any) => t.client_account_id === client.id
          );
          const pending = clientTasks.filter((t: any) => t.status === "pending").length;
          const completed = clientTasks.filter((t: any) => 
            t.status === "completed" || t.status === "sent_to_client"
          ).length;
          
          const lastJob = (jobsData || []).find((j: any) => j.client_id === client.id);

          return {
            id: client.id,
            business_name: client.business_name,
            tier: client.tier,
            status: client.status,
            pendingTasks: pending,
            completedTasks: completed,
            totalTasks: clientTasks.length,
            lastAutomation: lastJob?.completed_at || lastJob?.created_at || null,
            isRunning: false,
          };
        });

      setClients(clientStatuses);
      setRecentJobs((jobsData || []) as AutomationJob[]);

      // Load schedule config from admin_settings
      const { data: settings } = await supabase
        .from("admin_settings")
        .select("*")
        .eq("key", "automation_schedule")
        .single();

      if (settings?.value) {
        try {
          setScheduleConfig(JSON.parse(settings.value));
        } catch (e) {
          console.error("Failed to parse schedule config:", e);
        }
      }
    } catch (error) {
      console.error("Error fetching automation data:", error);
      toast({ title: "Error loading data", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [adminPassword]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const runAllTasksForClient = async (clientId: string, clientName: string) => {
    setRunningClients(prev => new Set(prev).add(clientId));
    setClients(prev => prev.map(c => 
      c.id === clientId ? { ...c, isRunning: true } : c
    ));

    try {
      toast({ title: `🚀 Starting automation for ${clientName}...` });

      const { data, error } = await supabase.functions.invoke("auto-run-client-tasks", {
        body: { clientId },
      });

      if (error) throw error;

      toast({
        title: `✅ Automation complete for ${clientName}`,
        description: `${data.completed} tasks completed, ${data.failed} failed`,
      });

      // Refresh data
      await fetchData();
    } catch (error) {
      console.error("Error running automation:", error);
      toast({
        title: "Automation failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRunningClients(prev => {
        const next = new Set(prev);
        next.delete(clientId);
        return next;
      });
      setClients(prev => prev.map(c => 
        c.id === clientId ? { ...c, isRunning: false } : c
      ));
    }
  };

  const runAllClientsAutomation = async () => {
    setIsRunningAll(true);
    const clientsWithTasks = clients.filter(c => c.pendingTasks > 0);

    toast({
      title: `🤖 Running automation for ${clientsWithTasks.length} clients...`,
      description: "This may take a few minutes",
    });

    let successCount = 0;
    let failCount = 0;

    for (const client of clientsWithTasks) {
      try {
        setRunningClients(prev => new Set(prev).add(client.id));
        
        const { data, error } = await supabase.functions.invoke("auto-run-client-tasks", {
          body: { clientId: client.id },
        });

        if (error) throw error;
        successCount++;
      } catch (error) {
        console.error(`Failed for ${client.business_name}:`, error);
        failCount++;
      } finally {
        setRunningClients(prev => {
          const next = new Set(prev);
          next.delete(client.id);
          return next;
        });
      }
    }

    setIsRunningAll(false);
    await fetchData();

    toast({
      title: "🎉 Bulk automation complete!",
      description: `${successCount} clients processed successfully, ${failCount} failed`,
    });
  };

  const saveScheduleConfig = async () => {
    try {
      const { error } = await supabase
        .from("admin_settings")
        .upsert({
          key: "automation_schedule",
          value: JSON.stringify(scheduleConfig),
          description: "Automation schedule configuration",
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });

      if (error) throw error;

      toast({ title: "Schedule saved!" });
    } catch (error) {
      console.error("Error saving schedule:", error);
      toast({ title: "Error saving schedule", variant: "destructive" });
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "foundation": return "bg-blue-500/10 text-blue-500 border-blue-500/30";
      case "growth": return "bg-purple-500/10 text-purple-500 border-purple-500/30";
      case "transformation": return "bg-purple-500/10 text-purple-500 border-purple-500/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getProgressColor = (percent: number) => {
    if (percent >= 80) return "bg-emerald-500";
    if (percent >= 50) return "bg-amber-500";
    return "bg-blue-500";
  };

  const totalPending = clients.reduce((sum, c) => sum + c.pendingTasks, 0);
  const totalCompleted = clients.reduce((sum, c) => sum + c.completedTasks, 0);
  const totalTasks = clients.reduce((sum, c) => sum + c.totalTasks, 0);
  const overallProgress = totalTasks > 0 ? (totalCompleted / totalTasks) * 100 : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Clients</p>
                <p className="text-3xl font-bold">{clients.length}</p>
              </div>
              <Users className="h-8 w-8 text-primary/60" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Tasks</p>
                <p className="text-3xl font-bold">{totalPending}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-500/60" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-3xl font-bold">{totalCompleted}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-emerald-500/60" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overall Progress</p>
                <p className="text-3xl font-bold">{Math.round(overallProgress)}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500/60" />
            </div>
            <Progress value={overallProgress} className="mt-2 h-2" />
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Quick Actions
          </CardTitle>
          <CardDescription>One-click automation controls</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Button
              size="lg"
              onClick={runAllClientsAutomation}
              disabled={isRunningAll || totalPending === 0}
              className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
            >
              {isRunningAll ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Running All Clients...
                </>
              ) : (
                <>
                  <Zap className="h-5 w-5 mr-2" />
                  Run All Pending Tasks ({totalPending})
                </>
              )}
            </Button>

            <Button variant="outline" size="lg" onClick={fetchData}>
              <RefreshCw className="h-5 w-5 mr-2" />
              Refresh Status
            </Button>
          </div>

          {isRunningAll && (
            <Alert className="mt-4">
              <Bot className="h-4 w-4" />
              <AlertTitle>Automation in progress</AlertTitle>
              <AlertDescription>
                Running tasks for {runningClients.size} client(s). Do not close this page.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="clients" className="space-y-4">
        <TabsList>
          <TabsTrigger value="clients">Client Status</TabsTrigger>
          <TabsTrigger value="recent">Recent Jobs</TabsTrigger>
          <TabsTrigger value="schedule">Scheduling</TabsTrigger>
        </TabsList>

        {/* Clients Tab */}
        <TabsContent value="clients">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Client Automation Status
              </CardTitle>
              <CardDescription>
                View and run automation for each client
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-4">
                  {clients.map((client) => {
                    const progress = client.totalTasks > 0 
                      ? (client.completedTasks / client.totalTasks) * 100 
                      : 0;
                    const isRunning = runningClients.has(client.id);

                    return (
                      <div
                        key={client.id}
                        className={cn(
                          "p-4 rounded-lg border transition-all",
                          isRunning && "border-primary/50 bg-primary/5 animate-pulse"
                        )}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div>
                              <h4 className="font-semibold">{client.business_name}</h4>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className={getTierColor(client.tier)}>
                                  {client.tier}
                                </Badge>
                                {client.lastAutomation && (
                                  <span className="text-xs text-muted-foreground">
                                    Last run: {formatDistanceToNow(new Date(client.lastAutomation), { addSuffix: true })}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <Button
                            onClick={() => runAllTasksForClient(client.id, client.business_name)}
                            disabled={isRunning || client.pendingTasks === 0}
                            size="sm"
                            variant={client.pendingTasks > 0 ? "default" : "outline"}
                          >
                            {isRunning ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Running...
                              </>
                            ) : client.pendingTasks > 0 ? (
                              <>
                                <Play className="h-4 w-4 mr-2" />
                                Run {client.pendingTasks} Tasks
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                All Done
                              </>
                            )}
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Progress</span>
                            <span className="font-medium">
                              {client.completedTasks} / {client.totalTasks} tasks
                            </span>
                          </div>
                          <Progress value={progress} className="h-2" />
                        </div>
                      </div>
                    );
                  })}

                  {clients.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No active clients found
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recent Jobs Tab */}
        <TabsContent value="recent">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Automation Jobs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {recentJobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-full",
                          job.status === "completed" && "bg-emerald-500/10",
                          job.status === "running" && "bg-blue-500/10",
                          job.status === "failed" && "bg-red-500/10",
                          job.status === "pending" && "bg-amber-500/10"
                        )}>
                          {job.status === "completed" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                          {job.status === "running" && <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />}
                          {job.status === "failed" && <AlertCircle className="h-4 w-4 text-red-500" />}
                          {job.status === "pending" && <Clock className="h-4 w-4 text-amber-500" />}
                        </div>
                        <div>
                          <p className="font-medium capitalize">
                            {job.job_type.replace(/_/g, " ")}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {job.client_accounts?.business_name || "Unknown client"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={job.status === "completed" ? "default" : "secondary"}>
                          {job.status}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}

                  {recentJobs.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No automation jobs yet
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Schedule Tab */}
        <TabsContent value="schedule">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Automation Schedule
              </CardTitle>
              <CardDescription>
                Configure automatic task execution schedules
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Daily Schedule */}
              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-blue-500/10">
                    <Timer className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <Label className="text-base font-medium">Daily Automation</Label>
                    <p className="text-sm text-muted-foreground">
                      Run all pending FULL tasks every day
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    type="time"
                    value={scheduleConfig.dailyTime}
                    onChange={(e) => setScheduleConfig(prev => ({ ...prev, dailyTime: e.target.value }))}
                    className="px-3 py-1 border rounded text-sm"
                    disabled={!scheduleConfig.dailyEnabled}
                  />
                  <Switch
                    checked={scheduleConfig.dailyEnabled}
                    onCheckedChange={(checked) => 
                      setScheduleConfig(prev => ({ ...prev, dailyEnabled: checked }))
                    }
                  />
                </div>
              </div>

              {/* Weekly Schedule */}
              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-purple-500/10">
                    <Calendar className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <Label className="text-base font-medium">Weekly Reports</Label>
                    <p className="text-sm text-muted-foreground">
                      Generate and send weekly reports
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <select
                    value={scheduleConfig.weeklyDay}
                    onChange={(e) => setScheduleConfig(prev => ({ ...prev, weeklyDay: e.target.value }))}
                    className="px-3 py-1 border rounded text-sm"
                    disabled={!scheduleConfig.weeklyEnabled}
                  >
                    <option value="monday">Monday</option>
                    <option value="tuesday">Tuesday</option>
                    <option value="wednesday">Wednesday</option>
                    <option value="thursday">Thursday</option>
                    <option value="friday">Friday</option>
                  </select>
                  <Switch
                    checked={scheduleConfig.weeklyEnabled}
                    onCheckedChange={(checked) => 
                      setScheduleConfig(prev => ({ ...prev, weeklyEnabled: checked }))
                    }
                  />
                </div>
              </div>

              {/* Monthly Schedule */}
              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-emerald-500/10">
                    <Target className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <Label className="text-base font-medium">Monthly Reports</Label>
                    <p className="text-sm text-muted-foreground">
                      Generate comprehensive monthly reports
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <select
                    value={scheduleConfig.monthlyDay}
                    onChange={(e) => setScheduleConfig(prev => ({ ...prev, monthlyDay: e.target.value }))}
                    className="px-3 py-1 border rounded text-sm"
                    disabled={!scheduleConfig.monthlyEnabled}
                  >
                    {[1, 5, 10, 15, 20, 25].map((day) => (
                      <option key={day} value={day.toString()}>
                        Day {day}
                      </option>
                    ))}
                  </select>
                  <Switch
                    checked={scheduleConfig.monthlyEnabled}
                    onCheckedChange={(checked) => 
                      setScheduleConfig(prev => ({ ...prev, monthlyEnabled: checked }))
                    }
                  />
                </div>
              </div>

              <Button onClick={saveScheduleConfig} className="w-full">
                <Sparkles className="h-4 w-4 mr-2" />
                Save Schedule Configuration
              </Button>

              <Alert>
                <Bot className="h-4 w-4" />
                <AlertTitle>Automated Scheduling</AlertTitle>
                <AlertDescription>
                  When enabled, the system will automatically run tasks at the scheduled times.
                  Make sure your backend has cron jobs configured.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AutomationControlCenter;
