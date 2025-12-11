import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { 
  BookOpen, 
  Video, 
  FileText, 
  Clock, 
  CheckCircle2, 
  Play,
  Search,
  Sparkles,
  GraduationCap,
  Trophy,
  Bookmark,
  BookmarkCheck,
  ArrowLeft,
  ArrowRight,
  TrendingUp,
  Zap,
  Target
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

// Import images
import heroMarketing from "@/assets/learning/hero-marketing.png";
import localSeoImg from "@/assets/learning/local-seo.png";
import googleAdsImg from "@/assets/learning/google-ads.png";
import emailMarketingImg from "@/assets/learning/email-marketing.png";
import analyticsImg from "@/assets/learning/analytics.png";
import reviewsImg from "@/assets/learning/reviews.png";
import socialMediaImg from "@/assets/learning/social-media.png";
import websiteSpeedImg from "@/assets/learning/website-speed.png";
import contentMarketingImg from "@/assets/learning/content-marketing.png";
import mobileFirstImg from "@/assets/learning/mobile-first.png";
import leadFollowupImg from "@/assets/learning/lead-followup.png";

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

// Map content titles to images
const imageMap: Record<string, string> = {
  "Why Local SEO Is Your Secret Weapon for Growth": localSeoImg,
  "The Small Business Guide to Google Ads That Actually Convert": googleAdsImg,
  "Email Marketing: Your Most Profitable Channel": emailMarketingImg,
  "Understanding Your Website Analytics (Without the Headache)": analyticsImg,
  "The Power of Online Reviews (And How to Get More)": reviewsImg,
  "Social Media for Small Business: Quality Over Quantity": socialMediaImg,
  "Website Speed: The Silent Conversion Killer": websiteSpeedImg,
  "Content Marketing: Attract Customers With Value": contentMarketingImg,
  "Mobile-First: Why Your Website Must Work on Phones": mobileFirstImg,
  "Lead Follow-Up: The Fortune Is in the Follow-Up": leadFollowupImg,
};

const contentTypeIcons: Record<string, React.ReactNode> = {
  video: <Video className="h-4 w-4" />,
  article: <FileText className="h-4 w-4" />,
  guide: <BookOpen className="h-4 w-4" />,
  tutorial: <GraduationCap className="h-4 w-4" />,
};

const contentTypeColors: Record<string, string> = {
  video: "bg-red-500/10 text-red-500 border-red-500/20",
  article: "bg-sky-500/10 text-sky-500 border-sky-500/20",
  guide: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  tutorial: "bg-violet-500/10 text-violet-500 border-violet-500/20",
};

const difficultyColors: Record<string, string> = {
  beginner: "bg-emerald-500/10 text-emerald-500",
  intermediate: "bg-amber-500/10 text-amber-500",
  advanced: "bg-rose-500/10 text-rose-500",
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
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
        await supabase
          .from("learning_progress")
          .update({ completed_at: new Date().toISOString() })
          .eq("client_account_id", clientAccountId)
          .eq("content_id", contentId);
      } else {
        await supabase
          .from("learning_progress")
          .insert({
            client_account_id: clientAccountId,
            content_id: contentId,
            completed_at: new Date().toISOString(),
            viewed_at: new Date().toISOString(),
          });
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

      toast({ title: "Article marked as complete!" });
    } catch (error) {
      console.error("Error updating progress:", error);
      toast({ title: "Error updating progress", variant: "destructive" });
    }
  };

  const toggleBookmark = async (contentId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const existing = progress[contentId];
      const newBookmarkState = !existing?.is_bookmarked;
      
      if (existing) {
        await supabase
          .from("learning_progress")
          .update({ is_bookmarked: newBookmarkState })
          .eq("client_account_id", clientAccountId)
          .eq("content_id", contentId);
      } else {
        await supabase
          .from("learning_progress")
          .insert({
            client_account_id: clientAccountId,
            content_id: contentId,
            is_bookmarked: true,
            viewed_at: new Date().toISOString(),
          });
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

      toast({ title: newBookmarkState ? "Saved to bookmarks" : "Removed from bookmarks" });
    } catch (error) {
      console.error("Error toggling bookmark:", error);
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

  const featuredContent = filteredContent.filter(item => item.is_featured);
  const regularContent = filteredContent.filter(item => !item.is_featured);
  const completedCount = Object.values(progress).filter(p => p.completed_at).length;
  const bookmarkedCount = Object.values(progress).filter(p => p.is_bookmarked).length;
  const contentTypes = [...new Set(content.map(c => c.content_type))];

  const getImage = (item: LearningContent) => {
    return imageMap[item.title] || item.thumbnail_url || heroMarketing;
  };

  // Article detail view
  if (selectedContent) {
    const itemProgress = progress[selectedContent.id];
    const isCompleted = itemProgress?.completed_at;
    const isBookmarked = itemProgress?.is_bookmarked;
    const currentIndex = content.findIndex(c => c.id === selectedContent.id);
    const prevArticle = currentIndex > 0 ? content[currentIndex - 1] : null;
    const nextArticle = currentIndex < content.length - 1 ? content[currentIndex + 1] : null;

    return (
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="space-y-8"
      >
        {/* Back button */}
        <Button 
          variant="ghost" 
          onClick={() => setSelectedContent(null)}
          className="group"
        >
          <ArrowLeft className="h-4 w-4 mr-2 transition-transform group-hover:-translate-x-1" />
          Back to Learning Hub
        </Button>
        
        {/* Hero image */}
        <div className="relative h-64 md:h-80 lg:h-96 rounded-2xl overflow-hidden">
          <img 
            src={getImage(selectedContent)} 
            alt={selectedContent.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
            <div className="flex items-center gap-2 mb-3">
              <Badge className={cn("border", contentTypeColors[selectedContent.content_type])}>
                {contentTypeIcons[selectedContent.content_type]}
                <span className="ml-1 capitalize">{selectedContent.content_type}</span>
              </Badge>
              {selectedContent.difficulty_level && (
                <Badge variant="secondary" className={cn("capitalize", difficultyColors[selectedContent.difficulty_level])}>
                  {selectedContent.difficulty_level}
                </Badge>
              )}
              {selectedContent.estimated_read_time && (
                <Badge variant="secondary" className="bg-white/10 text-white border-white/20">
                  <Clock className="h-3 w-3 mr-1" />
                  {selectedContent.estimated_read_time} min read
                </Badge>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white">
              {selectedContent.title}
            </h1>
          </div>

          {/* Bookmark button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 text-white"
            onClick={(e) => toggleBookmark(selectedContent.id, e)}
          >
            {isBookmarked ? (
              <BookmarkCheck className="h-5 w-5 fill-current" />
            ) : (
              <Bookmark className="h-5 w-5" />
            )}
          </Button>
        </div>

        {/* Article content */}
        <div className="max-w-4xl mx-auto">
          {selectedContent.description && (
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              {selectedContent.description}
            </p>
          )}

          {selectedContent.content_body && (
            <motion.article 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="prose prose-lg max-w-none dark:prose-invert 
                prose-headings:font-bold prose-headings:tracking-tight
                prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
                prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
                prose-p:text-muted-foreground prose-p:leading-relaxed
                prose-li:text-muted-foreground
                prose-strong:text-foreground prose-strong:font-semibold
                prose-ul:my-4 prose-ol:my-4
                prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
              dangerouslySetInnerHTML={{ __html: selectedContent.content_body }}
            />
          )}

          {/* Tags */}
          {selectedContent.tags && selectedContent.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-10 pt-6 border-t">
              {selectedContent.tags.map(tag => (
                <Badge key={tag} variant="secondary" className="text-sm">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Action bar */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-10 p-6 rounded-2xl bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border border-primary/10"
          >
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                {isCompleted ? (
                  <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle2 className="h-6 w-6" />
                    <span className="font-semibold text-lg">You have completed this article!</span>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    Finished reading? Mark this article as complete to track your progress.
                  </p>
                )}
              </div>
              {!isCompleted && (
                <Button 
                  size="lg" 
                  onClick={() => markAsComplete(selectedContent.id)}
                  className="bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/20"
                >
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  Mark as Complete
                </Button>
              )}
            </div>
          </motion.div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-10 pt-6 border-t">
            {prevArticle ? (
              <Button 
                variant="ghost" 
                className="group"
                onClick={() => setSelectedContent(prevArticle)}
              >
                <ArrowLeft className="h-4 w-4 mr-2 transition-transform group-hover:-translate-x-1" />
                <span className="hidden sm:inline">{prevArticle.title.slice(0, 30)}...</span>
                <span className="sm:hidden">Previous</span>
              </Button>
            ) : <div />}
            
            {nextArticle && (
              <Button 
                variant="ghost" 
                className="group"
                onClick={() => setSelectedContent(nextArticle)}
              >
                <span className="hidden sm:inline">{nextArticle.title.slice(0, 30)}...</span>
                <span className="sm:hidden">Next</span>
                <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  // Main hub view
  return (
    <div className="space-y-8">
      {/* Hero section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
      >
        <div className="absolute inset-0 opacity-40">
          <img 
            src={heroMarketing} 
            alt="Marketing growth" 
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/95 via-slate-900/80 to-transparent" />
        
        {/* Animated particles */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-2 w-2 rounded-full bg-primary/30"
              initial={{ 
                x: Math.random() * 100 + "%", 
                y: "100%",
                opacity: 0 
              }}
              animate={{ 
                y: "-20%",
                opacity: [0, 1, 0]
              }}
              transition={{
                duration: 4 + Math.random() * 2,
                repeat: Infinity,
                delay: i * 0.8,
                ease: "easeOut"
              }}
            />
          ))}
        </div>
        
        <div className="relative z-10 p-8 md:p-12 lg:p-16">
          <div className="max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Badge className="bg-primary/20 text-primary border-primary/30 mb-4">
                <Sparkles className="h-3 w-3 mr-1" />
                Learning Hub
              </Badge>
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4"
            >
              Grow Your Marketing Knowledge
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-lg text-slate-300 mb-6"
            >
              Expert guides and strategies to understand how we drive growth for your business. 
              <span className="text-primary font-medium"> We handle everything for you</span> — 
              these resources help you understand the why behind what we do.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center gap-2 text-white/80">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <Trophy className="h-4 w-4 text-emerald-400" />
                </div>
                <span>{completedCount} completed</span>
              </div>
              <div className="flex items-center gap-2 text-white/80">
                <div className="h-8 w-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <Bookmark className="h-4 w-4 text-amber-400" />
                </div>
                <span>{bookmarkedCount} saved</span>
              </div>
              <div className="flex items-center gap-2 text-white/80">
                <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
                  <BookOpen className="h-4 w-4 text-primary" />
                </div>
                <span>{content.length} articles</span>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Quick stats */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid gap-4 md:grid-cols-3"
      >
        <motion.div variants={itemVariants}>
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20 border-emerald-200/50 dark:border-emerald-800/30 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl" />
            <CardContent className="p-6 relative">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                  <Target className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">SEO & Visibility</p>
                  <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">Be Found First</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div variants={itemVariants}>
          <Card className="bg-gradient-to-br from-sky-50 to-sky-100/50 dark:from-sky-950/30 dark:to-sky-900/20 border-sky-200/50 dark:border-sky-800/30 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl" />
            <CardContent className="p-6 relative">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-sky-500/20 flex items-center justify-center">
                  <TrendingUp className="h-7 w-7 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <p className="text-sm text-sky-700 dark:text-sky-300 font-medium">Paid Advertising</p>
                  <p className="text-2xl font-bold text-sky-900 dark:text-sky-100">Scale Fast</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div variants={itemVariants}>
          <Card className="bg-gradient-to-br from-violet-50 to-violet-100/50 dark:from-violet-950/30 dark:to-violet-900/20 border-violet-200/50 dark:border-violet-800/30 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-2xl" />
            <CardContent className="p-6 relative">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-violet-500/20 flex items-center justify-center">
                  <Zap className="h-7 w-7 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <p className="text-sm text-violet-700 dark:text-violet-300 font-medium">Automation</p>
                  <p className="text-2xl font-bold text-violet-900 dark:text-violet-100">Work Smarter</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Search and filters */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex flex-col sm:flex-row gap-4"
      >
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search articles, guides, tutorials..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 h-12 rounded-xl border-border/50 bg-muted/30 focus-visible:bg-background"
          />
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
          <Button
            variant={selectedCategory === "all" ? "default" : "outline"}
            onClick={() => setSelectedCategory("all")}
            className="rounded-xl shrink-0"
          >
            All
          </Button>
          {contentTypes.map(type => (
            <Button
              key={type}
              variant={selectedCategory === type ? "default" : "outline"}
              onClick={() => setSelectedCategory(type)}
              className="rounded-xl capitalize shrink-0"
            >
              {contentTypeIcons[type]}
              <span className="ml-2">{type}</span>
            </Button>
          ))}
        </div>
      </motion.div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="overflow-hidden animate-pulse">
              <div className="aspect-video bg-muted" />
              <CardContent className="p-5 space-y-3">
                <div className="h-5 bg-muted rounded w-24" />
                <div className="h-6 bg-muted rounded w-full" />
                <div className="h-4 bg-muted rounded w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredContent.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="p-16 text-center">
            <div className="max-w-md mx-auto space-y-4">
              <div className="h-20 w-20 rounded-3xl bg-muted flex items-center justify-center mx-auto">
                <BookOpen className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold">No resources found</h3>
              <p className="text-muted-foreground">
                {searchQuery 
                  ? "Try adjusting your search or filters"
                  : "Learning content will appear here once published"
                }
              </p>
            </div>
          </Card>
        </motion.div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-10"
        >
          {/* Featured section */}
          {featuredContent.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500" />
                <h2 className="text-xl font-bold">Featured Resources</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                {featuredContent.map((item, index) => (
                  <ContentCard 
                    key={item.id} 
                    item={item} 
                    progress={progress[item.id]}
                    onClick={() => setSelectedContent(item)}
                    onBookmark={(e) => toggleBookmark(item.id, e)}
                    getImage={getImage}
                    featured
                    index={index}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* All content */}
          {regularContent.length > 0 && (
            <div className="space-y-4">
              {featuredContent.length > 0 && (
                <h2 className="text-xl font-bold">All Resources</h2>
              )}
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {regularContent.map((item, index) => (
                  <ContentCard 
                    key={item.id} 
                    item={item} 
                    progress={progress[item.id]}
                    onClick={() => setSelectedContent(item)}
                    onBookmark={(e) => toggleBookmark(item.id, e)}
                    getImage={getImage}
                    index={index}
                  />
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

interface ContentCardProps {
  item: LearningContent;
  progress?: LearningProgress;
  onClick: () => void;
  onBookmark: (e: React.MouseEvent) => void;
  getImage: (item: LearningContent) => string;
  featured?: boolean;
  index: number;
}

function ContentCard({ item, progress, onClick, onBookmark, getImage, featured, index }: ContentCardProps) {
  const isCompleted = progress?.completed_at;
  const isBookmarked = progress?.is_bookmarked;

  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -4 }}
      className="group"
    >
      <Card 
        className={cn(
          "overflow-hidden cursor-pointer transition-all duration-300 border-border/50 hover:shadow-xl hover:shadow-primary/5",
          isCompleted && "ring-2 ring-emerald-500/30",
          featured && "md:col-span-1"
        )}
        onClick={onClick}
      >
        {/* Thumbnail */}
        <div className={cn(
          "relative overflow-hidden",
          featured ? "aspect-[16/10]" : "aspect-video"
        )}>
          <motion.img 
            src={getImage(item)} 
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          
          {/* Play overlay for videos */}
          {item.content_type === "video" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div 
                className="h-16 w-16 rounded-full bg-white/90 flex items-center justify-center shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity"
                whileHover={{ scale: 1.1 }}
              >
                <Play className="h-7 w-7 text-primary ml-1" />
              </motion.div>
            </div>
          )}
          
          {/* Featured badge */}
          {item.is_featured && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="absolute top-3 left-3"
            >
              <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 shadow-lg">
                <Sparkles className="h-3 w-3 mr-1" />
                Featured
              </Badge>
            </motion.div>
          )}
          
          {/* Completed badge */}
          {isCompleted && (
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-3 right-3"
            >
              <div className="h-9 w-9 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                <CheckCircle2 className="h-5 w-5 text-white" />
              </div>
            </motion.div>
          )}
          
          {/* Bookmark button */}
          {!isCompleted && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 h-9 w-9 rounded-full bg-black/30 backdrop-blur-sm text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/50"
              onClick={onBookmark}
            >
              {isBookmarked ? (
                <BookmarkCheck className="h-4 w-4 fill-current" />
              ) : (
                <Bookmark className="h-4 w-4" />
              )}
            </Button>
          )}
          
          {/* Duration */}
          {item.estimated_read_time && (
            <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-sm text-white text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {item.estimated_read_time} min
            </div>
          )}
        </div>
        
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <Badge 
              variant="outline" 
              className={cn("text-xs uppercase tracking-wider", contentTypeColors[item.content_type])}
            >
              {contentTypeIcons[item.content_type]}
              <span className="ml-1">{item.content_type}</span>
            </Badge>
            
            {item.difficulty_level && (
              <Badge variant="secondary" className={cn("text-xs capitalize", difficultyColors[item.difficulty_level])}>
                {item.difficulty_level}
              </Badge>
            )}
          </div>
          
          <h3 className={cn(
            "font-semibold group-hover:text-primary transition-colors line-clamp-2",
            featured ? "text-lg" : "text-base"
          )}>
            {item.title}
          </h3>
          
          {item.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
              {item.description}
            </p>
          )}
          
          {/* Tags */}
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {item.tags.slice(0, 3).map(tag => (
                <Badge key={tag} variant="secondary" className="text-[10px] bg-muted/50">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
