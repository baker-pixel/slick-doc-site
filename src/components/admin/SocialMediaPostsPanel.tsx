import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { 
  Send, 
  Clock, 
  CheckCircle, 
  Edit, 
  Trash2, 
  Plus, 
  Facebook, 
  Instagram, 
  Linkedin, 
  Twitter,
  RefreshCw,
  Sparkles,
  Copy,
  Calendar
} from "lucide-react";

interface Client {
  id: string;
  business_name: string;
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

export default function SocialMediaPostsPanel() {
  const queryClient = useQueryClient();
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
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
        .select("id, business_name")
        .eq("status", "active")
        .order("business_name");
      if (error) throw error;
      return data as Client[];
    },
  });

  // Fetch social posts from content_calendar
  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["social-posts", selectedClient],
    queryFn: async () => {
      let query = supabase
        .from("content_calendar")
        .select("*")
        .in("platform", ["facebook", "instagram", "linkedin", "twitter"])
        .order("scheduled_for", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return data as SocialPost[];
    },
  });

  // Create post mutation
  const createPost = useMutation({
    mutationFn: async (post: typeof newPost) => {
      const { error } = await supabase.from("content_calendar").insert({
        title: post.title,
        content: post.content,
        platform: post.platform,
        content_type: "social_post",
        scheduled_for: post.scheduledFor || new Date().toISOString(),
        status: post.scheduledFor ? "scheduled" : "draft",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      setIsCreateOpen(false);
      setNewPost({ title: "", content: "", platform: "facebook", scheduledFor: "" });
      toast({ title: "Post created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating post", description: error.message, variant: "destructive" });
    },
  });

  // Delete post mutation
  const deletePost = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("content_calendar").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      toast({ title: "Post deleted" });
    },
  });

  // Update post status mutation
  const updatePostStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("content_calendar")
        .update({ status, published_at: status === "published" ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      toast({ title: "Post updated" });
    },
  });

  // Generate AI post
  const generateAIPost = async () => {
    if (!selectedClient) {
      toast({ title: "Please select a client first", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    try {
      const client = clients.find((c) => c.id === selectedClient);
      const { data, error } = await supabase.functions.invoke("chat", {
        body: {
          messages: [
            {
              role: "user",
              content: `Create a compelling social media post for ${client?.business_name || "a business"} for ${newPost.platform}. 
              The post should be engaging, include a call-to-action, and be appropriate for the platform's character limits and style.
              Return ONLY the post content, no explanations.`,
            },
          ],
        },
      });

      if (error) throw error;

      const content = data?.choices?.[0]?.message?.content || data?.content || "";
      setNewPost((prev) => ({ ...prev, content: content.trim() }));
      toast({ title: "Post generated!" });
    } catch (error: any) {
      toast({ title: "Error generating post", description: error.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({ title: "Copied to clipboard" });
  };

  const draftPosts = posts.filter((p) => p.status === "draft");
  const scheduledPosts = posts.filter((p) => p.status === "scheduled");
  const publishedPosts = posts.filter((p) => p.status === "published");

  const PostCard = ({ post }: { post: SocialPost }) => (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded ${platformColors[post.platform]} text-white`}>
                {platformIcons[post.platform]}
              </div>
              <span className="font-medium capitalize">{post.platform}</span>
              <Badge
                variant={
                  post.status === "published"
                    ? "default"
                    : post.status === "scheduled"
                    ? "secondary"
                    : "outline"
                }
              >
                {post.status}
              </Badge>
            </div>
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
          </div>
          <div className="flex flex-col gap-1">
            <Button size="icon" variant="ghost" onClick={() => copyToClipboard(post.content)}>
              <Copy className="h-4 w-4" />
            </Button>
            {post.status !== "published" && (
              <Button
                size="icon"
                variant="ghost"
                className="text-green-500 hover:text-green-600"
                onClick={() => updatePostStatus.mutate({ id: post.id, status: "published" })}
              >
                <Send className="h-4 w-4" />
              </Button>
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Social Media Posts</h2>
          <p className="text-muted-foreground">Create, schedule, and manage social content</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.business_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Post
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Social Media Post</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
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
                        <div className="flex items-center gap-2">
                          <Facebook className="h-4 w-4" /> Facebook
                        </div>
                      </SelectItem>
                      <SelectItem value="instagram">
                        <div className="flex items-center gap-2">
                          <Instagram className="h-4 w-4" /> Instagram
                        </div>
                      </SelectItem>
                      <SelectItem value="linkedin">
                        <div className="flex items-center gap-2">
                          <Linkedin className="h-4 w-4" /> LinkedIn
                        </div>
                      </SelectItem>
                      <SelectItem value="twitter">
                        <div className="flex items-center gap-2">
                          <Twitter className="h-4 w-4" /> Twitter/X
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Title (optional)</Label>
                  <Input
                    value={newPost.title}
                    onChange={(e) => setNewPost((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Post title for internal reference"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Content</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={generateAIPost}
                      disabled={isGenerating}
                    >
                      {isGenerating ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      Generate with AI
                    </Button>
                  </div>
                  <Textarea
                    value={newPost.content}
                    onChange={(e) => setNewPost((prev) => ({ ...prev, content: e.target.value }))}
                    placeholder="Write your post content..."
                    rows={5}
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {newPost.content.length} characters
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Schedule (optional)</Label>
                  <Input
                    type="datetime-local"
                    value={newPost.scheduledFor}
                    onChange={(e) => setNewPost((prev) => ({ ...prev, scheduledFor: e.target.value }))}
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => createPost.mutate(newPost)}
                    disabled={!newPost.content || createPost.isPending}
                  >
                    {newPost.scheduledFor ? "Schedule Post" : "Save as Draft"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All ({posts.length})</TabsTrigger>
          <TabsTrigger value="draft">Drafts ({draftPosts.length})</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled ({scheduledPosts.length})</TabsTrigger>
          <TabsTrigger value="published">Published ({publishedPosts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading posts...</div>
          ) : posts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Send className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No social posts yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first social media post to get started
                </p>
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Post
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="draft" className="space-y-4">
          {draftPosts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No draft posts</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {draftPosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="scheduled" className="space-y-4">
          {scheduledPosts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No scheduled posts</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {scheduledPosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="published" className="space-y-4">
          {publishedPosts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No published posts</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {publishedPosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
