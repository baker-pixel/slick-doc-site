import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { TierBadge } from "../core/TierBadge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Play,
  CheckCircle2,
  Circle,
  Loader2,
  Clock,
  AlertTriangle,
  Wifi,
  SkipForward,
  Sparkles,
  Wrench,
  CalendarIcon,
} from "lucide-react";

interface WorkflowStep {
  id: string;
  step_number: number;
  step_name: string;
  task_type: string;
  status: string;
  completed_at: string | null;
  estimated_completion: string | null;
  actual_completion: string | null;
}

interface Workflow {
  id: string;
  client_id: string;
  current_step: number;
  total_steps: number;
  status: string;
  created_at: string;
}

interface WorkflowProgressPanelProps {
  clientId: string;
  clientName: string;
  clientTier?: string;
  adminPassword?: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: "Pending", color: "bg-muted text-muted-foreground", icon: Circle },
  running: { label: "In Progress", color: "bg-amber-500/10 text-amber-600 border-amber-500/30", icon: Loader2 },
  awaiting_callback: { label: "Awaiting", color: "bg-blue-500/10 text-blue-600 border-blue-500/30", icon: Wifi },
  completed: { label: "Done", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", icon: CheckCircle2 },
  skipped: { label: "Skipped", color: "bg-muted text-muted-foreground border-border", icon: SkipForward },
  failed: { label: "Failed", color: "bg-destructive/10 text-destructive border-destructive/30", icon: AlertTriangle },
};

const PHASE_CONFIG: { name: string; taskTypes: string[] }[] = [
  { name: "Phase 1 — Analysis", taskTypes: ["website_analysis", "seo_audit", "gap_report"] },
  { name: "Phase 2 — Content Creation", taskTypes: ["content", "social_content", "email_template", "ad_copy"] },
  { name: "Phase 3 — Publishing", taskTypes: ["email_campaign"] },
  { name: "Phase 4 — Reporting", taskTypes: ["analytics", "report", "notify_client"] },
];

function getPhase(taskType: string): string {
  for (const phase of PHASE_CONFIG) {
    if (phase.taskTypes.includes(taskType)) return phase.name;
  }
  return "Other";
}

function isAiPowered(taskType: string | null): boolean {
  return !!taskType && taskType !== "manual";
}

export function WorkflowProgressPanel({ clientId, clientName, clientTier, adminPassword }: WorkflowProgressPanelProps) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetchWorkflow();
  }, [clientId]);

  // Realtime subscription for workflow_steps
  useEffect(() => {
    if (!workflow) return;

    const channel = supabase
      .channel(`workflow-steps-admin-${workflow.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workflow_steps",
          filter: `workflow_id=eq.${workflow.id}`,
        },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setSteps((prev) =>
              prev.map((s) =>
                s.id === (payload.new as WorkflowStep).id
                  ? (payload.new as WorkflowStep)
                  : s
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workflow?.id]);

  const fetchWorkflow = async () => {
    setLoading(true);
    try {
      const { data: wf } = await supabase
        .from("client_workflows")
        .select("*")
        .eq("client_id", clientId)
        .eq("status", "active")
        .maybeSingle();

      if (wf) {
        setWorkflow(wf as Workflow);

        const { data: stepsData } = await supabase
          .from("workflow_steps")
          .select("id, step_number, step_name, task_type, status, completed_at, estimated_completion, actual_completion")
          .eq("workflow_id", wf.id)
          .order("step_number", { ascending: true });

        setSteps((stepsData || []) as WorkflowStep[]);
      } else {
        setWorkflow(null);
        setSteps([]);
      }
    } catch (err) {
      console.error("Error fetching workflow:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartWorkflow = async () => {
    setStarting(true);
    try {
      const { data: seedData, error: seedError } = await supabase.functions.invoke(
        "seed-tier-workflow",
        { body: { client_id: clientId, password: adminPassword } }
      );

      if (seedError) throw seedError;
      if (seedData?.error) throw new Error(seedData.error);

      toast({
        title: "Workflow started",
        description: `${seedData.total_steps}-step ${seedData.tier} workflow initiated for ${clientName}`,
      });

      await fetchWorkflow();
    } catch (error) {
      console.error("Start workflow error:", error);
      toast({
        title: "Failed to start workflow",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setStarting(false);
    }
  };

  const handleUpdateDate = async (stepId: string, date: Date | undefined) => {
    if (!date || !adminPassword) return;
    const dateStr = format(date, "yyyy-MM-dd");
    
    try {
      const { error } = await supabase.functions.invoke("admin", {
        body: {
          action: "update",
          table: "workflow_steps",
          id: stepId,
          password: adminPassword,
          data: { estimated_completion: dateStr },
        },
      });
      if (error) throw error;
      setSteps((prev) => prev.map((s) => s.id === stepId ? { ...s, estimated_completion: dateStr } : s));
      toast({ title: "Due date updated" });
    } catch (err) {
      toast({ title: "Failed to update date", variant: "destructive" });
    }
  };

  // Grouped steps by phase
  const groupedSteps = useMemo(() => {
    const groups: { phase: string; steps: WorkflowStep[] }[] = [];
    const phaseMap = new Map<string, WorkflowStep[]>();

    for (const step of steps) {
      const phase = getPhase(step.task_type);
      if (!phaseMap.has(phase)) {
        phaseMap.set(phase, []);
      }
      phaseMap.get(phase)!.push(step);
    }

    // Maintain phase order
    for (const pc of PHASE_CONFIG) {
      const phaseSteps = phaseMap.get(pc.name);
      if (phaseSteps && phaseSteps.length > 0) {
        groups.push({ phase: pc.name, steps: phaseSteps });
      }
    }
    // Add "Other" if any
    const other = phaseMap.get("Other");
    if (other && other.length > 0) {
      groups.push({ phase: "Other", steps: other });
    }

    return groups;
  }, [steps]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!workflow) {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-3">
          <Clock className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No active workflow for this client</p>
          <Button onClick={handleStartWorkflow} disabled={starting} className="gap-2">
            {starting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {starting ? "Starting..." : "Start Tier Workflow"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const completedCount = steps.filter((s) => s.status === "completed" || s.status === "skipped").length;
  const progressPct = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;
  const finalEstimate = steps.length > 0 ? steps[steps.length - 1]?.estimated_completion : null;
  const startedDate = workflow.created_at ? format(new Date(workflow.created_at), "MMM d, yyyy") : "—";

  return (
    <Card>
      {/* Project Header */}
      <CardHeader className="pb-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">{clientName}</CardTitle>
            {clientTier && <TierBadge tier={clientTier} />}
          </div>
          <span className="text-sm font-medium text-muted-foreground">
            {completedCount} of {steps.length} steps complete — {progressPct}% done
          </span>
        </div>
        <Progress value={progressPct} className="h-2.5" />
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span>Project started: {startedDate}</span>
          {finalEstimate && (
            <span>Estimated completion: {format(new Date(finalEstimate + "T00:00:00"), "MMM d, yyyy")}</span>
          )}
        </div>
      </CardHeader>

      {/* Phased Steps */}
      <CardContent className="space-y-4 max-h-[600px] overflow-y-auto">
        {groupedSteps.map(({ phase, steps: phaseSteps }) => {
          const phaseCompleted = phaseSteps.filter((s) => s.status === "completed" || s.status === "skipped").length;
          return (
            <div key={phase} className="space-y-1">
              <div className="flex items-center justify-between px-2 py-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{phase}</h4>
                <span className="text-xs text-muted-foreground">{phaseCompleted}/{phaseSteps.length}</span>
              </div>
              {phaseSteps.map((step) => {
                const config = statusConfig[step.status] || statusConfig.pending;
                const Icon = config.icon;
                const isRunning = step.status === "running";
                const isDone = step.status === "completed";
                const ai = isAiPowered(step.task_type);

                return (
                  <div
                    key={step.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors",
                      isRunning && "bg-amber-500/5",
                      isDone && "opacity-70"
                    )}
                  >
                    <div className="flex-shrink-0">
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : isRunning ? (
                        <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />
                      ) : step.status === "awaiting_callback" ? (
                        <Wifi className="h-4 w-4 text-blue-500" />
                      ) : step.status === "skipped" ? (
                        <SkipForward className="h-4 w-4 text-muted-foreground" />
                      ) : step.status === "failed" ? (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      ) : (
                        <Circle className="h-4 w-4 text-border" />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground w-5 tabular-nums">{step.step_number}</span>
                    <span className="flex-1 text-sm truncate">{step.step_name}</span>

                    {/* AI / Manual tag */}
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1">
                      {ai ? <><Sparkles className="h-3 w-3" /> AI</> : <><Wrench className="h-3 w-3" /> Manual</>}
                    </Badge>

                    {/* Status badge */}
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-5", config.color)}>
                      {config.label}
                    </Badge>

                    {/* Date */}
                    <div className="w-28 text-right flex-shrink-0">
                      {isDone && step.actual_completion ? (
                        <span className="text-xs text-emerald-600">
                          Done {format(new Date(step.actual_completion + "T00:00:00"), "MMM d")}
                        </span>
                      ) : isDone && step.completed_at ? (
                        <span className="text-xs text-emerald-600">
                          Done {format(new Date(step.completed_at), "MMM d")}
                        </span>
                      ) : adminPassword ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1">
                              <CalendarIcon className="h-3 w-3" />
                              {step.estimated_completion
                                ? `Due ${format(new Date(step.estimated_completion + "T00:00:00"), "MMM d")}`
                                : "Set date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                              mode="single"
                              selected={step.estimated_completion ? new Date(step.estimated_completion + "T00:00:00") : undefined}
                              onSelect={(d) => handleUpdateDate(step.id, d)}
                              className="p-3 pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                      ) : step.estimated_completion ? (
                        <span className="text-xs text-muted-foreground">
                          Due {format(new Date(step.estimated_completion + "T00:00:00"), "MMM d")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
