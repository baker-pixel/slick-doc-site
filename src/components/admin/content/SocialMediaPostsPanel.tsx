import { postDisplayStatus } from "@/lib/postStatus";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import { isPlaceholderContent } from "@/lib/contentPlaceholder";
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
  Hourglass,
  Zap,
  Link2,
  CircleDot,
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
  content_id?: string | null;
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

const CONNECT_PLATFORMS = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "twitter", label: "X (Twitter)" },
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
  // Destructive / outward-facing actions all go through one confirm dialog.
  const [confirm, setConfirm] = useState<
    | { kind: "delete"; post: SocialPost }
    | { kind: "manual"; post: SocialPost }
    | { kind: "approve"; post: SocialPost }
    | { kind: "publish" }
    | null
  >(null);
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

  // Posts the client is still deciding on. A draft in this set is NOT
  // "hidden from the client" -- the automation already sent it to their
  // Approvals tab -- so the admin must not be offered a bypass approve.
  const { data: withClientIds = new Set<string>() } = useQuery({
    queryKey: ["social-with-client", selectedClient],
    enabled: !!selectedClient,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_approvals")
        .select("content_id")
        .eq("client_account_id", selectedClient)
        .eq("status", "pending");
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.content_id).filter(Boolean) as string[]);
    },
  });
  const isWithClient = (p: SocialPost) =>
    p.status === "draft" && (!!p.content_id && withClientIds.has(p.content_id));

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
    mutationFn: async ({ id, status, metadata }: { id: string; status: string; metadata?: Record<string, unknown> | null }) => {
      const extraFields: Record<string, unknown> = {};
      if (status === "approved") {
        extraFields.client_approved = true;
        extraFields.status = "scheduled";
      } else {
        extraFields.status = status;
        if (status === "published") {
          extraFields.published_at = new Date().toISOString();
          // Nothing was sent by us -- record that, so the UI never claims a
          // platform confirmation that doesn't exist.
          extraFields.metadata = { ...(metadata ?? {}), publish_verification: "manual", manually_marked_at: new Date().toISOString() };
        }
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
        toast({ title: "Scheduled", description: "Approved on the client's behalf — it will publish at the scheduled time via Post for Me." });
      } else if (status === "published") {
        toast({ title: "Marked as posted manually", description: "Nothing was sent from here — this just records that it was posted." });
      } else {
        toast({ title: "Post status updated" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error updating post", description: error.message, variant: "destructive" });
    },
  });

  // Generate a full round of posts for the selected client in one go:
  // ensure this month's slots exist, draft them with AI, then force-generate
  // any missing Instagram images right now instead of waiting on the batch
  // window.
  const generateAllForClient = useMutation({
    mutationFn: async () => {
      if (!selectedClient) throw new Error("Select a client first");

      const scheduleRes = await supabase.functions.invoke("auto-schedule-content", {
        body: { client_id: selectedClient, password: adminPassword },
      });
      if (scheduleRes.error || scheduleRes.data?.error) {
        const msg = await getEdgeErrorMessage(scheduleRes.error, scheduleRes.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to schedule content slots");
      }

      const fillRes = await supabase.functions.invoke("fill-scheduled-content", {
        body: { client_id: selectedClient, limit: 50, password: adminPassword },
      });
      if (fillRes.error || fillRes.data?.error) {
        const msg = await getEdgeErrorMessage(fillRes.error, fillRes.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to draft content");
      }

      const imagesRes = await supabase.functions.invoke("sync-fill-missing-images", {
        body: { client_id: selectedClient, force: true, password: adminPassword },
      });
      if (imagesRes.error || imagesRes.data?.error) {
        const msg = await getEdgeErrorMessage(imagesRes.error, imagesRes.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to generate images");
      }

      return {
        created: scheduleRes.data?.total_created ?? 0,
        drafted: fillRes.data?.successful ?? 0,
        imagesFilled: imagesRes.data?.filled ?? 0,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      toast({
        title: "Generated posts for client",
        description: `${data.created} new slot(s) scheduled · ${data.drafted} drafted with AI · ${data.imagesFilled} image(s) generated`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Generate all failed", description: error.message, variant: "destructive" });
    },
  });

  // Publish everything that is due, for every client. (This used to exist
  // twice -- "Publish Now" and "Test Pipeline" -- calling the same function
  // with the same body; the "test" published real posts.)
  const publishDue = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("publish-scheduled-content", {
        body: { password: adminPassword },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to publish");
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
      content: isPlaceholderContent(post.content) ? "" : post.content,
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

  const withClientPosts = posts.filter(isWithClient);
  const draftPosts = posts.filter((p) => p.status === "draft" && !isWithClient(p));
  const approvedPosts = posts.filter((p) => p.status === "approved");
  const scheduledPosts = posts.filter((p) => p.status === "scheduled" || postDisplayStatus(p).key === "sending");
  const publishedPosts = posts.filter((p) => p.status === "published" && postDisplayStatus(p).key === "published");

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
                {isWithClient(post) ? (
                  <Badge variant="secondary" className="bg-sky-500/15 text-sky-700 dark:text-sky-400" title="Sent to the client's Approvals tab automatically">
                    <Hourglass className="h-3 w-3 mr-1" />
                    With client
                  </Badge>
                ) : (
                  <Badge
                    variant={postDisplayStatus(post).variant}
                    className={post.status === "approved" ? "bg-green-600" : ""}
                    title={postDisplayStatus(post).note}
                  >
                    {post.status === "draft" && <EyeOff className="h-3 w-3 mr-1" />}
                    {post.status === "approved" && <Eye className="h-3 w-3 mr-1" />}
                    {postDisplayStatus(post).label}
                  </Badge>
                )}
              </div>
              {post.client_account_id && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3" />
                  {getClientName(post.client_account_id)}
                </div>
              )}
              {post.title && <h4 className="font-medium">{post.title}</h4>}
              {isPlaceholderContent(post.content) ? (
                <p className="text-sm text-amber-600 italic flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" /> Caption not generated yet
                </p>
              ) : (
                <p className="text-sm text-muted-foreground line-clamp-3">{post.content}</p>
              )}
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
              {isWithClient(post) && (
                <p className="text-xs text-sky-600 flex items-center gap-1">
                  <Hourglass className="h-3 w-3" /> Waiting for the client to approve — nothing to do here
                </p>
              )}
              {post.status === "draft" && !isWithClient(post) && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <EyeOff className="h-3 w-3" /> Not sent to the client
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
            <div className="flex flex-col gap-1 items-stretch min-w-[7.5rem]">
              <Button size="sm" variant="ghost" className="justify-start" disabled={isPlaceholderContent(post.content)} onClick={() => copyToClipboard(post.content)}>
                <Copy className="h-4 w-4 mr-2" /> Copy
              </Button>
              {post.status === "draft" && !isWithClient(post) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="justify-start text-green-600 hover:text-green-700"
                  title={isPlaceholderContent(post.content) ? "Caption still generating — can't approve yet" : "Schedules this post for publishing WITHOUT sending it to the client for approval"}
                  disabled={isPlaceholderContent(post.content)}
                  onClick={() => setConfirm({ kind: "approve", post })}
                >
                  <ShieldCheck className="h-4 w-4 mr-2" /> Approve &amp; schedule
                </Button>
              )}
              {post.status !== "published" && !isWithClient(post) && (
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => openEditDialog(post)}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </Button>
              )}
              {(post.status === "approved" || post.status === "scheduled") && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="justify-start text-blue-500 hover:text-blue-600"
                  title="Only for posts you published outside this system — it does not publish anything"
                  onClick={() => setConfirm({ kind: "manual", post })}
                >
                  <CheckCircle className="h-4 w-4 mr-2" /> Mark posted
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="justify-start text-destructive hover:text-destructive"
                onClick={() => setConfirm({ kind: "delete", post })}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete
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
            onClick={() => generateAllForClient.mutate()}
            disabled={!selectedClient || generateAllForClient.isPending}
            title="Schedule, draft, and generate images for this client's social posts right now"
          >
            {generateAllForClient.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4 mr-2" />
            )}
            Generate All Posts
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirm({ kind: "publish" })}
            disabled={publishDue.isPending}
            title="Publish every post that is due right now, for ALL clients (the scheduler already does this automatically)"
          >
            {publishDue.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Publish due posts
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

      {/* One confirm for every destructive / outward-facing action */}
      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "delete" && "Delete this post?"}
              {confirm?.kind === "manual" && "Mark as posted manually?"}
              {confirm?.kind === "approve" && "Approve and schedule without the client?"}
              {confirm?.kind === "publish" && "Publish all due posts now?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "delete" && "This permanently removes the post. It can't be undone."}
              {confirm?.kind === "manual" && "Use this only if the post was published outside this system. Nothing is sent from here — it just records the post as published."}
              {confirm?.kind === "approve" && "This skips the client's Approvals tab and queues the post to publish at its scheduled time. Client-facing posts normally go through client approval."}
              {confirm?.kind === "publish" && "Publishes every approved post that is due, for ALL clients, immediately. The scheduler already does this automatically."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirm?.kind === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={() => {
                if (!confirm) return;
                if (confirm.kind === "delete") deletePost.mutate(confirm.post.id);
                if (confirm.kind === "manual") updatePostStatus.mutate({ id: confirm.post.id, status: "published", metadata: confirm.post.metadata });
                if (confirm.kind === "approve") updatePostStatus.mutate({ id: confirm.post.id, status: "approved" });
                if (confirm.kind === "publish") publishDue.mutate();
                setConfirm(null);
              }}
            >
              {confirm?.kind === "delete" && "Delete"}
              {confirm?.kind === "manual" && "Mark as posted"}
              {confirm?.kind === "approve" && "Approve & schedule"}
              {confirm?.kind === "publish" && "Publish now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Test Pipeline Result Dialog */}
      <Dialog open={testResultOpen} onOpenChange={setTestResultOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Publish Results
            </DialogTitle>
            <DialogDescription>What happened when due posts were published just now</DialogDescription>
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
            <TabsTrigger value="with_client">With client ({withClientPosts.length})</TabsTrigger>
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
          </TabsContent>

          {/* Post tabs */}
          {[
            { value: "all", data: posts },
            { value: "with_client", data: withClientPosts },
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
