import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Square,
  List,
  Focus,
  Loader2,
  ArrowRight,
  Clock,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { useTaskTimer } from "@/hooks/use-task-timer";
import { cn } from "@/lib/utils";

interface SmartTaskQueueProps {
  adminPassword: string;
}

interface ClientProgress {
  id: string;
  business_name: string;
  tier: string;
  totalTasks: number;
  completedTasks: number;
  currentStep: number;
  nextTask: TaskItem | null;
}

interface TaskItem {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  notes: string | null;
  category: string;
  status: string;
  automation_type: string;
  order_index: number;
  completed_at: string | null;
  time_spent_minutes: number;
  timer_started_at: string | null;
}

type View = "clients" | "focus";

export function SmartTaskQueue({ adminPassword }: SmartTaskQueueProps) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("clients");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(true); // true = focus (1 task), false = checklist
  const [completeModal, setCompleteModal] = useState<{ open: boolean; task: TaskItem | null }>({ open: false, task: null });
  const [completionNote, setCompletionNote] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);

  // Fetch all clients
  const { data: clients = [] } = useQuery({
    queryKey: ["task-queue-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_accounts")
        .select("id, business_name, tier, status")
        .eq("status", "active")
        .order("business_name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch ALL tasks (for all clients)
  const { data: allTasks = [], isLoading, refetch } = useQuery({
    queryKey: ["task-queue-all-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_tasks")
        .select("id, name, description, instructions, notes, category, status, automation_type, order_index, completed_at, time_spent_minutes, timer_started_at, client_account_id")
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Build client progress list
  const clientProgressList: ClientProgress[] = useMemo(() => {
    return clients.map((client) => {
      const clientTasks = allTasks
        .filter((t) => t.client_account_id === client.id)
        .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

      const completed = clientTasks.filter((t) => t.status === "completed").length;
      const total = clientTasks.length;
      const nextTask = clientTasks.find((t) => t.status !== "completed") || null;
      const currentStep = completed + 1;

      return {
        id: client.id,
        business_name: client.business_name,
        tier: client.tier,
        totalTasks: total,
        completedTasks: completed,
        currentStep: Math.min(currentStep, total),
        nextTask,
      };
    })
    .filter((c) => c.totalTasks > 0)
    .sort((a, b) => {
      // Clients with incomplete tasks first, then by progress %
      const aPct = a.totalTasks > 0 ? a.completedTasks / a.totalTasks : 1;
      const bPct = b.totalTasks > 0 ? b.completedTasks / b.totalTasks : 1;
      if (aPct === 1 && bPct !== 1) return 1;
      if (bPct === 1 && aPct !== 1) return -1;
      return aPct - bPct;
    });
  }, [clients, allTasks]);

  // Tasks for selected client
  const clientTasks: TaskItem[] = useMemo(() => {
    if (!selectedClientId) return [];
    return allTasks
      .filter((t) => t.client_account_id === selectedClientId)
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  }, [allTasks, selectedClientId]);

  const currentStepIndex = clientTasks.findIndex((t) => t.status !== "completed");
  const currentTask = currentStepIndex >= 0 ? clientTasks[currentStepIndex] : null;
  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const completedCount = clientTasks.filter((t) => t.status === "completed").length;
  const progressPct = clientTasks.length > 0 ? (completedCount / clientTasks.length) * 100 : 0;

  // Timer for current task
  const taskTimer = useTaskTimer({
    taskId: currentTask?.id || "",
    initialMinutes: currentTask?.time_spent_minutes || 0,
  });

  const selectClient = (clientId: string) => {
    setSelectedClientId(clientId);
    setView("focus");
    setFocusMode(true);
  };

  const goBack = () => {
    taskTimer.stop();
    setView("clients");
    setSelectedClientId(null);
  };

  // Complete task
  const handleComplete = async (task: TaskItem, note?: string) => {
    setIsCompleting(true);
    try {
      await taskTimer.stop();

      const { error } = await supabase
        .from("client_tasks")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          notes: note || task.notes,
          time_spent_minutes: taskTimer.elapsedMinutes,
        })
        .eq("id", task.id);

      if (error) throw error;

      toast.success(`✓ ${task.name}`, { description: "Moving to next step..." });
      setCompleteModal({ open: false, task: null });
      setCompletionNote("");
      refetch();
    } catch (error) {
      console.error("Error completing task:", error);
      toast.error("Failed to complete task");
    } finally {
      setIsCompleting(false);
    }
  };

  // Quick complete from checklist
  const quickComplete = async (task: TaskItem) => {
    try {
      const { error } = await supabase
        .from("client_tasks")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", task.id);

      if (error) throw error;
      toast.success(`✓ ${task.name}`);
      refetch();
    } catch (error) {
      toast.error("Failed to complete task");
    }
  };

  // Undo complete
  const undoComplete = async (task: TaskItem) => {
    try {
      const { error } = await supabase
        .from("client_tasks")
        .update({
          status: "pending",
          completed_at: null,
        })
        .eq("id", task.id);

      if (error) throw error;
      toast.success(`Reopened: ${task.name}`);
      refetch();
    } catch (error) {
      toast.error("Failed to reopen task");
    }
  };

  const getCategoryColor = (cat: string) => {
    const colors: Record<string, string> = {
      onboarding: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      seo: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      reviews: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      analytics: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
      reporting: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
      website: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
      lead_nurturing: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
      content: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    };
    return colors[cat] || "bg-muted text-muted-foreground";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─── CLIENT PICKER VIEW ───
  if (view === "clients") {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Task Queue</h2>
          <p className="text-muted-foreground">Pick a client. Work through their tasks, one by one.</p>
        </div>

        {clientProgressList.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No clients with tasks yet. Generate tasks from SOPs in the Client Workflow panel.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {clientProgressList.map((cp) => {
              const isDone = cp.completedTasks === cp.totalTasks;
              return (
                <button
                  key={cp.id}
                  onClick={() => selectClient(cp.id)}
                  className={cn(
                    "w-full text-left rounded-xl border p-4 transition-all hover:shadow-md hover:border-primary/40",
                    "bg-card hover:bg-accent/30",
                    isDone && "opacity-60"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center text-sm font-bold",
                        isDone
                          ? "bg-green-500/10 text-green-600 dark:text-green-400"
                          : "bg-primary/10 text-primary"
                      )}>
                        {isDone ? <CheckCircle2 className="h-5 w-5" /> : `${cp.currentStep}`}
                      </div>
                      <div>
                        <p className="font-semibold">{cp.business_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {isDone ? "All done!" : `Step ${cp.currentStep} of ${cp.totalTasks}`}
                          {" · "}
                          <span className="capitalize">{cp.tier}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-muted-foreground">
                        {cp.completedTasks}/{cp.totalTasks}
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <Progress value={(cp.completedTasks / cp.totalTasks) * 100} className="h-1.5" />
                  {cp.nextTask && !isDone && (
                    <p className="text-xs text-muted-foreground mt-2 truncate">
                      Next: {cp.nextTask.name}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ─── FOCUS / CHECKLIST VIEW ───
  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack} className="rounded-lg">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">{selectedClient?.business_name}</h2>
            <p className="text-sm text-muted-foreground">
              Step {completedCount + 1} of {clientTasks.length}
              {" · "}
              {Math.round(progressPct)}% complete
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          <Button
            variant={focusMode ? "default" : "ghost"}
            size="sm"
            onClick={() => setFocusMode(true)}
            className="h-8 gap-1.5 rounded-md"
          >
            <Focus className="h-3.5 w-3.5" />
            Focus
          </Button>
          <Button
            variant={!focusMode ? "default" : "ghost"}
            size="sm"
            onClick={() => setFocusMode(false)}
            className="h-8 gap-1.5 rounded-md"
          >
            <List className="h-3.5 w-3.5" />
            Checklist
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <Progress value={progressPct} className="h-2" />

      {/* ─── FOCUS MODE ─── */}
      {focusMode && (
        <>
          {currentTask ? (
            <Card className="border-2 border-primary/20 shadow-lg">
              <CardContent className="p-6 space-y-5">
                {/* Step badge */}
                <div className="flex items-center gap-2">
                  <Badge className={getCategoryColor(currentTask.category)}>
                    {currentTask.category.replace(/_/g, " ")}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Step {currentStepIndex + 1}
                  </Badge>
                  {currentTask.automation_type === "FULL" && (
                    <Badge className="bg-primary/10 text-primary gap-1">
                      <Sparkles className="h-3 w-3" />
                      Auto
                    </Badge>
                  )}
                </div>

                {/* Task name */}
                <h3 className="text-2xl font-bold leading-tight">{currentTask.name}</h3>

                {/* Description */}
                {currentTask.description && (
                  <p className="text-muted-foreground leading-relaxed">{currentTask.description}</p>
                )}

                {/* Instructions */}
                {currentTask.instructions && (
                  <div className="rounded-lg bg-muted/50 border p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Instructions</p>
                    <p className="text-sm">{currentTask.instructions}</p>
                  </div>
                )}

                {/* Timer */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-lg font-semibold tabular-nums">
                    {taskTimer.formattedTime}
                  </span>
                  <div className="flex gap-1 ml-auto">
                    {!taskTimer.isRunning ? (
                      <Button size="sm" variant="outline" onClick={() => taskTimer.start()} className="gap-1">
                        <Play className="h-3 w-3" /> Start
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => taskTimer.pause()} className="gap-1">
                        <Pause className="h-3 w-3" /> Pause
                      </Button>
                    )}
                  </div>
                </div>

                {/* Complete button */}
                <Button
                  size="lg"
                  className="w-full h-14 text-lg gap-2 rounded-xl"
                  onClick={() => setCompleteModal({ open: true, task: currentTask })}
                >
                  <CheckCircle2 className="h-5 w-5" />
                  Mark Complete
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-16 text-center space-y-3">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                <h3 className="text-xl font-bold">All Done!</h3>
                <p className="text-muted-foreground">
                  Every task for {selectedClient?.business_name} is complete.
                </p>
                <Button variant="outline" onClick={goBack} className="mt-4">
                  Back to Clients
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Mini progress steps */}
          <div className="flex gap-1 justify-center flex-wrap">
            {clientTasks.map((t, i) => (
              <div
                key={t.id}
                className={cn(
                  "h-2 rounded-full transition-all",
                  clientTasks.length > 20 ? "w-2" : "w-6",
                  t.status === "completed"
                    ? "bg-green-500"
                    : i === currentStepIndex
                    ? "bg-primary animate-pulse"
                    : "bg-muted-foreground/20"
                )}
                title={`${i + 1}. ${t.name}`}
              />
            ))}
          </div>
        </>
      )}

      {/* ─── CHECKLIST MODE ─── */}
      {!focusMode && (
        <ScrollArea className="h-[calc(100vh-280px)]">
          <div className="space-y-1">
            {clientTasks.map((task, i) => {
              const isDone = task.status === "completed";
              const isCurrent = i === currentStepIndex;

              return (
                <div
                  key={task.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-xl transition-all border",
                    isCurrent && !isDone && "border-primary/30 bg-primary/5 shadow-sm",
                    isDone && "border-transparent opacity-70",
                    !isCurrent && !isDone && "border-transparent hover:bg-muted/50"
                  )}
                >
                  {/* Step indicator */}
                  <button
                    onClick={() => isDone ? undoComplete(task) : quickComplete(task)}
                    className="mt-0.5 shrink-0"
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : isCurrent ? (
                      <div className="h-5 w-5 rounded-full border-2 border-primary flex items-center justify-center">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      </div>
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground/40" />
                    )}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-xs font-mono text-muted-foreground",
                        isDone && "line-through"
                      )}>
                        {i + 1}.
                      </span>
                      <span className={cn(
                        "font-medium text-sm",
                        isDone && "line-through text-muted-foreground"
                      )}>
                        {task.name}
                      </span>
                    </div>
                    {isCurrent && !isDone && task.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {task.description}
                      </p>
                    )}
                    {isDone && task.completed_at && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Done {format(new Date(task.completed_at), "MMM d, h:mm a")}
                      </p>
                    )}
                  </div>

                  {/* Category */}
                  <Badge variant="outline" className={cn("text-[10px] shrink-0", getCategoryColor(task.category))}>
                    {task.category.replace(/_/g, " ")}
                  </Badge>

                  {/* Focus on this task */}
                  {isCurrent && !isDone && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 h-7 text-xs gap-1"
                      onClick={() => setFocusMode(true)}
                    >
                      <Focus className="h-3 w-3" />
                      Focus
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* ─── COMPLETE MODAL ─── */}
      <Dialog open={completeModal.open} onOpenChange={(open) => setCompleteModal({ open, task: open ? completeModal.task : null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Complete Step
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="font-medium">{completeModal.task?.name}</p>
            <Textarea
              placeholder="Add a note (optional)..."
              value={completionNote}
              onChange={(e) => setCompletionNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteModal({ open: false, task: null })}>
              Cancel
            </Button>
            <Button
              onClick={() => completeModal.task && handleComplete(completeModal.task, completionNote)}
              disabled={isCompleting}
              className="gap-2"
            >
              {isCompleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
