import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Target, Save, Loader2 } from "lucide-react";
import { TagEditor } from "./CompanyContextCard";

interface ClientICP {
  industries: string[];
  company_size?: string;
  geography: string;
  local: boolean;
  buyer_persona?: string;
  disqualifiers?: string[];
  summary: string;
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

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase.rpc as any)("client_update_icp", {
        p_client_account_id: clientAccountId,
        p_icp: icp,
      });
      if (error) throw error;
      toast({ title: "Ideal customer profile saved", description: "Future lead discovery and fit scoring will use this." });
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
    <Card className="border-0 bg-muted/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Ideal Customer Profile
        </CardTitle>
        <CardDescription>
          Who Orange Door should find leads for. {hasStoredIcp
            ? "Edit and save to refine who gets discovered and how fit is scored."
            : "This gets generated automatically once discovery runs — you can edit it any time after."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
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

        {hasChanges && (
          <div className="flex justify-end pt-2">
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : "Save ICP"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
