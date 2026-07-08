import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, FileCheck, CheckCircle, XCircle, Clock, MessageSquare,
  FileText, Image, Mail, Share2, PenTool, Video, Megaphone, Calendar,
  ClipboardList, Sparkles, Target, Hash, Link, AtSign, Type, AlignLeft,
  Facebook, Instagram, Linkedin, Twitter, LayoutGrid,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { sanitizeHtml } from "@/lib/sanitize";
import { format } from "date-fns";

interface ContentApproval {
  id: string;
  title: string;
  content_type: string;
  content_preview: string | null;
  full_content: string | null;
  status: string;
  feedback: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  publish_status: string | null;
  platform: string | null;
  content_id: string | null;
  image_url?: string | null;
}

interface ClientContentApprovalTabProps {
  clientAccountId: string;
}

type PlatformFilter = "all" | "facebook" | "instagram" | "twitter" | "linkedin" | "other";

const PLATFORM_CONFIG: Record<Exclude<PlatformFilter, "all">, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  facebook: { label: "Facebook", icon: Facebook },
  instagram: { label: "Instagram", icon: Instagram },
  twitter: { label: "X", icon: Twitter },
  linkedin: { label: "LinkedIn", icon: Linkedin },
  other: { label: "Other", icon: LayoutGrid },
};

function normalizePlatform(platform: string | null): Exclude<PlatformFilter, "all"> {
  const p = (platform || "").toLowerCase();
  if (p === "facebook" || p === "instagram" || p === "linkedin") return p;
  if (p === "twitter" || p === "x") return "twitter";
  return "other";
}

// Content type configurations with icons, colors, and descriptions
const contentTypeConfig: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  bgColor: string;
  description: string;
}> = {
  "blog_post": {
    icon: FileText,
    label: "Blog Post",
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    description: "A blog article written for your website to improve SEO and engage visitors"
  },
  "social_media": {
    icon: Share2,
    label: "Social Media Post",
    color: "text-purple-600",
    bgColor: "bg-purple-100",
    description: "Content designed for your social media channels"
  },
  // DB stores social_post — alias to social_media config
  "social_post": {
    icon: Share2,
    label: "Social Media Post",
    color: "text-purple-600",
    bgColor: "bg-purple-100",
    description: "Content designed for your social media channels"
  },
  "email": {
    icon: Mail,
    label: "Email Campaign",
    color: "text-green-600",
    bgColor: "bg-green-100",
    description: "Email content for your marketing campaigns or newsletters"
  },
  // DB stores email_copy and email_sequence — alias both to email config
  "email_copy": {
    icon: Mail,
    label: "Email Campaign",
    color: "text-green-600",
    bgColor: "bg-green-100",
    description: "Email content for your marketing campaigns or newsletters"
  },
  "email_sequence": {
    icon: Mail,
    label: "Email Sequence",
    color: "text-green-600",
    bgColor: "bg-green-100",
    description: "A series of emails for your marketing campaigns or nurture flows"
  },
  "ad_copy": {
    icon: Megaphone,
    label: "Ad Copy",
    color: "text-orange-600",
    bgColor: "bg-orange-100",
    description: "Advertising copy for paid campaigns on Google, Facebook, etc."
  },
  "website_copy": { 
    icon: PenTool, 
    label: "Website Copy", 
    color: "text-indigo-600",
    bgColor: "bg-indigo-100",
    description: "Content for your website pages to improve conversions"
  },
  "video_script": { 
    icon: Video, 
    label: "Video Script", 
    color: "text-red-600",
    bgColor: "bg-red-100",
    description: "Script for video content production"
  },
  "graphic_design": { 
    icon: Image, 
    label: "Graphic Design", 
    color: "text-pink-600",
    bgColor: "bg-pink-100",
    description: "Visual design assets for marketing materials"
  },
  "content_calendar": { 
    icon: Calendar, 
    label: "Content Calendar", 
    color: "text-teal-600",
    bgColor: "bg-teal-100",
    description: "Planned content schedule for upcoming campaigns"
  },
  "strategy": { 
    icon: Target, 
    label: "Strategy Document", 
    color: "text-amber-600",
    bgColor: "bg-amber-100",
    description: "Marketing strategy and planning documentation"
  },
  "report": { 
    icon: ClipboardList, 
    label: "Performance Report", 
    color: "text-cyan-600",
    bgColor: "bg-cyan-100",
    description: "Analytics and performance reporting"
  },
  "default": { 
    icon: FileCheck, 
    label: "Content", 
    color: "text-primary",
    bgColor: "bg-primary/10",
    description: "Marketing content for your review"
  }
};

function getContentTypeConfig(type: string) {
  const normalizedType = type.toLowerCase().replace(/\s+/g, '_');
  return contentTypeConfig[normalizedType] || contentTypeConfig.default;
}

// Helpers to clean markdown-style asterisks/brackets from text
function cleanMarkdownMarks(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/(?<!\*)\*(?!\*)/g, '')
    .replace(/\[([^\]]+)\]/g, '$1');
}

function deepCleanStrings(value: any): any {
  if (typeof value === 'string') return cleanMarkdownMarks(value);
  if (Array.isArray(value)) return value.map(deepCleanStrings);
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepCleanStrings(v);
    return out;
  }
  return value;
}

// Helper to parse JSON content safely
function parseContentSafely(content: string | null): any {
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

// Smart content renderer component
function ContentRenderer({ content, contentType }: { content: string | null; contentType: string }) {
  if (!content) return null;

  const parsedRaw = parseContentSafely(content);
  const parsed = deepCleanStrings(parsedRaw);

  // If it's a string (not JSON), render it nicely
  if (typeof parsed === 'string') {
    // Check if it looks like HTML
    if (parsed.includes('<') && parsed.includes('>')) {
      return (
        <div 
          className="prose prose-sm max-w-none text-foreground"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(parsed) }}
        />
      );
    }
    // Plain text
    return (
      <div className="whitespace-pre-wrap text-sm text-foreground leading-relaxed">
        {parsed}
      </div>
    );
  }
  
  // Render based on content type and structure
  const normalizedType = contentType.toLowerCase().replace(/\s+/g, '_');
  
  // Email content
  if (['email', 'email_copy', 'email_sequence'].includes(normalizedType) || parsed.subject || parsed.body) {
    return <EmailContentView data={parsed} />;
  }

  // Social media content
  if (['social_media', 'social_post'].includes(normalizedType) || parsed.caption || parsed.post || parsed.platform) {
    return <SocialMediaContentView data={parsed} />;
  }

  // Blog post content
  if (normalizedType === 'blog_post' || parsed.headline || parsed.article || parsed.body) {
    return <BlogPostContentView data={parsed} />;
  }

  // Ad copy content
  if (normalizedType === 'ad_copy' || parsed.headline || parsed.description || parsed.cta) {
    return <AdCopyContentView data={parsed} />;
  }
  
  // Generic structured content
  return <GenericContentView data={parsed} />;
}

// Email content view
function EmailContentView({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      {data.subject && (
        <div className="bg-muted/50 rounded-lg p-4 border-l-4 border-l-green-500">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Mail className="h-3 w-3" />
            <span>Subject Line</span>
          </div>
          <p className="font-semibold text-foreground">{data.subject}</p>
        </div>
      )}
      
      {data.preheader && (
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Type className="h-3 w-3" />
            <span>Preview Text</span>
          </div>
          <p className="text-sm text-muted-foreground italic">{data.preheader}</p>
        </div>
      )}
      
      {(data.body || data.content || data.html) && (
        <div className="bg-background rounded-lg border p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <AlignLeft className="h-3 w-3" />
            <span>Email Body</span>
          </div>
          <div className="prose prose-sm max-w-none text-foreground">
            {typeof (data.body || data.content || data.html) === 'string' && 
             (data.body || data.content || data.html).includes('<') ? (
              <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.body || data.content || data.html) }} />
            ) : (
              <p className="whitespace-pre-wrap">{data.body || data.content || data.html}</p>
            )}
          </div>
        </div>
      )}
      
      {data.cta && (
        <div className="flex items-center gap-2">
          <div className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium">
            {data.cta}
          </div>
          <span className="text-xs text-muted-foreground">Call-to-action button</span>
        </div>
      )}
    </div>
  );
}

// Social media content view
function SocialMediaContentView({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      {data.platform && (
        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
          <Share2 className="h-3 w-3 mr-1" />
          {data.platform}
        </Badge>
      )}
      
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border">
        <div className="space-y-3">
          {(data.caption || data.post || data.content || data.text) && (
            <p className="text-foreground whitespace-pre-wrap leading-relaxed">
              {data.caption || data.post || data.content || data.text}
            </p>
          )}
          
          {data.hashtags && (
            <div className="flex flex-wrap gap-1">
              {(Array.isArray(data.hashtags) ? data.hashtags : data.hashtags.split(/\s+/)).map((tag: string, i: number) => (
                <span key={i} className="text-purple-600 text-sm">
                  {tag.startsWith('#') ? tag : `#${tag}`}
                </span>
              ))}
            </div>
          )}
          
          {data.image_description && (
            <div className="flex items-start gap-2 bg-white/60 rounded-lg p-3">
              <Image className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Suggested Image</span>
                <p className="text-sm text-foreground">{data.image_description}</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {data.link && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link className="h-4 w-4" />
          <span className="truncate">{data.link}</span>
        </div>
      )}
    </div>
  );
}

// Blog post content view
function BlogPostContentView({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      {(data.headline || data.title) && (
        <div className="border-l-4 border-l-blue-500 pl-4">
          <span className="text-xs text-muted-foreground block mb-1">Headline</span>
          <h3 className="text-xl font-bold text-foreground">{data.headline || data.title}</h3>
        </div>
      )}
      
      {data.meta_description && (
        <div className="bg-blue-50 rounded-lg p-3">
          <span className="text-xs text-muted-foreground block mb-1">SEO Meta Description</span>
          <p className="text-sm text-foreground">{data.meta_description}</p>
        </div>
      )}
      
      {(data.article || data.body || data.content) && (
        <div className="bg-background rounded-lg border p-4">
          <span className="text-xs text-muted-foreground block mb-3">Article Content</span>
          <div className="prose prose-sm max-w-none text-foreground">
            {typeof (data.article || data.body || data.content) === 'string' &&
             (data.article || data.body || data.content).includes('<') ? (
              <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.article || data.body || data.content) }} />
            ) : (
              <p className="whitespace-pre-wrap">{data.article || data.body || data.content}</p>
            )}
          </div>
        </div>
      )}
      
      {data.keywords && (
        <div className="flex flex-wrap gap-1">
          <span className="text-xs text-muted-foreground mr-2">Keywords:</span>
          {(Array.isArray(data.keywords) ? data.keywords : data.keywords.split(',')).map((kw: string, i: number) => (
            <Badge key={i} variant="secondary" className="text-xs">{kw.trim()}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// Ad copy content view
function AdCopyContentView({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl p-4 border border-orange-100">
        {data.platform && (
          <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-200 mb-3">
            <Megaphone className="h-3 w-3 mr-1" />
            {data.platform} Ad
          </Badge>
        )}
        
        <div className="space-y-3">
          {(data.headline || data.title) && (
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Headline</span>
              <p className="font-bold text-lg text-foreground">{data.headline || data.title}</p>
            </div>
          )}
          
          {(data.description || data.body || data.text) && (
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Description</span>
              <p className="text-foreground">{data.description || data.body || data.text}</p>
            </div>
          )}
          
          {data.cta && (
            <div className="pt-2">
              <span className="text-xs text-muted-foreground block mb-1">Call-to-Action</span>
              <span className="inline-block bg-orange-500 text-white px-4 py-2 rounded font-medium text-sm">
                {data.cta}
              </span>
            </div>
          )}
        </div>
      </div>
      
      {data.targeting && (
        <div className="bg-muted/30 rounded-lg p-3">
          <span className="text-xs text-muted-foreground block mb-1">Target Audience</span>
          <p className="text-sm text-foreground">{data.targeting}</p>
        </div>
      )}
    </div>
  );
}

// Generic content view for unknown structures
function GenericContentView({ data }: { data: any }) {
  const renderValue = (value: any, depth = 0): React.ReactNode => {
    if (value === null || value === undefined) return null;
    
    if (typeof value === 'string') {
      if (value.length > 100) {
        return <p className="whitespace-pre-wrap text-foreground">{value}</p>;
      }
      return <span className="text-foreground">{value}</span>;
    }
    
    if (typeof value === 'number' || typeof value === 'boolean') {
      return <span className="text-foreground font-medium">{String(value)}</span>;
    }
    
    if (Array.isArray(value)) {
      if (value.every(v => typeof v === 'string')) {
        return (
          <div className="flex flex-wrap gap-1">
            {value.map((v, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{v}</Badge>
            ))}
          </div>
        );
      }
      return (
        <ul className="space-y-2 list-disc list-inside">
          {value.map((v, i) => (
            <li key={i}>{renderValue(v, depth + 1)}</li>
          ))}
        </ul>
      );
    }
    
    if (typeof value === 'object') {
      return (
        <div className={`space-y-3 ${depth > 0 ? 'pl-4 border-l-2 border-muted' : ''}`}>
          {Object.entries(value).map(([key, val]) => {
            const label = key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
            return (
              <div key={key}>
                <span className="text-xs text-muted-foreground capitalize block mb-1">{label}</span>
                {renderValue(val, depth + 1)}
              </div>
            );
          })}
        </div>
      );
    }
    
    return null;
  };
  
  return (
    <div className="bg-muted/20 rounded-lg p-4 border">
      {renderValue(data)}
    </div>
  );
}

export default function ClientContentApprovalTab({ clientAccountId }: ClientContentApprovalTabProps) {
  const queryClient = useQueryClient();
  const [approvals, setApprovals] = useState<ContentApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApproval, setSelectedApproval] = useState<ContentApproval | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  // Whether the client_approval onboarding step is unlocked but not yet complete
  // (draft is being generated in the background — show helpful empty state instead of blank)
  const [approvalStepPending, setApprovalStepPending] = useState(false);

  useEffect(() => {
    // Check if the client_approval workflow step is pending (onboarding step 5)
    supabase
      .from("client_workflows")
      .select("id")
      .eq("client_id", clientAccountId)
      .eq("status", "active")
      .maybeSingle()
      .then(({ data: wf }) => {
        if (!wf) return;
        supabase
          .from("workflow_steps")
          .select("status")
          .eq("workflow_id", wf.id)
          .eq("task_type", "client_approval")
          .maybeSingle()
          .then(({ data: step }) => {
            setApprovalStepPending(!!step && step.status !== "completed" && step.status !== "locked");
          });
      });
  }, [clientAccountId]);

  useEffect(() => {
    fetchApprovals();

    const channel = supabase
      .channel('content-approvals-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'content_approvals',
          filter: `client_account_id=eq.${clientAccountId}`,
        },
        () => {
          fetchApprovals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientAccountId]);

  const fetchApprovals = async () => {
    try {
      const { data, error } = await supabase
        .from("content_approvals")
        .select("*")
        .eq("client_account_id", clientAccountId)
        .order("submitted_at", { ascending: false });

      if (error) throw error;
      const rows = (data || []) as ContentApproval[];

      // content_approvals has no image column of its own -- the image
      // (when one exists) lives on content_calendar.metadata.image_url,
      // matched via the shared content_id. A live join rather than a copy
      // made at approval-creation time, since images are often still
      // generating (via the nightly image batch) when the approval is
      // first created.
      const contentIds = [...new Set(rows.map((r) => r.content_id).filter(Boolean))] as string[];
      let imageByContentId: Record<string, string> = {};
      if (contentIds.length > 0) {
        const { data: calRows } = await supabase
          .from("content_calendar")
          .select("content_id, metadata")
          .in("content_id", contentIds);
        imageByContentId = Object.fromEntries(
          (calRows || [])
            .map((c: any) => [c.content_id, (c.metadata as { image_url?: string } | null)?.image_url])
            .filter(([, url]) => !!url)
        );
      }

      setApprovals(rows.map((r) => ({ ...r, image_url: r.content_id ? imageByContentId[r.content_id] : undefined })));
    } catch (error) {
      console.error("Error fetching approvals:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedApproval) return;
    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("handle-approval", {
        body: {
          approval_id: selectedApproval.id,
          action: "approved",
          feedback: feedback || undefined,
        },
      });

      if (error) throw error;

      // Optimistic update
      setApprovals((prev) =>
        prev.map((a) =>
          a.id === selectedApproval.id
            ? { ...a, status: "approved", publish_status: "queued", reviewed_at: new Date().toISOString(), feedback: feedback || null }
            : a
        )
      );

      toast({
        title: "Content Approved",
        description: "The content has been approved and queued for publishing.",
      });

      setSelectedApproval(null);
      setFeedback("");

      // Complete the client_approval workflow step — first real approval unlocks automation
      (async () => {
        try {
          const { data: wf } = await supabase
            .from("client_workflows")
            .select("id")
            .eq("client_id", clientAccountId)
            .eq("status", "active")
            .maybeSingle();
          if (!wf) return;

          const { data: approvalStep } = await supabase
            .from("workflow_steps")
            .select("id, step_number, status")
            .eq("workflow_id", wf.id)
            .eq("task_type", "client_approval")
            .maybeSingle();

          if (approvalStep && approvalStep.status !== "completed") {
            await supabase
              .from("workflow_steps")
              .update({ status: "completed", completed_at: new Date().toISOString() })
              .eq("id", approvalStep.id);

            supabase.functions
              .invoke("advance-workflow", {
                body: {
                  workflow_id: wf.id,
                  completed_step_number: approvalStep.step_number,
                  client_id: clientAccountId,
                },
              })
              .catch((e) => console.error("advance-workflow after approval:", e));

            queryClient.invalidateQueries({ queryKey: ["onboarding-complete", clientAccountId] });
            queryClient.invalidateQueries({ queryKey: ["client-workflow", clientAccountId] });
          }
        } catch (e) {
          console.error("Failed to complete approval workflow step:", e);
        }
      })();
    } catch (error) {
      console.error("Error approving content:", error);
      toast({
        title: "Error",
        description: "Failed to approve content. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!selectedApproval || !feedback.trim()) {
      toast({
        title: "Feedback Required",
        description: "Please provide feedback on what changes are needed.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("handle-approval", {
        body: {
          approval_id: selectedApproval.id,
          action: "changes_requested",
          feedback,
        },
      });

      if (error) throw error;

      // Optimistic update
      setApprovals((prev) =>
        prev.map((a) =>
          a.id === selectedApproval.id
            ? { ...a, status: "changes_requested", publish_status: "changes_requested", feedback, reviewed_at: new Date().toISOString() }
            : a
        )
      );

      toast({
        title: "Changes Requested",
        description: "Your feedback has been sent to the team.",
      });

      setSelectedApproval(null);
      setFeedback("");
    } catch (error) {
      console.error("Error requesting changes:", error);
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string, publishStatus?: string | null) => {
    if (publishStatus === "published") {
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Published</Badge>;
    }
    if (status === "approved" && publishStatus === "queued") {
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Publishing...</Badge>;
    }
    switch (status) {
      case "approved":
        return <Badge className="bg-green-100 text-green-800 border-green-200">Approved</Badge>;
      case "changes_requested":
        return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Changes Requested</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800 border-red-200">Rejected</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Pending Review</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const platformCounts = approvals.reduce<Record<Exclude<PlatformFilter, "all">, number>>((acc, a) => {
    const key = normalizePlatform(a.platform);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, { facebook: 0, instagram: 0, twitter: 0, linkedin: 0, other: 0 });

  const filteredApprovals = platformFilter === "all"
    ? approvals
    : approvals.filter((a) => normalizePlatform(a.platform) === platformFilter);

  const pendingApprovals = filteredApprovals.filter((a) => a.status === "pending");
  const reviewedApprovals = filteredApprovals.filter((a) => a.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Content Approvals</h2>
        <p className="text-muted-foreground">Review and approve content before it goes live</p>
      </div>

      {approvals.length > 0 && (
        <Tabs value={platformFilter} onValueChange={(v) => setPlatformFilter(v as PlatformFilter)}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all" className="gap-1.5">
              All <span className="text-xs text-muted-foreground">({approvals.length})</span>
            </TabsTrigger>
            {(Object.keys(PLATFORM_CONFIG) as Array<Exclude<PlatformFilter, "all">>).map((key) => {
              const count = platformCounts[key];
              if (count === 0) return null;
              const { label, icon: PlatformIcon } = PLATFORM_CONFIG[key];
              return (
                <TabsTrigger key={key} value={key} className="gap-1.5">
                  <PlatformIcon className="h-3.5 w-3.5" />
                  {label} <span className="text-xs text-muted-foreground">({count})</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      )}

      {approvals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            {approvalStepPending ? (
              <>
                <Loader2 className="h-12 w-12 mx-auto text-primary mb-4 animate-spin" />
                <h3 className="text-lg font-medium text-foreground">Your First Draft is Being Prepared</h3>
                <p className="text-muted-foreground mt-1">We're generating your introductory content. It will appear here in a moment — refresh if it doesn't show up.</p>
              </>
            ) : (
              <>
                <FileCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground">No Content to Review</h3>
                <p className="text-muted-foreground">Content items will appear here when they need your approval.</p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Pending Approvals */}
          {pendingApprovals.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-600" />
                Awaiting Your Review ({pendingApprovals.length})
              </h3>
              <div className="grid gap-4">
                {pendingApprovals.map((approval) => {
                  const typeConfig = getContentTypeConfig(approval.content_type);
                  const IconComponent = typeConfig.icon;
                  
                  return (
                    <Card 
                      key={approval.id} 
                      className="cursor-pointer hover:shadow-md transition-all border-l-4 border-l-yellow-500 hover:border-l-yellow-600"
                      onClick={() => {
                        setSelectedApproval(approval);
                        setFeedback("");
                      }}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${typeConfig.bgColor}`}>
                              <IconComponent className={`h-5 w-5 ${typeConfig.color}`} />
                            </div>
                            <div>
                              <CardTitle className="text-base">{approval.title}</CardTitle>
                              <CardDescription className="text-xs">
                                {typeConfig.label} • Submitted {format(new Date(approval.submitted_at), "MMM d, yyyy 'at' h:mm a")}
                              </CardDescription>
                            </div>
                          </div>
                         {getStatusBadge(approval.status, approval.publish_status)}
                        </div>
                      </CardHeader>
                      <CardContent className="pt-2">
                        <p className="text-xs text-muted-foreground mb-2">{typeConfig.description}</p>
                        <div className="flex gap-3 mt-2">
                          {approval.image_url && (
                            <img
                              src={approval.image_url}
                              alt=""
                              className="w-20 h-20 rounded-md object-cover flex-shrink-0 border"
                            />
                          )}
                          {approval.content_preview && (
                            <div className="bg-muted/50 rounded-md p-3 flex-1 min-w-0">
                              <p className="text-sm text-foreground line-clamp-3">
                                {approval.content_preview}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <Button size="sm" variant="default" className="text-xs">
                            <Sparkles className="h-3 w-3 mr-1" />
                            Review Now
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reviewed Content */}
          {reviewedApprovals.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Previously Reviewed ({reviewedApprovals.length})
              </h3>
              <div className="grid gap-4">
                {reviewedApprovals.map((approval) => {
                  const typeConfig = getContentTypeConfig(approval.content_type);
                  const IconComponent = typeConfig.icon;
                  
                  return (
                    <Card 
                      key={approval.id} 
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => {
                        setSelectedApproval(approval);
                        setFeedback(approval.feedback || "");
                      }}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${typeConfig.bgColor} opacity-75`}>
                              <IconComponent className={`h-5 w-5 ${typeConfig.color}`} />
                            </div>
                            <div>
                              <CardTitle className="text-base">{approval.title}</CardTitle>
                              <CardDescription className="text-xs">
                                {typeConfig.label} • Reviewed {approval.reviewed_at ? format(new Date(approval.reviewed_at), "MMM d, yyyy 'at' h:mm a") : "N/A"}
                              </CardDescription>
                            </div>
                          </div>
                          {getStatusBadge(approval.status, approval.publish_status)}
                        </div>
                      </CardHeader>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Enhanced Review Dialog */}
      <Dialog open={!!selectedApproval} onOpenChange={() => setSelectedApproval(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selectedApproval && (() => {
            const typeConfig = getContentTypeConfig(selectedApproval.content_type);
            const IconComponent = typeConfig.icon;
            
            return (
              <>
                <DialogHeader className="pb-2">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-3 rounded-lg ${typeConfig.bgColor}`}>
                      <IconComponent className={`h-6 w-6 ${typeConfig.color}`} />
                    </div>
                    <div>
                      <DialogTitle className="text-xl">{selectedApproval.title}</DialogTitle>
                      <p className="text-sm text-muted-foreground mt-1">{typeConfig.description}</p>
                    </div>
                  </div>
                </DialogHeader>
                
                <div className="space-y-5">
                  {/* Status and Meta Info */}
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="outline" className={`${typeConfig.bgColor} ${typeConfig.color} border-0`}>
                      {typeConfig.label}
                    </Badge>
                    {getStatusBadge(selectedApproval.status, selectedApproval.publish_status)}
                    <span className="text-xs text-muted-foreground">
                      Submitted: {format(new Date(selectedApproval.submitted_at), "MMMM d, yyyy 'at' h:mm a")}
                    </span>
                  </div>

                  <Separator />

                  {/* What Was Completed Section */}
                  <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg p-4">
                    <h4 className="font-semibold text-foreground flex items-center gap-2 mb-3">
                      <ClipboardList className="h-4 w-4 text-primary" />
                      What Was Completed
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Created {typeConfig.label.toLowerCase()} based on your brand guidelines</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Optimized for your target audience and marketing goals</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Ready for your review and approval before publishing</span>
                      </div>
                    </div>
                  </div>

                  {/* Image */}
                  {selectedApproval.image_url && (
                    <div>
                      <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Image className="h-4 w-4" />
                        Image
                      </h4>
                      <img
                        src={selectedApproval.image_url}
                        alt=""
                        className="w-full max-h-96 object-cover rounded-lg border"
                      />
                    </div>
                  )}

                  {/* Full Content Preview */}
                  {(selectedApproval.full_content || selectedApproval.content_preview) && (
                    <div>
                      <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Content Preview
                      </h4>
                      <ScrollArea className="max-h-80">
                        <div className="pr-4">
                          <ContentRenderer 
                            content={selectedApproval.full_content || selectedApproval.content_preview} 
                            contentType={selectedApproval.content_type}
                          />
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  <Separator />

                  {/* Feedback Section for Pending */}
                  {selectedApproval.status === "pending" && (
                    <div className="space-y-3">
                      <h4 className="font-semibold text-foreground flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Your Feedback
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Optional for approval, required if requesting changes
                      </p>
                      <Textarea
                        placeholder="Share any thoughts, suggestions, or specific changes you'd like to see..."
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        rows={4}
                        className="resize-none"
                      />
                    </div>
                  )}

                  {/* Previous Feedback Display */}
                  {selectedApproval.feedback && selectedApproval.status !== "pending" && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-foreground flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Your Feedback
                      </h4>
                      <div className="bg-muted p-4 rounded-lg">
                        <p className="text-sm text-foreground whitespace-pre-wrap">{selectedApproval.feedback}</p>
                        {selectedApproval.reviewed_at && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Submitted on {format(new Date(selectedApproval.reviewed_at), "MMMM d, yyyy 'at' h:mm a")}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                {selectedApproval.status === "pending" && (
                  <DialogFooter className="gap-2 mt-4 pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={handleRequestChanges}
                      disabled={submitting}
                      className="border-orange-200 text-orange-700 hover:bg-orange-50"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Request Changes
                    </Button>
                    <Button onClick={handleApprove} disabled={submitting} className="bg-green-600 hover:bg-green-700">
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve Content
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}