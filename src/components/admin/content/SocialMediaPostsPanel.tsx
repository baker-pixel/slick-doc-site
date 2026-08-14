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
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
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
  Link2,
  CircleDot,
  FlaskConical,
  Unplug,
  ExternalLink,
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

interface PostForMeAccount {
  id: string;
  client_id: string;
  platform: string;
  postforme_account_id: string;
  username: string | null;
  profile_photo_url: string | null;
  status: string;
}

const platformIcons: Record<string, React.ReactNode> = {
  facebook: <Facebook className="h-4 w-4" />,
  instagram: <Instagram className="h-4 w-4" />,
  linkedin: <Linkedin className="h-4 w-4" />,
  twitter: <Twitter className="h-4 w-4" />,
  tiktok: <CircleDot className="h-4 w-4" />,
  youtube: <CircleDot className="h-4 w-4" />,
  bluesky: <CircleDot className="h-4 w-4" />,
  threads: <CircleDot className="h-4 w-4" />,
};

const platformColors: Record<string, string> = {
  facebook: "bg-blue-500",
  instagram: "bg-gradient-to-r from-purple-500 to-pink-500",
  linkedin: "bg-blue-700",
  twitter: "bg-sky-500",
  tiktok: "bg-black",
  youtube: "bg-red-600",
  bluesky: "bg-blue-400",
  threads: "bg-gray-800",
};

const SOCIAL_PLATFORMS = ["facebook", "instagram", "linkedin", "twitter"] as const;

const CONNECT_PLATFORMS = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "twitter", label: "X (Twitter)" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "bluesky", label: "Bluesky" },
  { id: "threads", label: "Threads" },
] as const;

export default function SocialMediaPostsPanel() {
  const queryClient = useQueryClient();
  const { adminPassword } = useAdminAuth();
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
  const [newPost, setNewPost] = useState({
    title: "",
    content: "",
    platform: "facebook",
    scheduledFor: "",
  });

  // Fetch clients
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

  // Fetch social posts for selected client
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

  // Fetch legacy OAuth tokens for selected client (kept for backward compat display)
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

  // Fetch Post for Me accounts for selected client
  const { data: pfmAccounts = [] } = useQuery({
    queryKey: ["pfm-accounts", selectedClient],
    enabled: !!selectedClient,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_postforme_accounts")
        .select("*")
        .eq("client_id", selectedClient)
        .eq("status", "connected");
      if (error) throw error;
      return data as PostForMeAccount[];
    },
  });

  // Fetch OAuth config
  const { data: oauthConfig } = useQuery({
    queryKey: ["oauth-config"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("oauth-config");
      if (error) throw error;
      return data as Record<string, { clientId: string; configured: boolean }>;
    },
  });

  // Pipeline status: green if PfM accounts connected, red if nothing.
  // Used to have a "yellow" tier for legacy OAuth + n8n; n8n is gone and
  // legacy OAuth tokens were never a real publish path on their own.
  const pfmConnectedPlatforms = pfmAccounts.map((a) => a.platform);
  const pipelineStatus: "green" | "red" = pfmConnectedPlatforms.length > 0 ? "green" : "red";

  const pipelineStatusConfig = {
    green: { color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/30", label: "Post for Me Ready" },
    red: { color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/30", label: "No Accounts Connected" },
  };

  // Connect Post for Me account
  const connectAccount = useMutation({
    mutationFn: async (platform: string) => {
      if (!selectedClient) throw new Error("Select a client first");
      const { data, error } = await supabase.functions.invoke("postforme-connect-account", {
        body: { clientId: selectedClient, platform, permissions: ["posts", "feeds"], password: adminPassword },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to connect account");
      }
      return data as { url: string; platform: string };
    },
    onSuccess: (data) => {
      window.open(data.url, "_blank");
      toast({
        title: `Redirecting to ${data.platform} login`,
        description: "After connecting, click Sync Accounts to refresh.",
      });
    },
    onError: (err) => toast({ title: "Connect failed", description: err.message, variant: "destructive" }),
  });

  // Sync Post for Me accounts
  const syncAccounts = useMutation({
    mutationFn: async () => {
      if (!selectedClient) throw new Error("Select a client first");
      const { data, error } = await supabase.functions.invoke("postforme-sync-accounts", {
        body: { clientId: selectedClient, password: adminPassword },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to sync accounts");
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pfm-accounts"] });
      toast({ title: "Synced", description: `${data?.synced ?? 0} account(s) synced from Post for Me` });
    },
    onError: (err) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  // Disconnect Post for Me account (remove from our DB only)
  const disconnectAccount = useMutation({
    mutationFn: async (pfmAccount: PostForMeAccount) => {
      const { error } = await supabase
        .from("client_postforme_accounts")
        .delete()
        .eq("id", pfmAccount.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pfm-accounts"] });
      toast({ title: "Account disconnected" });
    },
    onError: (err) => toast({ title: "Disconnect failed", description: err.message, variant: "destructive" }),
  });

  // Create post
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
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to create post");
      }
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

  // Delete post
  const deletePost = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("admin", {
        body: { action: "delete", table: "content_calendar", id },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to delete post");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      toast({ title: "Post deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error deleting post", description: error.message, variant: "destructive" });
    },
  });

  // Update post status
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
        body: { action: "update", table: "content_calendar", id, data: extraFields },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to update post status");
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      if (status === "approved") {
        toast({ title: "Post approved and queued", description: "Will publish at scheduled time via Post for Me" });
      } else {
        toast({ title: "Post status updated" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error updating post", description: error.message, variant: "destructive" });
    },
  });

  // Trigger publish now
  const triggerPublishNow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("publish-scheduled-content", {
        body: {},
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to trigger publish");
      }
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

  // Test pipeline
  const testPipeline = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("publish-scheduled-content", {
        body: {},
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to test pipeline");
      }
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

  // Update post
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
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to update post");
      }
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
    if (imageUrl) setSelectedImage(imageUrl);
    setIsCreateOpen(true);
  };

  const handleSave = () => {
    if (editingPost) {
      updatePost.mutate({ id: editingPost.id, post: newPost, imageUrl: selectedImage || undefined });
    } else {
      createPost.mutate({ ...newPost, imageUrl: selectedImage || undefined });
    }
  };

  const generateAIContent = async () => {
    if (!activeClient) {
      toast({ title: "Select a client first", variant: "destructive" });
      return;
    }
    setIsGeneratingContent(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-social-content", {
        body: {
          clientAccountId: activeClient.id,
          platforms: [newPost.platform],
          topic: contentTopic,
          tone: activeClient.tone || "professional",
          password: adminPassword,
        },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to generate content");
      }
      setNewPost((prev) => ({ ...prev, content: data.content || "" }));
      toast({ title: "Content generated!" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Error generating content", description: message, variant: "destructive" });
    } finally {
      setIsGeneratingContent(false);
    }
  };

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
        body: { prompt, platform: newPost.platform, count: 4, password: adminPassword },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to generate images");
      }
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
    if (authUrl) window.open(authUrl, "_blank", "width=600,height=700");
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
                <div className={`p-1.5 rounded ${platformColors[post.platform] || "bg-gray-500"} text-white`}>
                  {platformIcons[post.platform] || <CircleDot className="h-4 w-4" />}
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
                  <Zap className="h-3 w-3" /> Queued — publishes via Post for Me
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
                  title="Approve — queues for publishing via Post for Me"
                  onClick={() => updatePostStatus.mutate({ id: post.id, status: "approved" })}
                >
                  <ShieldCheck className="h-4 w-4" />
                </Button>
              )}
              {post.status !== "published" && (
                <>
                  <Button size="icon" variant="ghost" onClick={() => openEditDialog(post)}>
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
            <p className="text-muted-foreground">AI-generated content published via Post for Me</p>
          </div>
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
            title="Test the publishing pipeline"
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
            title="Run publish now for all due posts"
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
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="facebook"><div className="flex items-center gap-2"><Facebook className="h-4 w-4" /> Facebook</div></SelectItem>
                        <SelectItem value="instagram"><div className="flex items-center gap-2"><Instagram className="h-4 w-4" /> Instagram</div></SelectItem>
                        <SelectItem value="linkedin"><div className="flex items-center gap-2"><Linkedin className="h-4 w-4" /> LinkedIn</div></SelectItem>
                        <SelectItem value="twitter"><div className="flex items-center gap-2"><Twitter className="h-4 w-4" /> Twitter/X</div></SelectItem>
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
                      {isGeneratingContent ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
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
                  <p className="text-xs text-muted-foreground text-right">{newPost.content.length} characters</p>
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
                      {isGeneratingImages ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <ImageIcon className="h-4 w-4 mr-2" />}
                      Generate 4 Options
                    </Button>
                  </div>
                  <Input
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    placeholder="Describe the image (optional)"
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
                              selectedImage === img ? "border-primary ring-2 ring-primary ring-offset-2" : "border-transparent hover:border-muted-foreground/50"
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
          </div>
        </DialogContent>
      </Dialog>

      {!selectedClient && (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Select a client to get started</h3>
            <p className="text-muted-foreground">
              Choose a client from the dropdown above to manage their social accounts and posts
            </p>
          </CardContent>
        </Card>
      )}

      {selectedClient && (
        <Tabs defaultValue="accounts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="accounts">
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              Accounts ({pfmAccounts.length})
            </TabsTrigger>
            <TabsTrigger value="all">All ({posts.length})</TabsTrigger>
            <TabsTrigger value="draft">Drafts ({draftPosts.length})</TabsTrigger>
            <TabsTrigger value="approved">Approved ({approvedPosts.length})</TabsTrigger>
            <TabsTrigger value="scheduled">Scheduled ({scheduledPosts.length})</TabsTrigger>
            <TabsTrigger value="published">Published ({publishedPosts.length})</TabsTrigger>
          </TabsList>

          {/* Accounts Tab — Post for Me */}
          <TabsContent value="accounts" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Post for Me Connected Accounts</h3>
                <p className="text-sm text-muted-foreground">
                  Connect social accounts once — Post for Me handles OAuth and publishing for all platforms.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncAccounts.mutate()}
                disabled={syncAccounts.isPending}
              >
                {syncAccounts.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync Accounts
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {CONNECT_PLATFORMS.map(({ id: platformId, label }) => {
                const connected = pfmAccounts.find((a) => a.platform === platformId);
                const color = platformColors[platformId] || "bg-gray-500";
                const icon = platformIcons[platformId] || <CircleDot className="h-4 w-4" />;

                return (
                  <div
                    key={platformId}
                    className={cn(
                      "rounded-lg border p-4 space-y-3 transition-colors",
                      connected
                        ? "border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-800"
                        : "border-border bg-card"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${color} text-white flex-shrink-0`}>
                        {icon}
                      </div>
                      <span className="font-medium text-sm">{label}</span>
                      {connected && (
                        <CheckCircle className="h-3.5 w-3.5 text-green-600 ml-auto flex-shrink-0" />
                      )}
                    </div>

                    {connected ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {connected.profile_photo_url && (
                            <img
                              src={connected.profile_photo_url}
                              alt={connected.username || ""}
                              className="h-6 w-6 rounded-full object-cover"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{connected.username || "Connected"}</p>
                            <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-100 dark:bg-green-900/30 dark:text-green-400">
                              Connected
                            </Badge>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full h-7 text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => disconnectAccount.mutate(connected)}
                          disabled={disconnectAccount.isPending}
                        >
                          <Unplug className="h-3 w-3 mr-1" />
                          Disconnect
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-8 text-xs"
                        onClick={() => connectAccount.mutate(platformId)}
                        disabled={connectAccount.isPending || !selectedClient}
                      >
                        {connectAccount.isPending ? (
                          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <ExternalLink className="h-3 w-3 mr-1" />
                        )}
                        Connect
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legacy OAuth section (kept for backward compat) */}
            {oauthTokens.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground px-2">Legacy OAuth Tokens</span>
                  <div className="h-px flex-1 bg-border" />
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
              </div>
            )}
          </TabsContent>

          {/* Post tabs */}
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
