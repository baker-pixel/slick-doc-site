import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Building2, Save, Plus, X, Loader2 } from "lucide-react";

interface ContextProfile {
  services: string[];
  differentiators: string[];
  target_audience: string;
  location: string;
  tone: string;
  business_summary: string;
}

interface CompanyContext {
  business_name: string;
  industry: string;
  website_url: string;
  website_summary: string;
  tone: string;
  context_profile: ContextProfile | null;
}

const TONE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "casual", label: "Casual" },
  { value: "expert", label: "Expert / Authoritative" },
];

export function TagEditor({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput("");
  };

  const remove = (item: string) => onChange(values.filter((v) => v !== item));

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 rounded-lg border bg-background">
        {values.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1 pr-1">
            {v}
            <button onClick={() => remove(v)} className="ml-0.5 rounded hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
        <Button type="button" size="sm" variant="outline" onClick={add} className="h-8 px-2">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

interface CompanyContextCardProps {
  clientAccountId: string;
}

export function CompanyContextCard({ clientAccountId }: CompanyContextCardProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const [ctx, setCtx] = useState<CompanyContext>({
    business_name: "",
    industry: "",
    website_url: "",
    website_summary: "",
    tone: "professional",
    context_profile: null,
  });

  // context_profile fields lifted to state for easier editing
  const [services, setServices] = useState<string[]>([]);
  const [differentiators, setDifferentiators] = useState<string[]>([]);
  const [targetAudience, setTargetAudience] = useState("");
  const [location, setLocation] = useState("");
  const [businessSummary, setBusinessSummary] = useState("");

  useEffect(() => {
    fetchContext();
  }, [clientAccountId]);

  const fetchContext = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("client_accounts")
        .select("business_name, industry, website_url, website_summary, tone, context_profile")
        .eq("id", clientAccountId)
        .single();

      if (error) throw error;

      setCtx({
        business_name: data.business_name || "",
        industry: data.industry || "",
        website_url: data.website_url || "",
        website_summary: data.website_summary || "",
        tone: data.tone || "professional",
        context_profile: (data.context_profile as unknown as ContextProfile) || null,
      });

      const cp = data.context_profile as unknown as ContextProfile | null;
      setServices(cp?.services || []);
      setDifferentiators(cp?.differentiators || []);
      setTargetAudience(cp?.target_audience || "");
      setLocation(cp?.location || "");
      setBusinessSummary(cp?.business_summary || "");
    } catch (err) {
      console.error("Failed to fetch company context:", err);
      toast({ title: "Failed to load company info", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const update = <K extends keyof CompanyContext>(key: K, value: CompanyContext[K]) => {
    setCtx((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleProfileChange = () => setHasChanges(true);

  const save = async () => {
    setSaving(true);
    try {
      const updatedProfile: ContextProfile = {
        ...(ctx.context_profile || {}),
        services,
        differentiators,
        target_audience: targetAudience,
        location,
        tone: ctx.tone,
        business_summary: businessSummary,
      };

      const { error } = await (supabase.rpc as any)("client_update_company_context", {
        p_client_account_id: clientAccountId,
        p_industry:          ctx.industry,
        p_website_url:       ctx.website_url,
        p_website_summary:   ctx.website_summary,
        p_tone:              ctx.tone,
        p_context_profile:   updatedProfile,
      });

      if (error) throw error;

      toast({ title: "Company info saved", description: "AI content will use your updated context." });
      setHasChanges(false);
    } catch (err) {
      console.error("Failed to save context:", err);
      toast({ title: "Save failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-0 bg-muted/30">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 bg-muted/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Company Context
        </CardTitle>
        <CardDescription>
          This information is used by AI when generating your content. Keep it accurate for the best results.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Read-only business name */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Business Name</Label>
          <Input value={ctx.business_name} readOnly className="bg-muted/50 cursor-default" />
          <p className="text-xs text-muted-foreground">Contact your account manager to change this.</p>
        </div>

        {/* Industry + Tone side by side */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Industry</Label>
            <Input
              value={ctx.industry}
              onChange={(e) => update("industry", e.target.value)}
              placeholder="e.g. Digital Marketing, HVAC, Legal..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Brand Tone</Label>
            <Select value={ctx.tone} onValueChange={(v) => update("tone", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONE_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Website URL */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Website URL</Label>
          <Input
            value={ctx.website_url}
            onChange={(e) => update("website_url", e.target.value)}
            placeholder="https://yourbusiness.com"
            type="url"
          />
        </div>

        {/* Website Summary */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Website Summary</Label>
          <Textarea
            value={ctx.website_summary}
            onChange={(e) => update("website_summary", e.target.value)}
            placeholder="Brief description of what your website covers and what visitors can find..."
            className="min-h-[80px] resize-none"
          />
        </div>

        <div className="border-t pt-4 space-y-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">AI Content Profile</p>

          {/* Business Summary */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Business Summary</Label>
            <Textarea
              value={businessSummary}
              onChange={(e) => { setBusinessSummary(e.target.value); handleProfileChange(); }}
              placeholder="One sentence: what your business does and who it serves..."
              className="min-h-[72px] resize-none"
            />
          </div>

          {/* Target Audience + Location */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Target Audience</Label>
              <Input
                value={targetAudience}
                onChange={(e) => { setTargetAudience(e.target.value); handleProfileChange(); }}
                placeholder="e.g. Small business owners in Australia"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Location / Region</Label>
              <Input
                value={location}
                onChange={(e) => { setLocation(e.target.value); handleProfileChange(); }}
                placeholder="e.g. Melbourne, VIC"
              />
            </div>
          </div>

          {/* Services */}
          <TagEditor
            label="Services / Products"
            values={services}
            onChange={(v) => { setServices(v); handleProfileChange(); }}
            placeholder="Add a service and press Enter..."
          />

          {/* Differentiators */}
          <TagEditor
            label="Key Differentiators"
            values={differentiators}
            onChange={(v) => { setDifferentiators(v); handleProfileChange(); }}
            placeholder="e.g. 20+ years experience, family-owned..."
          />
        </div>

        {hasChanges && (
          <div className="flex justify-end pt-2">
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : "Save Company Info"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
