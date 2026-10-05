import { Badge } from "@/components/ui/badge";
import {
  FileText, Image, Mail, Share2, PenTool, Video, Megaphone, Calendar,
  ClipboardList, Target, Type, AlignLeft, Link, FileCheck,
} from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize";

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

export function getContentTypeConfig(type: string) {
  const normalizedType = type.toLowerCase().replace(/\s+/g, '_');
  return contentTypeConfig[normalizedType] || contentTypeConfig.default;
}

// Helpers to clean markdown-style asterisks/brackets from text
export function cleanMarkdownMarks(text: string): string {
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
export function parseContentSafely(content: string | null): any {
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

// Smart content renderer component
export function ContentRenderer({ content, contentType }: { content: string | null; contentType: string }) {
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
// Mirrors supabase/functions/_shared/captionGate.ts: empty/placeholder posts can't be approved.
export function hasCaption(a: { full_content: string | null; content_preview: string | null }): boolean {
  const ok = (t: string | null) => {
    const v = (t ?? "").trim();
    return v.length >= 15 && !/^\[auto-generated placeholder/i.test(v);
  };
  return ok(a.full_content) || ok(a.content_preview);
}

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

