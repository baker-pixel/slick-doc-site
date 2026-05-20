import { useState, useEffect, useMemo } from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import { getClientPortalOrigin } from "@/lib/getPortalUrl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Send, Calendar, Users, FileText, Clock, CheckCircle, AlertCircle, Loader2, Eye, Plus, Trash2, Building2, Info, Sparkles, Wand2 } from "lucide-react";
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
  variables: string[];
  category: string;
}

interface Recipient {
  email: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
}

interface QueuedEmail {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  status: string;
  scheduled_for: string;
  created_at: string;
  metadata: any;
}

interface ClientAccount {
  id: string;
  business_name: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  industry: string | null;
}

// Auto-populated variable values
const AUTO_FILL_VARIABLES: Record<string, string> = {
  schedulingLink: "https://calendly.com/orangedoormarketing/discovery",
  unsubscribeLink: "{{unsubscribeLink}}", // Will be replaced by tracking system
  dashboardLink: `${getClientPortalOrigin()}/portal`,
  websiteUrl: "https://orangedoormarketing.com",
};

// Variables that come from recipient data (not editable globally)
const RECIPIENT_VARIABLES = ["firstName", "lastName", "businessName", "email"];

const RECIPIENT_SOURCES = [
  { value: "manual", label: "Enter manually" },
  { value: "client", label: "Selected Client" },
  { value: "gap_analysis", label: "Gap Analysis Submissions" },
  { value: "contact_submissions", label: "Contact Form Submissions" },
  { value: "pdf_leads", label: "PDF Download Leads" },
];

export function CampaignSenderPanel() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [recipientSource, setRecipientSource] = useState("manual");
  const [manualRecipients, setManualRecipients] = useState<Recipient[]>([{ email: "", firstName: "" }]);
  const [sourceRecipients, setSourceRecipients] = useState<Recipient[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("10:00");
  const [isSending, setIsSending] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [queuedEmails, setQueuedEmails] = useState<QueuedEmail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Client selection state
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  // Custom email state (AI generated)
  const [useCustomEmail, setUseCustomEmail] = useState(false);
  const [customSubject, setCustomSubject] = useState("");
  const [customHtml, setCustomHtml] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const selectedClient = useMemo(() => 
    clients.find(c => c.id === selectedClientId), 
    [clients, selectedClientId]
  );

  useEffect(() => {
    fetchTemplates();
    fetchQueuedEmails();
    fetchClients();
  }, []);

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from("client_accounts")
      .select("id, business_name, email, first_name, last_name, industry")
      .order("business_name");

    if (!error && data) {
      setClients(data);
    }
  };

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from("email_templates")
      .select("id, name, slug, subject, html_content, variables, category")
      .eq("is_active", true)
      .order("name");

    if (!error && data) {
      setTemplates(data.map(t => ({
        ...t,
        variables: Array.isArray(t.variables) ? t.variables as string[] : []
      })));
    }
  };

  const fetchQueuedEmails = async () => {
    setIsLoading(true);
    let query = supabase
      .from("email_queue")
      .select("*")
      .in("status", ["pending", "scheduled"])
      .order("scheduled_for", { ascending: true })
      .limit(50);

    const { data, error } = await query;

    if (!error && data) {
      // Filter by selected client if one is selected
      if (selectedClientId && selectedClient) {
        const filteredEmails = data.filter(e => 
          e.recipient_email.toLowerCase() === selectedClient.email.toLowerCase() ||
          (e.metadata as any)?.client_id === selectedClientId
        );
        setQueuedEmails(filteredEmails);
      } else {
        setQueuedEmails(data);
      }
    }
    setIsLoading(false);
  };

  // Refetch when client changes
  useEffect(() => {
    if (selectedClientId) {
      fetchQueuedEmails();
    }
  }, [selectedClientId]);

  const fetchSourceRecipients = async (source: string) => {
    let recipients: Recipient[] = [];

    if (source === "client" && selectedClient) {
      recipients = [{
        email: selectedClient.email,
        firstName: selectedClient.first_name || undefined,
        lastName: selectedClient.last_name || undefined,
        businessName: selectedClient.business_name
      }];
    } else if (source === "gap_analysis") {
      const { data } = await supabase
        .from("gap_analysis_submissions")
        .select("email, first_name, last_name, business_name")
        .eq("status", "submitted")
        .order("created_at", { ascending: false })
        .limit(100);
      
      if (data) {
        recipients = data.map(d => ({
          email: d.email,
          firstName: d.first_name,
          lastName: d.last_name,
          businessName: d.business_name
        }));
      }
    } else if (source === "contact_submissions") {
      const { data } = await supabase
        .from("contact_submissions")
        .select("email, first_name, last_name, business_name")
        .order("created_at", { ascending: false })
        .limit(100);
      
      if (data) {
        recipients = data.map(d => ({
          email: d.email,
          firstName: d.first_name,
          lastName: d.last_name,
          businessName: d.business_name
        }));
      }
    } else if (source === "pdf_leads") {
      const { data } = await supabase
        .from("pdf_leads")
        .select("email, first_name")
        .order("created_at", { ascending: false })
        .limit(100);
      
      if (data) {
        recipients = data.map(d => ({
          email: d.email,
          firstName: d.first_name || undefined
        }));
      }
    }

    // Filter out duplicates
    const uniqueRecipients = recipients.filter((r, i, arr) => 
      arr.findIndex(x => x.email === r.email) === i
    );

    setSourceRecipients(uniqueRecipients);
    setSelectedRecipients(new Set(uniqueRecipients.map(r => r.email)));
  };

  useEffect(() => {
    if (recipientSource !== "manual") {
      fetchSourceRecipients(recipientSource);
    } else {
      setSourceRecipients([]);
      setSelectedRecipients(new Set());
    }
  }, [recipientSource]);

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    setSelectedTemplate(template || null);
    
    // Initialize variable values - auto-fill known variables
    if (template) {
      const initialValues: Record<string, string> = {};
      template.variables.forEach(v => {
        // Skip recipient-specific variables (populated per-recipient)
        if (RECIPIENT_VARIABLES.includes(v)) return;
        
        // Auto-fill known variables
        if (AUTO_FILL_VARIABLES[v]) {
          initialValues[v] = AUTO_FILL_VARIABLES[v];
        } else if (selectedClient) {
          // Try to populate from selected client
          if (v === "industry" && selectedClient.industry) {
            initialValues[v] = selectedClient.industry;
          } else {
            initialValues[v] = "";
          }
        } else {
          initialValues[v] = "";
        }
      });
      setVariableValues(initialValues);
    }
  };

  // Update variables when client changes
  useEffect(() => {
    if (selectedTemplate && selectedClient) {
      setVariableValues(prev => ({
        ...prev,
        ...(selectedClient.industry ? { industry: selectedClient.industry } : {}),
      }));
    }
  }, [selectedClient, selectedTemplate]);

  const addManualRecipient = () => {
    setManualRecipients([...manualRecipients, { email: "", firstName: "" }]);
  };

  const removeManualRecipient = (index: number) => {
    setManualRecipients(manualRecipients.filter((_, i) => i !== index));
  };

  const updateManualRecipient = (index: number, field: keyof Recipient, value: string) => {
    const updated = [...manualRecipients];
    updated[index] = { ...updated[index], [field]: value };
    setManualRecipients(updated);
  };

  const toggleRecipient = (email: string) => {
    const newSelected = new Set(selectedRecipients);
    if (newSelected.has(email)) {
      newSelected.delete(email);
    } else {
      newSelected.add(email);
    }
    setSelectedRecipients(newSelected);
  };

  const selectAllRecipients = () => {
    setSelectedRecipients(new Set(sourceRecipients.map(r => r.email)));
  };

  const deselectAllRecipients = () => {
    setSelectedRecipients(new Set());
  };

  const getRecipients = (): Recipient[] => {
    if (recipientSource === "manual") {
      return manualRecipients.filter(r => r.email.trim());
    }
    return sourceRecipients.filter(r => selectedRecipients.has(r.email));
  };

  const replaceVariables = (content: string, recipient: Recipient): string => {
    let result = content;
    result = result.replace(/\{\{firstName\}\}/g, recipient.firstName || "there");
    result = result.replace(/\{\{lastName\}\}/g, recipient.lastName || "");
    result = result.replace(/\{\{businessName\}\}/g, recipient.businessName || "{{businessName}}");
    result = result.replace(/\{\{email\}\}/g, recipient.email);
    
    Object.entries(variableValues).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || `[${key}]`);
    });
    
    return result;
  };

  const openPreview = () => {
    const sampleRecipient = getRecipients()[0] || { email: "sample@example.com", firstName: "John" };
    
    if (useCustomEmail) {
      const html = replaceVariables(customHtml, sampleRecipient);
      setPreviewHtml(html);
    } else if (selectedTemplate) {
      const html = replaceVariables(selectedTemplate.html_content, sampleRecipient);
      setPreviewHtml(html);
    } else {
      return;
    }
    setIsPreviewOpen(true);
  };

  const generateAIEmail = async () => {
    if (!aiPrompt.trim()) {
      toast({ title: "Please describe the email you want", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-email-template", {
        body: {
          templateType: "custom",
          purpose: aiPrompt,
          tone: "professional",
          clientName: selectedClient?.business_name,
          industry: selectedClient?.industry,
          customInstructions: aiPrompt
        }
      });

      if (error) throw error;

      if (data?.subject && data?.htmlContent) {
        setCustomSubject(data.subject);
        setCustomHtml(data.htmlContent);
        toast({ title: "Email generated!", description: "Review and edit as needed" });
      } else {
        throw new Error("Invalid response from AI");
      }
    } catch (error: any) {
      console.error("AI generation error:", error);
      toast({ 
        title: "Failed to generate email", 
        description: error.message,
        variant: "destructive" 
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const sendCampaign = async () => {
    // Validate email content
    if (useCustomEmail) {
      if (!customSubject.trim() || !customHtml.trim()) {
        toast({ title: "Please generate or enter email content", variant: "destructive" });
        return;
      }
    } else if (!selectedTemplate) {
      toast({ title: "Please select a template", variant: "destructive" });
      return;
    }

    const recipients = getRecipients();
    if (recipients.length === 0) {
      toast({ title: "Please add at least one recipient", variant: "destructive" });
      return;
    }

    // Check for unfilled variables (only for templates)
    if (!useCustomEmail) {
      const unfilledVars = Object.entries(variableValues)
        .filter(([_, value]) => !value.trim())
        .map(([key]) => key);
      
      if (unfilledVars.length > 0) {
        toast({ 
          title: "Missing variable values", 
          description: `Please fill in: ${unfilledVars.join(", ")}`,
          variant: "destructive" 
        });
        return;
      }
    }

    setIsSending(true);

    try {
      // Calculate scheduled time
      let scheduledFor = new Date();
      if (isScheduled && scheduledDate) {
        const [hours, minutes] = scheduledTime.split(":").map(Number);
        scheduledFor = new Date(scheduledDate);
        scheduledFor.setHours(hours, minutes, 0, 0);
      }

      // Queue emails for each recipient
      const emailsToQueue = recipients.map(recipient => ({
        recipient_email: recipient.email,
        recipient_name: [recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || null,
        subject: useCustomEmail 
          ? replaceVariables(customSubject, recipient)
          : replaceVariables(selectedTemplate!.subject, recipient),
        html_content: useCustomEmail 
          ? replaceVariables(customHtml, recipient)
          : replaceVariables(selectedTemplate!.html_content, recipient),
        scheduled_for: scheduledFor.toISOString(),
        status: isScheduled ? "scheduled" : "pending",
        metadata: useCustomEmail 
          ? { custom_email: true, campaign_sent_at: new Date().toISOString() }
          : {
              template_id: selectedTemplate!.id,
              template_slug: selectedTemplate!.slug,
              campaign_sent_at: new Date().toISOString()
            }
      }));

      const { error } = await supabase
        .from("email_queue")
        .insert(emailsToQueue);

      if (error) throw error;

      toast({ 
        title: isScheduled ? "Campaign scheduled!" : "Campaign queued!",
        description: `${recipients.length} emails ${isScheduled ? "scheduled for " + format(scheduledFor, "MMM d, h:mm a") : "queued for sending"}`
      });

      // Reset form
      setSelectedTemplate(null);
      setVariableValues({});
      setCustomSubject("");
      setCustomHtml("");
      setAiPrompt("");
      if (recipientSource === "manual") {
        setManualRecipients([{ email: "", firstName: "" }]);
      }
      fetchQueuedEmails();

    } catch (error: any) {
      toast({ 
        title: "Error sending campaign", 
        description: error.message,
        variant: "destructive" 
      });
    } finally {
      setIsSending(false);
    }
  };

  const cancelQueuedEmail = async (id: string) => {
    const { error } = await supabase
      .from("email_queue")
      .delete()
      .eq("id", id);

    if (error) {
      toast({ title: "Error canceling email", variant: "destructive" });
    } else {
      toast({ title: "Email canceled" });
      fetchQueuedEmails();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-amber-500/10 text-amber-600";
      case "scheduled": return "bg-blue-500/10 text-blue-600";
      case "sent": return "bg-green-500/10 text-green-600";
      case "failed": return "bg-red-500/10 text-red-600";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Campaign Sender</h2>
          <p className="text-muted-foreground">Send emails manually or schedule campaigns for clients</p>
        </div>
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <Select value={selectedClientId} onValueChange={setSelectedClientId}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Select a client..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients.map(client => (
                <SelectItem key={client.id} value={client.id}>
                  {client.business_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="compose" className="space-y-6">
        <TabsList>
          <TabsTrigger value="compose" className="gap-2">
            <Send className="w-4 h-4" />
            Compose
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="gap-2">
            <Calendar className="w-4 h-4" />
            Scheduled ({queuedEmails.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Template or Custom Email */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {useCustomEmail ? <Sparkles className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                    {useCustomEmail ? "AI Generated Email" : "Select Template"}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">AI Generate</Label>
                    <Switch
                      checked={useCustomEmail}
                      onCheckedChange={(checked) => {
                        setUseCustomEmail(checked);
                        if (checked) {
                          setSelectedTemplate(null);
                        } else {
                          setCustomSubject("");
                          setCustomHtml("");
                          setAiPrompt("");
                        }
                      }}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {useCustomEmail ? (
                  <>
                    <div className="space-y-2">
                      <Label>Describe your email</Label>
                      <Textarea
                        placeholder="E.g., A follow-up email thanking the client for their meeting and summarizing next steps..."
                        value={aiPrompt}
                        onChange={e => setAiPrompt(e.target.value)}
                        rows={3}
                      />
                      <Button 
                        onClick={generateAIEmail} 
                        disabled={isGenerating || !aiPrompt.trim()}
                        className="w-full"
                      >
                        {isGenerating ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Wand2 className="w-4 h-4 mr-2" />
                        )}
                        Generate Email
                      </Button>
                    </div>

                    {customSubject && (
                      <div className="space-y-3 pt-2 border-t">
                        <div className="space-y-2">
                          <Label>Subject</Label>
                          <Input
                            value={customSubject}
                            onChange={e => setCustomSubject(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>HTML Content</Label>
                          <Textarea
                            value={customHtml}
                            onChange={e => setCustomHtml(e.target.value)}
                            rows={6}
                            className="font-mono text-xs"
                          />
                        </div>
                        <Button variant="outline" size="sm" onClick={openPreview}>
                          <Eye className="w-4 h-4 mr-2" />
                          Preview
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <Select 
                      value={selectedTemplate?.id || ""} 
                      onValueChange={handleTemplateSelect}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map(t => (
                          <SelectItem key={t.id} value={t.id}>
                            <div className="flex items-center gap-2">
                              <span>{t.name}</span>
                              <Badge variant="outline" className="text-xs">{t.category}</Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {selectedTemplate && (
                      <div className="space-y-3 pt-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Subject</Label>
                          <p className="font-medium">{selectedTemplate.subject}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={openPreview}>
                          <Eye className="w-4 h-4 mr-2" />
                          Preview
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Variable Values */}
            {!useCustomEmail && selectedTemplate && Object.keys(variableValues).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Template Variables</CardTitle>
                  <CardDescription>Fill in the dynamic content</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <TooltipProvider>
                    {Object.keys(variableValues).map(key => (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm">{`{{${key}}}`}</Label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">{VARIABLE_DESCRIPTIONS[key] || `Custom variable: ${key}`}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <Input
                          value={variableValues[key]}
                          onChange={e => setVariableValues({ ...variableValues, [key]: e.target.value })}
                          placeholder={VARIABLE_DESCRIPTIONS[key] || `Enter ${key}...`}
                        />
                      </div>
                    ))}
                  </TooltipProvider>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Recipients */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5" />
                Recipients
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4 flex-wrap">
                {RECIPIENT_SOURCES.map(source => (
                  <label key={source.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="recipientSource"
                      value={source.value}
                      checked={recipientSource === source.value}
                      onChange={e => setRecipientSource(e.target.value)}
                      className="accent-primary"
                    />
                    <span className="text-sm">{source.label}</span>
                  </label>
                ))}
              </div>

              {recipientSource === "manual" ? (
                <div className="space-y-3">
                  {manualRecipients.map((recipient, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <div className="flex-1 grid gap-2 sm:grid-cols-3">
                        <Input
                          type="email"
                          placeholder="Email address *"
                          value={recipient.email}
                          onChange={e => updateManualRecipient(index, "email", e.target.value)}
                        />
                        <Input
                          placeholder="First name (optional)"
                          value={recipient.firstName || ""}
                          onChange={e => updateManualRecipient(index, "firstName", e.target.value)}
                        />
                        <Input
                          placeholder="Business name (optional)"
                          value={recipient.businessName || ""}
                          onChange={e => updateManualRecipient(index, "businessName", e.target.value)}
                        />
                      </div>
                      {manualRecipients.length > 1 && (
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => removeManualRecipient(index)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addManualRecipient}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Recipient
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {selectedRecipients.size} of {sourceRecipients.length} selected
                    </span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={selectAllRecipients}>
                        Select All
                      </Button>
                      <Button variant="outline" size="sm" onClick={deselectAllRecipients}>
                        Deselect All
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                    {sourceRecipients.length === 0 ? (
                      <p className="p-4 text-center text-muted-foreground text-sm">
                        No recipients found from this source
                      </p>
                    ) : (
                      sourceRecipients.map(recipient => (
                        <label 
                          key={recipient.email}
                          className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedRecipients.has(recipient.email)}
                            onChange={() => toggleRecipient(recipient.email)}
                            className="accent-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{recipient.email}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {[recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || "No name"}
                              {recipient.businessName && ` • ${recipient.businessName}`}
                            </p>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scheduling */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Scheduling
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch
                  checked={isScheduled}
                  onCheckedChange={setIsScheduled}
                />
                <Label>Schedule for later</Label>
              </div>

              {isScheduled && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={scheduledDate}
                      onChange={e => setScheduledDate(e.target.value)}
                      min={format(new Date(), "yyyy-MM-dd")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Time</Label>
                    <Input
                      type="time"
                      value={scheduledTime}
                      onChange={e => setScheduledTime(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Send Button */}
          <div className="flex justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={openPreview} 
              disabled={useCustomEmail ? !customHtml : !selectedTemplate}
            >
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
            <Button 
              onClick={sendCampaign} 
              disabled={isSending || (useCustomEmail ? (!customSubject || !customHtml) : !selectedTemplate)}
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              {isScheduled ? "Schedule Campaign" : "Send Now"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="scheduled" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={fetchQueuedEmails} disabled={isLoading}>
              Refresh
            </Button>
          </div>

          {isLoading ? (
            <Card className="p-8">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
            </Card>
          ) : queuedEmails.length === 0 ? (
            <Card className="p-8 text-center">
              <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-1">No scheduled emails</h3>
              <p className="text-sm text-muted-foreground">
                Compose a campaign and schedule it for later
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {queuedEmails.map(email => (
                <Card key={email.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium truncate">{email.subject}</p>
                        <Badge className={getStatusColor(email.status)}>
                          {email.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        To: {email.recipient_email}
                        {email.recipient_name && ` (${email.recipient_name})`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Scheduled for: {format(new Date(email.scheduled_for), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => cancelQueuedEmail(email.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>
              Preview with sample recipient data
            </DialogDescription>
          </DialogHeader>
          <div 
            className="border rounded-lg p-4 bg-white"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewHtml) }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
