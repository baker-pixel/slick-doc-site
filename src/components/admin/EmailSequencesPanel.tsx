import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Json } from "@/integrations/supabase/types";
import { Mail, Plus, Edit, Trash2, Clock, RefreshCw, Eye, Copy, BarChart3, Send, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { EmailSequenceAnalytics } from "./EmailSequenceAnalytics";

interface SequenceEmail {
  delay_hours: number;
  subject: string;
  template: string;
  optimal_send_time?: boolean;
  send_window_start?: number;
  send_window_end?: number;
}

interface SequenceSettings {
  use_recipient_timezone?: boolean;
  default_timezone?: string;
  optimal_send_enabled?: boolean;
  exclude_weekends?: boolean;
  exclude_holidays?: boolean;
}

interface EmailSequence {
  id: string;
  name: string;
  trigger_type: string;
  emails: SequenceEmail[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  settings?: SequenceSettings;
}

const TRIGGER_TYPES = [
  { value: "gap_analysis_complete", label: "Gap Analysis Complete" },
  { value: "gap_analysis_partial", label: "Gap Analysis Partial (Abandoned)" },
  { value: "contact_form", label: "Contact Form Submission" },
  { value: "pdf_download", label: "PDF Download" },
  { value: "booking_confirmed", label: "Booking Confirmed" },
];

const TEMPLATE_OPTIONS = [
  { value: "immediate_report", label: "Immediate Report" },
  { value: "followup_1", label: "Follow-up 1" },
  { value: "followup_2", label: "Follow-up 2" },
  { value: "followup_3", label: "Follow-up 3" },
  { value: "resume_reminder_1", label: "Resume Reminder 1" },
  { value: "resume_reminder_2", label: "Resume Reminder 2" },
  { value: "contact_immediate", label: "Contact Immediate" },
  { value: "contact_followup", label: "Contact Follow-up" },
  { value: "pdf_thankyou", label: "PDF Thank You" },
  { value: "booking_confirmation", label: "Booking Confirmation" },
];

interface CustomTemplate {
  slug: string;
  name: string;
}

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
  { value: "UTC", label: "UTC" },
];

export function EmailSequencesPanel() {
  const [sequences, setSequences] = useState<EmailSequence[]>([]);
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [selectedSequence, setSelectedSequence] = useState<EmailSequence | null>(null);
  const [editingSequence, setEditingSequence] = useState<Partial<EmailSequence>>({});
  const [editingEmails, setEditingEmails] = useState<SequenceEmail[]>([]);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testTemplate, setTestTemplate] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const allTemplateOptions = [
    ...TEMPLATE_OPTIONS,
    ...customTemplates.map(t => ({ value: `custom:${t.slug}`, label: `✨ ${t.name}` }))
  ];

  const fetchSequences = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("email_sequences")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error fetching sequences", description: error.message, variant: "destructive" });
    } else {
      setSequences(data?.map(s => ({
        ...s,
        emails: Array.isArray(s.emails) ? (s.emails as unknown as SequenceEmail[]) : []
      })) || []);
    }
    setIsLoading(false);
  };

  const fetchCustomTemplates = async () => {
    const { data, error } = await supabase
      .from("email_templates")
      .select("slug, name")
      .eq("is_active", true)
      .order("name");

    if (!error && data) {
      setCustomTemplates(data);
    }
  };

  useEffect(() => {
    fetchSequences();
    fetchCustomTemplates();
  }, []);

  const handleToggleActive = async (sequence: EmailSequence) => {
    const { error } = await supabase
      .from("email_sequences")
      .update({ is_active: !sequence.is_active })
      .eq("id", sequence.id);

    if (error) {
      toast({ title: "Error updating sequence", description: error.message, variant: "destructive" });
    } else {
      toast({ title: sequence.is_active ? "Sequence disabled" : "Sequence enabled" });
      fetchSequences();
    }
  };

  const openEditor = (sequence?: EmailSequence) => {
    if (sequence) {
      setEditingSequence({ 
        ...sequence,
        settings: sequence.settings || { use_recipient_timezone: true, default_timezone: "America/New_York", optimal_send_enabled: false }
      });
      setEditingEmails([...sequence.emails]);
    } else {
      setEditingSequence({ 
        name: "", 
        trigger_type: "", 
        is_active: true,
        settings: { use_recipient_timezone: true, default_timezone: "America/New_York", optimal_send_enabled: false }
      });
      setEditingEmails([{ delay_hours: 0, subject: "", template: "", optimal_send_time: false }]);
    }
    setIsEditorOpen(true);
  };

  const addEmail = () => {
    const lastEmail = editingEmails[editingEmails.length - 1];
    const newDelay = lastEmail ? lastEmail.delay_hours + 24 : 0;
    setEditingEmails([...editingEmails, { delay_hours: newDelay, subject: "", template: "", optimal_send_time: editingSequence.settings?.optimal_send_enabled || false }]);
  };

  const removeEmail = (index: number) => {
    setEditingEmails(editingEmails.filter((_, i) => i !== index));
  };

  const updateEmail = (index: number, field: keyof SequenceEmail, value: string | number | boolean) => {
    const updated = [...editingEmails];
    updated[index] = { ...updated[index], [field]: value };
    setEditingEmails(updated);
  };

  const updateSettings = (field: keyof SequenceSettings, value: string | boolean) => {
    setEditingSequence({
      ...editingSequence,
      settings: { ...editingSequence.settings, [field]: value }
    });
  };

  const saveSequence = async () => {
    if (!editingSequence.name || !editingSequence.trigger_type || editingEmails.length === 0) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }

    const payload = {
      name: editingSequence.name!,
      trigger_type: editingSequence.trigger_type!,
      emails: editingEmails as unknown as Json,
      is_active: editingSequence.is_active ?? true,
    };

    let error;
    if (editingSequence.id) {
      const result = await supabase
        .from("email_sequences")
        .update(payload)
        .eq("id", editingSequence.id);
      error = result.error;
    } else {
      const result = await supabase
        .from("email_sequences")
        .insert([payload]);
      error = result.error;
    }

    if (error) {
      toast({ title: "Error saving sequence", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingSequence.id ? "Sequence updated" : "Sequence created" });
      setIsEditorOpen(false);
      fetchSequences();
    }
  };

  const deleteSequence = async (id: string) => {
    const { error } = await supabase
      .from("email_sequences")
      .delete()
      .eq("id", id);

    if (error) {
      toast({ title: "Error deleting sequence", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sequence deleted" });
      fetchSequences();
    }
  };

  const duplicateSequence = async (sequence: EmailSequence) => {
    const { error } = await supabase
      .from("email_sequences")
      .insert([{
        name: `${sequence.name} (Copy)`,
        trigger_type: sequence.trigger_type,
        emails: sequence.emails as unknown as Json,
        is_active: false,
      }]);

    if (error) {
      toast({ title: "Error duplicating sequence", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sequence duplicated" });
      fetchSequences();
    }
  };

  const formatDelayTime = (hours: number) => {
    if (hours === 0) return "Immediately";
    if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""}`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (remainingHours === 0) return `${days} day${days > 1 ? "s" : ""}`;
    return `${days}d ${remainingHours}h`;
  };

  const getTriggerLabel = (type: string) => {
    return TRIGGER_TYPES.find(t => t.value === type)?.label || type;
  };

  const openTestModal = (template: string) => {
    setTestTemplate(template);
    setPreviewHtml("");
    setPreviewSubject("");
    setIsTestModalOpen(true);
    loadPreview(template);
  };

  const loadPreview = async (template: string) => {
    setIsLoadingPreview(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-test-email", {
        body: { template, previewOnly: true },
      });
      if (error) throw error;
      setPreviewHtml(data.html);
      setPreviewSubject(data.subject);
    } catch (error: any) {
      toast({ title: "Error loading preview", description: error.message, variant: "destructive" });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const sendTestEmail = async () => {
    if (!testEmail) {
      toast({ title: "Please enter an email address", variant: "destructive" });
      return;
    }
    setIsSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-test-email", {
        body: { template: testTemplate, testEmail },
      });
      if (error) throw error;
      toast({ title: "Test email sent!", description: `Sent to ${testEmail}` });
    } catch (error: any) {
      toast({ title: "Error sending test email", description: error.message, variant: "destructive" });
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Email Sequences</h2>
          <p className="text-muted-foreground">Manage automated email sequences for different triggers</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant={showAnalytics ? "default" : "outline"} 
            onClick={() => setShowAnalytics(!showAnalytics)}
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            {showAnalytics ? "Hide Analytics" : "Analytics"}
          </Button>
          <Button variant="outline" onClick={fetchSequences} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={() => openEditor()}>
            <Plus className="w-4 h-4 mr-2" />
            New Sequence
          </Button>
        </div>
      </div>

      {showAnalytics && (
        <EmailSequenceAnalytics />
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-24 bg-muted/50" />
              <CardContent className="h-32 bg-muted/30" />
            </Card>
          ))}
        </div>
      ) : sequences.length === 0 ? (
        <Card className="p-12 text-center">
          <Mail className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No email sequences</h3>
          <p className="text-muted-foreground mb-4">Create your first automated email sequence</p>
          <Button onClick={() => openEditor()}>
            <Plus className="w-4 h-4 mr-2" />
            Create Sequence
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sequences.map(sequence => (
            <Card key={sequence.id} className={!sequence.is_active ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {sequence.name}
                      <Badge variant={sequence.is_active ? "default" : "secondary"}>
                        {sequence.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Trigger: {getTriggerLabel(sequence.trigger_type)}
                    </p>
                  </div>
                  <Switch
                    checked={sequence.is_active}
                    onCheckedChange={() => handleToggleActive(sequence)}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{sequence.emails.length} email{sequence.emails.length !== 1 ? "s" : ""} in sequence:</p>
                  <div className="space-y-1">
                    {sequence.emails.slice(0, 3).map((email, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span className="font-medium">{formatDelayTime(email.delay_hours)}:</span>
                        <span className="truncate">{email.subject}</span>
                      </div>
                    ))}
                    {sequence.emails.length > 3 && (
                      <p className="text-sm text-muted-foreground">+{sequence.emails.length - 3} more...</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    Updated {format(new Date(sequence.updated_at), "MMM d, yyyy")}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setSelectedSequence(sequence); setIsPreviewOpen(true); }}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => duplicateSequence(sequence)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditor(sequence)}>
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
                          <AlertDialogTitle>Delete Sequence</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{sequence.name}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteSequence(sequence.id)}>Delete</AlertDialogAction>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSequence.id ? "Edit Sequence" : "Create New Sequence"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Sequence Name *</Label>
                <Input
                  value={editingSequence.name || ""}
                  onChange={e => setEditingSequence({ ...editingSequence, name: e.target.value })}
                  placeholder="e.g., Welcome Series"
                />
              </div>
              <div className="space-y-2">
                <Label>Trigger Type *</Label>
                <Select
                  value={editingSequence.trigger_type || ""}
                  onValueChange={v => setEditingSequence({ ...editingSequence, trigger_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select trigger" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Scheduling Settings */}
            <Card className="p-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-primary" />
                <Label className="text-base font-medium">Scheduling Options</Label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Use Recipient Timezone</Label>
                    <p className="text-xs text-muted-foreground">Send based on recipient's timezone</p>
                  </div>
                  <Switch
                    checked={editingSequence.settings?.use_recipient_timezone ?? true}
                    onCheckedChange={v => updateSettings("use_recipient_timezone", v)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Default Timezone</Label>
                  <Select
                    value={editingSequence.settings?.default_timezone || "America/New_York"}
                    onValueChange={v => updateSettings("default_timezone", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map(tz => (
                        <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div>
                  <Label className="text-sm">Enable Optimal Send Times</Label>
                  <p className="text-xs text-muted-foreground">Send during business hours (9am-5pm)</p>
                </div>
                <Switch
                  checked={editingSequence.settings?.optimal_send_enabled ?? false}
                  onCheckedChange={v => updateSettings("optimal_send_enabled", v)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 mt-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Exclude Weekends</Label>
                    <p className="text-xs text-muted-foreground">Skip Saturday & Sunday</p>
                  </div>
                  <Switch
                    checked={editingSequence.settings?.exclude_weekends ?? false}
                    onCheckedChange={v => updateSettings("exclude_weekends", v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Exclude US Holidays</Label>
                    <p className="text-xs text-muted-foreground">Skip major US holidays</p>
                  </div>
                  <Switch
                    checked={editingSequence.settings?.exclude_holidays ?? false}
                    onCheckedChange={v => updateSettings("exclude_holidays", v)}
                  />
                </div>
              </div>
            </Card>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base">Emails in Sequence</Label>
                <Button variant="outline" size="sm" onClick={addEmail}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Email
                </Button>
              </div>

              {editingEmails.map((email, idx) => (
                <Card key={idx} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <Badge variant="outline">Email {idx + 1}</Badge>
                    {editingEmails.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeEmail(idx)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Delay (hours)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={email.delay_hours}
                        onChange={e => updateEmail(idx, "delay_hours", parseInt(e.target.value) || 0)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Sends {formatDelayTime(email.delay_hours)} after trigger
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Template</Label>
                      <Select
                        value={email.template}
                        onValueChange={v => updateEmail(idx, "template", v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select template" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectLabel>Built-in Templates</SelectLabel>
                          {TEMPLATE_OPTIONS.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                          {customTemplates.length > 0 && (
                            <>
                              <SelectLabel className="mt-2">Custom Templates</SelectLabel>
                              {customTemplates.map(t => (
                                <SelectItem key={t.slug} value={`custom:${t.slug}`}>✨ {t.name}</SelectItem>
                              ))}
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2 mt-4">
                    <Label>Subject Line *</Label>
                    <Input
                      value={email.subject}
                      onChange={e => updateEmail(idx, "subject", e.target.value)}
                      placeholder="Email subject"
                    />
                  </div>
                  {editingSequence.settings?.optimal_send_enabled && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div>
                        <Label className="text-sm">Optimal Send Time</Label>
                        <p className="text-xs text-muted-foreground">Wait for best delivery window</p>
                      </div>
                      <Switch
                        checked={email.optimal_send_time ?? false}
                        onCheckedChange={v => updateEmail(idx, "optimal_send_time", v)}
                      />
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>Cancel</Button>
            <Button onClick={saveSequence}>
              {editingSequence.id ? "Save Changes" : "Create Sequence"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedSequence?.name}</DialogTitle>
          </DialogHeader>
          {selectedSequence && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={selectedSequence.is_active ? "default" : "secondary"}>
                  {selectedSequence.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Trigger</span>
                <span className="text-sm font-medium">{getTriggerLabel(selectedSequence.trigger_type)}</span>
              </div>
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Email Timeline</h4>
                <div className="space-y-3">
                  {selectedSequence.emails.map((email, idx) => (
                    <div key={idx} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                          {idx + 1}
                        </div>
                        {idx < selectedSequence.emails.length - 1 && (
                          <div className="w-0.5 h-full bg-border mt-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <p className="text-sm font-medium">{email.subject}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-muted-foreground">
                            {formatDelayTime(email.delay_hours)} • {email.template}
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => openTestModal(email.template)}
                          >
                            <Send className="w-3 h-3 mr-1" />
                            Test
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Test Email Modal */}
      <Dialog open={isTestModalOpen} onOpenChange={setIsTestModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Test Template: {testTemplate}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Send test email to</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                />
                <Button onClick={sendTestEmail} disabled={isSendingTest || !testEmail}>
                  {isSendingTest ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Test
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted px-4 py-2 border-b">
                <p className="text-sm font-medium">Subject: {previewSubject || "Loading..."}</p>
              </div>
              <div className="p-4 bg-background">
                {isLoadingPreview ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTestModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
