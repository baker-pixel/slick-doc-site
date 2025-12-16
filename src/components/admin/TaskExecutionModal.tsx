import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Play, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  FileText, 
  Target, 
  Zap,
  ListChecks,
  Lightbulb,
  Clock,
  Bot
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TaskExecutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: {
    id: string;
    name: string;
    description?: string;
    instructions?: string;
    category: string;
    automation_type: string;
    client_account_id: string;
  } | null;
  clientName: string;
  onTaskCompleted: () => void;
}

// Detailed instructions for each task type
const taskInstructions: Record<string, {
  overview: string;
  steps: string[];
  aiActions: string[];
  expectedOutput: string;
  timeEstimate: string;
  segmentationLogic?: string[];
}> = {
  // Onboarding Tasks
  "send intake form": {
    overview: "Automatically sends a personalized intake form email to the client to gather essential business information.",
    steps: [
      "Generate personalized email with client's name and business",
      "Include secure link to intake form with client ID",
      "Send via Resend email API",
      "Log activity in client timeline",
      "Create deliverable record for tracking"
    ],
    aiActions: [
      "Personalize greeting based on client data",
      "Set appropriate follow-up reminders",
      "Track email delivery status"
    ],
    expectedOutput: "Email sent confirmation, intake form URL, deliverable created",
    timeEstimate: "~5 seconds"
  },
  "add to crm": {
    overview: "Creates or updates the client contact in your CRM system with all relevant business information.",
    steps: [
      "Check for existing CRM integration (GoHighLevel)",
      "Create contact record with client details",
      "Add custom fields for tier, industry, level",
      "Assign to appropriate pipeline stage",
      "Create deliverable documenting CRM setup"
    ],
    aiActions: [
      "Map client data to CRM fields",
      "Set lead source attribution",
      "Configure automated follow-up sequences"
    ],
    expectedOutput: "CRM contact created, pipeline assignment, automation triggers set",
    timeEstimate: "~10 seconds"
  },
  "schedule kickoff": {
    overview: "Sends calendar scheduling link for kickoff call and prepares meeting agenda.",
    steps: [
      "Generate personalized scheduling email",
      "Include Calendly/booking link",
      "Outline kickoff call agenda in email",
      "Set up reminder sequence",
      "Create deliverable with meeting prep"
    ],
    aiActions: [
      "Generate custom agenda based on client tier",
      "Prepare discovery questions for kickoff",
      "Set calendar hold for team availability"
    ],
    expectedOutput: "Scheduling email sent, agenda prepared, team notified",
    timeEstimate: "~8 seconds"
  },
  
  // SEO Tasks
  "run page speed test": {
    overview: "Performs comprehensive website speed analysis using Google PageSpeed Insights API.",
    steps: [
      "Fetch client website URL",
      "Run Google PageSpeed API test (mobile + desktop)",
      "Extract Core Web Vitals scores",
      "Identify performance bottlenecks",
      "Generate detailed report with recommendations"
    ],
    aiActions: [
      "Analyze performance metrics against industry benchmarks",
      "Prioritize optimization opportunities",
      "Generate actionable improvement checklist"
    ],
    expectedOutput: "Performance score, Core Web Vitals breakdown, prioritized recommendations",
    timeEstimate: "~30 seconds",
    segmentationLogic: [
      "Score ≥90: 'Excellent' - Focus on maintaining performance",
      "Score 50-89: 'Needs Work' - Prioritize critical issues first",
      "Score <50: 'Critical' - Immediate intervention required"
    ]
  },
  "run seo audit": {
    overview: "Comprehensive SEO analysis covering technical, on-page, and off-page factors.",
    steps: [
      "Crawl website for technical SEO issues",
      "Analyze meta tags, headings, content structure",
      "Check mobile-friendliness and Core Web Vitals",
      "Review backlink profile health",
      "Assess local SEO factors (for local businesses)"
    ],
    aiActions: [
      "Compare against top 3 competitors",
      "Identify keyword ranking opportunities",
      "Generate SEO roadmap with priorities",
      "Calculate potential traffic improvement"
    ],
    expectedOutput: "SEO score, issue list by priority, keyword opportunities, competitor gaps",
    timeEstimate: "~45 seconds",
    segmentationLogic: [
      "Local business: Prioritize Google Business Profile and local citations",
      "E-commerce: Focus on product schema and site speed",
      "Service business: Emphasize content and authority building"
    ]
  },
  "run keyword gap analysis": {
    overview: "Identifies keyword opportunities by analyzing gaps between client and competitor rankings.",
    steps: [
      "Identify top 3-5 competitors",
      "Pull competitor keyword rankings",
      "Compare against client's current rankings",
      "Find high-value keyword gaps",
      "Prioritize by search volume and difficulty"
    ],
    aiActions: [
      "Calculate keyword difficulty scores",
      "Estimate traffic potential for each keyword",
      "Suggest content topics to target gaps",
      "Create content brief outlines"
    ],
    expectedOutput: "Gap analysis report, prioritized keyword list, content recommendations",
    timeEstimate: "~60 seconds"
  },

  // Review & Reputation Tasks
  "create google review link": {
    overview: "Generates a direct Google review link for the client's business.",
    steps: [
      "Look up Google Place ID from business name",
      "Generate direct review URL",
      "Test link functionality",
      "Save to client profile",
      "Create shareable assets"
    ],
    aiActions: [
      "Verify business listing accuracy",
      "Generate QR code for review link",
      "Create email/SMS templates for review requests"
    ],
    expectedOutput: "Direct review URL, QR code, request templates",
    timeEstimate: "~15 seconds"
  },
  "create review qr code": {
    overview: "Generates a scannable QR code that links directly to client's Google review page.",
    steps: [
      "Retrieve or generate Google review URL",
      "Generate high-resolution QR code",
      "Apply brand colors if available",
      "Upload to storage bucket",
      "Create multiple size variants"
    ],
    aiActions: [
      "Design QR code with brand styling",
      "Generate print-ready PDF versions",
      "Create social media sized versions"
    ],
    expectedOutput: "QR code image URL, print-ready files, brand assets",
    timeEstimate: "~10 seconds"
  },
  "setup review automation": {
    overview: "Configures automated review request sequences triggered after service completion.",
    steps: [
      "Create review request email template",
      "Set up SMS follow-up sequence",
      "Configure timing triggers (post-service delay)",
      "Add personalization tokens",
      "Enable tracking for sent/completed"
    ],
    aiActions: [
      "Generate industry-specific request copy",
      "A/B test subject lines",
      "Set optimal send times based on industry data"
    ],
    expectedOutput: "Email sequence created, SMS templates, automation rules active",
    timeEstimate: "~20 seconds",
    segmentationLogic: [
      "5-star prediction: Send immediate review request",
      "Neutral prediction: Send satisfaction check first, then review request",
      "Negative prediction: Route to customer service for follow-up"
    ]
  },

  // Reporting Tasks
  "generate monthly report": {
    overview: "Creates comprehensive monthly performance report with all key metrics and insights.",
    steps: [
      "Pull analytics data for reporting period",
      "Calculate MoM and YoY comparisons",
      "Extract key wins and highlights",
      "Identify areas needing attention",
      "Generate executive summary"
    ],
    aiActions: [
      "Write narrative insights for each metric",
      "Generate data visualizations",
      "Provide strategic recommendations",
      "Create next month action items"
    ],
    expectedOutput: "Full report with charts, insights, and recommendations",
    timeEstimate: "~45 seconds",
    segmentationLogic: [
      "Growth clients: Focus on scaling metrics and expansion opportunities",
      "Struggling clients: Emphasize turnaround strategies and quick wins",
      "Stable clients: Highlight maintenance and optimization opportunities"
    ]
  },
  "create kpi dashboard": {
    overview: "Sets up a custom KPI dashboard tailored to client's tier and goals.",
    steps: [
      "Determine widgets based on client tier",
      "Connect data sources (Analytics, Ads, CRM)",
      "Configure refresh schedules",
      "Set up alert thresholds",
      "Create shareable dashboard link"
    ],
    aiActions: [
      "Recommend KPIs based on industry benchmarks",
      "Set realistic target thresholds",
      "Configure anomaly detection alerts"
    ],
    expectedOutput: "Dashboard configuration, widget setup, alert rules",
    timeEstimate: "~15 seconds"
  },

  // Lead & Automation Tasks
  "setup lead automations": {
    overview: "Creates automated lead nurturing sequences based on lead behavior and scoring.",
    steps: [
      "Define lead scoring criteria",
      "Create email nurture sequences",
      "Set up behavior-based triggers",
      "Configure lead routing rules",
      "Enable real-time alerts for hot leads"
    ],
    aiActions: [
      "Generate personalized email content",
      "Create dynamic content blocks",
      "Set intelligent send times",
      "Build predictive lead scoring model"
    ],
    expectedOutput: "Lead scoring rules, email sequences, automation triggers",
    timeEstimate: "~30 seconds",
    segmentationLogic: [
      "Score 80+: 'Hot Lead' → Immediate sales alert + priority follow-up",
      "Score 50-79: 'Warm Lead' → Accelerated nurture sequence",
      "Score 20-49: 'Cool Lead' → Standard nurture, educational content",
      "Score <20: 'Cold Lead' → Long-term nurture, re-engagement campaigns"
    ]
  },
  "setup retargeting audiences": {
    overview: "Creates custom audiences for retargeting campaigns across ad platforms.",
    steps: [
      "Define audience segments based on behavior",
      "Create Facebook Custom Audiences",
      "Set up Google Ads remarketing lists",
      "Configure lookalike/similar audiences",
      "Set frequency caps and exclusions"
    ],
    aiActions: [
      "Analyze visitor behavior patterns",
      "Recommend audience segment sizes",
      "Generate ad creative suggestions per segment"
    ],
    expectedOutput: "Audience lists created, segment definitions, platform sync status",
    timeEstimate: "~25 seconds",
    segmentationLogic: [
      "Cart abandoners: High-intent, urgency messaging",
      "Page viewers: Educational content, social proof",
      "Past customers: Upsell/cross-sell, loyalty offers",
      "Blog readers: Lead magnets, newsletter signup"
    ]
  },
  "setup retention automations": {
    overview: "Builds automated sequences to improve customer retention and lifetime value.",
    steps: [
      "Create post-purchase follow-up sequence",
      "Set up anniversary/milestone emails",
      "Configure win-back campaigns for churning customers",
      "Build referral request automation",
      "Enable loyalty program triggers"
    ],
    aiActions: [
      "Predict churn risk scores",
      "Generate personalized retention offers",
      "Create dynamic content based on purchase history"
    ],
    expectedOutput: "Retention sequences active, churn alerts configured, referral system ready",
    timeEstimate: "~35 seconds",
    segmentationLogic: [
      "High LTV + Low Churn Risk: VIP treatment, exclusive offers",
      "High LTV + High Churn Risk: Immediate intervention, personal outreach",
      "Low LTV + Low Churn Risk: Upsell opportunities, engagement campaigns",
      "Low LTV + High Churn Risk: Win-back or graceful exit"
    ]
  }
};

// Get instructions for a task based on name matching
function getTaskInstructions(taskName: string) {
  const normalizedName = taskName.toLowerCase();
  
  for (const [key, instructions] of Object.entries(taskInstructions)) {
    if (normalizedName.includes(key) || key.includes(normalizedName.split(" ").slice(0, 3).join(" "))) {
      return instructions;
    }
  }
  
  // Default instructions for unknown tasks
  return {
    overview: "This task will be executed based on the configured automation rules.",
    steps: [
      "Analyze task requirements",
      "Execute automation logic",
      "Update task status",
      "Create deliverable if applicable",
      "Log activity for tracking"
    ],
    aiActions: [
      "Process task inputs",
      "Generate required outputs",
      "Validate completion criteria"
    ],
    expectedOutput: "Task completed, status updated, deliverable created",
    timeEstimate: "~20 seconds"
  };
}

// Map task name to job type
function mapTaskToJobType(taskName: string): string {
  const mappings: Record<string, string> = {
    "send intake form": "send_intake_form",
    "add to crm": "add_to_crm",
    "schedule kickoff": "schedule_kickoff",
    "run pagespeed test": "run_page_speed_test",
    "run page speed test": "run_page_speed_test",
    "create google review link": "create_google_review_link",
    "create review qr code": "create_review_qr_code",
    "setup review automation": "setup_review_automation",
    "send review scripts": "send_review_scripts",
    "create kpi dashboard": "create_kpi_dashboard",
    "run seo audit": "run_seo_audit",
    "run keyword gap analysis": "run_keyword_gap_analysis",
    "setup lead automations": "setup_lead_automations",
    "setup retargeting audiences": "setup_retargeting_audiences",
    "setup retention automations": "setup_retention_automations",
    "generate monthly report": "generate_monthly_report",
    "generate report": "generate_report",
  };

  const normalizedName = taskName.toLowerCase();
  for (const [name, jobType] of Object.entries(mappings)) {
    if (normalizedName.includes(name) || name.includes(normalizedName)) {
      return jobType;
    }
  }

  return taskName.toLowerCase().replace(/\s+/g, "_");
}

export default function TaskExecutionModal({
  isOpen,
  onClose,
  task,
  clientName,
  onTaskCompleted
}: TaskExecutionModalProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    message: string;
    output?: Record<string, unknown>;
  } | null>(null);

  if (!task) return null;

  const instructions = getTaskInstructions(task.name);

  const executeTask = async () => {
    setIsExecuting(true);
    setExecutionResult(null);

    try {
      const jobType = mapTaskToJobType(task.name);
      
      const { data, error } = await supabase.functions.invoke("run-automation", {
        body: {
          clientId: task.client_account_id,
          taskId: task.id,
          jobType: jobType,
        },
      });

      if (error) throw error;

      setExecutionResult({
        success: true,
        message: "Task completed successfully!",
        output: data?.output,
      });

      toast.success(`Task "${task.name}" completed successfully!`);
      onTaskCompleted();
    } catch (error) {
      console.error("Task execution error:", error);
      setExecutionResult({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error occurred",
      });
      toast.error("Failed to execute task");
    } finally {
      setIsExecuting(false);
    }
  };

  const handleClose = () => {
    setExecutionResult(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Execute Task: {task.name}
          </DialogTitle>
          <DialogDescription>
            Running for client: <span className="font-medium">{clientName}</span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Task Overview */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Target className="h-4 w-4 text-primary" />
                Overview
              </div>
              <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                {instructions.overview}
              </p>
            </div>

            <Separator />

            {/* Execution Steps */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ListChecks className="h-4 w-4 text-primary" />
                What AI Will Do
              </div>
              <div className="space-y-2">
                {instructions.steps.map((step, index) => (
                  <div key={index} className="flex items-start gap-3 text-sm">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                      {index + 1}
                    </span>
                    <span className="text-muted-foreground pt-0.5">{step}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* AI Actions */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Zap className="h-4 w-4 text-amber-500" />
                AI-Powered Actions
              </div>
              <div className="grid gap-2">
                {instructions.aiActions.map((action, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground bg-amber-500/5 p-2 rounded-md">
                    <Lightbulb className="h-3 w-3 text-amber-500 flex-shrink-0" />
                    {action}
                  </div>
                ))}
              </div>
            </div>

            {/* Segmentation Logic */}
            {instructions.segmentationLogic && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Target className="h-4 w-4 text-green-500" />
                    Segmentation Logic
                  </div>
                  <div className="space-y-2">
                    {instructions.segmentationLogic.map((logic, index) => (
                      <div key={index} className="text-sm text-muted-foreground bg-green-500/5 p-2 rounded-md border-l-2 border-green-500">
                        {logic}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Expected Output */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-primary" />
                Expected Output
              </div>
              <p className="text-sm text-muted-foreground">{instructions.expectedOutput}</p>
            </div>

            {/* Time Estimate */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Estimated time: {instructions.timeEstimate}
            </div>

            {/* Execution Result */}
            {executionResult && (
              <>
                <Separator />
                <div className={`p-4 rounded-lg ${executionResult.success ? "bg-green-500/10 border border-green-500/30" : "bg-destructive/10 border border-destructive/30"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {executionResult.success ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    )}
                    <span className={`font-medium ${executionResult.success ? "text-green-500" : "text-destructive"}`}>
                      {executionResult.success ? "Task Completed" : "Task Failed"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{executionResult.message}</p>
                  {executionResult.output && (
                    <pre className="mt-2 text-xs bg-background/50 p-2 rounded overflow-auto max-h-32">
                      {JSON.stringify(executionResult.output, null, 2)}
                    </pre>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={handleClose}>
            {executionResult?.success ? "Done" : "Cancel"}
          </Button>
          {!executionResult?.success && (
            <Button onClick={executeTask} disabled={isExecuting}>
              {isExecuting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run Task
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
