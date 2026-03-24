import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, Edit, Check, X, FileText, Mail, MessageSquare, Megaphone, Eye, Send, Loader2, Sparkles, Plus } from "lucide-react";

interface GeneratedContent {
  id: string;
  client_id: string;
  content_type: string;
  title: string | null;
  content: string;
  status: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  client_accounts?: {
    business_name: string;
    email: string;
    first_name: string | null;
  };
}

interface ClientAccount {
  id: string;
  business_name: string;
  industry: string | null;
  tier: string;
}

export const ContentReviewPanel = () => {
  const [contents, setContents] = useState<GeneratedContent[]>([]);
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [editingContent, setEditingContent] = useState<GeneratedContent | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [editedTitle, setEditedTitle] = useState("");
  const [previewContent, setPreviewContent] = useState<GeneratedContent | null>(null);
  const [publishingContent, setPublishingContent] = useState<GeneratedContent | null>(null);
  const [sendToClient, setSendToClient] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  
  // Content generation state
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generateClientId, setGenerateClientId] = useState<string>("");
  const [generateContentType, setGenerateContentType] = useState<string>("blog_post");
  const [generateTopic, setGenerateTopic] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [contentsRes, clientsRes] = await Promise.all([
      supabase
        .from("generated_content")
        .select("*, client_accounts(business_name, email, first_name)")
        .order("created_at", { ascending: false }),
      supabase
        .from("client_accounts")
        .select("id, business_name, industry, tier")
        .order("business_name"),
    ]);

    if (contentsRes.data) setContents(contentsRes.data as GeneratedContent[]);
    if (clientsRes.data) setClients(clientsRes.data);
    setLoading(false);
  };

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case "blog_post":
        return <FileText className="w-4 h-4" />;
      case "email_sequence":
        return <Mail className="w-4 h-4" />;
      case "social_post":
        return <MessageSquare className="w-4 h-4" />;
      case "ad_copy":
        return <Megaphone className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      case "approved":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Approved</Badge>;
      case "published":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Published</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatContentType = (type: string) => {
    return type.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };

  const handleApprove = async (content: GeneratedContent) => {
    const { error } = await supabase
      .from("generated_content")
      .update({ status: "approved" })
      .eq("id", content.id);

    if (error) {
      toast({ title: "Error", description: "Failed to approve content", variant: "destructive" });
    } else {
      toast({ title: "Approved", description: "Content has been approved" });
      fetchData();
    }
  };

  const handleReject = async (content: GeneratedContent) => {
    const { error } = await supabase
      .from("generated_content")
      .update({ status: "rejected" })
      .eq("id", content.id);

    if (error) {
      toast({ title: "Error", description: "Failed to reject content", variant: "destructive" });
    } else {
      toast({ title: "Rejected", description: "Content has been rejected" });
      fetchData();
    }
  };

  const handleEdit = (content: GeneratedContent) => {
    setEditingContent(content);
    setEditedContent(content.content);
    setEditedTitle(content.title || "");
  };

  const handleSaveEdit = async () => {
    if (!editingContent) return;

    const { error } = await supabase
      .from("generated_content")
      .update({ 
        content: editedContent, 
        title: editedTitle || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", editingContent.id);

    if (error) {
      toast({ title: "Error", description: "Failed to save changes", variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Content has been updated" });
      setEditingContent(null);
      fetchData();
    }
  };

  const handlePublishClick = (content: GeneratedContent) => {
    setPublishingContent(content);
    setSendToClient(true);
  };

  const handlePublish = async () => {
    if (!publishingContent) return;

    setIsPublishing(true);

    try {
      // Update status to published
      const { error: updateError } = await supabase
        .from("generated_content")
        .update({ status: "published", updated_at: new Date().toISOString() })
        .eq("id", publishingContent.id);

      if (updateError) throw updateError;

      // Optionally send to client
      if (sendToClient && publishingContent.client_accounts?.email) {
        const { error: emailError } = await supabase.functions.invoke("send-content-to-client", {
          body: {
            contentId: publishingContent.id,
            clientEmail: publishingContent.client_accounts.email,
            clientName: publishingContent.client_accounts.first_name || publishingContent.client_accounts.business_name,
            businessName: publishingContent.client_accounts.business_name,
            contentTitle: publishingContent.title || "New Content",
            contentType: formatContentType(publishingContent.content_type),
            content: publishingContent.content,
          },
        });

        if (emailError) {
          console.error("Email error:", emailError);
          toast({ 
            title: "Published", 
            description: "Content published but failed to send email to client",
          });
        } else {
          toast({ 
            title: "Published & Sent", 
            description: "Content has been published and sent to the client" 
          });
        }
      } else {
        toast({ title: "Published", description: "Content has been published" });
      }

      setPublishingContent(null);
      fetchData();
    } catch (error: any) {
      console.error("Publish error:", error);
      toast({ title: "Error", description: "Failed to publish content", variant: "destructive" });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleGenerateContent = async () => {
    if (!generateClientId || !generateTopic.trim()) {
      toast({ title: "Please select a client and enter a topic", variant: "destructive" });
      return;
    }

    setIsGenerating(true);

    try {
      const client = clients.find(c => c.id === generateClientId);
      
      const { triggerN8N } = await import("@/lib/n8n");
      await triggerN8N({
        clientId: generateClientId,
        tasks: [{ id: `content-${Date.now()}`, name: "content_generation", category: "content" }],
        trigger: "content_generation",
        metadata: {
          contentType: generateContentType,
          topic: generateTopic,
          businessName: client?.business_name,
          industry: client?.industry
        }
      });

      toast({ title: "Content generated!", description: "New content has been created and is ready for review." });
      setGenerateModalOpen(false);
      setGenerateTopic("");
      setGenerateClientId("");
      fetchData();

    } catch (error: any) {
      toast({ title: "Error generating content", description: error.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredContents = contents.filter((c) => {
    if (selectedClient !== "all" && c.client_id !== selectedClient) return false;
    if (selectedType !== "all" && c.content_type !== selectedType) return false;
    if (selectedStatus !== "all" && c.status !== selectedStatus) return false;
    return true;
  });

  const contentTypes = [...new Set(contents.map((c) => c.content_type))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Content Review</h2>
        <div className="flex gap-2">
          <Button onClick={() => setGenerateModalOpen(true)} size="sm">
            <Sparkles className="w-4 h-4 mr-2" />
            Generate Content
          </Button>
          <Button onClick={fetchData} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <Select value={selectedClient} onValueChange={setSelectedClient}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.business_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {contentTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {formatContentType(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content Grid */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading content...</div>
      ) : filteredContents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No content found</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredContents.map((content) => (
            <Card key={content.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {getContentTypeIcon(content.content_type)}
                    <span className="text-xs">{formatContentType(content.content_type)}</span>
                  </div>
                  {getStatusBadge(content.status)}
                </div>
                <CardTitle className="text-base leading-tight mt-2">
                  {content.title || "Untitled"}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {content.client_accounts?.business_name} • {new Date(content.created_at).toLocaleDateString()}
                </p>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="flex-1 mb-4">
                  <p className="text-sm text-muted-foreground line-clamp-4">
                    {content.content.substring(0, 200)}...
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPreviewContent(content)}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(content)}
                  >
                    <Edit className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                  {content.status === "draft" && (
                    <>
                      <Button
                        size="sm"
                        variant="default"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => handleApprove(content)}
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleReject(content)}
                      >
                        <X className="w-3 h-3 mr-1" />
                        Reject
                      </Button>
                    </>
                  )}
                  {(content.status === "approved" || content.status === "draft") && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handlePublishClick(content)}
                    >
                      <Send className="w-3 h-3 mr-1" />
                      Publish
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewContent} onOpenChange={() => setPreviewContent(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              {previewContent && getContentTypeIcon(previewContent.content_type)}
              <span className="text-sm">{previewContent && formatContentType(previewContent.content_type)}</span>
              {previewContent && getStatusBadge(previewContent.status)}
            </div>
            <DialogTitle>{previewContent?.title || "Untitled"}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {previewContent?.client_accounts?.business_name} • {previewContent && new Date(previewContent.created_at).toLocaleDateString()}
            </p>
          </DialogHeader>
          <div className="mt-4 prose prose-sm dark:prose-invert max-w-none">
            <pre className="whitespace-pre-wrap text-sm font-sans bg-muted/50 p-4 rounded-lg">
              {previewContent?.content}
            </pre>
          </div>
          <DialogFooter className="mt-4 flex-wrap gap-2">
            {previewContent?.status === "draft" && (
              <>
                <Button
                  variant="default"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    handleApprove(previewContent);
                    setPreviewContent(null);
                  }}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    handleReject(previewContent);
                    setPreviewContent(null);
                  }}
                >
                  <X className="w-4 h-4 mr-2" />
                  Reject
                </Button>
              </>
            )}
            {previewContent && (previewContent.status === "approved" || previewContent.status === "draft") && (
              <Button
                variant="default"
                onClick={() => {
                  handlePublishClick(previewContent);
                  setPreviewContent(null);
                }}
              >
                <Send className="w-4 h-4 mr-2" />
                Publish
              </Button>
            )}
            <Button variant="outline" onClick={() => setPreviewContent(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish Dialog */}
      <Dialog open={!!publishingContent} onOpenChange={() => setPublishingContent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish Content</DialogTitle>
            <DialogDescription>
              Mark this content as published and optionally send it to the client.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-medium">{publishingContent?.title || "Untitled"}</p>
              <p className="text-sm text-muted-foreground">
                {formatContentType(publishingContent?.content_type || "")} for {publishingContent?.client_accounts?.business_name}
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="sendToClient"
                checked={sendToClient}
                onCheckedChange={(checked) => setSendToClient(checked === true)}
              />
              <label
                htmlFor="sendToClient"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Send content to client via email
              </label>
            </div>
            
            {sendToClient && publishingContent?.client_accounts?.email && (
              <p className="text-sm text-muted-foreground pl-6">
                Will be sent to: {publishingContent.client_accounts.email}
              </p>
            )}
            {sendToClient && !publishingContent?.client_accounts?.email && (
              <p className="text-sm text-destructive pl-6">
                No email address found for this client
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishingContent(null)} disabled={isPublishing}>
              Cancel
            </Button>
            <Button onClick={handlePublish} disabled={isPublishing}>
              {isPublishing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  {sendToClient ? "Publish & Send" : "Publish"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingContent} onOpenChange={() => setEditingContent(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Content</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Title</label>
              <Input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                placeholder="Content title"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Content</label>
              <Textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditingContent(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Content Dialog */}
      <Dialog open={generateModalOpen} onOpenChange={setGenerateModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Generate New Content
            </DialogTitle>
            <DialogDescription>
              Create AI-generated content tailored to your client's industry and needs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Client</label>
              <Select value={generateClientId} onValueChange={setGenerateClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.business_name} {client.industry && `(${client.industry})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Content Type</label>
              <Select value={generateContentType} onValueChange={setGenerateContentType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select content type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blog_post">Blog Post</SelectItem>
                  <SelectItem value="social_post">Social Media Post</SelectItem>
                  <SelectItem value="email_copy">Email Copy</SelectItem>
                  <SelectItem value="ad_copy">Ad Copy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Topic / Brief</label>
              <Textarea
                value={generateTopic}
                onChange={(e) => setGenerateTopic(e.target.value)}
                placeholder="Describe what the content should be about..."
                className="min-h-[100px]"
              />
            </div>
            
            {generateClientId && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="text-muted-foreground">
                  Content will be generated for{" "}
                  <span className="font-medium text-foreground">
                    {clients.find(c => c.id === generateClientId)?.business_name}
                  </span>
                  {clients.find(c => c.id === generateClientId)?.industry && (
                    <> in the <span className="font-medium text-foreground">{clients.find(c => c.id === generateClientId)?.industry}</span> industry</>
                  )}
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setGenerateModalOpen(false)} disabled={isGenerating}>
              Cancel
            </Button>
            <Button onClick={handleGenerateContent} disabled={isGenerating || !generateClientId || !generateTopic.trim()}>
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Content
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
