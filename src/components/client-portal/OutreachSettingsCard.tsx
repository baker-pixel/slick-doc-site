import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CollapsibleCard } from "./CollapsibleCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { PenLine, Save, Loader2 } from "lucide-react";

interface OutreachSettings {
  signature: { name: string; title: string };
  cta: { label: string; url: string };
}

const EMPTY_SETTINGS: OutreachSettings = {
  signature: { name: "", title: "" },
  cta: { label: "", url: "" },
};

// Merged into every prospect_outreach email run-prospect-drip drafts:
// the sign-off (falls back to the business name when unset) and the one
// CTA link (falls back to website_url, then a generic scheduling page).
export function OutreachSettingsCard({ clientAccountId }: { clientAccountId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [settings, setSettings] = useState<OutreachSettings>(EMPTY_SETTINGS);
  const [fallbackUrl, setFallbackUrl] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("client_accounts")
        .select("outreach_settings, website_url")
        .eq("id", clientAccountId)
        .single();
      const stored = (data?.outreach_settings ?? {}) as Partial<OutreachSettings>;
      setSettings({
        signature: { ...EMPTY_SETTINGS.signature, ...stored.signature },
        cta: { ...EMPTY_SETTINGS.cta, ...stored.cta },
      });
      setFallbackUrl(data?.website_url || "https://orangedoormarketing.com/schedule");
      setLoading(false);
    };
    load();
  }, [clientAccountId]);

  const update = (section: "signature" | "cta", key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
    setHasChanges(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase.rpc as any)("client_update_outreach_settings", {
        p_client_account_id: clientAccountId,
        p_settings: settings,
      });
      if (error) throw error;
      toast({ title: "Outreach settings saved", description: "Newly drafted emails will use this signature and link." });
      setHasChanges(false);
    } catch (err) {
      console.error("Failed to save outreach settings:", err);
      toast({ title: "Save failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-0 bg-muted/30">
        <CardHeader>
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <CollapsibleCard
      icon={<PenLine className="h-5 w-5 text-primary" />}
      title="Signature & call-to-action"
      description={`Used to sign off and link out in every AI-drafted outreach email. Leave blank to sign as your business name and link to ${fallbackUrl}.`}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Your name</Label>
            <Input
              value={settings.signature.name}
              onChange={(e) => update("signature", "name", e.target.value)}
              placeholder="e.g. Jordan Lee"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Title (optional)</Label>
            <Input
              value={settings.signature.title}
              onChange={(e) => update("signature", "title", e.target.value)}
              placeholder="e.g. Founder"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">CTA link text</Label>
            <Input
              value={settings.cta.label}
              onChange={(e) => update("cta", "label", e.target.value)}
              placeholder="e.g. Book a 15-minute call"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">CTA link URL</Label>
            <Input
              type="url"
              value={settings.cta.url}
              onChange={(e) => update("cta", "url", e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>

        {hasChanges && (
          <div className="flex justify-end pt-2">
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}
