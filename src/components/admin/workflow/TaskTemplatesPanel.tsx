import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Loader2, ListChecks, Zap, ClipboardList, User } from "lucide-react";

interface TaskTemplate {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  category: string;
  tier: string;
  automation_type: string;
  frequency: string | null;
  estimated_minutes: number | null;
  order_index: number;
  is_active: boolean;
  created_at: string;
}

export function TaskTemplatesPanel() {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [tierFilter, setTierFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    instructions: "",
    category: "onboarding",
    tier: "foundation",
    automation_type: "MANUAL",
    frequency: "onboarding",
    estimated_minutes: 30,
    order_index: 0,
    is_active: true,
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("task_templates")
      .select("*")
      .order("tier")
      .order("order_index");

    if (error) {
      toast.error("Failed to fetch templates");
      console.error(error);
    } else {
      setTemplates(data || []);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast.error("Name is required");
      return;
    }

    if (editingTemplate) {
      const { error } = await supabase
        .from("task_templates")
        .update(formData)
        .eq("id", editingTemplate.id);

      if (error) {
        toast.error("Failed to update template");
      } else {
        toast.success("Template updated");
        fetchTemplates();
      }
    } else {
      const { error } = await supabase
        .from("task_templates")
        .insert(formData);

      if (error) {
        toast.error("Failed to create template");
      } else {
        toast.success("Template created");
        fetchTemplates();
      }
    }

    setDialogOpen(false);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("task_templates")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Failed to delete template");
    } else {
      toast.success("Template deleted");
      fetchTemplates();
    }
  };

  const openEditDialog = (template: TaskTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || "",
      instructions: template.instructions || "",
      category: template.category,
      tier: template.tier,
      automation_type: template.automation_type,
      frequency: template.frequency || "onboarding",
      estimated_minutes: template.estimated_minutes || 30,
      order_index: template.order_index,
      is_active: template.is_active,
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingTemplate(null);
    setFormData({
      name: "",
      description: "",
      instructions: "",
      category: "onboarding",
      tier: "foundation",
      automation_type: "MANUAL",
      frequency: "onboarding",
      estimated_minutes: 30,
      order_index: 0,
      is_active: true,
    });
  };

  const getAutomationBadge = (type: string) => {
    switch (type) {
      case "FULL": return <Badge className="bg-green-500"><Zap className="h-3 w-3 mr-1" />FULL</Badge>;
      case "SEMI": return <Badge className="bg-yellow-500"><ClipboardList className="h-3 w-3 mr-1" />SEMI</Badge>;
      default: return <Badge variant="outline"><User className="h-3 w-3 mr-1" />MANUAL</Badge>;
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

  const filteredTemplates = templates.filter(t => {
    if (tierFilter !== "all" && t.tier !== tierFilter) return false;
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    return true;
  });

  const categories = [...new Set(templates.map(t => t.category))];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-5 w-5" />
          Task Templates
        </CardTitle>
        <div className="flex gap-2">
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="foundation">Foundation</SelectItem>
              <SelectItem value="growth">Growth</SelectItem>
              <SelectItem value="transformation">Transformation</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingTemplate ? "Edit Template" : "Add Task Template"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Task Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Send client intake form"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of the task"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Instructions</Label>
                  <Textarea
                    value={formData.instructions}
                    onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                    placeholder="Detailed instructions for completing this task"
                    rows={4}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tier</Label>
                    <Select value={formData.tier} onValueChange={(v) => setFormData({ ...formData, tier: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="foundation">Foundation (Level 1)</SelectItem>
                        <SelectItem value="growth">Growth (Level 2)</SelectItem>
                        <SelectItem value="scale">Scale (Level 3)</SelectItem>
                        <SelectItem value="dominate">Dominate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="onboarding">Onboarding</SelectItem>
                        <SelectItem value="website">Website & Conversion</SelectItem>
                        <SelectItem value="seo">SEO & Visibility</SelectItem>
                        <SelectItem value="ads">Paid Advertising</SelectItem>
                        <SelectItem value="email">Email & Nurturing</SelectItem>
                        <SelectItem value="crm">CRM & Sales</SelectItem>
                        <SelectItem value="reviews">Reviews & Reputation</SelectItem>
                        <SelectItem value="analytics">Analytics & Reporting</SelectItem>
                        <SelectItem value="retention">Retention & Loyalty</SelectItem>
                        <SelectItem value="content">Content Creation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Automation Type</Label>
                    <Select value={formData.automation_type} onValueChange={(v) => setFormData({ ...formData, automation_type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FULL">FULL - Fully Automated</SelectItem>
                        <SelectItem value="SEMI">SEMI - AI Assisted</SelectItem>
                        <SelectItem value="MANUAL">MANUAL - Human Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Frequency</Label>
                    <Select value={formData.frequency} onValueChange={(v) => setFormData({ ...formData, frequency: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="onboarding">Onboarding (One-time)</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="as_needed">As Needed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Estimated Minutes</Label>
                    <Input
                      type="number"
                      value={formData.estimated_minutes}
                      onChange={(e) => setFormData({ ...formData, estimated_minutes: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Order Index</Label>
                    <Input
                      type="number"
                      value={formData.order_index}
                      onChange={(e) => setFormData({ ...formData, order_index: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
                  />
                  <Label>Active</Label>
                </div>
                <Button onClick={handleSave} className="w-full">
                  {editingTemplate ? "Update Template" : "Create Template"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No task templates found. Create templates to define your agency's workflow.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Automation</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTemplates.map((template) => (
                <TableRow key={template.id} className={!template.is_active ? "opacity-50" : ""}>
                  <TableCell>
                    <div className="font-medium">{template.name}</div>
                    {template.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1">{template.description}</div>
                    )}
                  </TableCell>
                  <TableCell>{getTierBadge(template.tier)}</TableCell>
                  <TableCell className="capitalize">{template.category}</TableCell>
                  <TableCell>{getAutomationBadge(template.automation_type)}</TableCell>
                  <TableCell className="capitalize">{template.frequency || "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(template)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(template.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}