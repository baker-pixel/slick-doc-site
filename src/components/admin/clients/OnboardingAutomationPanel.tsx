import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Rocket, CheckCircle, Circle, BarChart3, RefreshCw, Lock, Zap } from "lucide-react";
import { format } from "date-fns";

interface WorkflowStep {
  id: string;
  step_number: number;
  step_name: string;
  task_type: string;
  status: string;
  depends_on: number | null;
  completed_at: string | null;
  estimated_completion: string | null;
  workflow_id: string;
}

interface ClientWorkflow {
  id: string;
  client_id: string;
  workflow_name: string;
  current_step: number;
  total_steps: number;
  status: string;
  created_at: string;
  steps: WorkflowStep[];
  client_accounts?: { business_name: string; email: string; tier: string };
}


export function OnboardingAutomationPanel({ adminPassword }: { adminPassword?: string }) {
  const [workflows, setWorkflows] = useState<ClientWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkflow, setSelectedWorkflow] = useState<ClientWorkflow | null>(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [advancingStep, setAdvancingStep] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const { data: workflowData, error: workflowErr } = await supabase
      .from("client_workflows")
      .select(`id, client_id, workflow_name, current_step, total_steps, status, created_at, client_accounts(business_name, email, tier)`)
      .order("created_at", { ascending: false });

    if (workflowErr) {
      toast.error("Failed to fetch workflows");
      setLoading(false);
      return;
    }

    if (workflowData && workflowData.length > 0) {
      const wfIds = workflowData.map((w: any) => w.id);
      const { data: allSteps } = await supabase
        .from("workflow_steps")
        .select("id, step_number, step_name, task_type, status, depends_on, completed_at, estimated_completion, workflow_id")
        .in("workflow_id", wfIds)
        .order("step_number");

      const stepsMap = new Map<string, WorkflowStep[]>();
      (allSteps || []).forEach((s: WorkflowStep) => {
        if (!stepsMap.has(s.workflow_id)) stepsMap.set(s.workflow_id, []);
        stepsMap.get(s.workflow_id)!.push(s);
      });

      setWorkflows(workflowData.map((w: any) => ({ ...w, steps: stepsMap.get(w.id) || [] })));
    } else {
      setWorkflows([]);
    }

    setLoading(false);
  };

  const advanceWorkflowStep = async (workflow: ClientWorkflow, step: WorkflowStep) => {
    setAdvancingStep(step.id);
    try {
      await supabase
        .from("workflow_steps")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", step.id);

      const { error } = await supabase.functions.invoke("advance-workflow", {
        body: {
          workflow_id: workflow.id,
          completed_step_number: step.step_number,
          client_id: workflow.client_id,
          password: adminPassword,
        },
      });
      if (error) throw error;

      toast.success(`Step "${step.step_name}" advanced`);
      await fetchAll();
      // Refresh the open dialog's workflow data
      if (selectedWorkflow?.id === workflow.id) {
        setSelectedWorkflow((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            steps: prev.steps.map((s) =>
              s.id === step.id ? { ...s, status: "completed", completed_at: new Date().toISOString() } : s
            ),
          };
        });
      }
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setAdvancingStep(null);
    }
  };

  const getTierBadge = (tier: string) => {
    const colors: Record<string, string> = {
      foundation: "bg-slate-500",
      growth: "bg-blue-500",
      transformation: "bg-purple-500",
    };
    return <Badge className={colors[tier] || "bg-gray-500"}>{tier}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-5 w-5" />
          Client Onboarding
        </CardTitle>
        <Button size="sm" variant="outline" onClick={fetchAll}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : workflows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No active workflows found. Invite a client to start.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflows.map((wf) => {
                const done = wf.steps.filter((s) => s.status === "completed").length;
                const total = wf.steps.length;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                const clientDone = wf.steps.filter((s) => s.task_type.startsWith("client_") && s.status === "completed").length;
                const clientTotal = wf.steps.filter((s) => s.task_type.startsWith("client_")).length;

                return (
                  <TableRow key={wf.id}>
                    <TableCell>
                      <div className="font-medium">{(wf as any).client_accounts?.business_name}</div>
                      <div className="text-xs text-muted-foreground">{(wf as any).client_accounts?.email}</div>
                    </TableCell>
                    <TableCell>{getTierBadge((wf as any).client_accounts?.tier || "")}</TableCell>
                    <TableCell>
                      <div className="w-36">
                        <div className="flex justify-between text-xs mb-1">
                          <span>{done}/{total} steps</span>
                          <span>{pct}%</span>
                        </div>
                        <Progress value={pct} className="h-2" />
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Onboarding: {clientDone}/{clientTotal}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={wf.status === "active" ? "default" : "secondary"}>
                        {wf.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setSelectedWorkflow(wf); setWorkflowOpen(true); }}
                      >
                        View Steps
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <Dialog open={workflowOpen} onOpenChange={setWorkflowOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Workflow: {(selectedWorkflow as any)?.client_accounts?.business_name}
              </DialogTitle>
            </DialogHeader>
            {selectedWorkflow && (
              <div className="space-y-2 mt-2">
                {selectedWorkflow.steps.map((step) => {
                  const isCompleted = step.status === "completed";
                  const isLocked = step.status === "locked";
                  const isRunning = step.status === "in_progress" || step.status === "running";
                  const isClientStep = step.task_type.startsWith("client_");
                  const isAdvancing = advancingStep === step.id;

                  return (
                    <div
                      key={step.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        isCompleted
                          ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                          : isLocked
                          ? "bg-muted/30 opacity-60"
                          : "bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {isCompleted ? (
                          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                        ) : isLocked ? (
                          <Lock className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        ) : isRunning ? (
                          <Loader2 className="h-5 w-5 text-amber-500 animate-spin flex-shrink-0" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{step.step_name}</span>
                            <Badge variant="outline" className={`text-xs ${isClientStep ? "border-primary/50 text-primary" : ""}`}>
                              {step.task_type}
                            </Badge>
                          </div>
                          {step.completed_at && (
                            <div className="text-xs text-muted-foreground">
                              Completed {format(new Date(step.completed_at), "MMM d 'at' h:mm a")}
                            </div>
                          )}
                          {!isCompleted && step.estimated_completion && (
                            <div className="text-xs text-muted-foreground">
                              Due {step.estimated_completion}
                            </div>
                          )}
                        </div>
                      </div>
                      {!isCompleted && !isLocked && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-shrink-0 ml-2"
                          disabled={isAdvancing}
                          onClick={() => advanceWorkflowStep(selectedWorkflow, step)}
                        >
                          {isAdvancing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Advance
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}