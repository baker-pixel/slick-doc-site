import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientActivityTabProps {
  clientAccountId: string;
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
  const { data: tasks = [], isLoading } = useQuery({
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

  const completedCount = useMemo(() => tasks.filter((t) => t.status === "completed").length, [tasks]);
  const totalCount = tasks.length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const currentStepIndex = tasks.findIndex((t) => t.status !== "completed");
  const currentTask = currentStepIndex >= 0 ? tasks[currentStepIndex] : null;
  const allDone = totalCount > 0 && completedCount === totalCount;

  const getCategoryLabel = (cat: string) => cat.replace(/_/g, " ");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (totalCount === 0) {
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

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Progress header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Your Progress</h2>
          <span className="text-sm font-medium text-muted-foreground">
            {completedCount} of {totalCount} steps
          </span>
        </div>
        <Progress value={progressPct} className="h-2.5" />
        {allDone ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
            🎉 All steps complete — your marketing system is live!
          </p>
        ) : currentTask ? (
          <p className="text-sm text-muted-foreground">
            Up next: <span className="font-medium text-foreground">{currentTask.name}</span>
          </p>
        ) : null}
      </div>

      {/* Current step highlight */}
      {currentTask && !allDone && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Badge className="bg-primary text-primary-foreground text-xs">
              Step {currentStepIndex + 1}
            </Badge>
            <Badge variant="outline" className="capitalize text-xs">
              {getCategoryLabel(currentTask.category)}
            </Badge>
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
            {currentTask.automation_type === "FULL"
              ? "This step is handled automatically by your team"
              : "Your team is working on this"}
          </p>
        </div>
      )}

      {/* Checklist */}
      <div className="space-y-1">
        {tasks.map((task, i) => {
          const isDone = task.status === "completed";
          const isCurrent = i === currentStepIndex;

          return (
            <div
              key={task.id}
              className={cn(
                "flex items-start gap-3 rounded-lg px-4 py-3 transition-colors",
                isCurrent && "bg-primary/5",
                isDone && "opacity-60"
              )}
            >
              {/* Step indicator */}
              <div className="pt-0.5">
                {isDone ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : isCurrent ? (
                  <div className="h-5 w-5 rounded-full border-2 border-primary bg-primary/20 flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                ) : (
                  <Circle className="h-5 w-5 text-border" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-sm font-medium",
                  isDone && "line-through text-muted-foreground",
                  isCurrent && "text-foreground"
                )}>
                  {task.name}
                </p>
                {isCurrent && task.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                )}
              </div>

              {/* Step number */}
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
