import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { 
  BookOpen, 
  Video, 
  FileText, 
  ExternalLink, 
  Clock, 
  CheckCircle2, 
  Play,
  Search,
  Sparkles,
  TrendingUp,
  GraduationCap,
  Trophy,
  Bookmark,
  BookmarkCheck
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface LearningContent {
  id: string;
  title: string;
  description: string | null;
  content_type: string;
  content_url: string | null;
  content_body: string | null;
  thumbnail_url: string | null;
  estimated_read_time: number | null;
  tags: string[] | null;
  industry: string | null;
  difficulty_level: string | null;
  is_featured: boolean | null;
  view_count: number | null;
}

interface LearningProgress {
  content_id: string;
  completed_at: string | null;
  is_bookmarked: boolean | null;
  viewed_at: string | null;
}

interface ClientLearningHubTabProps {
  clientAccountId: string;
}

const contentTypeIcons: Record<string, React.ReactNode> = {
  video: <Video className="h-4 w-4" />,
  article: <FileText className="h-4 w-4" />,
  guide: <BookOpen className="h-4 w-4" />,
  tutorial: <GraduationCap className="h-4 w-4" />,
};

const contentTypeColors: Record<string, string> = {
  video: "bg-red-500/10 text-red-600 border-red-500/20",
  article: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  guide: "bg-green-500/10 text-green-600 border-green-500/20",
  tutorial: "bg-purple-500/10 text-purple-600 border-purple-500/20",
};

const difficultyColors: Record<string, string> = {
  beginner: "bg-green-500/10 text-green-600",
  intermediate: "bg-amber-500/10 text-amber-600",
  advanced: "bg-red-500/10 text-red-600",
};

export function ClientLearningHubTab({ clientAccountId }: ClientLearningHubTabProps) {
  const [content, setContent] = useState<LearningContent[]>([]);
  const [progress, setProgress] = useState<Record<string, LearningProgress>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedContent, setSelectedContent] = useState<LearningContent | null>(null);

  useEffect(() => {
    fetchContent();
    fetchProgress();
  }, [clientAccountId]);

  const fetchContent = async () => {
    try {
      const { data, error } = await supabase
        .from("learning_content")
        .select("*")
        .eq("is_published", true)
        .order("is_featured", { ascending: false });

      if (error) throw error;
      setContent(data || []);
    } catch (error) {
      console.error("Error fetching learning content:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProgress = async () => {
    try {
      const { data, error } = await supabase
        .from("learning_progress")
        .select("*")
        .eq("client_account_id", clientAccountId);

      if (error) throw error;
      
      const progressMap: Record<string, LearningProgress> = {};
      data?.forEach(p => {
        progressMap[p.content_id] = {
          content_id: p.content_id,
          completed_at: p.completed_at,
          is_bookmarked: p.is_bookmarked,
          viewed_at: p.viewed_at,
        };
      });
      setProgress(progressMap);
    } catch (error) {
      console.error("Error fetching learning progress:", error);
    }
  };

  const markAsComplete = async (contentId: string) => {
    try {
      const existing = progress[contentId];
      
      if (existing) {
        const { error } = await supabase
          .from("learning_progress")
          .update({
            completed_at: new Date().toISOString(),
          })
          .eq("client_account_id", clientAccountId)
          .eq("content_id", contentId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("learning_progress")
          .insert({
            client_account_id: clientAccountId,
            content_id: contentId,
            completed_at: new Date().toISOString(),
            viewed_at: new Date().toISOString(),
          });

        if (error) throw error;
      }
      
      setProgress(prev => ({
        ...prev,
        [contentId]: {
          ...prev[contentId],
          content_id: contentId,
          completed_at: new Date().toISOString(),
          is_bookmarked: prev[contentId]?.is_bookmarked || null,
          viewed_at: prev[contentId]?.viewed_at || new Date().toISOString(),
        }
      }));

      toast({ title: "Marked as complete!" });
    } catch (error) {
      console.error("Error updating progress:", error);
      toast({ title: "Error updating progress", variant: "destructive" });
    }
  };

  const toggleBookmark = async (contentId: string) => {
    try {
      const existing = progress[contentId];
      const newBookmarkState = !existing?.is_bookmarked;
      
      if (existing) {
        const { error } = await supabase
          .from("learning_progress")
          .update({
            is_bookmarked: newBookmarkState,
          })
          .eq("client_account_id", clientAccountId)
          .eq("content_id", contentId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("learning_progress")
          .insert({
            client_account_id: clientAccountId,
            content_id: contentId,
            is_bookmarked: true,
            viewed_at: new Date().toISOString(),
          });

        if (error) throw error;
      }
      
      setProgress(prev => ({
        ...prev,
        [contentId]: {
          ...prev[contentId],
          content_id: contentId,
          is_bookmarked: newBookmarkState,
          completed_at: prev[contentId]?.completed_at || null,
          viewed_at: prev[contentId]?.viewed_at || new Date().toISOString(),
        }
      }));

      toast({ title: newBookmarkState ? "Bookmarked!" : "Removed from bookmarks" });
    } catch (error) {
      console.error("Error toggling bookmark:", error);
      toast({ title: "Error updating bookmark", variant: "destructive" });
    }
  };

  // Filter content
  const filteredContent = content.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === "all" || item.content_type === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  // Get featured content
  const featuredContent = filteredContent.filter(item => item.is_featured);
  const regularContent = filteredContent.filter(item => !item.is_featured);

  // Calculate overall progress
  const completedCount = Object.values(progress).filter(p => p.completed_at).length;
  const bookmarkedCount = Object.values(progress).filter(p => p.is_bookmarked).length;

  // Get unique content types for filter
  const contentTypes = [...new Set(content.map(c => c.content_type))];

  const ContentCard = ({ item }: { item: LearningContent }) => {
    const itemProgress = progress[item.id];
    const isCompleted = itemProgress?.completed_at;
    const isBookmarked = itemProgress?.is_bookmarked;

    return (
      <Card 
        className={cn(
          "group cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1 border-border/50",
          isCompleted && "ring-2 ring-green-500/20"
        )}
        onClick={() => setSelectedContent(item)}
      >
        {/* Thumbnail */}
        <div className="relative aspect-video bg-gradient-to-br from-muted to-muted/50 rounded-t-lg overflow-hidden">
          {item.thumbnail_url ? (
            <img 
              src={item.thumbnail_url} 
              alt={item.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                {contentTypeIcons[item.content_type] || <BookOpen className="h-8 w-8 text-primary" />}
              </div>
            </div>
          )}
          
          {/* Play overlay for videos */}
          {item.content_type === "video" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="h-14 w-14 rounded-full bg-white/90 flex items-center justify-center shadow-xl">
                <Play className="h-6 w-6 text-primary ml-1" />
              </div>
            </div>
          )}
          
          {/* Featured badge */}
          {item.is_featured && (
            <div className="absolute top-3 left-3">
              <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 shadow-lg">
                <Sparkles className="h-3 w-3 mr-1" />
                Featured
              </Badge>
            </div>
          )}
          
          {/* Completed badge */}
          {isCompleted && (
            <div className="absolute top-3 right-3">
              <div className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
                <CheckCircle2 className="h-5 w-5 text-white" />
              </div>
            </div>
          )}
          
          {/* Duration */}
          {item.estimated_read_time && (
            <div className="absolute bottom-3 right-3 bg-black/70 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {item.estimated_read_time} min
            </div>
          )}
        </div>
        
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            {/* Content type badge */}
            <Badge 
              variant="outline" 
              className={cn("text-[10px] uppercase tracking-wider", contentTypeColors[item.content_type])}
            >
              {contentTypeIcons[item.content_type]}
              <span className="ml-1">{item.content_type}</span>
            </Badge>
            
            {/* Difficulty */}
            {item.difficulty_level && (
              <Badge variant="secondary" className={cn("text-[10px] capitalize", difficultyColors[item.difficulty_level])}>
                {item.difficulty_level}
              </Badge>
            )}
          </div>
          
          <h3 className="font-semibold line-clamp-2 group-hover:text-primary transition-colors">
            {item.title}
          </h3>
          
          {item.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
              {item.description}
            </p>
          )}
          
          {/* Tags */}
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {item.tags.slice(0, 3).map(tag => (
                <Badge key={tag} variant="secondary" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Content detail view
  if (selectedContent) {
    const itemProgress = progress[selectedContent.id];
    const isCompleted = itemProgress?.completed_at;
    const isBookmarked = itemProgress?.is_bookmarked;

    return (
      <div className="space-y-6">
        <Button 
          variant="ghost" 
          onClick={() => setSelectedContent(null)}
          className="mb-4"
        >
          ← Back to Learning Hub
        </Button>
        
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge 
                    variant="outline" 
                    className={cn(contentTypeColors[selectedContent.content_type])}
                  >
                    {contentTypeIcons[selectedContent.content_type]}
                    <span className="ml-1 capitalize">{selectedContent.content_type}</span>
                  </Badge>
                  {selectedContent.difficulty_level && (
                    <Badge variant="secondary" className={cn("capitalize", difficultyColors[selectedContent.difficulty_level])}>
                      {selectedContent.difficulty_level}
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-2xl">{selectedContent.title}</CardTitle>
                <CardDescription className="mt-2">{selectedContent.description}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {selectedContent.estimated_read_time && (
                  <Badge variant="secondary" className="shrink-0">
                    <Clock className="h-3 w-3 mr-1" />
                    {selectedContent.estimated_read_time} min
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleBookmark(selectedContent.id);
                  }}
                >
                  {isBookmarked ? (
                    <BookmarkCheck className="h-5 w-5 text-primary" />
                  ) : (
                    <Bookmark className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Video embed or content */}
            {selectedContent.content_type === "video" && selectedContent.content_url && (
              <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                <iframe
                  src={selectedContent.content_url}
                  className="w-full h-full"
                  allowFullScreen
                  title={selectedContent.title}
                />
              </div>
            )}
            
            {/* Article/Guide content */}
            {selectedContent.content_body && (
              <div 
                className="prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: selectedContent.content_body }}
              />
            )}
            
            {/* External link */}
            {selectedContent.content_url && selectedContent.content_type !== "video" && (
              <Button asChild>
                <a href={selectedContent.content_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Resource
                </a>
              </Button>
            )}
            
            {/* Progress actions */}
            <div className="flex items-center gap-4 pt-4 border-t">
              {isCompleted ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Completed!</span>
                </div>
              ) : (
                <Button onClick={() => markAsComplete(selectedContent.id)}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Mark as Complete
                </Button>
              )}
            </div>
            
            {/* Tags */}
            {selectedContent.tags && selectedContent.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-4 border-t">
                {selectedContent.tags.map(tag => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <GraduationCap className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Resources</p>
                <p className="text-2xl font-bold">{content.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-500/5 to-green-500/10 border-green-500/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Trophy className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{completedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 border-amber-500/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Bookmark className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Bookmarked</p>
                <p className="text-2xl font-bold">{bookmarkedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search resources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full sm:w-auto">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {contentTypes.map(type => (
              <TabsTrigger key={type} value={type} className="capitalize">
                {type}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="animate-pulse">
              <div className="aspect-video bg-muted rounded-t-lg" />
              <CardContent className="p-4 space-y-2">
                <div className="h-4 bg-muted rounded w-20" />
                <div className="h-5 bg-muted rounded w-full" />
                <div className="h-4 bg-muted rounded w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredContent.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="max-w-md mx-auto space-y-4">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No resources found</h3>
            <p className="text-muted-foreground">
              {searchQuery 
                ? "Try adjusting your search or filters"
                : "Learning content will appear here once published"
              }
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* Featured section */}
          {featuredContent.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500" />
                Featured Resources
              </h2>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {featuredContent.map(item => (
                  <ContentCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}
          
          {/* All content */}
          {regularContent.length > 0 && (
            <div className="space-y-4">
              {featuredContent.length > 0 && (
                <h2 className="text-lg font-semibold">All Resources</h2>
              )}
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {regularContent.map(item => (
                  <ContentCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
