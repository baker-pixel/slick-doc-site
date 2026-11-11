import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Target, Save, Loader2 } from "lucide-react";
import { TagEditor } from "./CompanyContextCard";
import { CollapsibleCard } from "./CollapsibleCard";
import { icpForSave, normalizeKeywords, MAX_KEYWORDS, type KeywordSource } from "@/lib/icpKeywords";

interface ClientICP {
  industries: string[];
  company_size?: string;
  geography: string;
  local: boolean;
  buyer_persona?: string;
  disqualifiers?: string[];
  summary: string;
  /** Company-type tags lead discovery searches with. AI-derived unless a person set them. */
  search_keywords?: string[];
  search_keywords_source?: KeywordSource;
}

const EMPTY_ICP: ClientICP = {
  industries: [],
  company_size: "",
  geography: "",
  local: false,
  buyer_persona: "",
  disqualifiers: [],
  summary: "",
};

export function ProspectIcpCard({ clientAccountId }: { clientAccountId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [icp, setIcp] = useState<ClientICP>(EMPTY_ICP);
  const [hasStoredIcp, setHasStoredIcp] = useState(false);
  // True once the person has changed the keyword list themselves (vs. only other fields).
  const [keywordsEdited, setKeywordsEdited] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("client_accounts")
        .select("icp")
        .eq("id", clientAccountId)
        .single();
      const stored = data?.icp as unknown as ClientICP | null;
      if (stored && typeof stored === "object") {
        setIcp({ ...EMPTY_ICP, ...stored });
        setHasStoredIcp(true);
      }
      setLoading(false);
    };
    load();
  }, [clientAccountId]);

  const update = <K extends keyof ClientICP>(key: K, value: ClientICP[K]) => {
    setIcp((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const setKeywords = (list: string[]) => {
    const cleaned = normalizeKeywords(list);
    if (cleaned.length < list.length) {
      toast({
        title: "Some keywords were skipped",
        description: `Keywords need 3-60 characters, can't repeat, and are limited to ${MAX_KEYWORDS}.`,
      });
    }
    setIcp((prev) => ({ ...prev, search_keywords: cleaned }));
    setKeywordsEdited(true);
    setHasChanges(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      // Keywords typed in here are kept (flagged manual). Keywords the AI derived are dropped on any
      // edit, since they came from the ICP that just changed, and re-derived on the next discovery run.
      const payload = icpForSave(icp, keywordsEdited);
      const { error } = await (supabase.rpc as any)("client_update_icp", {
        p_client_account_id: clientAccountId,
        p_icp: payload,
      });
      if (error) throw error;
      toast({ title: "Ideal customer profile saved", description: "Future lead discovery and fit scoring will use this." });
      setIcp({ ...EMPTY_ICP, ...payload });
      setKeywordsEdited(false);
      setHasChanges(false);
      setHasStoredIcp(true);
    } catch (err) {
      console.error("Failed to save ICP:", err);
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
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <CollapsibleCard
      icon={<Target className="h-5 w-5 text-primary" />}
      title="Ideal Customer Profile"
      description={
        hasStoredIcp
          ? "Who Orange Door should find leads for. Edit and save to refine who gets discovered and how fit is scored."
          : "Who Orange Door should find leads for. This gets generated automatically once discovery runs."
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">One-line summary</Label>
          <Textarea
            value={icp.summary}
            onChange={(e) => update("summary", e.target.value)}
            placeholder="e.g. Local HVAC and mechanical contractors who need more inbound calls"
            className="min-h-[60px] resize-none"
          />
        </div>

        <TagEditor
          label="Target industries"
          values={icp.industries}
          onChange={(v) => update("industries", v)}
          placeholder="Add an industry and press Enter..."
        />

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Company size</Label>
            <Input
              value={icp.company_size}
              onChange={(e) => update("company_size", e.target.value)}
              placeholder="e.g. 10-200 employees, or any"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Geography</Label>
            <Input
              value={icp.geography}
              onChange={(e) => update("geography", e.target.value)}
              placeholder="e.g. Knoxville, TN metro"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2.5">
          <div>
            <Label className="text-sm font-medium">Local businesses</Label>
            <p className="text-xs text-muted-foreground">On if your customers are local physical businesses (maps search), off if national/online.</p>
          </div>
          <Switch checked={icp.local} onCheckedChange={(v) => update("local", v)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Buyer persona</Label>
          <Input
            value={icp.buyer_persona}
            onChange={(e) => update("buyer_persona", e.target.value)}
            placeholder="e.g. Owner or office manager"
          />
        </div>

        <TagEditor
          label="Disqualifiers"
          values={icp.disqualifiers || []}
          onChange={(v) => update("disqualifiers", v)}
          placeholder="Traits that make a lead a bad fit..."
        />

        {/* Keywords drive the online company search. Local (maps) discovery searches by place, not keyword. */}
        {!icp.local && (
          <div className="space-y-1.5">
            <TagEditor
              label="Search keywords"
              values={icp.search_keywords || []}
              onChange={setKeywords}
              placeholder="Add a type of company, e.g. executive coaching firms..."
            />
            <p className="text-xs text-muted-foreground">
              {(icp.search_keywords?.length ?? 0) === 0
                ? "None yet. They're created automatically the next time lead discovery runs, or add your own."
                : icp.search_keywords_source === "manual" && !keywordsEdited
                  ? "Set by you, so they stay as they are when you edit the rest of this profile."
                  : keywordsEdited
                    ? "Your keywords are used as soon as you save."
                    : "Suggested automatically. Editing this profile re-creates them, unless you set your own."}
              {" "}Use concrete company types of 2-4 words (up to {MAX_KEYWORDS}). Avoid broad words like "software" or "solutions".
            </p>
            {icp.search_keywords_source === "manual" && !keywordsEdited && (
              <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setKeywords([])}>
                Reset to automatic suggestions
              </Button>
            )}
          </div>
        )}

        {hasChanges && (
          <div className="flex justify-end pt-2">
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : "Save ICP"}
            </Button>
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}
