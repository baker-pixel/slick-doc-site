import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Sparkles, Send, Save, Loader2, Linkedin, Instagram, Twitter, Facebook, Copy, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

interface SocialPostComposerProps {
  clientAccountId: string;
}

const PLATFORMS = [
  { id: "linkedin", name: "LinkedIn", icon: Linkedin, color: "text-[#0A66C2]", maxChars: 3000 },
  { id: "facebook", name: "Facebook", icon: Facebook, color: "text-[#1877F2]", maxChars: 63206 },
  { id: "instagram", name: "Instagram", icon: Instagram, color: "text-[#E4405F]", maxChars: 2200 },
  { id: "twitter", name: "Twitter / X", icon: Twitter, color: "text-foreground", maxChars: 280 },
];

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual & Friendly" },
  { value: "authoritative", label: "Authoritative" },
  { value: "inspirational", label: "Inspirational" },
  { value: "humorous", label: "Humorous" },
];

export function SocialPostComposer({ clientAccountId }: SocialPostComposerProps) {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("professional");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["linkedin"]);
  const [generatedContent, setGeneratedContent] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast({ title: "Enter a topic", description: "Please describe what you'd like to post about.", variant: "destructive" });
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast({ title: "Select a platform", description: "Choose at least one platform.", variant: "destructive" });
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-social-content", {
        body: {
          topic,
          tone,
          platforms: selectedPlatforms,
          clientAccountId,
        },
      });

      if (error) throw error;

      setGeneratedContent(data?.content || "");
      setHashtags(data?.hashtags || []);
      toast({ title: "Content generated!", description: "Review and edit the post before saving." });
    } catch (err) {
      console.error("Error generating content:", err);
      toast({ title: "Generation failed", description: "Could not generate content. Please try again.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (status: "draft" | "scheduled") => {
    if (!generatedContent.trim()) {
      toast({ title: "No content", description: "Generate or write content first.", variant: "destructive" });
      return;
    }

    if (status === "scheduled" && !scheduledAt) {
      toast({ title: "Pick a date", description: "Select when you want this post published.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const posts = selectedPlatforms.map((platform) => ({
        client_account_id: clientAccountId,
        platform,
        content: generatedContent,
        status,
        scheduled_at: status === "scheduled" ? scheduledAt : null,
        ai_generated: true,
        topic,
        tone,
        hashtags,
      }));

      const { error } = await supabase.from("social_media_posts").insert(posts);
      if (error) throw error;

      toast({
        title: status === "draft" ? "Draft saved" : "Post scheduled",
        description: `Saved to ${selectedPlatforms.length} platform${selectedPlatforms.length > 1 ? "s" : ""}.`,
      });

      // Reset
      setGeneratedContent("");
      setHashtags([]);
      setTopic("");
      setScheduledAt("");
    } catch (err) {
      console.error("Error saving post:", err);
      toast({ title: "Save failed", description: "Could not save the post.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const activePlatform = PLATFORMS.find((p) => selectedPlatforms.includes(p.id));
  const maxChars = activePlatform?.maxChars || 3000;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left: Input */}
      <Card className="border-0 bg-muted/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Post Composer
          </CardTitle>
          <CardDescription>
            Describe your topic and let AI create engaging social media content.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Platform Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Platforms</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => {
                const Icon = p.icon;
                const selected = selectedPlatforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all",
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:bg-muted"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", selected ? p.color : "text-muted-foreground")} />
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Topic */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Topic / Description</label>
            <Textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Announce our new service offering for small businesses, highlight the free consultation..."
              className="min-h-[120px] resize-none"
            />
          </div>

          {/* Tone */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Tone</label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Generate Button */}
          <Button onClick={handleGenerate} disabled={generating} className="w-full gap-2">
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Content
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Right: Preview & Actions */}
      <Card className="border-0 bg-muted/30">
        <CardHeader>
          <CardTitle className="text-base">Preview & Edit</CardTitle>
          <CardDescription>
            {generatedContent
              ? `${generatedContent.length} / ${maxChars} characters`
              : "Generated content will appear here"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Textarea
            value={generatedContent}
            onChange={(e) => setGeneratedContent(e.target.value)}
            placeholder="Your AI-generated content will appear here. You can also type directly..."
            className="min-h-[200px] resize-none"
          />

          {/* Hashtags */}
          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {hashtags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Schedule */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Schedule (optional)
            </label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => handleSave("draft")}
              disabled={saving || !generatedContent.trim()}
              className="flex-1 gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              Save Draft
            </Button>
            <Button
              onClick={() => handleSave("scheduled")}
              disabled={saving || !generatedContent.trim() || !scheduledAt}
              className="flex-1 gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              Schedule
            </Button>
          </div>

          {generatedContent && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-1.5 text-muted-foreground"
              onClick={() => {
                navigator.clipboard.writeText(generatedContent);
                toast({ title: "Copied!", description: "Content copied to clipboard." });
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy to Clipboard
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
