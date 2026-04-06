import { useQuery } from "@tanstack/react-query";
import { useMemo, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface ClientActivityTabProps {
  clientAccountId: string;
}

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
  "website_analysis": "We're reviewing your website for opportunities",
  "seo_audit": "We're analysing how you rank on Google",
  "gap_report": "We're building your personalised marketing plan",
  "content": "We're creating content to grow your online presence",
  "social_content": "We're creating your social media content",
  "email_template": "We're building your automated email sequences",
  "ad_copy": "We're drafting your ad campaigns",
  "n8n_post_blog": "We're publishing your blog post",
  "n8n_post_social": "We're posting to your social media",
  "email_campaign": "We're sending your email campaign",
  "analytics": "We're pulling your performance data",
  "report": "We're preparing your monthly results report",
  "notify_client": "Your marketing plan is complete — time to review!",
};

const STEP_NAME_DESCRIPTIONS: Record<string, string> = {
  "Website analysis": "We're reviewing your website for opportunities",
  "SEO audit": "We're analysing how you rank on Google",
  "Gap report": "We're building your personalised marketing plan",
  "Keyword strategy": "We're identifying the best keywords for your business",
  "Homepage content": "We're rewriting your homepage to convert more visitors",
  "Blog post 1": "We're writing a blog post to boost your SEO",
  "Blog post 2": "We're writing a blog post to boost your SEO",
  "Google post batch": "We're creating your social media content",
  "Social post batch": "We're creating your social media content",
  "Email welcome sequence": "We're building your automated welcome emails",
  "Email newsletter 1": "We're writing your email newsletter",
  "Ad copy draft": "We're drafting your ad campaigns",
  "Publish blog 1": "We're publishing your blog post",
  "Publish blog 2": "We're publishing your blog post",
  "Publish Google posts": "We're posting to your social media",
  "Publish Google + social posts": "We're posting to your social media",
  "Publish Google + social": "We're posting to your social media",
  "Send welcome email": "We're sending your email campaign",
  "Send welcome + newsletter": "We're sending your email campaign",
  "Analytics + report": "We're preparing your monthly results report",
  "Analytics snapshot": "We're pulling your performance data",
  "Monthly report": "We're preparing your monthly results report",
  "Analytics + monthly report": "We're preparing your monthly results report",
};

function getStepDescription(step: WorkflowStep): string {
  return STEP_NAME_DESCRIPTIONS[step.step_name] || STEP_DESCRIPTIONS[step.task_type] || "Your team is working on this step";
}

function formatDatePlain(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    return format(new Date(dateStr + "T00:00:00"), "MMM d");
  } catch {
    return null;
  }
}

export function ClientActivityTab({ clientAccountId }: ClientActivityTabProps) {
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowCreatedAt, setWorkflowCreatedAt] = useState<string | null>(null);

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
        .select("id, step_number, step_name, task_type, status, completed_at, estimated_completion, actual_completion")
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

  // Workflow-based progress
  const wfCompleted = useMemo(() => workflowSteps.filter((s) => s.status === "completed").length, [workflowSteps]);
  const wfTotal = workflowSteps.length;
  const wfProgress = wfTotal > 0 ? Math.round((wfCompleted / wfTotal) * 100) : 0;
  const wfCurrentIdx = workflowSteps.findIndex((s) => s.status !== "completed" && s.status !== "skipped");
  const wfCurrentStep = wfCurrentIdx >= 0 ? workflowSteps[wfCurrentIdx] : null;
  const wfAllDone = wfTotal > 0 && wfCompleted === wfTotal;
  const finalEstimate = workflowSteps.length > 0 ? workflowSteps[workflowSteps.length - 1]?.estimated_completion : null;

  // Legacy task-based progress
  const completedCount = useMemo(() => tasks.filter((t) => t.status === "completed").length, [tasks]);
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
            <h2 className="text-2xl font-bold tracking-tight">
              Your marketing project — {wfProgress}% complete
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
            const isDone = step.status === "completed";
            const isRunning = step.status === "running";
            const isFailed = step.status === "failed";
            const isAwaiting = step.status === "awaiting_callback";
            const isCurrent = i === wfCurrentIdx;

            const completionDate = step.actual_completion || (isDone && step.completed_at ? step.completed_at.split("T")[0] : null);
            const formattedDone = completionDate ? formatDatePlain(completionDate) : null;
            const formattedDue = formatDatePlain(step.estimated_completion);

            return (
              <div
                key={step.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg px-4 py-3 transition-colors",
                  isCurrent && "bg-primary/5 border border-primary/20",
                  isDone && "opacity-60",
                  isFailed && "bg-destructive/5"
                )}
              >
                <div className="pt-0.5">
                  {isDone ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : isRunning ? (
                    <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
                  ) : isAwaiting ? (
                    <Wifi className="h-5 w-5 text-blue-500" />
                  ) : isFailed ? (
                    <XCircle className="h-5 w-5 text-destructive" />
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
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {getStepDescription(step)}
                  </p>
                  {isFailed && <p className="text-xs text-destructive mt-0.5">Something went wrong — your team has been notified</p>}
                </div>
                <div className="text-right flex-shrink-0 pt-0.5">
                  {isDone && formattedDone ? (
                    <span className="text-xs text-emerald-600 font-medium">Completed {formattedDone}</span>
                  ) : formattedDue ? (
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
              ) : wfCurrentStep ? (
                <p className="text-foreground">
                  Your team is currently working on: <span className="font-semibold">{wfCurrentStep.step_name}</span>
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
              Step {currentStepIndex + 1}
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
