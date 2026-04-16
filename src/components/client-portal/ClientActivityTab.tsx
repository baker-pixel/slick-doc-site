import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  ArrowRight,
  XCircle,
  CalendarDays,
  Info,
  Lock,
  Upload,
  FileEdit,
  Link2,
  CalendarPlus,
  Eye,
  ExternalLink,
  BarChart3,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { scoreToStatus, getStatusColor } from "@/components/report/ReportConfig";

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
  const [showBusinessForm, setShowBusinessForm] = useState(false);
  const [pendingFormStepId, setPendingFormStepId] = useState<string | null>(null);
  const [submittingBizForm, setSubmittingBizForm] = useState(false);
  const [bizForm, setBizForm] = useState({
    business_name: "",
    website_url: "",
    first_name: "",
    last_name: "",
    marketing_goal: "",
  });

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

  // Fetch SYSTEM score from gap analysis
  const { data: gapScore } = useQuery({
    queryKey: ["client-gap-score", clientAccountId],
    queryFn: async () => {
      // Get client email first
      const { data: client } = await supabase
        .from("client_accounts")
        .select("email")
        .eq("id", clientAccountId)
        .single();
      if (!client) return null;

      // Case-insensitive email match to handle any casing differences
      const { data: byEmail } = await supabase
        .from("gap_analysis_submissions")
        .select("id, overall_score, score_breakdown, business_name, created_at")
        .ilike("email", client.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Also try matching by business name as fallback
      let byBusiness = null;
      if (!byEmail?.overall_score) {
        const { data: acct } = await supabase
          .from("client_accounts")
          .select("business_name")
          .eq("id", clientAccountId)
          .single();
        if (acct?.business_name) {
          const { data } = await supabase
            .from("gap_analysis_submissions")
            .select("id, overall_score, score_breakdown, business_name, created_at")
            .ilike("business_name", acct.business_name)
            .not("overall_score", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          byBusiness = data;
        }
      }

      // Prefer whichever has an overall_score; if both do, prefer more recent
      if (byEmail?.overall_score != null && byBusiness?.overall_score != null) {
        return new Date(byEmail.created_at) >= new Date(byBusiness.created_at) ? byEmail : byBusiness;
      }
      return byEmail?.overall_score != null ? byEmail : byBusiness ?? byEmail;
    },
  });

  // Check for expired tokens + failed posts
  const { data: expiredTokenAlert } = useQuery({
    queryKey: ["expired-token-alert", clientAccountId],
    queryFn: async () => {
      const { data: expiredTokens } = await supabase
        .from("client_oauth_tokens")
        .select("platform, expires_at")
        .eq("client_id", clientAccountId)
        .lt("expires_at", new Date().toISOString());

      if (!expiredTokens || expiredTokens.length === 0) return null;

      const { count } = await supabase
        .from("content_calendar")
        .select("id", { count: "exact", head: true })
        .eq("client_account_id", clientAccountId)
        .eq("status", "failed");

      if (!count || count === 0) return null;

      const platforms = expiredTokens.map((t) => t.platform);
      return { platforms, failedCount: count };
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

  const handleBizFormSubmit = useCallback(async () => {
    if (!pendingFormStepId) return;
    if (!bizForm.business_name.trim()) {
      toast({ title: "Business name is required", variant: "destructive" });
      return;
    }
    setSubmittingBizForm(true);
    try {
      const { error } = await supabase
        .from("client_accounts")
        .update({
          business_name: bizForm.business_name,
          website_url: bizForm.website_url || null,
          first_name: bizForm.first_name || null,
          last_name: bizForm.last_name || null,
        })
        .eq("id", clientAccountId);

      if (error) throw error;
      setShowBusinessForm(false);
      await handleCompleteStep(pendingFormStepId);
      setPendingFormStepId(null);
    } catch (err: any) {
      toast({ title: "Failed to save details", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingBizForm(false);
    }
  }, [pendingFormStepId, bizForm, clientAccountId, handleCompleteStep]);

  // Handle CTA click
  const handleStepAction = useCallback(async (step: WorkflowStep) => {
    switch (step.task_type) {
      case "client_form": {
        // Fetch existing account data to pre-fill the form
        const { data: acct } = await supabase
          .from("client_accounts")
          .select("business_name, website_url, first_name, last_name")
          .eq("id", clientAccountId)
          .single();
        setBizForm({
          business_name: acct?.business_name || "",
          website_url: acct?.website_url || "",
          first_name: acct?.first_name || "",
          last_name: acct?.last_name || "",
          marketing_goal: "",
        });
        setPendingFormStepId(step.id);
        setShowBusinessForm(true);
        break;
      }
      case "client_upload":
        // Navigate to Brand Assets — completion handled by ClientBrandAssetsTab after actual upload
        if (onTabChange) onTabChange("brand");
        break;
      case "client_oauth":
        if (onTabChange) onTabChange("social");
        handleCompleteStep(step.id);
        break;
      case "client_calendar": {
        const url = step.payload?.calendar_url || "https://calendly.com/baker-orangedoor";
        window.open(url, "_blank");
        handleCompleteStep(step.id);
        break;
      }
      case "client_approval":
        if (onTabChange) onTabChange("approvals");
        handleCompleteStep(step.id);
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

  // Business confirmation dialog — shared across all render paths
  const bizFormDialog = (
    <Dialog open={showBusinessForm} onOpenChange={(open) => { if (!open) setShowBusinessForm(false); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Your Business Details</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Review and confirm your information so we can tailor your marketing plan.
          </p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="biz-name">Business Name *</Label>
            <Input
              id="biz-name"
              value={bizForm.business_name}
              onChange={(e) => setBizForm((f) => ({ ...f, business_name: e.target.value }))}
              placeholder="Your Business Name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="biz-website">Website URL</Label>
            <Input
              id="biz-website"
              value={bizForm.website_url}
              onChange={(e) => setBizForm((f) => ({ ...f, website_url: e.target.value }))}
              placeholder="https://yourbusiness.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="biz-first">First Name</Label>
              <Input
                id="biz-first"
                value={bizForm.first_name}
                onChange={(e) => setBizForm((f) => ({ ...f, first_name: e.target.value }))}
                placeholder="John"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="biz-last">Last Name</Label>
              <Input
                id="biz-last"
                value={bizForm.last_name}
                onChange={(e) => setBizForm((f) => ({ ...f, last_name: e.target.value }))}
                placeholder="Smith"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="biz-goal">Top Marketing Goal</Label>
            <Textarea
              id="biz-goal"
              value={bizForm.marketing_goal}
              onChange={(e) => setBizForm((f) => ({ ...f, marketing_goal: e.target.value }))}
              placeholder="e.g. Get more local leads, grow online reviews, increase website traffic"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowBusinessForm(false)} disabled={submittingBizForm}>
            Cancel
          </Button>
          <Button onClick={handleBizFormSubmit} disabled={submittingBizForm}>
            {submittingBizForm ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Confirm & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasWorkflow && totalCount === 0) {
    const placeholderSteps = [
      "Confirm Business Information",
      "Upload Brand Assets",
      "Connect Social Accounts",
      "Book Your Kickoff Call",
      "Review Your First Content",
    ];
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Score placeholder */}
        <Card className="border-dashed border-2">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Your SYSTEM Gap Analysis is being prepared</p>
              <p className="text-xs text-muted-foreground">
                Your marketing team is reviewing your website and building your personalised score.
              </p>
            </div>
            <Badge variant="outline" className="flex-shrink-0 whitespace-nowrap">In Progress</Badge>
          </CardContent>
        </Card>

        {/* Progress header */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Your Marketing Roadmap</h2>
            <span className="text-sm text-muted-foreground">Setting up…</span>
          </div>
          <Progress value={0} className="h-3" />
          <p className="text-sm text-muted-foreground">
            Your step-by-step plan is being configured by your team. Check back shortly.
          </p>
        </div>

        {/* Placeholder step list — disabled */}
        <div className="space-y-1 opacity-40 pointer-events-none select-none">
          {placeholderSteps.map((name, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg px-4 py-3 bg-muted/30">
              <Circle className="h-5 w-5 text-border mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">{name}</p>
                <p className="text-xs text-muted-foreground">Awaiting setup</p>
              </div>
            </div>
          ))}
        </div>

        {/* Info callout */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground">
              Your team is setting up your custom marketing roadmap. You'll receive an email once everything is ready to go.
            </p>
          </CardContent>
        </Card>

        {bizFormDialog}
      </div>
    );
  }

  const tierFromScore = (score: number): string => {
    if (score >= 70) return 'Transformation';
    if (score >= 45) return 'Growth';
    return 'Foundation';
  };

  const scoreColor = (score: number): string => {
    if (score >= 70) return 'text-emerald-500';
    if (score >= 45) return 'text-amber-500';
    return 'text-red-500';
  };

  const scoreRingColor = (score: number): string => {
    if (score >= 70) return 'stroke-emerald-500';
    if (score >= 45) return 'stroke-amber-500';
    return 'stroke-red-500';
  };

  const renderScoreCard = () => {
    if (gapScore?.overall_score != null) {
      const score = gapScore.overall_score;
      const breakdown = (gapScore.score_breakdown || []) as Array<{ category: string; label: string; score: number }>;
      const circumference = 2 * Math.PI * 45;
      const progress = (score / 100) * circumference;

      return (
        <Card className="border-primary/20 overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-start gap-6 flex-col sm:flex-row">
              {/* Score gauge */}
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your SYSTEM Score</p>
                <div className="relative w-28 h-28">
                  <svg width={112} height={112} className="-rotate-90">
                    <circle cx={56} cy={56} r={45} fill="none" stroke="hsl(var(--muted))" strokeWidth={8} />
                    <circle
                      cx={56} cy={56} r={45} fill="none"
                      className={scoreRingColor(score)}
                      strokeWidth={8} strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference - progress}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={cn("text-3xl font-bold", scoreColor(score))}>{score}</span>
                    <span className="text-[10px] text-muted-foreground">/ 100</span>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  Recommended: {tierFromScore(score)} Plan
                </Badge>
              </div>

              {/* Category bars */}
              <div className="flex-1 space-y-2 w-full">
                {breakdown.map((cat) => {
                  const status = scoreToStatus(cat.score);
                  const colors = getStatusColor(status);
                  return (
                    <div key={cat.category} className="flex items-center gap-2">
                      <span className="w-6 text-xs font-bold text-muted-foreground text-center">{cat.category.replace('S2','S')}</span>
                      <span className="w-32 text-xs truncate">{cat.label}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className={cn("h-full rounded-full", colors.bar)} style={{ width: `${cat.score}%` }} />
                      </div>
                      <span className="w-8 text-xs text-right font-medium">{cat.score}</span>
                    </div>
                  );
                })}
                <a
                  href={`/report/${gapScore.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                >
                  View Full Report <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    // No gap analysis found — show "in progress" state, do NOT link to public page
    return (
      <Card className="border-dashed border-2">
        <CardContent className="p-6 flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">Your SYSTEM Gap Analysis is being prepared</p>
            <p className="text-xs text-muted-foreground">
              Your marketing team is reviewing your website and building your personalised score. You'll see your results here as soon as they're ready.
            </p>
          </div>
          <Badge variant="outline" className="flex-shrink-0 whitespace-nowrap">In Progress</Badge>
        </CardContent>
      </Card>
    );
  };

  // Render workflow-based progress
  if (hasWorkflow) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        {/* SYSTEM Score Card */}
        {renderScoreCard()}
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

        {/* Business confirmation Dialog */}
        {bizFormDialog}
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

      {/* Business confirmation Dialog */}
      {bizFormDialog}
    </div>
  );
}
