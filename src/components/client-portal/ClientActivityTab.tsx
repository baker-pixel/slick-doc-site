import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  ArrowRight,
  XCircle,
  Wifi,
  CalendarDays,
  Info,
  Lock,
  Upload,
  FileEdit,
  Link2,
  CalendarPlus,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface ClientActivityTabProps {
  clientAccountId: string;
  onTabChange?: (tab: string) => void;
}

interface WorkflowStep {
  id: string;
  step_number: number;
  step_name: string;
  task_type: string;
  status: string;
  depends_on: number | null;
  completed_at: string | null;
  estimated_completion: string | null;
  actual_completion: string | null;
  payload: any;
}

interface WorkflowData {
  id: string;
  created_at: string;
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

const STEP_DESCRIPTIONS: Record<string, string> = {
  client_form: "Please confirm your business details so we can tailor your marketing plan",
  client_upload: "Upload your logo and brand assets so we can create on-brand content",
  client_oauth: "Connect your social media accounts so we can post on your behalf",
  client_calendar: "Book your kickoff call to align on strategy and goals",
  client_approval: "Review and approve your first piece of content",
  website_analysis: "We're reviewing your website for opportunities",
  seo_audit: "We're analysing how you rank on Google",
  gap_report: "We're building your personalised marketing plan",
  content: "We're creating content to grow your online presence",
  social_content: "We're creating your social media content",
  email_template: "We're building your automated email sequences",
  ad_copy: "We're drafting your ad campaigns",
  n8n_post_blog: "We're publishing your blog post",
  n8n_post_social: "We're posting to your social media",
  email_campaign: "We're sending your email campaign",
  analytics: "We're pulling your performance data",
  report: "We're preparing your monthly results report",
  notify_client: "Your marketing plan is complete — time to review!",
};

const CTA_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  client_form: { label: "Fill Out Form", icon: FileEdit },
  client_upload: { label: "Upload Assets", icon: Upload },
  client_oauth: { label: "Connect Accounts", icon: Link2 },
  client_calendar: { label: "Book Kickoff Call", icon: CalendarPlus },
  client_approval: { label: "Review Content", icon: Eye },
};

function getStepDescription(step: WorkflowStep): string {
  return STEP_DESCRIPTIONS[step.task_type] || "Your team is working on this step";
}

function formatDatePlain(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    return format(new Date(dateStr + "T00:00:00"), "MMM d");
  } catch {
    return null;
  }
}

type StepState = "completed" | "in_progress" | "available" | "current" | "locked" | "failed";

function computeStepState(step: WorkflowStep, stepsMap: Map<number, WorkflowStep>): StepState {
  if (step.status === "completed") return "completed";
  if (step.status === "failed") return "failed";
  if (step.status === "running" || step.status === "in_progress") return "in_progress";

  // Check dependency
  if (step.depends_on != null) {
    const dep = stepsMap.get(step.depends_on);
    if (!dep || dep.status !== "completed") return "locked";
  }

  return "available";
}

export function ClientActivityTab({ clientAccountId, onTabChange }: ClientActivityTabProps) {
  const queryClient = useQueryClient();
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowCreatedAt, setWorkflowCreatedAt] = useState<string | null>(null);
  const [completingStep, setCompletingStep] = useState<string | null>(null);

  // Fetch workflow steps
  const { data: workflowData, isLoading: wfLoading } = useQuery({
    queryKey: ["client-workflow", clientAccountId],
    queryFn: async () => {
      const { data: wf } = await supabase
        .from("client_workflows")
        .select("id, created_at")
        .eq("client_id", clientAccountId)
        .eq("status", "active")
        .maybeSingle();

      if (!wf) return { workflow: null, steps: [] };

      const { data: steps } = await supabase
        .from("workflow_steps")
        .select("id, step_number, step_name, task_type, status, depends_on, completed_at, estimated_completion, actual_completion, payload")
        .eq("workflow_id", wf.id)
        .order("step_number", { ascending: true });

      return { workflow: wf as WorkflowData, steps: (steps || []) as WorkflowStep[] };
    },
  });

  useEffect(() => {
    if (workflowData?.workflow) {
      setWorkflowId(workflowData.workflow.id);
      setWorkflowCreatedAt(workflowData.workflow.created_at);
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

  // Build steps map for dependency checking
  const stepsMap = useMemo(() => {
    const m = new Map<number, WorkflowStep>();
    workflowSteps.forEach((s) => m.set(s.step_number, s));
    return m;
  }, [workflowSteps]);

  // Compute states
  const stepStates = useMemo(() => {
    const states = workflowSteps.map((s) => computeStepState(s, stepsMap));
    // Mark the first "available" as "current"
    const firstAvailableIdx = states.findIndex((st) => st === "available");
    if (firstAvailableIdx >= 0) {
      states[firstAvailableIdx] = "current";
    }
    return states;
  }, [workflowSteps, stepsMap]);

  const wfCompleted = useMemo(() => workflowSteps.filter((s) => s.status === "completed").length, [workflowSteps]);
  const wfTotal = workflowSteps.length;
  const wfProgress = wfTotal > 0 ? Math.round((wfCompleted / wfTotal) * 100) : 0;
  const currentStepIdx = stepStates.findIndex((s) => s === "current");
  const currentStep = currentStepIdx >= 0 ? workflowSteps[currentStepIdx] : null;
  const wfAllDone = wfTotal > 0 && wfCompleted === wfTotal;
  const finalEstimate = workflowSteps.length > 0 ? workflowSteps[workflowSteps.length - 1]?.estimated_completion : null;

  // Complete a client-driven step
  const handleCompleteStep = useCallback(async (stepId: string) => {
    setCompletingStep(stepId);
    try {
      const { error } = await supabase
        .from("workflow_steps")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", stepId);

      if (error) throw error;
      toast({ title: "Step completed!" });
      queryClient.invalidateQueries({ queryKey: ["client-workflow", clientAccountId] });
      queryClient.invalidateQueries({ queryKey: ["onboarding-complete", clientAccountId] });
    } catch (err: any) {
      toast({ title: "Error completing step", description: err.message, variant: "destructive" });
    } finally {
      setCompletingStep(null);
    }
  }, [clientAccountId, queryClient]);

  // Handle CTA click
  const handleStepAction = useCallback((step: WorkflowStep) => {
    switch (step.task_type) {
      case "client_form":
        // For now, mark complete directly (could open modal in future)
        handleCompleteStep(step.id);
        break;
      case "client_upload":
        // Navigate to brand tab or mark complete
        if (onTabChange) onTabChange("brand");
        else handleCompleteStep(step.id);
        break;
      case "client_oauth":
        if (onTabChange) onTabChange("integrations");
        else handleCompleteStep(step.id);
        break;
      case "client_calendar": {
        const url = step.payload?.calendar_url || "https://calendly.com/baker-orangedoor";
        window.open(url, "_blank");
        // Mark complete after opening
        handleCompleteStep(step.id);
        break;
      }
      case "client_approval":
        if (onTabChange) onTabChange("approvals");
        else handleCompleteStep(step.id);
        break;
      default:
        break;
    }
  }, [handleCompleteStep, onTabChange]);

  // Legacy task-based progress
  const completedCount = useMemo(() => tasks.filter((t) => t.status === "completed").length, [tasks]);
  const totalCount = tasks.length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const currentTaskIndex = tasks.findIndex((t) => t.status !== "completed");
  const currentTask = currentTaskIndex >= 0 ? tasks[currentTaskIndex] : null;
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
            <h2 className="text-2xl font-bold tracking-tight">
              {currentStep
                ? `Step ${currentStep.step_number} of ${wfTotal} — ${currentStep.step_name}`
                : wfAllDone
                  ? "All steps complete! 🎉"
                  : `Your marketing project — ${wfProgress}% complete`}
            </h2>
          </div>
          <Progress value={wfProgress} className="h-3" />
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
            {workflowCreatedAt && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                Started {format(new Date(workflowCreatedAt), "MMM d, yyyy")}
              </span>
            )}
            {finalEstimate && (
              <span>· Estimated completion {format(new Date(finalEstimate + "T00:00:00"), "MMM d, yyyy")}</span>
            )}
          </div>
        </div>

        {/* Step list */}
        <div className="space-y-1">
          {workflowSteps.map((step, i) => {
            const state = stepStates[i];
            const isCompleting = completingStep === step.id;
            const completionDate = step.actual_completion || (step.status === "completed" && step.completed_at ? step.completed_at.split("T")[0] : null);
            const formattedDone = completionDate ? formatDatePlain(completionDate) : null;
            const formattedDue = formatDatePlain(step.estimated_completion);
            const isClientStep = step.task_type.startsWith("client_");
            const cta = CTA_CONFIG[step.task_type];

            return (
              <div
                key={step.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg px-4 py-3 transition-colors",
                  state === "current" && "bg-primary/5 border-2 border-primary/30",
                  state === "available" && "bg-primary/5 border border-primary/20",
                  state === "completed" && "opacity-60",
                  state === "failed" && "bg-destructive/5",
                  state === "locked" && "bg-muted/30 opacity-50",
                  state === "in_progress" && "bg-amber-500/5 border border-amber-500/20",
                )}
              >
                <div className="pt-0.5">
                  {state === "completed" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : state === "in_progress" ? (
                    <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
                  ) : state === "locked" ? (
                    <Lock className="h-5 w-5 text-muted-foreground/50" />
                  ) : state === "failed" ? (
                    <XCircle className="h-5 w-5 text-destructive" />
                  ) : state === "current" || state === "available" ? (
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
                    state === "completed" && "line-through text-muted-foreground",
                    (state === "current" || state === "available") && "text-foreground",
                    state === "failed" && "text-destructive",
                    state === "locked" && "text-muted-foreground",
                  )}>
                    {step.step_name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {getStepDescription(step)}
                  </p>
                  {state === "failed" && <p className="text-xs text-destructive mt-0.5">Something went wrong — your team has been notified</p>}
                  {state === "in_progress" && <p className="text-xs text-amber-600 mt-0.5">In progress…</p>}

                  {/* CTA button for client steps that are current/available */}
                  {isClientStep && cta && (state === "current" || state === "available") && (
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={() => handleStepAction(step)}
                      disabled={isCompleting}
                    >
                      {isCompleting ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <cta.icon className="h-4 w-4 mr-1" />
                      )}
                      {cta.label}
                    </Button>
                  )}
                </div>

                <div className="text-right flex-shrink-0 pt-0.5">
                  {state === "completed" && formattedDone ? (
                    <span className="text-xs text-emerald-600 font-medium">Completed {formattedDone}</span>
                  ) : state !== "locked" && formattedDue ? (
                    <span className="text-xs text-muted-foreground">Expected by {formattedDue}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Status callout */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              {wfAllDone ? (
                <p className="text-foreground font-medium">
                  Your initial marketing plan is complete. Your team is now running ongoing campaigns for you. 🎉
                </p>
              ) : currentStep ? (
                <p className="text-foreground">
                  {currentStep.task_type.startsWith("client_")
                    ? <>Complete this step to unlock the next: <span className="font-semibold">{currentStep.step_name}</span></>
                    : <>Your team is currently working on: <span className="font-semibold">{currentStep.step_name}</span></>
                  }
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
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
              Step {currentTaskIndex + 1}
            </Badge>
            {currentTask.status === "in_progress" && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" /> Running
              </Badge>
            )}
          </div>
          <h3 className="text-lg font-bold">{currentTask.name}</h3>
          {currentTask.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{currentTask.description}</p>
          )}
          <p className="text-xs text-primary font-medium flex items-center gap-1 pt-1">
            <ArrowRight className="h-3 w-3" />
            Your team is working on this
          </p>
        </div>
      )}

      <div className="space-y-1">
        {tasks.map((task, i) => {
          const isDone = task.status === "completed";
          const isRunning = task.status === "in_progress";
          const isFailed = task.status === "failed";
          const isCurrent = i === currentTaskIndex;

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
