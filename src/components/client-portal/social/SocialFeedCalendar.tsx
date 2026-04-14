import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  CalendarDays, Linkedin, Instagram, Twitter, Facebook,
  Clock, CheckCircle2, FileEdit, AlertTriangle, Trash2, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SocialFeedCalendarProps {
  clientAccountId: string;
}

interface SocialPost {
  id: string;
  platform: string;
  content: string;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  ai_generated: boolean;
  topic: string | null;
  hashtags: string[];
  created_at: string;
}

const PLATFORM_META: Record<string, { icon: typeof Linkedin; color: string; name: string }> = {
  linkedin: { icon: Linkedin, color: "text-[#0A66C2]", name: "LinkedIn" },
  facebook: { icon: Facebook, color: "text-[#1877F2]", name: "Facebook" },
  instagram: { icon: Instagram, color: "text-[#E4405F]", name: "Instagram" },
  twitter: { icon: Twitter, color: "text-foreground", name: "Twitter / X" },
};

const STATUS_META: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  draft: { label: "Draft", icon: FileEdit, className: "bg-muted text-muted-foreground" },
  scheduled: { label: "Scheduled", icon: Clock, className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  published: { label: "Published", icon: CheckCircle2, className: "bg-green-500/10 text-green-600 border-green-500/20" },
  failed: { label: "Failed", icon: AlertTriangle, className: "bg-red-500/10 text-red-600 border-red-500/20" },
};

export function SocialFeedCalendar({ clientAccountId }: SocialFeedCalendarProps) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    fetchPosts();
  }, [clientAccountId]);

  const fetchPosts = async () => {
    try {
      const { data, error } = await supabase
        .from("social_media_posts")
        .select("*")
        .eq("client_account_id", clientAccountId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setPosts((data as SocialPost[]) || []);
    } catch (err) {
      console.error("Error fetching posts:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (postId: string) => {
    try {
      const { error } = await supabase.from("social_media_posts").delete().eq("id", postId);
      if (error) throw error;
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      toast({ title: "Post deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete post.", variant: "destructive" });
    }
  };

  const filtered = posts.filter((p) => {
    if (filterPlatform !== "all" && p.platform !== filterPlatform) return false;
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterPlatform} onValueChange={setFilterPlatform}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            <SelectItem value="linkedin">LinkedIn</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="twitter">Twitter / X</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="ml-auto">
          {filtered.length} post{filtered.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Posts */}
      {filtered.length === 0 ? (
        <Card className="border-0 bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CalendarDays className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold">No posts yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Use the Composer tab to create your first AI-generated social media post.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((post) => {
            const pm = PLATFORM_META[post.platform] || PLATFORM_META.linkedin;
            const sm = STATUS_META[post.status] || STATUS_META.draft;
            const Icon = pm.icon;
            const StatusIcon = sm.icon;

            return (
              <Card key={post.id} className="border-0 bg-muted/30 overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn("p-2 rounded-lg bg-muted shrink-0")}>
                      <Icon className={cn("h-4 w-4", pm.color)} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{pm.name}</span>
                        <Badge variant="outline" className={cn("text-xs gap-1", sm.className)}>
                          <StatusIcon className="h-3 w-3" />
                          {sm.label}
                        </Badge>
                        {post.ai_generated && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <span className="text-primary">✦</span> AI
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                        {post.content}
                      </p>
                      {post.hashtags && post.hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {post.hashtags.map((tag) => (
                            <span key={tag} className="text-xs text-primary">#{tag}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {post.scheduled_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(post.scheduled_at).toLocaleDateString()} at{" "}
                            {new Date(post.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        <span>Created {new Date(post.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {post.status === "draft" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(post.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
