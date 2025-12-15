import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  CheckCircle, 
  Circle, 
  Lock, 
  ChevronRight, 
  User, 
  Building2, 
  Mail, 
  Calendar,
  FileText,
  Package,
  ClipboardCheck,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface ClientWorkflowPanelProps {
  adminPassword: string;
}

interface ClientAccount {
  id: string;
  business_name: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  tier: string;
  status: string;
  created_at: string;
  onboarded_at: string | null;
}

interface ClientTask {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  status: string;
  category: string;
  automation_type: string;
  notes: string | null;
  output_data: any;
  completed_at: string | null;
  created_at: string;
  client_account_id: string;
}

interface Deliverable {
  id: string;
  title: string;
  description: string | null;
  status: string;
  category: string;
  created_at: string;
  reviewed_at: string | null;
}

interface OnboardingData {
  id: string;
  current_step: number | null;
  intake_form_sent_at: string | null;
  intake_form_completed_at: string | null;
  kickoff_scheduled_at: string | null;
  kickoff_completed_at: string | null;
  crm_added_at: string | null;
  dashboard_created_at: string | null;
  review_system_setup_at: string | null;
  onboarding_completed_at: string | null;
}

type WorkflowPhase = "onboarding" | "tasks" | "deliverables" | "review";

const phaseConfig: { id: WorkflowPhase; label: string; icon: React.ElementType }[] = [
  { id: "onboarding", label: "Onboarding", icon: User },
  { id: "tasks", label: "Tasks", icon: ClipboardCheck },
  { id: "deliverables", label: "Deliverables", icon: Package },
  { id: "review", label: "Review", icon: FileText },
];

const tierColors: Record<string, string> = {
  foundation: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  growth: "bg-purple-500/10 text-purple-500 border-purple-500/30",
  scale: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  transform: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
};

export function ClientWorkflowPanel({ adminPassword }: ClientWorkflowPanelProps) {
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [currentPhase, setCurrentPhase] = useState<WorkflowPhase>("onboarding");
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [completionNotes, setCompletionNotes] = useState("");
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const selectedClient = useMemo(() => 
    clients.find(c => c.id === selectedClientId), 
    [clients, selectedClientId]
  );

  // Fetch clients
  useEffect(() => {
    const fetchClients = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("admin", {
          body: { action: "getClients", password: adminPassword },
        });
        if (error) throw error;
        setClients(data?.clients || []);
      } catch (error) {
        console.error("Error fetching clients:", error);
        toast({ title: "Error loading clients", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };
    fetchClients();
  }, [adminPassword]);

  // Fetch client data when selected
  useEffect(() => {
    if (!selectedClientId) return;

    const fetchClientData = async () => {
      setIsLoading(true);
      try {
        const [tasksRes, deliverablesRes, onboardingRes] = await Promise.all([
          supabase.functions.invoke("admin", {
            body: { action: "getClientTasks", password: adminPassword },
          }),
          supabase.functions.invoke("admin", {
            body: { action: "getDeliverables", password: adminPassword },
          }),
          supabase.from("client_onboarding")
            .select("*")
            .eq("client_account_id", selectedClientId)
            .single(),
        ]);

        const clientTasks = (tasksRes.data?.tasks || [])
          .filter((t: ClientTask) => t.client_account_id === selectedClientId)
          .sort((a: ClientTask, b: ClientTask) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        
        const clientDeliverables = (deliverablesRes.data?.deliverables || [])
          .filter((d: Deliverable & { client_account_id: string }) => 
            d.client_account_id === selectedClientId
          );

        setTasks(clientTasks);
        setDeliverables(clientDeliverables);
        setOnboarding(onboardingRes.data);

        // Find first incomplete task
        const firstIncomplete = clientTasks.findIndex((t: ClientTask) => t.status !== "completed");
        setCurrentTaskIndex(firstIncomplete >= 0 ? firstIncomplete : clientTasks.length - 1);

        // Determine current phase based on data
        if (!onboardingRes.data?.onboarding_completed_at) {
          setCurrentPhase("onboarding");
        } else if (clientTasks.some((t: ClientTask) => t.status !== "completed")) {
          setCurrentPhase("tasks");
        } else if (clientDeliverables.some((d: Deliverable) => d.status === "pending_review")) {
          setCurrentPhase("deliverables");
        } else {
          setCurrentPhase("review");
        }
      } catch (error) {
        console.error("Error fetching client data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchClientData();
  }, [selectedClientId, adminPassword]);

  // Calculate phase completion
  const phaseProgress = useMemo(() => {
    const onboardingSteps = onboarding ? [
      onboarding.intake_form_sent_at,
      onboarding.intake_form_completed_at,
      onboarding.kickoff_scheduled_at,
      onboarding.kickoff_completed_at,
      onboarding.crm_added_at,
      onboarding.dashboard_created_at,
      onboarding.review_system_setup_at,
      onboarding.onboarding_completed_at,
    ] : [];
    const completedOnboarding = onboardingSteps.filter(Boolean).length;
    
    const completedTasks = tasks.filter(t => t.status === "completed").length;
    const completedDeliverables = deliverables.filter(d => d.status === "approved").length;
    const pendingReview = deliverables.filter(d => d.status === "pending_review").length;

    return {
      onboarding: onboardingSteps.length ? (completedOnboarding / onboardingSteps.length) * 100 : 0,
      tasks: tasks.length ? (completedTasks / tasks.length) * 100 : 0,
      deliverables: deliverables.length ? (completedDeliverables / deliverables.length) * 100 : 0,
      review: pendingReview === 0 && deliverables.length > 0 ? 100 : 0,
    };
  }, [onboarding, tasks, deliverables]);

  const isPhaseUnlocked = (phase: WorkflowPhase): boolean => {
    switch (phase) {
      case "onboarding":
        return true;
      case "tasks":
        return phaseProgress.onboarding === 100;
      case "deliverables":
        return phaseProgress.tasks === 100;
      case "review":
        return phaseProgress.deliverables >= 50; // Allow review once half delivered
      default:
        return false;
    }
  };

  const handleCompleteTask = async (task: ClientTask) => {
    setIsActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke("admin", {
        body: {
          action: "updateClientTask",
          password: adminPassword,
          taskId: task.id,
          updates: {
            status: "completed",
            completed_at: new Date().toISOString(),
            notes: completionNotes || task.notes,
          },
        },
      });

      if (error) throw error;

      setTasks(prev => prev.map(t => 
        t.id === task.id 
          ? { ...t, status: "completed", completed_at: new Date().toISOString(), notes: completionNotes || t.notes }
          : t
      ));
      setCompletionNotes("");
      setCurrentTaskIndex(prev => prev + 1);
      toast({ title: "Task completed!" });
    } catch (error) {
      console.error("Error completing task:", error);
      toast({ title: "Error completing task", variant: "destructive" });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCompleteOnboardingStep = async (step: string) => {
    if (!onboarding) return;
    setIsActionLoading(true);
    try {
      const { error } = await supabase
        .from("client_onboarding")
        .update({ [step]: new Date().toISOString() })
        .eq("id", onboarding.id);

      if (error) throw error;

      setOnboarding(prev => prev ? { ...prev, [step]: new Date().toISOString() } : null);
      toast({ title: "Step completed!" });
    } catch (error) {
      console.error("Error updating onboarding:", error);
      toast({ title: "Error updating step", variant: "destructive" });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleApproveDeliverable = async (deliverable: Deliverable) => {
    setIsActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke("admin", {
        body: {
          action: "updateDeliverable",
          password: adminPassword,
          deliverableId: deliverable.id,
          updates: {
            status: "approved",
            reviewed_at: new Date().toISOString(),
          },
        },
      });

      if (error) throw error;

      setDeliverables(prev => prev.map(d => 
        d.id === deliverable.id 
          ? { ...d, status: "approved", reviewed_at: new Date().toISOString() }
          : d
      ));
      toast({ title: "Deliverable approved!" });
    } catch (error) {
      console.error("Error approving deliverable:", error);
      toast({ title: "Error approving deliverable", variant: "destructive" });
    } finally {
      setIsActionLoading(false);
    }
  };

  const currentTask = tasks[currentTaskIndex];

  if (isLoading && clients.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Client Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Select Client
          </CardTitle>
          <CardDescription>Choose a client to work through their workflow step by step</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedClientId} onValueChange={setSelectedClientId}>
            <SelectTrigger className="w-full bg-background">
              <SelectValue placeholder="Select a client..." />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{client.business_name}</span>
                    <Badge variant="outline" className={cn("ml-2", tierColors[client.tier])}>
                      {client.tier}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedClient && (
        <>
          {/* Client Info Summary */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{selectedClient.business_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedClient.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>Started {format(new Date(selectedClient.created_at), "MMM d, yyyy")}</span>
                </div>
                <Badge variant="outline" className={cn(tierColors[selectedClient.tier])}>
                  {selectedClient.tier.charAt(0).toUpperCase() + selectedClient.tier.slice(1)} Tier
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Phase Progress */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Workflow Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {phaseConfig.map((phase, index) => {
                  const Icon = phase.icon;
                  const isUnlocked = isPhaseUnlocked(phase.id);
                  const isActive = currentPhase === phase.id;
                  const progress = phaseProgress[phase.id];
                  const isComplete = progress === 100;

                  return (
                    <div key={phase.id} className="flex items-center flex-1">
                      <button
                        onClick={() => isUnlocked && setCurrentPhase(phase.id)}
                        disabled={!isUnlocked}
                        className={cn(
                          "flex flex-col items-center gap-2 p-4 rounded-lg border transition-all flex-1",
                          isActive && "border-primary bg-primary/5",
                          !isActive && isUnlocked && "border-muted hover:border-primary/50 cursor-pointer",
                          !isUnlocked && "border-muted/50 opacity-50 cursor-not-allowed"
                        )}
                      >
                        <div className={cn(
                          "h-10 w-10 rounded-full flex items-center justify-center",
                          isComplete && "bg-green-500/10 text-green-500",
                          !isComplete && isActive && "bg-primary/10 text-primary",
                          !isComplete && !isActive && "bg-muted text-muted-foreground"
                        )}>
                          {!isUnlocked ? (
                            <Lock className="h-5 w-5" />
                          ) : isComplete ? (
                            <CheckCircle className="h-5 w-5" />
                          ) : (
                            <Icon className="h-5 w-5" />
                          )}
                        </div>
                        <span className={cn(
                          "text-sm font-medium",
                          isActive && "text-primary",
                          !isUnlocked && "text-muted-foreground"
                        )}>
                          {phase.label}
                        </span>
                        <Progress value={progress} className="h-1.5 w-full" />
                        <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
                      </button>
                      {index < phaseConfig.length - 1 && (
                        <ChevronRight className="h-5 w-5 text-muted-foreground mx-2 flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Phase Content */}
          {currentPhase === "onboarding" && onboarding && (
            <Card>
              <CardHeader>
                <CardTitle>Onboarding Steps</CardTitle>
                <CardDescription>Complete each step in order before moving to tasks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { key: "intake_form_sent_at", label: "Send Intake Form", description: "Send the client their intake form" },
                  { key: "intake_form_completed_at", label: "Intake Form Completed", description: "Client has completed their intake form" },
                  { key: "kickoff_scheduled_at", label: "Schedule Kickoff", description: "Schedule the kickoff meeting" },
                  { key: "kickoff_completed_at", label: "Complete Kickoff", description: "Kickoff meeting has been completed" },
                  { key: "crm_added_at", label: "Add to CRM", description: "Add client to CRM system" },
                  { key: "dashboard_created_at", label: "Create Dashboard", description: "Set up client reporting dashboard" },
                  { key: "review_system_setup_at", label: "Setup Review System", description: "Configure review collection system" },
                  { key: "onboarding_completed_at", label: "Complete Onboarding", description: "Mark onboarding as complete" },
                ].map((step, index, arr) => {
                  const isCompleted = !!onboarding[step.key as keyof OnboardingData];
                  const previousCompleted = index === 0 || !!onboarding[arr[index - 1].key as keyof OnboardingData];
                  const isCurrentStep = !isCompleted && previousCompleted;

                  return (
                    <div
                      key={step.key}
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-lg border transition-all",
                        isCurrentStep && "border-primary bg-primary/5",
                        isCompleted && "border-green-500/30 bg-green-500/5",
                        !isCurrentStep && !isCompleted && "border-muted opacity-50"
                      )}
                    >
                      <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0",
                        isCompleted && "bg-green-500 text-white",
                        isCurrentStep && "bg-primary text-primary-foreground",
                        !isCompleted && !isCurrentStep && "bg-muted text-muted-foreground"
                      )}>
                        {isCompleted ? (
                          <CheckCircle className="h-5 w-5" />
                        ) : isCurrentStep ? (
                          <span className="font-bold text-sm">{index + 1}</span>
                        ) : (
                          <Lock className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium">{step.label}</h4>
                        <p className="text-sm text-muted-foreground">{step.description}</p>
                      </div>
                      {isCurrentStep && (
                        <Button
                          onClick={() => handleCompleteOnboardingStep(step.key)}
                          disabled={isActionLoading}
                        >
                          {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Complete"}
                        </Button>
                      )}
                      {isCompleted && (
                        <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                          Done
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {currentPhase === "tasks" && (
            <Card>
              <CardHeader>
                <CardTitle>Current Task</CardTitle>
                <CardDescription>
                  Task {currentTaskIndex + 1} of {tasks.length} — Complete each task before moving to the next
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {currentTask ? (
                  <>
                    {/* Current Task Detail */}
                    <div className="p-6 rounded-lg border-2 border-primary bg-primary/5 space-y-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <Badge className="mb-2">{currentTask.category}</Badge>
                          <h3 className="text-xl font-semibold">{currentTask.name}</h3>
                        </div>
                        <Badge variant="outline">
                          {currentTask.automation_type === "MANUAL" ? "Manual" : "Automated"}
                        </Badge>
                      </div>

                      {currentTask.description && (
                        <div>
                          <h4 className="text-sm font-medium text-muted-foreground mb-1">Description</h4>
                          <p>{currentTask.description}</p>
                        </div>
                      )}

                      {currentTask.instructions && (
                        <div className="p-4 rounded-lg bg-muted/50">
                          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Instructions
                          </h4>
                          <p className="text-sm whitespace-pre-wrap">{currentTask.instructions}</p>
                        </div>
                      )}

                      <div className="pt-4 border-t space-y-4">
                        <div>
                          <label className="text-sm font-medium block mb-2">Completion Notes (optional)</label>
                          <Textarea
                            value={completionNotes}
                            onChange={(e) => setCompletionNotes(e.target.value)}
                            placeholder="Add any notes about this task..."
                            rows={3}
                          />
                        </div>
                        <Button
                          size="lg"
                          className="w-full"
                          onClick={() => handleCompleteTask(currentTask)}
                          disabled={isActionLoading}
                        >
                          {isActionLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-2" />
                          )}
                          Mark as Complete
                        </Button>
                      </div>
                    </div>

                    {/* Task List */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">All Tasks</h4>
                      {tasks.map((task, index) => (
                        <div
                          key={task.id}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                            index === currentTaskIndex && "border-primary bg-primary/5",
                            task.status === "completed" && "border-green-500/30 bg-green-500/5",
                            index > currentTaskIndex && task.status !== "completed" && "opacity-50"
                          )}
                          onClick={() => {
                            if (task.status === "completed" || index === currentTaskIndex) {
                              setExpandedTask(expandedTask === task.id ? null : task.id);
                            }
                          }}
                        >
                          <div className={cn(
                            "h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0",
                            task.status === "completed" && "bg-green-500 text-white",
                            task.status !== "completed" && index === currentTaskIndex && "bg-primary text-primary-foreground",
                            task.status !== "completed" && index !== currentTaskIndex && "bg-muted"
                          )}>
                            {task.status === "completed" ? (
                              <CheckCircle className="h-4 w-4" />
                            ) : index === currentTaskIndex ? (
                              <Circle className="h-3 w-3 fill-current" />
                            ) : (
                              <Lock className="h-3 w-3" />
                            )}
                          </div>
                          <span className={cn(
                            "flex-1 text-sm",
                            task.status === "completed" && "line-through text-muted-foreground"
                          )}>
                            {task.name}
                          </span>
                          {expandedTask === task.id ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold">All Tasks Completed!</h3>
                    <p className="text-muted-foreground">Move on to the Deliverables phase</p>
                    <Button className="mt-4" onClick={() => setCurrentPhase("deliverables")}>
                      Go to Deliverables
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {currentPhase === "deliverables" && (
            <Card>
              <CardHeader>
                <CardTitle>Deliverables</CardTitle>
                <CardDescription>Review and approve client deliverables</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {deliverables.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No deliverables yet. Create deliverables from completed tasks.</p>
                  </div>
                ) : (
                  deliverables.map((deliverable) => (
                    <div
                      key={deliverable.id}
                      className={cn(
                        "p-4 rounded-lg border",
                        deliverable.status === "approved" && "border-green-500/30 bg-green-500/5",
                        deliverable.status === "pending_review" && "border-amber-500/30 bg-amber-500/5"
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <Badge className="mb-2" variant="outline">{deliverable.category}</Badge>
                          <h4 className="font-medium">{deliverable.title}</h4>
                          {deliverable.description && (
                            <p className="text-sm text-muted-foreground mt-1">{deliverable.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={deliverable.status === "approved" ? "default" : "secondary"}>
                            {deliverable.status === "approved" ? "Approved" : "Pending Review"}
                          </Badge>
                          {deliverable.status === "pending_review" && (
                            <Button
                              size="sm"
                              onClick={() => handleApproveDeliverable(deliverable)}
                              disabled={isActionLoading}
                            >
                              Approve
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {currentPhase === "review" && (
            <Card>
              <CardHeader>
                <CardTitle>Final Review</CardTitle>
                <CardDescription>Review the client's overall progress and completion status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <div className="text-2xl font-bold text-green-500">
                      {tasks.filter(t => t.status === "completed").length}
                    </div>
                    <div className="text-sm text-muted-foreground">Tasks Completed</div>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <div className="text-2xl font-bold">{tasks.length}</div>
                    <div className="text-sm text-muted-foreground">Total Tasks</div>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <div className="text-2xl font-bold text-green-500">
                      {deliverables.filter(d => d.status === "approved").length}
                    </div>
                    <div className="text-sm text-muted-foreground">Deliverables Approved</div>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <div className="text-2xl font-bold">{deliverables.length}</div>
                    <div className="text-sm text-muted-foreground">Total Deliverables</div>
                  </div>
                </div>

                {phaseProgress.onboarding === 100 && 
                 phaseProgress.tasks === 100 && 
                 phaseProgress.deliverables === 100 ? (
                  <div className="text-center py-8 space-y-4">
                    <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
                    <h3 className="text-xl font-semibold">Client Workflow Complete!</h3>
                    <p className="text-muted-foreground">
                      All onboarding, tasks, and deliverables have been completed for {selectedClient.business_name}.
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-8 space-y-4">
                    <AlertCircle className="h-16 w-16 text-amber-500 mx-auto" />
                    <h3 className="text-xl font-semibold">Workflow In Progress</h3>
                    <p className="text-muted-foreground">
                      There are still pending items. Go back to complete them.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default ClientWorkflowPanel;
