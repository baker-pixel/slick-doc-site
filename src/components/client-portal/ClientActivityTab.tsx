import { useQuery } from "@tanstack/react-query";
import { useMemo, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  ArrowRight,
  XCircle,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientActivityTabProps {
  clientAccountId: string;
}

interface WorkflowStep {
  id: string;
  step_number: number;
  step_name: string;
  status: string;
  completed_at: string | null;
}

interface TaskItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  automation_type: string;
  order_index: number;
  completed_at: string | null;
}

export function ClientActivityTab({ clientAccountId }: ClientActivityTabProps) {
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [workflowId, setWorkflowId] = useState<string | null>(null);

  // Fetch workflow steps
  const { data: workflowData, isLoading: wfLoading } = useQuery({
    queryKey: ["client-workflow", clientAccountId],
    queryFn: async () => {
      const { data: wf } = await supabase
        .from("client_workflows")
        .select("id")
        .eq("client_id", clientAccountId)
        .eq("status", "active")
        .maybeSingle();

      if (!wf) return { workflow: null, steps: [] };

      const { data: steps } = await supabase
        .from("workflow_steps")
        .select("id, step_number, step_name, status, completed_at")
        .eq("workflow_id", wf.id)
        .order("step_number", { ascending: true });

      return { workflow: wf, steps: (steps || []) as WorkflowStep[] };
    },
  });

  useEffect(() => {
    if (workflowData?.workflow) {
      setWorkflowId(workflowData.workflow.id);
      setWorkflowSteps(workflowData.steps);
    }
  }, [workflowData]);

  // Realtime subscription for workflow_steps
  useEffect(() => {
    if (!workflowId) return;

    const channel = supabase
      .channel(`wf-steps-portal-${workflowId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workflow_steps",
          filter: `workflow_id=eq.${workflowId}`,
        },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setWorkflowSteps((prev) =>
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
  }, [workflowId]);

  // Fallback: legacy client_tasks
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["client-progress-tasks", clientAccountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_tasks")
        .select("id, name, description, category, status, automation_type, order_index, completed_at")
        .eq("client_account_id", clientAccountId)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return (data || []) as TaskItem[];
    },
  });

  const isLoading = wfLoading || tasksLoading;
  const hasWorkflow = workflowSteps.length > 0;

  // Workflow-based progress
  const wfCompleted = useMemo(() => workflowSteps.filter((s) => s.status === "completed").length, [workflowSteps]);
  const wfRunning = useMemo(() => workflowSteps.filter((s) => s.status === "running").length, [workflowSteps]);
  const wfFailed = useMemo(() => workflowSteps.filter((s) => s.status === "failed").length, [workflowSteps]);
  const wfTotal = workflowSteps.length;
  const wfProgress = wfTotal > 0 ? (wfCompleted / wfTotal) * 100 : 0;
  const wfCurrentIdx = workflowSteps.findIndex((s) => s.status !== "completed");
  const wfCurrentStep = wfCurrentIdx >= 0 ? workflowSteps[wfCurrentIdx] : null;
  const wfAllDone = wfTotal > 0 && wfCompleted === wfTotal;

  // Legacy task-based progress
  const completedCount = useMemo(() => tasks.filter((t) => t.status === "completed").length, [tasks]);
  const runningCount = useMemo(() => tasks.filter((t) => t.status === "in_progress").length, [tasks]);
  const failedCount = useMemo(() => tasks.filter((t) => t.status === "failed").length, [tasks]);
  const totalCount = tasks.length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const currentStepIndex = tasks.findIndex((t) => t.status !== "completed");
  const currentTask = currentStepIndex >= 0 ? tasks[currentStepIndex] : null;
  const allDone = totalCount > 0 && completedCount === totalCount;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasWorkflow && totalCount === 0) {
    return (
      <div className="max-w-xl mx-auto text-center py-20 space-y-4">
        <div className="h-16 w-16 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center">
          <Sparkles className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold">Your plan is being prepared</h2>
        <p className="text-muted-foreground">
          Your marketing team is setting up your custom roadmap. You'll see your step-by-step progress here soon.
        </p>
      </div>
    );
  }

  // Render workflow-based progress
  if (hasWorkflow) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Progress header */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Your Marketing Plan</h2>
            <span className="text-sm font-medium text-muted-foreground">
              {wfCompleted} of {wfTotal} steps
            </span>
          </div>
          <Progress value={wfProgress} className="h-2.5" />
          <div className="flex items-center gap-3 text-sm">
            {wfRunning > 0 && (
              <span className="flex items-center gap-1 text-primary">
                <Loader2 className="h-3 w-3 animate-spin" />
                {wfRunning} running
              </span>
            )}
            {wfFailed > 0 && (
              <span className="flex items-center gap-1 text-destructive">
                <XCircle className="h-3 w-3" />
                {wfFailed} failed
              </span>
            )}
            {wfAllDone ? (
              <p className="text-emerald-600 dark:text-emerald-400 font-medium">
                🎉 All steps complete — your marketing system is live!
              </p>
            ) : wfCurrentStep ? (
              <p className="text-muted-foreground">
                Up next: <span className="font-medium text-foreground">{wfCurrentStep.step_name}</span>
              </p>
            ) : null}
          </div>
        </div>

        {/* Current step highlight */}
        {wfCurrentStep && !wfAllDone && (
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-primary text-primary-foreground text-xs">
                Step {wfCurrentStep.step_number}
              </Badge>
              {wfCurrentStep.status === "running" && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" /> Running
                </Badge>
              )}
              {wfCurrentStep.status === "awaiting_callback" && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Wifi className="h-3 w-3" /> Awaiting
                </Badge>
              )}
            </div>
            <h3 className="text-lg font-bold">{wfCurrentStep.step_name}</h3>
            <p className="text-xs text-primary font-medium flex items-center gap-1 pt-1">
              <ArrowRight className="h-3 w-3" />
              {wfCurrentStep.status === "running"
                ? "This step is currently being executed"
                : wfCurrentStep.status === "awaiting_callback"
                ? "Waiting for external service to respond"
                : "Your team is working on this"}
            </p>
          </div>
        )}

        {/* Step checklist */}
        <div className="space-y-1">
          {workflowSteps.map((step, i) => {
            const isDone = step.status === "completed";
            const isRunning = step.status === "running";
            const isFailed = step.status === "failed";
            const isAwaiting = step.status === "awaiting_callback";
            const isCurrent = i === wfCurrentIdx;

            return (
              <div
                key={step.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg px-4 py-3 transition-colors",
                  isCurrent && "bg-primary/5",
                  isDone && "opacity-60",
                  isFailed && "bg-destructive/5"
                )}
              >
                <div className="pt-0.5">
                  {isDone ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : isRunning ? (
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  ) : isAwaiting ? (
                    <Wifi className="h-5 w-5 text-blue-500" />
                  ) : isFailed ? (
                    <XCircle className="h-5 w-5 text-destructive" />
                  ) : isCurrent ? (
                    <div className="h-5 w-5 rounded-full border-2 border-primary bg-primary/20 flex items-center justify-center">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    </div>
                  ) : (
                    <Circle className="h-5 w-5 text-border" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-medium",
                    isDone && "line-through text-muted-foreground",
                    isCurrent && "text-foreground",
                    isFailed && "text-destructive"
                  )}>
                    {step.step_name}
                  </p>
                  {isRunning && <p className="text-xs text-primary mt-0.5">Running...</p>}
                  {isAwaiting && <p className="text-xs text-blue-500 mt-0.5">Waiting for response...</p>}
                  {isFailed && <p className="text-xs text-destructive mt-0.5">Failed — your team has been notified</p>}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums pt-0.5">
                  {step.step_number}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Fallback: Legacy task-based view
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Your Progress</h2>
          <span className="text-sm font-medium text-muted-foreground">
            {completedCount} of {totalCount} steps
          </span>
        </div>
        <Progress value={progressPct} className="h-2.5" />
        <div className="flex items-center gap-3 text-sm">
          {runningCount > 0 && (
            <span className="flex items-center gap-1 text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              {runningCount} running
            </span>
          )}
          {failedCount > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <XCircle className="h-3 w-3" />
              {failedCount} failed
            </span>
          )}
          {allDone ? (
            <p className="text-emerald-600 dark:text-emerald-400 font-medium">
              🎉 All steps complete — your marketing system is live!
            </p>
          ) : currentTask ? (
            <p className="text-muted-foreground">
              Up next: <span className="font-medium text-foreground">{currentTask.name}</span>
            </p>
          ) : null}
        </div>
      </div>

      {currentTask && !allDone && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Badge className="bg-primary text-primary-foreground text-xs">
              Step {currentStepIndex + 1}
            </Badge>
            <Badge variant="outline" className="capitalize text-xs">
              {currentTask.category.replace(/_/g, " ")}
            </Badge>
            {currentTask.status === "in_progress" && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" /> Running
              </Badge>
            )}
            {currentTask.automation_type === "FULL" && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Sparkles className="h-3 w-3" /> Auto
              </Badge>
            )}
          </div>
          <h3 className="text-lg font-bold">{currentTask.name}</h3>
          {currentTask.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{currentTask.description}</p>
          )}
          <p className="text-xs text-primary font-medium flex items-center gap-1 pt-1">
            <ArrowRight className="h-3 w-3" />
            {currentTask.status === "in_progress"
              ? "This step is currently being executed"
              : currentTask.automation_type === "FULL"
              ? "This step is handled automatically by your team"
              : "Your team is working on this"}
          </p>
        </div>
      )}

      <div className="space-y-1">
        {tasks.map((task, i) => {
          const isDone = task.status === "completed";
          const isRunning = task.status === "in_progress";
          const isFailed = task.status === "failed";
          const isCurrent = i === currentStepIndex;

          return (
            <div
              key={task.id}
              className={cn(
                "flex items-start gap-3 rounded-lg px-4 py-3 transition-colors",
                isCurrent && "bg-primary/5",
                isDone && "opacity-60",
                isFailed && "bg-destructive/5"
              )}
            >
              <div className="pt-0.5">
                {isDone ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : isRunning ? (
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                ) : isFailed ? (
                  <XCircle className="h-5 w-5 text-destructive" />
                ) : isCurrent ? (
                  <div className="h-5 w-5 rounded-full border-2 border-primary bg-primary/20 flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                ) : (
                  <Circle className="h-5 w-5 text-border" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-sm font-medium",
                  isDone && "line-through text-muted-foreground",
                  isCurrent && "text-foreground",
                  isFailed && "text-destructive"
                )}>
                  {task.name}
                </p>
                {isRunning && <p className="text-xs text-primary mt-0.5">Running...</p>}
                {isFailed && <p className="text-xs text-destructive mt-0.5">Failed — your team has been notified</p>}
                {isCurrent && !isRunning && !isFailed && task.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                )}
              </div>
              <span className="text-xs text-muted-foreground tabular-nums pt-0.5">
                {i + 1}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
