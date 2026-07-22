import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2,
  Circle,
  Clock,
  Users,
  Rocket,
  Zap,
  Target,
  TrendingUp,
  ChevronRight,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";

interface ClientWithPhase {
  id: string;
  business_name: string;
  tier: string;
  status: string;
  created_at: string;
  tasksByCategory: Record<string, { total: number; completed: number }>;
  currentPhase: string;
  phaseProgress: number;
  totalTasks: number;
  completedTasks: number;
}

interface ClientPhaseTrackerProps {
  adminPassword: string;
}

const phases = [
  { id: "onboarding", label: "Onboarding", icon: Users, color: "text-blue-500" },
  { id: "lead_nurturing", label: "Lead Nurturing", icon: Zap, color: "text-purple-500" },
  { id: "crm", label: "CRM Setup", icon: Target, color: "text-orange-500" },
  { id: "ads", label: "Ads & Retargeting", icon: Rocket, color: "text-pink-500" },
  { id: "content", label: "Content", icon: TrendingUp, color: "text-green-500" },
  { id: "seo", label: "SEO", icon: TrendingUp, color: "text-emerald-500" },
];

const tierColors: Record<string, string> = {
  foundation: "bg-slate-500/10 text-slate-600 border-slate-500/30",
  growth: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  transformation: "bg-purple-500/10 text-purple-600 border-purple-500/30",
};

export function ClientPhaseTracker({ adminPassword }: ClientPhaseTrackerProps) {
  const [clients, setClients] = useState<ClientWithPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<string>("all");
  const [generatingTasks, setGeneratingTasks] = useState<string | null>(null);

  useEffect(() => {
    fetchClientsWithPhases();
  }, []);

  const fetchClientsWithPhases = async () => {
    setLoading(true);
    try {
      // Fetch all active clients
      const { data: clientsData, error: clientsError } = await supabase
        .from("client_accounts")
        .select("id, business_name, tier, status, created_at")
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (clientsError) throw clientsError;

      // Fetch tasks for all clients
      const { data: tasksData, error: tasksError } = await supabase
        .from("client_tasks")
        .select("client_account_id, category, status");

      if (tasksError) throw tasksError;

      // Group tasks by client and category
      const tasksByClient: Record<string, Record<string, { total: number; completed: number }>> = {};
      
      tasksData?.forEach((task) => {
        if (!tasksByClient[task.client_account_id]) {
          tasksByClient[task.client_account_id] = {};
        }
        if (!tasksByClient[task.client_account_id][task.category]) {
          tasksByClient[task.client_account_id][task.category] = { total: 0, completed: 0 };
        }
        tasksByClient[task.client_account_id][task.category].total++;
        if (task.status === "completed") {
          tasksByClient[task.client_account_id][task.category].completed++;
        }
      });

      // Determine current phase for each client
      const clientsWithPhases: ClientWithPhase[] = (clientsData || []).map((client) => {
        const categories = tasksByClient[client.id] || {};
        let currentPhase = "onboarding";
        let totalTasks = 0;
        let completedTasks = 0;

        // Calculate totals
        Object.values(categories).forEach((cat) => {
          totalTasks += cat.total;
          completedTasks += cat.completed;
        });

        // Determine current phase based on completion
        const phaseOrder = ["onboarding", "lead_nurturing", "crm", "ads", "content", "seo"];
        for (const phase of phaseOrder) {
          const phaseTasks = categories[phase];
          if (phaseTasks) {
            if (phaseTasks.completed < phaseTasks.total) {
              currentPhase = phase;
              break;
            }
          }
        }

        // If no tasks exist yet, they're in pre-onboarding
        if (totalTasks === 0) {
          currentPhase = "no_tasks";
        }

        const phaseProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        return {
          ...client,
          tasksByCategory: categories,
          currentPhase,
          phaseProgress,
          totalTasks,
          completedTasks,
        };
      });

      setClients(clientsWithPhases);
    } catch (err) {
      console.error("Error fetching client phases:", err);
      toast.error("Failed to load client phases");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateTasks = async (clientId: string) => {
    setGeneratingTasks(clientId);
    try {
      const response = await supabase.functions.invoke("admin", {
        body: {
          action: "generate_client_tasks",
          password: adminPassword,
          data: { client_id: clientId },
        },
      });

      if (response.error) {
        const msg = await getEdgeErrorMessage(response.error, response.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to generate tasks");
      }
      const result = response.data;
      if (result?.error) throw new Error(result.error);

      toast.success(`Generated ${result.tasksGenerated} tasks for ${result.client}`);
      await fetchClientsWithPhases();
    } catch (err: any) {
      console.error("Error generating tasks:", err);
      toast.error(err?.message || "Failed to generate tasks");
    } finally {
      setGeneratingTasks(null);
    }
  };

  const filteredClients = selectedTier === "all" 
    ? clients 
    : clients.filter((c) => c.tier === selectedTier);

  const getCurrentPhaseInfo = (phaseId: string) => {
    if (phaseId === "no_tasks") {
      return { label: "No Tasks Yet", icon: Circle, color: "text-muted-foreground" };
    }
    return phases.find((p) => p.id === phaseId) || phases[0];
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Client Phase Tracker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Client Phase Tracker
          </CardTitle>
          <div className="flex items-center gap-3">
            <Select value={selectedTier} onValueChange={setSelectedTier}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Filter by tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                <SelectItem value="foundation">Foundation</SelectItem>
                <SelectItem value="growth">Growth</SelectItem>
                <SelectItem value="transformation">Transformation</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchClientsWithPhases}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Phase Legend */}
        <div className="flex flex-wrap gap-4 mb-6 p-3 bg-muted/50 rounded-lg">
          {phases.map((phase) => (
            <div key={phase.id} className="flex items-center gap-1.5 text-sm">
              <phase.icon className={`h-4 w-4 ${phase.color}`} />
              <span className="text-muted-foreground">{phase.label}</span>
            </div>
          ))}
        </div>

        {filteredClients.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No active clients found</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-4">
              {filteredClients.map((client) => {
                const phaseInfo = getCurrentPhaseInfo(client.currentPhase);
                const PhaseIcon = phaseInfo.icon;

                return (
                  <div
                    key={client.id}
                    className="p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold text-foreground truncate">
                            {client.business_name}
                          </h4>
                          <Badge className={tierColors[client.tier] || tierColors.foundation}>
                            {client.tier}
                          </Badge>
                        </div>

                        {/* Current Phase */}
                        <div className="flex items-center gap-2 mb-3">
                          <PhaseIcon className={`h-4 w-4 ${phaseInfo.color}`} />
                          <span className="text-sm font-medium">{phaseInfo.label}</span>
                          {client.totalTasks > 0 && (
                            <span className="text-xs text-muted-foreground">
                              ({client.completedTasks}/{client.totalTasks} tasks)
                            </span>
                          )}
                        </div>

                        {/* Phase Progress Bar */}
                        {client.totalTasks > 0 ? (
                          <div className="space-y-1.5">
                            <Progress value={client.phaseProgress} className="h-2" />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{client.phaseProgress}% complete</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Tasks not yet generated for this client
                          </p>
                        )}

                        {/* Category Breakdown */}
                        {client.totalTasks > 0 && (
                          <TooltipProvider>
                            <div className="flex flex-wrap gap-2 mt-3">
                              {phases.map((phase) => {
                                const categoryData = client.tasksByCategory[phase.id];
                                if (!categoryData) return null;

                                const isComplete = categoryData.completed === categoryData.total;
                                const isInProgress = categoryData.completed > 0 && !isComplete;

                                return (
                                  <Tooltip key={phase.id}>
                                    <TooltipTrigger>
                                      <div
                                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${
                                          isComplete
                                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                            : isInProgress
                                            ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                            : "bg-muted text-muted-foreground border-border"
                                        }`}
                                      >
                                        {isComplete ? (
                                          <CheckCircle2 className="h-3 w-3" />
                                        ) : isInProgress ? (
                                          <Clock className="h-3 w-3" />
                                        ) : (
                                          <Circle className="h-3 w-3" />
                                        )}
                                        <span>{phase.label.split(" ")[0]}</span>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>
                                        {phase.label}: {categoryData.completed}/{categoryData.total} complete
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })}
                            </div>
                          </TooltipProvider>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2">
                        {client.totalTasks === 0 && (
                          <Button
                            size="sm"
                            onClick={() => handleGenerateTasks(client.id)}
                            disabled={generatingTasks === client.id}
                          >
                            {generatingTasks === client.id ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Zap className="h-4 w-4 mr-2" />
                            )}
                            Generate Tasks
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
