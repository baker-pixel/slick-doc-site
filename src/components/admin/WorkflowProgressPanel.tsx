import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import {
  Play,
  CheckCircle2,
  Circle,
  Loader2,
  Clock,
  AlertTriangle,
  Wifi,
  SkipForward,
} from "lucide-react";

interface WorkflowStep {
  id: string;
  step_number: number;
  step_name: string;
  task_type: string;
  status: string;
  completed_at: string | null;
}

interface Workflow {
  id: string;
  client_id: string;
  current_step: number;
  total_steps: number;
  status: string;
}

interface WorkflowProgressPanelProps {
  clientId: string;
  clientName: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: "Pending", color: "bg-muted text-muted-foreground", icon: Circle },
  running: { label: "Running", color: "bg-amber-500/10 text-amber-600 border-amber-500/30", icon: Loader2 },
  awaiting_callback: { label: "Awaiting", color: "bg-blue-500/10 text-blue-600 border-blue-500/30", icon: Wifi },
  completed: { label: "Done", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", icon: CheckCircle2 },
  skipped: { label: "Skipped", color: "bg-muted text-muted-foreground border-border", icon: SkipForward },
  failed: { label: "Failed", color: "bg-destructive/10 text-destructive border-destructive/30", icon: AlertTriangle },
};

export function WorkflowProgressPanel({ clientId, clientName }: WorkflowProgressPanelProps) {
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
          .select("id, step_number, step_name, task_type, status, completed_at")
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
      // Seed the workflow
      const { data: seedData, error: seedError } = await supabase.functions.invoke(
        "seed-tier-workflow",
        { body: { client_id: clientId } }
      );

      if (seedError) throw seedError;
      if (seedData?.error) throw new Error(seedData.error);

      const workflowId = seedData.workflow_id;

      toast({
        title: "Workflow started",
        description: `${seedData.total_steps}-step ${seedData.tier} workflow initiated for ${clientName}`,
      });

      // Refresh to get the new workflow
      await fetchWorkflow();

      // Start step 1
      supabase.functions
        .invoke("run-workflow-step", {
          body: { client_id: clientId, workflow_id: workflowId, step_number: 1 },
        })
        .catch((err) => console.error("Step 1 trigger error:", err));
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

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const progressPct = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Workflow Progress</CardTitle>
          <span className="text-sm text-muted-foreground">
            {completedCount}/{steps.length} steps
          </span>
        </div>
        <Progress value={progressPct} className="h-2" />
      </CardHeader>
      <CardContent className="space-y-1 max-h-[400px] overflow-y-auto">
        {steps.map((step) => {
          const config = statusConfig[step.status] || statusConfig.pending;
          const Icon = config.icon;
          const isRunning = step.status === "running";

          return (
            <div
              key={step.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors"
            >
              <div className="flex-shrink-0">
                {step.status === "completed" ? (
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
              <span className="text-xs text-muted-foreground w-5">{step.step_number}</span>
              <span className="flex-1 text-sm truncate">{step.step_name}</span>
              <Badge variant="outline" className={`text-xs ${config.color}`}>
                {config.label}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
