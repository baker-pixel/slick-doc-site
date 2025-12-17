import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Plus, Edit, Trash2, RefreshCw, Eye, Copy, Code, Variable, Filter, Sparkles, Loader2, Wand2, Info } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";

// Variable descriptions for tooltips
const VARIABLE_DESCRIPTIONS: Record<string, string> = {
  firstName: "Recipient's first name",
  lastName: "Recipient's last name",
  businessName: "Recipient's business/company name",
  email: "Recipient's email address",
  websiteUrl: "Recipient's website URL",
  schedulingLink: "Link to schedule a call or meeting",
  reportLink: "Link to view a marketing report",
  unsubscribeLink: "Link to unsubscribe from emails",
  dashboardLink: "Link to client dashboard",
  phoneNumber: "Recipient's phone number",
  industry: "Recipient's industry",
  serviceTier: "Client's service tier/package",
  projectName: "Name of current project",
  meetingDate: "Date of scheduled meeting",
  meetingTime: "Time of scheduled meeting",
  resumeToken: "Token to resume gap analysis",
};

interface EmailTemplate {
  id: string;
  name: string;
  slug: string;
  subject: string;
  html_content: string;
  description: string | null;
  variables: string[];
  category: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const DEFAULT_VARIABLES = ["firstName", "lastName", "businessName", "email", "resumeToken"];

const CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "marketing", label: "Marketing" },
  { value: "transactional", label: "Transactional" },
  { value: "notification", label: "Notification" },
  { value: "onboarding", label: "Onboarding" },
  { value: "follow-up", label: "Follow-up" },
  { value: "sales", label: "Sales & Conversion" },
  { value: "customer-success", label: "Customer Success" },
  { value: "engagement", label: "Engagement" },
];

const TEMPLATE_TYPES = [
  { value: "welcome", label: "Welcome Email" },
  { value: "followup", label: "Follow-up" },
  { value: "report", label: "Report Delivery" },
  { value: "promotion", label: "Promotional" },
  { value: "newsletter", label: "Newsletter" },
  { value: "reminder", label: "Reminder" },
  { value: "reengagement", label: "Re-engagement" },
  { value: "thankyou", label: "Thank You" },
];

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly & Casual" },
  { value: "urgent", label: "Urgent" },
  { value: "celebratory", label: "Celebratory" },
  { value: "educational", label: "Educational" },
];

const getCategoryColor = (category: string) => {
  switch (category) {
    case "transactional": return "bg-blue-500/10 text-blue-600 border-blue-200";
    case "notification": return "bg-amber-500/10 text-amber-600 border-amber-200";
    case "onboarding": return "bg-green-500/10 text-green-600 border-green-200";
    case "follow-up": return "bg-purple-500/10 text-purple-600 border-purple-200";
    case "sales": return "bg-rose-500/10 text-rose-600 border-rose-200";
    case "customer-success": return "bg-teal-500/10 text-teal-600 border-teal-200";
    case "engagement": return "bg-indigo-500/10 text-indigo-600 border-indigo-200";
    default: return "bg-primary/10 text-primary border-primary/20";
  }
};

export function EmailTemplatesPanel() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Partial<EmailTemplate>>({});
  const [previewHtml, setPreviewHtml] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  
  // AI Generation state
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiForm, setAiForm] = useState({
    templateType: "followup",
    industry: "",
    tone: "professional",
    purpose: "",
    customInstructions: "",
  });

  const fetchTemplates = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("email_templates")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error fetching templates", description: error.message, variant: "destructive" });
    } else {
      setTemplates(data?.map(t => ({
        ...t,
        variables: Array.isArray(t.variables) ? t.variables as string[] : []
      })) || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleToggleActive = async (template: EmailTemplate) => {
    const { error } = await supabase
      .from("email_templates")
      .update({ is_active: !template.is_active })
      .eq("id", template.id);

    if (error) {
      toast({ title: "Error updating template", description: error.message, variant: "destructive" });
    } else {
      toast({ title: template.is_active ? "Template disabled" : "Template enabled" });
      fetchTemplates();
    }
  };

  const openEditor = (template?: EmailTemplate) => {
    if (template) {
      setEditingTemplate({ ...template });
    } else {
      setEditingTemplate({
        name: "",
        slug: "",
        subject: "",
        html_content: getDefaultHtmlTemplate(),
        description: "",
        variables: DEFAULT_VARIABLES,
        category: "marketing",
        is_active: true,
      });
    }
    setIsEditorOpen(true);
  };

  const filteredTemplates = categoryFilter === "all" 
    ? templates 
    : templates.filter(t => t.category === categoryFilter);

  const getDefaultHtmlTemplate = () => {
    return `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #F97316;">Hi {{firstName}}!</h1>
  <p>Your email content goes here.</p>
  <p>You can use variables like {{businessName}} to personalize.</p>
  <p style="margin: 30px 0;">
    <a href="https://orangedoormarketing.com" 
       style="background: #F97316; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
      Call to Action
    </a>
  </p>
  <p>— The Orange Door Team</p>
</div>`;
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "_")
      .replace(/-+/g, "_");
  };

  const extractVariables = (html: string): string[] => {
    const regex = /\{\{(\w+)\}\}/g;
    const matches = new Set<string>();
    let match;
    while ((match = regex.exec(html)) !== null) {
      matches.add(match[1]);
    }
    return Array.from(matches);
  };

  const saveTemplate = async () => {
    if (!editingTemplate.name || !editingTemplate.subject || !editingTemplate.html_content) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }

    const slug = editingTemplate.slug || generateSlug(editingTemplate.name);
    const variables = extractVariables(editingTemplate.html_content);

    const payload = {
      name: editingTemplate.name!,
      slug,
      subject: editingTemplate.subject!,
      html_content: editingTemplate.html_content!,
      description: editingTemplate.description || null,
      variables,
      category: editingTemplate.category || "marketing",
      is_active: editingTemplate.is_active ?? true,
    };

    let error;
    if (editingTemplate.id) {
      const result = await supabase
        .from("email_templates")
        .update(payload)
        .eq("id", editingTemplate.id);
      error = result.error;
    } else {
      const result = await supabase
        .from("email_templates")
        .insert([payload]);
      error = result.error;
    }

    if (error) {
      toast({ title: "Error saving template", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingTemplate.id ? "Template updated" : "Template created" });
      setIsEditorOpen(false);
      fetchTemplates();
    }
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await supabase
      .from("email_templates")
      .delete()
      .eq("id", id);

    if (error) {
      toast({ title: "Error deleting template", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Template deleted" });
      fetchTemplates();
    }
  };

  const duplicateTemplate = async (template: EmailTemplate) => {
    const { error } = await supabase
      .from("email_templates")
      .insert([{
        name: `${template.name} (Copy)`,
        slug: `${template.slug}_copy_${Date.now()}`,
        subject: template.subject,
        html_content: template.html_content,
        description: template.description,
        variables: template.variables,
        category: template.category,
        is_active: false,
      }]);

    if (error) {
      toast({ title: "Error duplicating template", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Template duplicated" });
      fetchTemplates();
    }
  };

  const openPreview = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    // Replace variables with sample data for preview
    let html = template.html_content;
    const sampleData: Record<string, string> = {
      firstName: "John",
      lastName: "Doe",
      businessName: "Acme Corp",
      email: "john@example.com",
      resumeToken: "sample-token-123",
    };
    Object.entries(sampleData).forEach(([key, value]) => {
      html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    });
    setPreviewHtml(html);
    setIsPreviewOpen(true);
  };

  const generateWithAI = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-email-template", {
        body: aiForm,
      });

      if (error) throw error;
      if (!data?.success || !data?.template) {
        throw new Error(data?.error || "Failed to generate template");
      }

      // Save the generated template to the database
      const { error: saveError } = await supabase
        .from("email_templates")
        .insert([{
          name: data.template.name,
          slug: data.template.slug + "_" + Date.now(),
          subject: data.template.subject,
          html_content: data.template.html_content,
          description: data.template.description,
          variables: data.template.variables,
          category: data.template.category,
          is_active: true,
        }]);

      if (saveError) throw saveError;

      toast({ title: "Template generated!", description: `Created: ${data.template.name}` });
      setIsAiDialogOpen(false);
      setAiForm({
        templateType: "followup",
        industry: "",
        tone: "professional",
        purpose: "",
        customInstructions: "",
      });
      fetchTemplates();
    } catch (error: any) {
      console.error("AI generation error:", error);
      toast({ 
        title: "Generation failed", 
        description: error.message || "Failed to generate template",
        variant: "destructive" 
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const regenerateTemplate = async (template: EmailTemplate) => {
    setAiForm({
      templateType: "followup",
      industry: "",
      tone: "professional",
      purpose: template.description || "",
      customInstructions: `Regenerate and improve the template: ${template.name}`,
    });
    setIsAiDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Email Templates</h2>
          <p className="text-muted-foreground">Create and manage custom email templates</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={fetchTemplates} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="secondary" onClick={() => setIsAiDialogOpen(true)}>
            <Sparkles className="w-4 h-4 mr-2" />
            AI Generate
          </Button>
          <Button onClick={() => openEditor()}>
            <Plus className="w-4 h-4 mr-2" />
            New Template
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-20 bg-muted/50" />
              <CardContent className="h-24 bg-muted/30" />
            </Card>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No email templates</h3>
          <p className="text-muted-foreground mb-4">Create your first custom email template</p>
          <Button onClick={() => openEditor()}>
            <Plus className="w-4 h-4 mr-2" />
            Create Template
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map(template => (
            <Card key={template.id} className={!template.is_active ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {template.name}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={getCategoryColor(template.category)}>
                        {template.category}
                      </Badge>
                      <Badge variant={template.is_active ? "default" : "secondary"}>
                        {template.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 font-mono">
                      {template.slug}
                    </p>
                  </div>
                  <Switch
                    checked={template.is_active}
                    onCheckedChange={() => handleToggleActive(template)}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm font-medium truncate">{template.subject}</p>
                {template.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>
                )}
                <TooltipProvider>
                  <div className="flex flex-wrap gap-1">
                    {template.variables.slice(0, 4).map(v => (
                      <Tooltip key={v}>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="text-xs cursor-help">
                            {`{{${v}}}`}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">{VARIABLE_DESCRIPTIONS[v] || `Custom variable: ${v}`}</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                    {template.variables.length > 4 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="text-xs cursor-help">
                            +{template.variables.length - 4} more
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">{template.variables.slice(4).map(v => `{{${v}}}`).join(", ")}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TooltipProvider>

                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    Updated {format(new Date(template.updated_at), "MMM d, yyyy")}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openPreview(template)} title="Preview">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => regenerateTemplate(template)} title="AI Regenerate">
                      <Wand2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => duplicateTemplate(template)} title="Duplicate">
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditor(template)} title="Edit">
                      <Edit className="w-4 h-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Template</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{template.name}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteTemplate(template.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Editor Dialog */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate.id ? "Edit Template" : "Create New Template"}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="content" className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="html">HTML Code</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            
            <TabsContent value="content" className="space-y-4 mt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Template Name *</Label>
                  <Input
                    value={editingTemplate.name || ""}
                    onChange={e => {
                      const name = e.target.value;
                      setEditingTemplate({
                        ...editingTemplate,
                        name,
                        slug: editingTemplate.id ? editingTemplate.slug : generateSlug(name)
                      });
                    }}
                    placeholder="e.g., Welcome Email"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slug (used in sequences)</Label>
                  <Input
                    value={editingTemplate.slug || ""}
                    onChange={e => setEditingTemplate({ ...editingTemplate, slug: e.target.value })}
                    placeholder="e.g., welcome_email"
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Subject Line *</Label>
                <Input
                  value={editingTemplate.subject || ""}
                  onChange={e => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                  placeholder="e.g., Welcome to Orange Door Marketing!"
                />
                <p className="text-xs text-muted-foreground">
                  You can use variables like {"{{firstName}}"} in the subject
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={editingTemplate.category || "marketing"}
                    onValueChange={value => setEditingTemplate({ ...editingTemplate, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.filter(c => c.value !== "all").map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Textarea
                    value={editingTemplate.description || ""}
                    onChange={e => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                    placeholder="Brief description"
                    rows={2}
                  />
                </div>
              </div>
              <Card className="p-4 bg-muted/30">
                <div className="flex items-center gap-2 mb-3">
                  <Variable className="w-4 h-4 text-primary" />
                  <Label className="text-sm font-medium">Available Variables</Label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_VARIABLES.map(v => (
                    <Badge
                      key={v}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10"
                      onClick={() => {
                        navigator.clipboard.writeText(`{{${v}}}`);
                        toast({ title: `Copied {{${v}}} to clipboard` });
                      }}
                    >
                      {`{{${v}}}`}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Click a variable to copy it. Use them in your HTML with double curly braces.
                </p>
              </Card>
            </TabsContent>

            <TabsContent value="html" className="space-y-4 mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Code className="w-4 h-4 text-primary" />
                <Label>HTML Content *</Label>
              </div>
              <Textarea
                value={editingTemplate.html_content || ""}
                onChange={e => setEditingTemplate({ ...editingTemplate, html_content: e.target.value })}
                placeholder="Enter your HTML email content here..."
                className="font-mono text-sm min-h-[400px]"
              />
              <p className="text-xs text-muted-foreground">
                Write valid HTML. Use inline styles for best email client compatibility.
              </p>
            </TabsContent>

            <TabsContent value="preview" className="mt-4">
              <div className="border rounded-lg p-4 bg-white min-h-[400px]">
                <div className="mb-4 pb-4 border-b">
                  <p className="text-sm text-muted-foreground">Subject:</p>
                  <p className="font-medium">
                    {(editingTemplate.subject || "").replace(/\{\{(\w+)\}\}/g, (_, key) => {
                      const sampleData: Record<string, string> = {
                        firstName: "John",
                        lastName: "Doe",
                        businessName: "Acme Corp",
                      };
                      return sampleData[key] || `{{${key}}}`;
                    })}
                  </p>
                </div>
                <div
                  dangerouslySetInnerHTML={{
                    __html: (editingTemplate.html_content || "").replace(/\{\{(\w+)\}\}/g, (_, key) => {
                      const sampleData: Record<string, string> = {
                        firstName: "John",
                        lastName: "Doe",
                        businessName: "Acme Corp",
                        email: "john@example.com",
                        resumeToken: "sample-token-123",
                      };
                      return sampleData[key] || `{{${key}}}`;
                    })
                  }}
                />
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>Cancel</Button>
            <Button onClick={saveTemplate}>
              {editingTemplate.id ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview: {selectedTemplate?.name}</DialogTitle>
          </DialogHeader>
          <div className="border rounded-lg p-4 bg-white mt-4">
            <div className="mb-4 pb-4 border-b">
              <p className="text-sm text-muted-foreground">Subject:</p>
              <p className="font-medium">
                {selectedTemplate?.subject.replace(/\{\{(\w+)\}\}/g, (_, key) => {
                  const sampleData: Record<string, string> = {
                    firstName: "John",
                    lastName: "Doe",
                    businessName: "Acme Corp",
                  };
                  return sampleData[key] || `{{${key}}}`;
                })}
              </p>
            </div>
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>Close</Button>
            <Button onClick={() => { setIsPreviewOpen(false); openEditor(selectedTemplate!); }}>
              <Edit className="w-4 h-4 mr-2" />
              Edit Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Generation Dialog */}
      <Dialog open={isAiDialogOpen} onOpenChange={setIsAiDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Template Generator
            </DialogTitle>
            <DialogDescription>
              Generate a professional email template using AI
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Template Type</Label>
              <Select value={aiForm.templateType} onValueChange={v => setAiForm({ ...aiForm, templateType: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tone</Label>
              <Select value={aiForm.tone} onValueChange={v => setAiForm({ ...aiForm, tone: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Industry (optional)</Label>
              <Input
                value={aiForm.industry}
                onChange={e => setAiForm({ ...aiForm, industry: e.target.value })}
                placeholder="e.g., Real estate, Healthcare, Retail..."
              />
            </div>
            <div className="space-y-2">
              <Label>Purpose (optional)</Label>
              <Textarea
                value={aiForm.purpose}
                onChange={e => setAiForm({ ...aiForm, purpose: e.target.value })}
                placeholder="Describe what this email should accomplish..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Custom Instructions (optional)</Label>
              <Textarea
                value={aiForm.customInstructions}
                onChange={e => setAiForm({ ...aiForm, customInstructions: e.target.value })}
                placeholder="Any specific requirements or content to include..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAiDialogOpen(false)} disabled={isGenerating}>
              Cancel
            </Button>
            <Button onClick={generateWithAI} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Template
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}