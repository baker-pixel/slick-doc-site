import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Plus,
  Trash2,
  GripVertical,
  Calendar,
  Target,
  Rocket,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

interface MilestoneTemplate {
  id: string;
  name: string;
  description: string;
  defaultDays: number; // Days from project start
  selected: boolean;
}

interface ProjectSetupWizardProps {
  open: boolean;
  onClose: () => void;
  client: {
    id: string;
    business_name: string;
    tier: string;
  };
  adminPassword: string;
  onSuccess: () => void;
}

const getTierMilestones = (tier: string): MilestoneTemplate[] => {
  const baseMilestones: MilestoneTemplate[] = [
    {
      id: "kickoff",
      name: "Project Kickoff",
      description: "Initial strategy session and goal alignment",
      defaultDays: 0,
      selected: true,
    },
    {
      id: "discovery",
      name: "Discovery & Research",
      description: "Competitor analysis, audience research, current state audit",
      defaultDays: 7,
      selected: true,
    },
  ];

  if (tier === "foundation") {
    return [
      ...baseMilestones,
      {
        id: "gbp_setup",
        name: "Google Business Profile Optimization",
        description: "Complete GBP setup with photos, categories, and business info",
        defaultDays: 10,
        selected: true,
      },
      {
        id: "citation_building",
        name: "Citation Building",
        description: "Submit to top 20 local directories and data aggregators",
        defaultDays: 14,
        selected: true,
      },
      {
        id: "review_strategy",
        name: "Review Generation Strategy",
        description: "Set up review request system and response templates",
        defaultDays: 21,
        selected: true,
      },
      {
        id: "local_seo_audit",
        name: "Local SEO Audit Delivery",
        description: "Present findings and recommendations report",
        defaultDays: 14,
        selected: true,
      },
      {
        id: "website_optimization",
        name: "On-Page SEO Optimization",
        description: "Optimize title tags, meta descriptions, and local schema",
        defaultDays: 28,
        selected: true,
      },
      {
        id: "first_month_review",
        name: "30-Day Performance Review",
        description: "Review initial results and adjust strategy",
        defaultDays: 30,
        selected: true,
      },
    ];
  }

  if (tier === "growth") {
    return [
      ...baseMilestones,
      {
        id: "gbp_setup",
        name: "Google Business Profile Optimization",
        description: "Complete GBP setup with photos, categories, and business info",
        defaultDays: 10,
        selected: true,
      },
      {
        id: "ad_account_setup",
        name: "Ad Account Setup",
        description: "Configure Google/Meta ad accounts and tracking pixels",
        defaultDays: 7,
        selected: true,
      },
      {
        id: "campaign_launch",
        name: "First Campaign Launch",
        description: "Launch initial paid advertising campaigns",
        defaultDays: 14,
        selected: true,
      },
      {
        id: "email_sequences",
        name: "Email Automation Setup",
        description: "Set up welcome sequences and nurture campaigns",
        defaultDays: 21,
        selected: true,
      },
      {
        id: "content_calendar",
        name: "Content Calendar Creation",
        description: "Plan 30 days of social and blog content",
        defaultDays: 14,
        selected: true,
      },
      {
        id: "lead_tracking",
        name: "Lead Tracking Implementation",
        description: "Set up CRM integrations and lead scoring",
        defaultDays: 21,
        selected: true,
      },
      {
        id: "first_month_review",
        name: "30-Day Performance Review",
        description: "Review campaign performance and ROI",
        defaultDays: 30,
        selected: true,
      },
    ];
  }

  // Scale / Transformation tier
  return [
    ...baseMilestones,
    {
      id: "full_audit",
      name: "Comprehensive Marketing Audit",
      description: "Full-funnel analysis across all channels",
      defaultDays: 10,
      selected: true,
    },
    {
      id: "strategy_presentation",
      name: "Strategy Presentation",
      description: "Present 90-day marketing roadmap",
      defaultDays: 14,
      selected: true,
    },
    {
      id: "tech_stack_setup",
      name: "Marketing Tech Stack Setup",
      description: "CRM, automation, analytics, and integrations",
      defaultDays: 21,
      selected: true,
    },
    {
      id: "campaign_launch",
      name: "Multi-Channel Campaign Launch",
      description: "Launch coordinated campaigns across all channels",
      defaultDays: 28,
      selected: true,
    },
    {
      id: "content_engine",
      name: "Content Engine Activation",
      description: "Blog, social, email, and video content production",
      defaultDays: 21,
      selected: true,
    },
    {
      id: "conversion_optimization",
      name: "Conversion Rate Optimization",
      description: "Landing page tests and funnel optimization",
      defaultDays: 35,
      selected: true,
    },
    {
      id: "attribution_setup",
      name: "Attribution & Reporting Setup",
      description: "Multi-touch attribution and executive dashboards",
      defaultDays: 28,
      selected: true,
    },
    {
      id: "first_month_review",
      name: "30-Day Performance Review",
      description: "Review results across all channels",
      defaultDays: 30,
      selected: true,
    },
    {
      id: "quarterly_planning",
      name: "Quarterly Strategy Session",
      description: "Plan next quarter based on learnings",
      defaultDays: 90,
      selected: true,
    },
  ];
};

const getTierIcon = (tier: string) => {
  switch (tier) {
    case "foundation":
      return <Target className="h-5 w-5" />;
    case "growth":
      return <Rocket className="h-5 w-5" />;
    default:
      return <TrendingUp className="h-5 w-5" />;
  }
};

const getTierProjectName = (tier: string) => {
  switch (tier) {
    case "foundation":
      return "Local SEO Setup";
    case "growth":
      return "Marketing Campaign Launch";
    default:
      return "Full Marketing OS Implementation";
  }
};

export function ProjectSetupWizard({
  open,
  onClose,
  client,
  adminPassword,
  onSuccess,
}: ProjectSetupWizardProps) {
  const [step, setStep] = useState<"details" | "milestones">("details");
  const [loading, setLoading] = useState(false);
  
  // Project details
  const [projectName, setProjectName] = useState(`${client.business_name} — ${getTierProjectName(client.tier)}`);
  const [projectDescription, setProjectDescription] = useState(
    `${client.tier.charAt(0).toUpperCase() + client.tier.slice(1)} tier project for ${client.business_name}`
  );
  
  // Milestones
  const [milestones, setMilestones] = useState<MilestoneTemplate[]>(
    getTierMilestones(client.tier)
  );
  const [customMilestoneName, setCustomMilestoneName] = useState("");
  const [customMilestoneDesc, setCustomMilestoneDesc] = useState("");
  const [customMilestoneDays, setCustomMilestoneDays] = useState(14);

  const handleToggleMilestone = (id: string) => {
    setMilestones((prev) =>
      prev.map((m) => (m.id === id ? { ...m, selected: !m.selected } : m))
    );
  };

  const handleAddCustomMilestone = () => {
    if (!customMilestoneName.trim()) return;
    
    const newMilestone: MilestoneTemplate = {
      id: `custom_${Date.now()}`,
      name: customMilestoneName,
      description: customMilestoneDesc || "Custom milestone",
      defaultDays: customMilestoneDays,
      selected: true,
    };
    
    setMilestones((prev) => [...prev, newMilestone]);
    setCustomMilestoneName("");
    setCustomMilestoneDesc("");
    setCustomMilestoneDays(14);
  };

  const handleRemoveMilestone = (id: string) => {
    setMilestones((prev) => prev.filter((m) => m.id !== id));
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      toast.error("Project name is required");
      return;
    }

    const selectedMilestones = milestones.filter((m) => m.selected);
    if (selectedMilestones.length === 0) {
      toast.error("Select at least one milestone");
      return;
    }

    setLoading(true);
    try {
      const resp = await supabase.functions.invoke("admin", {
        body: {
          action: "create_project_with_milestones",
          password: adminPassword,
          data: {
            client_account_id: client.id,
            name: projectName,
            description: projectDescription || null,
            milestones: selectedMilestones.map((m, index) => ({
              name: m.name,
              description: m.description,
              days_from_start: m.defaultDays,
              sort_order: index,
            })),
          },
        },
      });

      if (resp.error) throw resp.error;
      if ((resp.data as any)?.error) throw new Error((resp.data as any).error);

      toast.success(`Project created with ${selectedMilestones.length} milestones!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = milestones.filter((m) => m.selected).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getTierIcon(client.tier)}
            <span>Create Project for {client.business_name}</span>
            <Badge variant="outline" className="ml-2 capitalize">
              {client.tier}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {step === "details" && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Enter project name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-desc">Description (optional)</Label>
              <Textarea
                id="project-desc"
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Brief project description"
                rows={3}
              />
            </div>

            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <h4 className="font-medium text-sm">What's included:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• {milestones.length} recommended milestones for {client.tier} tier</li>
                <li>• Automatic due date calculation based on project start</li>
                <li>• Client visibility in their portal</li>
                <li>• Progress tracking and notifications</li>
              </ul>
            </div>
          </div>
        )}

        {step === "milestones" && (
          <div className="flex-1 overflow-hidden flex flex-col py-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Select milestones to include ({selectedCount} selected)
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setMilestones((prev) =>
                    prev.map((m) => ({ ...m, selected: true }))
                  )
                }
              >
                Select All
              </Button>
            </div>

            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-2">
                {milestones.map((milestone) => (
                  <div
                    key={milestone.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                      milestone.selected
                        ? "bg-primary/5 border-primary/20"
                        : "bg-muted/30 border-transparent"
                    }`}
                  >
                    <Checkbox
                      checked={milestone.selected}
                      onCheckedChange={() => handleToggleMilestone(milestone.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{milestone.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          <Calendar className="h-3 w-3 mr-1" />
                          Day {milestone.defaultDays}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {milestone.description}
                      </p>
                    </div>
                    {milestone.id.startsWith("custom_") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleRemoveMilestone(milestone.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add custom milestone */}
              <div className="mt-4 p-4 border border-dashed rounded-lg space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add Custom Milestone
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Input
                      placeholder="Milestone name"
                      value={customMilestoneName}
                      onChange={(e) => setCustomMilestoneName(e.target.value)}
                    />
                  </div>
                  <Input
                    placeholder="Description (optional)"
                    value={customMilestoneDesc}
                    onChange={(e) => setCustomMilestoneDesc(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Days"
                      value={customMilestoneDays}
                      onChange={(e) => setCustomMilestoneDays(Number(e.target.value))}
                      className="w-20"
                    />
                    <Button
                      variant="secondary"
                      onClick={handleAddCustomMilestone}
                      disabled={!customMilestoneName.trim()}
                      className="flex-1"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "milestones" && (
            <Button variant="outline" onClick={() => setStep("details")}>
              Back
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {step === "details" ? (
            <Button onClick={() => setStep("milestones")}>
              Next: Configure Milestones
            </Button>
          ) : (
            <Button onClick={handleCreateProject} disabled={loading || selectedCount === 0}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Project ({selectedCount} milestones)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
