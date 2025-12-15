import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Mail, Send, FileText, MessageSquare, Zap, Loader2, 
  CheckCircle, Users, Sparkles, Clock, ArrowRight, Eye, Copy, Trash2, Edit, X, CheckCircle2, Circle
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface EmailTemplate {
  id: string;
  name: string;
  slug: string;
  subject: string;
  category: string;
}

interface Client {
  id: string;
  business_name: string;
  email: string;
  tier: string;
  industry: string | null;
}

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  action: () => void;
}

interface GeneratedContentItem {
  id: string;
  title: string | null;
  content: string;
  content_type: string;
  status: string;
  created_at: string;
}

export function QuickActionsPanel() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [generatedContentList, setGeneratedContentList] = useState<GeneratedContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Quick Email Modal
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [emailTarget, setEmailTarget] = useState<"all_leads" | "gap_analysis" | "contacts">("all_leads");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  
  // Quick Content Modal
  const [contentModalOpen, setContentModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState("");
  const [contentType, setContentType] = useState<"blog_post" | "social_post" | "email_copy">("blog_post");
  const [contentTopic, setContentTopic] = useState("");
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  
  // Quick Social Modal
  const [socialModalOpen, setSocialModalOpen] = useState(false);
  const [socialPlatform, setSocialPlatform] = useState<"linkedin" | "facebook" | "twitter">("linkedin");
  const [socialTopic, setSocialTopic] = useState("");
  const [isGeneratingSocial, setIsGeneratingSocial] = useState(false);
  const [generatedSocial, setGeneratedSocial] = useState("");

  // Stats
  const [stats, setStats] = useState({
    pendingEmails: 0,
    totalClients: 0,
    recentContent: 0
  });
  const [isSendingAll, setIsSendingAll] = useState(false);

  // Content viewer
  const [viewContentModal, setViewContentModal] = useState(false);
  const [editContentModal, setEditContentModal] = useState(false);
  const [selectedContent, setSelectedContent] = useState<GeneratedContentItem | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [isSavingContent, setIsSavingContent] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    
    const [templatesRes, clientsRes, queueRes, contentRes, allContentRes] = await Promise.all([
      supabase.from("email_templates").select("id, name, slug, subject, category").eq("is_active", true),
      supabase.from("client_accounts").select("id, business_name, email, tier, industry").eq("status", "active"),
      supabase.from("email_queue").select("id").eq("status", "pending"),
      supabase.from("generated_content").select("id").gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from("generated_content").select("id, title, content, content_type, status, created_at").order("created_at", { ascending: false }).limit(20)
    ]);

    if (templatesRes.data) setTemplates(templatesRes.data);
    if (clientsRes.data) setClients(clientsRes.data);
    if (allContentRes.data) setGeneratedContentList(allContentRes.data);
    
    setStats({
      pendingEmails: queueRes.data?.length || 0,
      totalClients: clientsRes.data?.length || 0,
      recentContent: contentRes.data?.length || 0
    });
    
    setIsLoading(false);
  };

  const sendAllPending = async () => {
    if (stats.pendingEmails === 0) {
      toast({ title: "No pending emails", description: "Queue is empty" });
      return;
    }
    
    setIsSendingAll(true);
    try {
      const { error } = await supabase.functions.invoke("process-email-queue");
      if (error) throw error;
      
      toast({ 
        title: "Emails sent!", 
        description: `Processed ${stats.pendingEmails} pending emails`
      });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error sending emails", description: error.message, variant: "destructive" });
    } finally {
      setIsSendingAll(false);
    }
  };

  const viewContent = (content: GeneratedContentItem) => {
    setSelectedContent(content);
    setViewContentModal(true);
  };

  const openEditContent = (content: GeneratedContentItem) => {
    setSelectedContent(content);
    setEditedContent(content.content);
    setEditContentModal(true);
  };

  const saveEditedContent = async () => {
    if (!selectedContent) return;
    setIsSavingContent(true);
    
    try {
      const { error } = await supabase
        .from("generated_content")
        .update({ content: editedContent, updated_at: new Date().toISOString() })
        .eq("id", selectedContent.id);
      
      if (error) throw error;
      
      toast({ title: "Content updated!" });
      setEditContentModal(false);
      fetchData();
    } catch (error: any) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } finally {
      setIsSavingContent(false);
    }
  };

  const deleteContent = async (id: string) => {
    try {
      const { error } = await supabase.from("generated_content").delete().eq("id", id);
      if (error) throw error;
      
      toast({ title: "Content deleted" });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error deleting", description: error.message, variant: "destructive" });
    }
  };

  const togglePublishStatus = async (item: GeneratedContentItem) => {
    const newStatus = item.status === "published" ? "draft" : "published";
    try {
      const { error } = await supabase
        .from("generated_content")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", item.id);
      
      if (error) throw error;
      
      toast({ title: newStatus === "published" ? "Content published!" : "Moved to draft" });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error updating status", description: error.message, variant: "destructive" });
    }
  };

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case "blog_post": return "📝";
      case "social_post": return "📱";
      case "email_copy": return "✉️";
      case "ad_copy": return "📢";
      default: return "📄";
    }
  };

  const sendQuickEmail = async () => {
    if (!selectedTemplate) {
      toast({ title: "Please select a template", variant: "destructive" });
      return;
    }

    setIsSendingEmail(true);

    try {
      // Get recipients based on target
      let recipients: { email: string; firstName?: string }[] = [];
      
      if (emailTarget === "gap_analysis" || emailTarget === "all_leads") {
        const { data } = await supabase
          .from("gap_analysis_submissions")
          .select("email, first_name")
          .eq("status", "submitted");
        if (data) recipients.push(...data.map(d => ({ email: d.email, firstName: d.first_name })));
      }
      
      if (emailTarget === "contacts" || emailTarget === "all_leads") {
        const { data } = await supabase
          .from("contact_submissions")
          .select("email, first_name");
        if (data) recipients.push(...data.map(d => ({ email: d.email, firstName: d.first_name })));
      }

      // Remove duplicates
      const uniqueRecipients = recipients.filter((r, i, arr) => 
        arr.findIndex(x => x.email === r.email) === i
      );

      if (uniqueRecipients.length === 0) {
        toast({ title: "No recipients found", variant: "destructive" });
        setIsSendingEmail(false);
        return;
      }

      // Get template
      const template = templates.find(t => t.id === selectedTemplate);
      if (!template) throw new Error("Template not found");

      // Get full template content
      const { data: fullTemplate } = await supabase
        .from("email_templates")
        .select("html_content, subject")
        .eq("id", selectedTemplate)
        .single();

      if (!fullTemplate) throw new Error("Could not load template");

      // Queue emails
      const emailsToQueue = uniqueRecipients.map(recipient => ({
        recipient_email: recipient.email,
        recipient_name: recipient.firstName || null,
        subject: fullTemplate.subject.replace(/\{\{firstName\}\}/g, recipient.firstName || "there"),
        html_content: fullTemplate.html_content.replace(/\{\{firstName\}\}/g, recipient.firstName || "there"),
        scheduled_for: new Date().toISOString(),
        status: "pending",
        metadata: { template_id: template.id, quick_send: true }
      }));

      const { error } = await supabase.from("email_queue").insert(emailsToQueue);
      if (error) throw error;

      // Trigger immediate send
      const { error: sendError } = await supabase.functions.invoke("process-email-queue");
      
      if (sendError) {
        toast({ 
          title: "Emails queued but not sent", 
          description: "Queued successfully but instant send failed. They'll send on next schedule.",
          variant: "destructive"
        });
      } else {
        toast({ 
          title: "Emails sent!", 
          description: `${uniqueRecipients.length} emails sent successfully`
        });
      }
      
      setEmailModalOpen(false);
      setSelectedTemplate("");
      fetchData();

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const generateQuickContent = async () => {
    if (!selectedClient || !contentTopic.trim()) {
      toast({ title: "Please select a client and enter a topic", variant: "destructive" });
      return;
    }

    setIsGeneratingContent(true);
    setGeneratedContent("");

    try {
      const client = clients.find(c => c.id === selectedClient);
      
      const { data, error } = await supabase.functions.invoke("run-automation", {
        body: {
          clientId: selectedClient,
          jobType: "content_generation",
          inputData: {
            contentType,
            topic: contentTopic,
            businessName: client?.business_name,
            industry: client?.industry
          }
        }
      });

      if (error) throw error;

      const content = data?.output?.content || data?.output?.generated_content || "Content generated successfully!";
      setGeneratedContent(content);
      
      toast({ title: "Content generated!" });
      fetchData();

    } catch (error: any) {
      toast({ title: "Error generating content", description: error.message, variant: "destructive" });
    } finally {
      setIsGeneratingContent(false);
    }
  };

  const generateQuickSocial = async () => {
    if (!socialTopic.trim()) {
      toast({ title: "Please enter a topic", variant: "destructive" });
      return;
    }

    setIsGeneratingSocial(true);
    setGeneratedSocial("");

    try {
      // Use AI to generate social post
      const { data, error } = await supabase.functions.invoke("chat", {
        body: {
          message: `Create a ${socialPlatform} post about: ${socialTopic}. 
          
          Make it engaging, professional, and include relevant hashtags. 
          For LinkedIn: professional tone, 1-3 paragraphs
          For Facebook: friendly tone, conversational
          For Twitter/X: concise, under 280 characters with hashtags
          
          Return ONLY the post content, nothing else.`
        }
      });

      if (error) throw error;

      const content = data?.response || data?.message || "Social post generated!";
      setGeneratedSocial(content);
      
      toast({ title: "Social post generated!" });

    } catch (error: any) {
      toast({ title: "Error generating post", description: error.message, variant: "destructive" });
    } finally {
      setIsGeneratingSocial(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard!" });
  };

  const quickActions: QuickAction[] = [
    {
      id: "email",
      title: "Send Email Blast",
      description: "Send emails to all leads in 2 clicks",
      icon: <Mail className="w-8 h-8" />,
      color: "from-blue-500 to-cyan-500",
      action: () => setEmailModalOpen(true)
    },
    {
      id: "content",
      title: "Generate Content",
      description: "AI-powered blog posts & copy",
      icon: <FileText className="w-8 h-8" />,
      color: "from-purple-500 to-pink-500",
      action: () => setContentModalOpen(true)
    },
    {
      id: "social",
      title: "Create Social Post",
      description: "Generate LinkedIn, FB, Twitter posts",
      icon: <MessageSquare className="w-8 h-8" />,
      color: "from-green-500 to-emerald-500",
      action: () => setSocialModalOpen(true)
    }
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-muted-foreground">Pending Emails</p>
                <p className="text-3xl font-bold">{stats.pendingEmails}</p>
              </div>
              <Clock className="w-10 h-10 text-blue-500/50" />
            </div>
            {stats.pendingEmails > 0 && (
              <Button 
                size="sm" 
                className="w-full" 
                onClick={sendAllPending}
                disabled={isSendingAll}
              >
                {isSendingAll ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
                ) : (
                  <><Send className="w-4 h-4 mr-2" /> Send All Now</>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Clients</p>
                <p className="text-3xl font-bold">{stats.totalClients}</p>
              </div>
              <Users className="w-10 h-10 text-purple-500/50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Content This Week</p>
                <p className="text-3xl font-bold">{stats.recentContent}</p>
              </div>
              <Sparkles className="w-10 h-10 text-green-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          Quick Actions
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {quickActions.map(action => (
            <Card 
              key={action.id}
              className="group cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1"
              onClick={action.action}
            >
              <CardContent className="pt-6">
                <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform`}>
                  {action.icon}
                </div>
                <h3 className="font-semibold text-lg mb-1">{action.title}</h3>
                <p className="text-sm text-muted-foreground mb-4">{action.description}</p>
                <Button className="w-full group-hover:bg-primary">
                  Get Started
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Generated Content Library */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Generated Content
        </h2>
        {generatedContentList.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No content generated yet. Use the "Generate Content" action above to create some!
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {generatedContentList.map(item => (
              <Card key={item.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{getContentTypeIcon(item.content_type)}</span>
                        <h4 className="font-medium truncate">
                          {item.title || `Untitled ${item.content_type.replace("_", " ")}`}
                        </h4>
                        <Badge 
                          variant={item.status === "published" ? "default" : "outline"} 
                          className={`text-xs ${item.status === "published" ? "bg-green-600" : ""}`}
                        >
                          {item.status === "published" ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <Circle className="w-3 h-3 mr-1" />}
                          {item.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {item.content.substring(0, 150)}...
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(item.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 border-r pr-2 mr-1">
                        <span className="text-xs text-muted-foreground">
                          {item.status === "published" ? "Published" : "Draft"}
                        </span>
                        <Switch
                          checked={item.status === "published"}
                          onCheckedChange={() => togglePublishStatus(item)}
                          className="data-[state=checked]:bg-green-600"
                        />
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => viewContent(item)}
                        title="View"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => copyToClipboard(item.content)}
                        title="Copy"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => openEditContent(item)}
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => deleteContent(item.id)}
                        title="Delete"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* View Content Modal */}
      <Dialog open={viewContentModal} onOpenChange={setViewContentModal}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedContent && getContentTypeIcon(selectedContent.content_type)}
              {selectedContent?.title || "Generated Content"}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[60vh] bg-muted p-4 rounded-lg whitespace-pre-wrap text-sm">
            {selectedContent?.content}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewContentModal(false)}>
              Close
            </Button>
            <Button onClick={() => selectedContent && copyToClipboard(selectedContent.content)}>
              <Copy className="w-4 h-4 mr-2" /> Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Content Modal */}
      <Dialog open={editContentModal} onOpenChange={setEditContentModal}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Edit Content</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="min-h-[300px] font-mono text-sm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditContentModal(false)}>
              Cancel
            </Button>
            <Button onClick={saveEditedContent} disabled={isSavingContent}>
              {isSavingContent ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={emailModalOpen} onOpenChange={setEmailModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-500" />
              Quick Email Blast
            </DialogTitle>
            <DialogDescription>
              Send an email to your leads in just 2 clicks
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email Template</label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template..." />
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
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Send To</label>
              <Select value={emailTarget} onValueChange={(v: any) => setEmailTarget(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_leads">All Leads</SelectItem>
                  <SelectItem value="gap_analysis">Gap Analysis Submissions</SelectItem>
                  <SelectItem value="contacts">Contact Form Submissions</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={sendQuickEmail} disabled={isSendingEmail}>
              {isSendingEmail ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
              ) : (
                <><Send className="w-4 h-4 mr-2" /> Send Now</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Content Modal */}
      <Dialog open={contentModalOpen} onOpenChange={setContentModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-500" />
              Generate Content
            </DialogTitle>
            <DialogDescription>
              AI-powered content generation for your clients
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Client</label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <span>{c.business_name}</span>
                        <Badge variant="outline" className="text-xs">{c.tier}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Content Type</label>
              <Select value={contentType} onValueChange={(v: any) => setContentType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blog_post">Blog Post</SelectItem>
                  <SelectItem value="social_post">Social Media Post</SelectItem>
                  <SelectItem value="email_copy">Email Copy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Topic / Brief</label>
              <Textarea 
                value={contentTopic}
                onChange={(e) => setContentTopic(e.target.value)}
                placeholder="Describe what content you need..."
                rows={3}
              />
            </div>

            {generatedContent && (
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Generated Content
                </label>
                <div className="bg-muted p-3 rounded-lg text-sm max-h-48 overflow-y-auto">
                  {generatedContent}
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => copyToClipboard(generatedContent)}
                >
                  Copy to Clipboard
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setContentModalOpen(false);
              setGeneratedContent("");
              setContentTopic("");
            }}>
              Close
            </Button>
            <Button onClick={generateQuickContent} disabled={isGeneratingContent}>
              {isGeneratingContent ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> Generate</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Social Modal */}
      <Dialog open={socialModalOpen} onOpenChange={setSocialModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-green-500" />
              Create Social Post
            </DialogTitle>
            <DialogDescription>
              Generate engaging social media content instantly
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Platform</label>
              <Select value={socialPlatform} onValueChange={(v: any) => setSocialPlatform(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="twitter">Twitter / X</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Topic / Message</label>
              <Textarea 
                value={socialTopic}
                onChange={(e) => setSocialTopic(e.target.value)}
                placeholder="What should the post be about?"
                rows={3}
              />
            </div>

            {generatedSocial && (
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Generated Post
                </label>
                <div className="bg-muted p-3 rounded-lg text-sm whitespace-pre-wrap">
                  {generatedSocial}
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => copyToClipboard(generatedSocial)}
                >
                  Copy to Clipboard
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setSocialModalOpen(false);
              setGeneratedSocial("");
              setSocialTopic("");
            }}>
              Close
            </Button>
            <Button onClick={generateQuickSocial} disabled={isGeneratingSocial}>
              {isGeneratingSocial ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> Generate</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
