import { useState, useEffect } from "react";
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
import { Loader2, Plus, Trash2, Calendar, Sparkles, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface MilestoneTemplate {
  id: string;
  name: string;
  description: string;
  defaultDays: number;
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

const GENERIC_STARTERS: MilestoneTemplate[] = [
  { id: "g1", name: "Project Kickoff", description: "Initial strategy session and goal alignment", defaultDays: 3, selected: true },
  { id: "g2", name: "Discovery & Research", description: "Audit, competitor research, current state analysis", defaultDays: 10, selected: true },
  { id: "g3", name: "30-Day Performance Review", description: "Review initial results and adjust strategy", defaultDays: 30, selected: true },
];

export function ProjectSetupWizard({
  open,
  onClose,
  client,
  onSuccess,
  adminPassword,
}: ProjectSetupWizardProps) {
  const [step, setStep] = useState<"details" | "milestones">("details");
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [milestones, setMilestones] = useState<MilestoneTemplate[]>([]);

  const [customMilestoneName, setCustomMilestoneName] = useState("");
  const [customMilestoneDesc, setCustomMilestoneDesc] = useState("");
  const [customMilestoneDays, setCustomMilestoneDays] = useState(14);

  // Reset and fetch AI suggestions every time the dialog opens
  useEffect(() => {
    if (!open) return;
    setStep("details");
    setProjectName("");
    setProjectDescription("");
    setMilestones([]);
    setAiError(null);
    setCustomMilestoneName("");
    setCustomMilestoneDesc("");
    fetchSuggestions();
  }, [open]);

  const fetchSuggestions = async () => {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-client-projects", {
        body: { clientAccountId: client.id, returnOnly: true, password: adminPassword },
      });

      if (error || data?.error) throw new Error(data?.error || "AI unavailable");

      const first = data.projects?.[0];
      if (first) {
        setProjectName(first.name || `${client.business_name} — Project`);
        setProjectDescription(first.description || "");
        setMilestones(
          (first.milestones || []).map((m: any, i: number) => ({
            id: `ai_${i}`,
            name: m.name,
            description: m.description || "",
            defaultDays: typeof m.days_from_start === "number" && m.days_from_start > 0
              ? m.days_from_start
              : (i + 1) * 7,
            selected: true,
          }))
        );
      } else {
        throw new Error("No suggestions returned");
      }
    } catch {
      setAiError("AI suggestions unavailable — loaded SOP templates instead");
      await fetchSOPFallback();
    } finally {
      setAiLoading(false);
    }
  };

  const fetchSOPFallback = async () => {
    try {
      const { data: sop } = await supabase
        .from("sop_documents")
        .select("name, action_items")
        .eq("tier", client.tier)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (sop?.action_items && (sop.action_items as any[]).length > 0) {
        setProjectName(`${client.business_name} — ${sop.name}`);
        setMilestones(
          (sop.action_items as any[]).slice(0, 10).map((item: any, i: number) => ({
            id: `sop_${i}`,
            name: item.step || (item.action || "").slice(0, 80) || `Step ${i + 1}`,
            description: item.action || "",
            defaultDays:
              item.automation_potential === "HIGH" ? 7
              : item.automation_potential === "MEDIUM" ? 14
              : 21,
            selected: true,
          }))
        );
        return;
      }
    } catch {
      // SOP also unavailable — use generic starters
    }

    setProjectName(`${client.business_name} — ${client.tier.charAt(0).toUpperCase() + client.tier.slice(1)} Kickoff`);
    setMilestones(GENERIC_STARTERS);
  };

  const handleToggleMilestone = (id: string) =>
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, selected: !m.selected } : m));

  const handleAddCustomMilestone = () => {
    if (!customMilestoneName.trim()) return;
    setMilestones(prev => [
      ...prev,
      {
        id: `custom_${Date.now()}`,
        name: customMilestoneName,
        description: customMilestoneDesc || "",
        defaultDays: customMilestoneDays,
        selected: true,
      },
    ]);
    setCustomMilestoneName("");
    setCustomMilestoneDesc("");
    setCustomMilestoneDays(14);
  };

  const handleRemoveMilestone = (id: string) =>
    setMilestones(prev => prev.filter(m => m.id !== id));

  const handleCreateProject = async () => {
    const selected = milestones.filter(m => m.selected);
    if (!projectName.trim()) {
      toast.error("Project name is required");
      return;
    }
    if (selected.length === 0) {
      toast.error("Select at least one milestone");
      return;
    }

    setLoading(true);
    try {
      const { error } = await (supabase.rpc as any)("create_project_with_milestones", {
        p_client_account_id: client.id,
        p_name: projectName.trim(),
        p_description: projectDescription.trim() || null,
        p_milestones: selected.map((m, i) => ({
          name: m.name,
          description: m.description || null,
          days_from_start: m.defaultDays,
          sort_order: i,
        })),
      });

      if (error) throw error;

      toast.success(`Project created with ${selected.length} milestones!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = milestones.filter(m => m.selected).length;

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Create Project for {client.business_name}
            <Badge variant="outline" className="ml-2 capitalize">{client.tier}</Badge>
          </DialogTitle>
        </DialogHeader>

        {aiLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Generating AI suggestions for {client.business_name}…</p>
          </div>
        ) : (
          <>
            {aiError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {aiError}
              </div>
            )}

            {step === "details" && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="project-name">Project Name</Label>
                  <Input
                    id="project-name"
                    value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                    placeholder="Enter project name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-desc">Description (optional)</Label>
                  <Textarea
                    id="project-desc"
                    value={projectDescription}
                    onChange={e => setProjectDescription(e.target.value)}
                    placeholder="Brief project description"
                    rows={3}
                  />
                </div>
                <div className="bg-muted/50 rounded-lg p-4 space-y-1 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Ready to review:</p>
                  <p>• {milestones.length} AI-suggested milestones for {client.tier} tier</p>
                  <p>• Due dates calculated from task complexity</p>
                  <p>• You can edit, remove, or add milestones in the next step</p>
                </div>
              </div>
            )}

            {step === "milestones" && (
              <div className="flex-1 overflow-hidden flex flex-col py-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {selectedCount} of {milestones.length} selected
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMilestones(prev => prev.map(m => ({ ...m, selected: true })))}
                  >
                    Select All
                  </Button>
                </div>

                <ScrollArea className="flex-1 -mx-6 px-6">
                  <div className="space-y-2">
                    {milestones.map(milestone => (
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
                          {milestone.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{milestone.description}</p>
                          )}
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
                          onChange={e => setCustomMilestoneName(e.target.value)}
                        />
                      </div>
                      <Input
                        placeholder="Description (optional)"
                        value={customMilestoneDesc}
                        onChange={e => setCustomMilestoneDesc(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="Days"
                          value={customMilestoneDays}
                          onChange={e => setCustomMilestoneDays(Number(e.target.value))}
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
          </>
        )}

        <DialogFooter className="gap-2">
          {step === "milestones" && !aiLoading && (
            <Button variant="outline" onClick={() => setStep("details")}>Back</Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {!aiLoading && (
            step === "details" ? (
              <Button onClick={() => setStep("milestones")} disabled={!projectName.trim()}>
                Next: Review Milestones
              </Button>
            ) : (
              <Button onClick={handleCreateProject} disabled={loading || selectedCount === 0}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Project ({selectedCount} milestones)
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
