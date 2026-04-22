import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Send,
  CheckCircle,
  Trash2,
  Plus,
  Facebook,
  Instagram,
  Linkedin,
  Twitter,
  RefreshCw,
  Sparkles,
  Copy,
  Calendar,
  ImageIcon,
  Wand2,
  Download,
  Check,
  Pencil,
  ShieldCheck,
  Building2,
  Eye,
  EyeOff,
  Zap,
  AlertTriangle,
  ChevronDown,
  Link2,
  CircleDot,
  FlaskConical,
} from "lucide-react";

interface Client {
  id: string;
  business_name: string;
  industry: string | null;
  tone: string | null;
  website_summary: string | null;
}

interface SocialPost {
  id: string;
  title: string;
  content: string;
  platform: string;
  scheduled_for: string;
  status: string;
  created_at: string;
  published_at: string | null;
  metadata: Record<string, unknown> | null;
  client_account_id: string | null;
}

interface OAuthToken {
  id: string;
  platform: string;
  expires_at: string | null;
  page_id: string | null;
  token_metadata: Record<string, unknown> | null;
}

interface AutomationAlert {
  id: string;
  title: string;
  message: string;
  severity: string;
  source: string | null;
  created_at: string;
}

const platformIcons: Record<string, React.ReactNode> = {
  facebook: <Facebook className="h-4 w-4" />,
  instagram: <Instagram className="h-4 w-4" />,
  linkedin: <Linkedin className="h-4 w-4" />,
  twitter: <Twitter className="h-4 w-4" />,
};

const platformColors: Record<string, string> = {
  facebook: "bg-blue-500",
  instagram: "bg-gradient-to-r from-purple-500 to-pink-500",
  linkedin: "bg-blue-700",
  twitter: "bg-sky-500",
};

const SOCIAL_PLATFORMS = ["facebook", "instagram", "linkedin", "twitter"] as const;

export default function SocialMediaPostsPanel() {
  const queryClient = useQueryClient();
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [contentTopic, setContentTopic] = useState("");
  const [testResultOpen, setTestResultOpen] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [errorsOpen, setErrorsOpen] = useState(false);
  const [newPost, setNewPost] = useState({
    title: "",
    content: "",
    platform: "facebook",
    scheduledFor: "",
  });

  // Fetch clients with full business info
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-for-social"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_accounts")
        .select("id, business_name, industry, tone, website_summary")
        .eq("status", "active")
        .order("business_name");
      if (error) throw error;
      return data as Client[];
    },
  });

  const activeClient = clients.find((c) => c.id === selectedClient) || null;

  // Fetch social posts filtered by selected client
  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["social-posts", selectedClient],
    queryFn: async () => {
      let query = supabase
        .from("content_calendar")
        .select("*")
        .in("platform", ["facebook", "instagram", "linkedin", "twitter"])
        .order("scheduled_for", { ascending: false });

      if (selectedClient) {
        query = query.eq("client_account_id", selectedClient);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SocialPost[];
    },
  });

  // Fetch OAuth tokens for selected client
  const { data: oauthTokens = [] } = useQuery({
    queryKey: ["client-oauth-tokens", selectedClient],
    enabled: !!selectedClient,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin", {
        body: { action: "list", table: "client_oauth_tokens", filters: { client_id: selectedClient } },
      });
      if (error) throw error;
      return (data?.data || []) as OAuthToken[];
    },
  });

  // Fetch OAuth config (which platforms have credentials configured)
  const { data: oauthConfig } = useQuery({
    queryKey: ["oauth-config"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("oauth-config");
      if (error) throw error;
      return data as Record<string, { clientId: string; configured: boolean }>;
    },
  });

  // Check n8n webhook status — try a dry-run with no clientId to see if webhook URL is configured
  const { data: n8nStatus } = useQuery({
    queryKey: ["n8n-webhook-status"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.functions.invoke("trigger-n8n", {
          body: { clientId: "__health_check__", tasks: [], trigger: "health_check" },
        });
        // If we get "N8N_WEBHOOK_URL not configured" that means it's not set up
        if (error?.message?.includes("N8N_WEBHOOK_URL") || data?.error?.includes("N8N_WEBHOOK_URL")) {
          return { configured: false };
        }
        // Any other response means the URL is configured (even if the request itself fails for other reasons)
        return { configured: true };
      } catch {
        return { configured: false };
      }
    },
    staleTime: 60_000,
  });

  // Fetch recent automation alerts for pipeline debugging
  const { data: recentAlerts = [] } = useQuery({
    queryKey: ["pipeline-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin", {
        body: {
          action: "list",
          table: "automation_alerts",
          filters: {},
          order: { column: "created_at", ascending: false },
          limit: 20,
        },
      });
      if (error) throw error;
      const all = (data?.data || []) as AutomationAlert[];
      return all
        .filter((a) =>
          a.source === "trigger-n8n" ||
          a.source === "publish-scheduled-content" ||
          a.title?.includes("trigger-n8n") ||
          a.title?.includes("publish-scheduled-content") ||
          a.message?.includes("n8n") ||
          a.message?.includes("publish")
        )
        .slice(0, 5);
    },
    staleTime: 30_000,
  });

  // Compute pipeline status
  const connectedPlatforms = oauthTokens.map((t) => t.platform);
  const n8nConfigured = n8nStatus?.configured ?? false;
  const pipelineStatus: "green" | "yellow" | "red" = !n8nConfigured
    ? "red"
    : connectedPlatforms.length > 0
    ? "green"
    : "yellow";

  const pipelineStatusConfig = {
    green: { color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/30", label: "Pipeline Ready" },
    yellow: { color: "text-yellow-600", bg: "bg-yellow-100 dark:bg-yellow-900/30", label: "No OAuth Tokens" },
    red: { color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/30", label: "N8N Not Configured" },
  };

  // Create post mutation
  const createPost = useMutation({
    mutationFn: async (post: typeof newPost & { imageUrl?: string }) => {
      if (!selectedClient) throw new Error("Please select a client first");
      const { data, error } = await supabase.functions.invoke("admin", {
        body: {
          action: "create",
          table: "content_calendar",
          data: {
            title: post.title,
            content: post.content,
            platform: post.platform,
            content_type: "social_post",
            scheduled_for: post.scheduledFor || new Date().toISOString(),
            status: "draft",
            client_account_id: selectedClient,
            metadata: { image_url: post.imageUrl || null },
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      setIsCreateOpen(false);
      resetForm();
      toast({ title: "Post created as draft — approve to make visible to client" });
    },
    onError: (error) => {
      toast({ title: "Error creating post", description: error.message, variant: "destructive" });
    },
  });

  // Delete post mutation
  const deletePost = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("admin", {
        body: { action: "delete", table: "content_calendar", id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      toast({ title: "Post deleted" });
    },
  });

  // Update post status mutation
  const updatePostStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const extraFields: Record<string, unknown> = {};
      if (status === "approved") {
        extraFields.client_approved = true;
        extraFields.status = "scheduled";
      } else {
        extraFields.status = status;
        if (status === "published") extraFields.published_at = new Date().toISOString();
      }

      const { data, error } = await supabase.functions.invoke("admin", {
        body: {
          action: "update",
          table: "content_calendar",
          id,
          data: extraFields,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      if (status === "approved") {
        toast({ title: "Post approved and queued", description: "Will publish at scheduled time (cron runs every 15 min)" });
      } else {
        toast({ title: "Post status updated" });
      }
    },
  });

  // Trigger publish now
  const triggerPublishNow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("publish-scheduled-content", {
        body: {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      toast({
        title: "Publish triggered",
        description: `Processed: ${data?.processed ?? 0} · Published: ${data?.successful ?? 0} · Failed: ${data?.failed ?? 0}`,
      });
    },
    onError: (error) => {
      toast({ title: "Publish failed", description: error.message, variant: "destructive" });
    },
  });

  // Test n8n pipeline — runs publish-scheduled-content and shows detailed result
  const testPipeline = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("publish-scheduled-content", {
        body: {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-alerts"] });
      setTestResult(data);
      setTestResultOpen(true);
    },
    onError: (error) => {
      setTestResult({ error: error.message });
      setTestResultOpen(true);
    },
  });

  // Update post mutation
  const updatePost = useMutation({
    mutationFn: async ({ id, post, imageUrl }: { id: string; post: typeof newPost; imageUrl?: string }) => {
      const { data, error } = await supabase.functions.invoke("admin", {
        body: {
          action: "update",
          table: "content_calendar",
          id,
          data: {
            title: post.title,
            content: post.content,
            platform: post.platform,
            scheduled_for: post.scheduledFor || new Date().toISOString(),
            metadata: { image_url: imageUrl || null },
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      setIsCreateOpen(false);
      setEditingPost(null);
      resetForm();
      toast({ title: "Post updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating post", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setNewPost({ title: "", content: "", platform: "facebook", scheduledFor: "" });
    setGeneratedImages([]);
    setSelectedImage(null);
    setImagePrompt("");
    setContentTopic("");
    setEditingPost(null);
  };

  const openEditDialog = (post: SocialPost) => {
    const imageUrl = (post.metadata as { image_url?: string } | null)?.image_url;
    setEditingPost(post);
    setNewPost({
      title: post.title || "",
      content: post.content,
      platform: post.platform,
      scheduledFor: post.scheduled_for ? new Date(post.scheduled_for).toISOString().slice(0, 16) : "",
    });
    if (imageUrl) {
      setSelectedImage(imageUrl);
    }
    setIsCreateOpen(true);
  };

  const handleSave = () => {
    if (editingPost) {
      updatePost.mutate({ id: editingPost.id, post: newPost, imageUrl: selectedImage || undefined });
    } else {
      createPost.mutate({ ...newPost, imageUrl: selectedImage || undefined });
    }
  };

  // Generate AI content using client's business info
  const generateAIContent = async () => {
    if (!activeClient) {
      toast({ title: "Select a client first", variant: "destructive" });
      return;
    }
    setIsGeneratingContent(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-social-content", {
        body: {
          clientName: activeClient.business_name,
          industry: activeClient.industry || "marketing",
          platform: newPost.platform,
          topic: contentTopic,
          tone: activeClient.tone || "professional",
          websiteSummary: activeClient.website_summary || "",
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setNewPost((prev) => ({ ...prev, content: data.content || "" }));
      toast({ title: "Content generated!" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Error generating content", description: message, variant: "destructive" });
    } finally {
      setIsGeneratingContent(false);
    }
  };

  // Generate AI images
  const generateAIImages = async () => {
    if (!activeClient) {
      toast({ title: "Select a client first", variant: "destructive" });
      return;
    }
    setIsGeneratingImages(true);
    setGeneratedImages([]);
    setSelectedImage(null);

    try {
      const prompt = imagePrompt || `Professional marketing image for ${activeClient.business_name} in the ${activeClient.industry || "marketing"} industry`;

      const { data, error } = await supabase.functions.invoke("generate-social-image", {
        body: {
          prompt,
          platform: newPost.platform,
          count: 4,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.images?.length > 0) {
        setGeneratedImages(data.images);
        toast({ title: `${data.images.length} images generated! Pick your favorite.` });
      } else {
        throw new Error("No images returned");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Error generating images", description: message, variant: "destructive" });
    } finally {
      setIsGeneratingImages(false);
    }
  };

  const generateBoth = async () => {
    await Promise.all([generateAIContent(), generateAIImages()]);
  };

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({ title: "Copied to clipboard" });
  };

  const downloadImage = (url: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = `social-post-${Date.now()}.png`;
    link.click();
  };

  const getClientName = (clientId: string | null) => {
    if (!clientId) return "Unassigned";
    return clients.find((c) => c.id === clientId)?.business_name || "Unknown";
  };

  const startOAuthFlow = (platform: string) => {
    if (!selectedClient) {
      toast({ title: "Select a client first", variant: "destructive" });
      return;
    }
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const callbackMap: Record<string, string> = {
      facebook: `${supabaseUrl}/functions/v1/facebook-oauth-callback`,
      instagram: `${supabaseUrl}/functions/v1/instagram-oauth-callback`,
      linkedin: `${supabaseUrl}/functions/v1/linkedin-oauth-callback`,
      twitter: `${supabaseUrl}/functions/v1/twitter-oauth-callback`,
    };

    const cfg = oauthConfig?.[platform];
    if (!cfg?.configured) {
      toast({ title: `${platform} OAuth not configured`, description: "Set up app credentials first.", variant: "destructive" });
      return;
    }

    // Build platform-specific auth URLs
    const redirectUri = callbackMap[platform];
    let authUrl = "";

    switch (platform) {
      case "facebook":
        authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${cfg.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${selectedClient}&scope=pages_manage_posts,pages_read_engagement`;
        break;
      case "instagram":
        authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${cfg.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${selectedClient}&scope=instagram_basic,instagram_content_publish,pages_show_list`;
        break;
      case "linkedin":
        authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${cfg.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${selectedClient}&scope=${encodeURIComponent("w_member_social w_organization_social rw_organization_admin openid profile")}`;
        break;
      case "twitter":
        authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${cfg.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${selectedClient}&scope=tweet.read+tweet.write+users.read&code_challenge=challenge&code_challenge_method=plain`;
        break;
    }

    if (authUrl) {
      window.open(authUrl, "_blank", "width=600,height=700");
    }
  };

  const draftPosts = posts.filter((p) => p.status === "draft");
  const approvedPosts = posts.filter((p) => p.status === "approved");
  const scheduledPosts = posts.filter((p) => p.status === "scheduled");
  const publishedPosts = posts.filter((p) => p.status === "published");

  const PostCard = ({ post }: { post: SocialPost }) => {
    const imageUrl = (post.metadata as { image_url?: string } | null)?.image_url;

    return (
      <Card className="hover:shadow-md transition-shadow overflow-hidden">
        {imageUrl && (
          <div className="relative h-40 bg-muted">
            <img src={imageUrl} alt="Post image" className="w-full h-full object-cover" />
          </div>
        )}
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <div className={`p-1.5 rounded ${platformColors[post.platform]} text-white`}>
                  {platformIcons[post.platform]}
                </div>
                <span className="font-medium capitalize">{post.platform}</span>
                <Badge
                  variant={
                    post.status === "published"
                      ? "default"
                      : post.status === "approved"
                      ? "default"
                      : post.status === "scheduled"
                      ? "secondary"
                      : "outline"
                  }
                  className={post.status === "approved" ? "bg-green-600" : ""}
                >
                  {post.status === "draft" && <EyeOff className="h-3 w-3 mr-1" />}
                  {post.status === "approved" && <Eye className="h-3 w-3 mr-1" />}
                  {post.status}
                </Badge>
              </div>
              {post.client_account_id && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3" />
                  {getClientName(post.client_account_id)}
                </div>
              )}
              {post.title && <h4 className="font-medium">{post.title}</h4>}
              <p className="text-sm text-muted-foreground line-clamp-3">{post.content}</p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(post.scheduled_for), "MMM d, yyyy h:mm a")}
                </span>
                {post.published_at && (
                  <span className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    Published {format(new Date(post.published_at), "MMM d")}
                  </span>
                )}
              </div>
              {post.status === "draft" && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <EyeOff className="h-3 w-3" /> Not visible to client
                </p>
              )}
              {post.status === "approved" && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <Eye className="h-3 w-3" /> Visible to client
                </p>
              )}
              {post.status === "scheduled" && (
                <p className="text-xs text-blue-600 flex items-center gap-1">
                  <Zap className="h-3 w-3" /> Queued — publishes at scheduled time
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Button size="icon" variant="ghost" onClick={() => copyToClipboard(post.content)}>
                <Copy className="h-4 w-4" />
              </Button>
              {post.status === "draft" && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-green-600 hover:text-green-700"
                  title="Approve — queues for publishing (cron picks up every 15 min)"
                  onClick={() => updatePostStatus.mutate({ id: post.id, status: "approved" })}
                >
                  <ShieldCheck className="h-4 w-4" />
                </Button>
              )}
              {post.status !== "published" && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openEditDialog(post)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {(post.status === "approved" || post.status === "scheduled") && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-blue-500 hover:text-blue-600"
                      title="Mark as published"
                      onClick={() => updatePostStatus.mutate({ id: post.id, status: "published" })}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => deletePost.mutate(post.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold">Social Media Posts</h2>
            <p className="text-muted-foreground">Create AI-generated content mapped to each client</p>
          </div>
          {/* Pipeline Status Indicator */}
          {selectedClient && (
            <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium", pipelineStatusConfig[pipelineStatus].bg, pipelineStatusConfig[pipelineStatus].color)}>
              <CircleDot className="h-3 w-3" />
              {pipelineStatusConfig[pipelineStatus].label}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => testPipeline.mutate()}
            disabled={testPipeline.isPending}
            title="Test the full n8n publishing pipeline"
          >
            {testPipeline.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4 mr-2" />
            )}
            Test Pipeline
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => triggerPublishNow.mutate()}
            disabled={triggerPublishNow.isPending}
            title="Run publish-scheduled-content right now for all due posts"
          >
            {triggerPublishNow.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Publish Now
          </Button>
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3 w-3" />
                    {client.business_name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button disabled={!selectedClient}>
                <Plus className="h-4 w-4 mr-2" />
                New Post
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingPost ? "Edit Social Post" : "Create AI-Powered Social Post"}</DialogTitle>
                <DialogDescription>
                  {editingPost
                    ? "Update your post content and settings"
                    : activeClient
                    ? `Generating for ${activeClient.business_name} · ${activeClient.industry || "General"} · Tone: ${activeClient.tone || "Professional"}`
                    : "Select a client to generate content"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5 py-4">
                {activeClient && (
                  <div className="rounded-lg border bg-muted/50 p-3 text-sm space-y-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Building2 className="h-4 w-4" />
                      {activeClient.business_name}
                    </div>
                    <div className="text-muted-foreground text-xs space-x-3">
                      {activeClient.industry && <span>Industry: {activeClient.industry}</span>}
                      {activeClient.tone && <span>Tone: {activeClient.tone}</span>}
                    </div>
                    {activeClient.website_summary && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{activeClient.website_summary}</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Platform</Label>
                    <Select
                      value={newPost.platform}
                      onValueChange={(v) => setNewPost((prev) => ({ ...prev, platform: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="facebook">
                          <div className="flex items-center gap-2"><Facebook className="h-4 w-4" /> Facebook</div>
                        </SelectItem>
                        <SelectItem value="instagram">
                          <div className="flex items-center gap-2"><Instagram className="h-4 w-4" /> Instagram</div>
                        </SelectItem>
                        <SelectItem value="linkedin">
                          <div className="flex items-center gap-2"><Linkedin className="h-4 w-4" /> LinkedIn</div>
                        </SelectItem>
                        <SelectItem value="twitter">
                          <div className="flex items-center gap-2"><Twitter className="h-4 w-4" /> Twitter/X</div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Title (optional)</Label>
                    <Input
                      value={newPost.title}
                      onChange={(e) => setNewPost((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="Internal reference"
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  variant="default"
                  size="lg"
                  className="w-full"
                  onClick={generateBoth}
                  disabled={isGeneratingContent || isGeneratingImages || !selectedClient}
                >
                  {(isGeneratingContent || isGeneratingImages) ? (
                    <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                  ) : (
                    <Wand2 className="h-5 w-5 mr-2" />
                  )}
                  Generate Content & Images with AI
                </Button>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Content</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={generateAIContent}
                      disabled={isGeneratingContent || !selectedClient}
                    >
                      {isGeneratingContent ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      Generate Text
                    </Button>
                  </div>
                  <Input
                    value={contentTopic}
                    onChange={(e) => setContentTopic(e.target.value)}
                    placeholder="Topic or theme (optional) - e.g., 'holiday sale', 'new service launch'"
                    className="text-sm"
                  />
                  <Textarea
                    value={newPost.content}
                    onChange={(e) => setNewPost((prev) => ({ ...prev, content: e.target.value }))}
                    placeholder="Your post content will appear here..."
                    rows={4}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {newPost.content.length} characters
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Image</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={generateAIImages}
                      disabled={isGeneratingImages || !selectedClient}
                    >
                      {isGeneratingImages ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <ImageIcon className="h-4 w-4 mr-2" />
                      )}
                      Generate 4 Options
                    </Button>
                  </div>
                  <Input
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    placeholder="Describe the image (optional) - e.g., 'team working together', 'happy customers'"
                    className="text-sm"
                  />

                  {isGeneratingImages && (
                    <div className="grid grid-cols-2 gap-3">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="aspect-square bg-muted rounded-lg animate-pulse flex items-center justify-center">
                          <RefreshCw className="h-6 w-6 text-muted-foreground animate-spin" />
                        </div>
                      ))}
                    </div>
                  )}

                  {generatedImages.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">Click to select an image:</p>
                      <div className="grid grid-cols-2 gap-3">
                        {generatedImages.map((img, index) => (
                          <div
                            key={index}
                            onClick={() => setSelectedImage(img)}
                            className={cn(
                              "relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all",
                              selectedImage === img
                                ? "border-primary ring-2 ring-primary ring-offset-2"
                                : "border-transparent hover:border-muted-foreground/50"
                            )}
                          >
                            <img src={img} alt={`Option ${index + 1}`} className="w-full h-full object-cover" />
                            {selectedImage === img && (
                              <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                                <Check className="h-4 w-4" />
                              </div>
                            )}
                            <div className="absolute bottom-2 left-2">
                              <Button
                                size="icon"
                                variant="secondary"
                                className="h-7 w-7"
                                onClick={(e) => { e.stopPropagation(); downloadImage(img); }}
                              >
                                <Download className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Schedule (optional)</Label>
                  <Input
                    type="datetime-local"
                    value={newPost.scheduledFor}
                    onChange={(e) => setNewPost((prev) => ({ ...prev, scheduledFor: e.target.value }))}
                  />
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
                  <EyeOff className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Posts are saved as <strong>drafts</strong> and are <strong>not visible</strong> to clients until you approve them.</span>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleSave}
                    disabled={!newPost.content || !selectedClient || createPost.isPending || updatePost.isPending}
                  >
                    {editingPost ? "Update Post" : "Save as Draft"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Connected Platforms + OAuth Connect section */}
      {selectedClient && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Connected Platforms
              </h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SOCIAL_PLATFORMS.map((platform) => {
                const token = oauthTokens.find((t) => t.platform === platform);
                const isConnected = !!token;
                const isExpired = token?.expires_at ? new Date(token.expires_at) < new Date() : false;
                const oauthAvailable = oauthConfig?.[platform]?.configured;
                const pageName = (token?.token_metadata as { page_name?: string } | null)?.page_name;

                return (
                  <div
                    key={platform}
                    className={cn(
                      "rounded-lg border p-3 space-y-2",
                      isConnected && !isExpired ? "border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-800" : "border-border"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${platformColors[platform]} text-white`}>
                        {platformIcons[platform]}
                      </div>
                      <span className="font-medium capitalize text-sm">{platform}</span>
                      {isConnected && !isExpired && <CheckCircle className="h-3.5 w-3.5 text-green-600 ml-auto" />}
                      {isConnected && isExpired && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 ml-auto" />}
                    </div>
                    {isConnected ? (
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {pageName && <p>{pageName}</p>}
                        {token.expires_at && (
                          <p className={isExpired ? "text-amber-600 font-medium" : ""}>
                            {isExpired ? "Expired" : `Expires ${format(new Date(token.expires_at), "MMM d, yyyy")}`}
                          </p>
                        )}
                        {isExpired && (
                          <Button size="sm" variant="outline" className="w-full mt-1 h-7 text-xs" onClick={() => startOAuthFlow(platform)}>
                            Reconnect
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-7 text-xs"
                        onClick={() => startOAuthFlow(platform)}
                        disabled={!oauthAvailable}
                        title={!oauthAvailable ? "OAuth credentials not configured" : undefined}
                      >
                        {oauthAvailable ? "Connect" : "Not Configured"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Errors - collapsible */}
      {recentAlerts.length > 0 && (
        <Collapsible open={errorsOpen} onOpenChange={setErrorsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between text-sm text-destructive hover:text-destructive">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Recent Pipeline Errors ({recentAlerts.length})
              </span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", errorsOpen && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            {recentAlerts.map((alert) => (
              <div key={alert.id} className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-3 text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-red-800 dark:text-red-300">{alert.title}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(alert.created_at), "MMM d, h:mm a")}</span>
                </div>
                <p className="text-xs text-red-700 dark:text-red-400">{alert.message}</p>
                {alert.source && (
                  <Badge variant="outline" className="text-xs">{alert.source}</Badge>
                )}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Test Pipeline Result Dialog */}
      <Dialog open={testResultOpen} onOpenChange={setTestResultOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5" />
              Pipeline Test Results
            </DialogTitle>
            <DialogDescription>Results from publish-scheduled-content execution</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {testResult?.error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 text-sm text-red-800 dark:text-red-300">
                <p className="font-medium">Error</p>
                <p>{String(testResult.error)}</p>
              </div>
            ) : testResult ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold">{String((testResult as Record<string, unknown>).processed ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">Processed</p>
                  </div>
                  <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{String((testResult as Record<string, unknown>).successful ?? 0)}</p>
                    <p className="text-xs text-green-600">Succeeded</p>
                  </div>
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 p-3 text-center">
                    <p className="text-2xl font-bold text-red-700">{String((testResult as Record<string, unknown>).failed ?? 0)}</p>
                    <p className="text-xs text-red-600">Failed</p>
                  </div>
                </div>
                {Array.isArray((testResult as Record<string, unknown>).results) && (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {((testResult as Record<string, unknown>).results as Array<Record<string, unknown>>).map((r, i) => (
                      <div key={i} className={cn("rounded border p-2 text-xs", r.success ? "border-green-200 bg-green-50 dark:bg-green-900/10" : "border-red-200 bg-red-50 dark:bg-red-900/10")}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium capitalize">{String(r.platform)}</span>
                          <Badge variant={r.success ? "default" : "destructive"} className="text-xs">
                            {r.success ? "Success" : "Failed"}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground mt-0.5">{String(r.id).slice(0, 8)}…</p>
                        {r.error && <p className="text-red-600 mt-1">{String(r.error)}</p>}
                      </div>
                    ))}
                  </div>
                )}
                {(testResult as Record<string, unknown>).processed === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    No posts were due for publishing. Make sure posts are <strong>scheduled</strong> with <strong>client_approved = true</strong> and <strong>scheduled_for ≤ now</strong>.
                  </p>
                )}
              </>
            ) : null}
            <div className="rounded-lg border p-3 text-sm space-y-1">
              <p className="font-medium">N8N Webhook Status</p>
              <div className="flex items-center gap-2">
                <CircleDot className={cn("h-3.5 w-3.5", n8nConfigured ? "text-green-600" : "text-red-600")} />
                <span>{n8nConfigured ? "N8N_WEBHOOK_URL is configured" : "N8N_WEBHOOK_URL is NOT configured"}</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {!selectedClient && (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Select a client to get started</h3>
            <p className="text-muted-foreground">
              Choose a client from the dropdown above to view and create social media posts
            </p>
          </CardContent>
        </Card>
      )}

      {selectedClient && (
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">All ({posts.length})</TabsTrigger>
            <TabsTrigger value="draft">Drafts ({draftPosts.length})</TabsTrigger>
            <TabsTrigger value="approved">Approved ({approvedPosts.length})</TabsTrigger>
            <TabsTrigger value="scheduled">Scheduled ({scheduledPosts.length})</TabsTrigger>
            <TabsTrigger value="published">Published ({publishedPosts.length})</TabsTrigger>
          </TabsList>

          {[
            { value: "all", data: posts },
            { value: "draft", data: draftPosts },
            { value: "approved", data: approvedPosts },
            { value: "scheduled", data: scheduledPosts },
            { value: "published", data: publishedPosts },
          ].map(({ value, data }) => (
            <TabsContent key={value} value={value} className="space-y-4">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading posts...</div>
              ) : data.length === 0 ? (
                value === "all" ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Send className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-2">No social posts for this client</h3>
                      <p className="text-muted-foreground mb-4">Create your first AI-powered social media post</p>
                      <Button onClick={() => setIsCreateOpen(true)}>
                        <Wand2 className="h-4 w-4 mr-2" />
                        Create with AI
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">No {value} posts</div>
                )
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {data.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
