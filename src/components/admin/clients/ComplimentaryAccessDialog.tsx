import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { addDays, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { callAdminApi } from "@/lib/admin-api";
import { toast } from "@/hooks/use-toast";

const DEFAULT_COMP_DAYS = 60;

export interface ComplimentaryClient {
  id: string;
  business_name: string;
  status: string;
  paused_for_billing?: boolean | null;
  billing_bypass?: boolean | null;
  billing_bypass_reason?: string | null;
  billing_bypass_until?: string | null;
}

interface Props {
  client: ComplimentaryClient;
  adminPassword: string;
  /** Called after a save so the parent can refresh its client list. */
  onChanged?: () => void;
}

const toDateInput = (iso?: string | null) => (iso ? format(new Date(iso), "yyyy-MM-dd") : "");

function isActive(c: ComplimentaryClient) {
  if (!c.billing_bypass) return false;
  return !c.billing_bypass_until || new Date(c.billing_bypass_until).getTime() > Date.now();
}

/**
 * Admin control for free ("complimentary") access: the client skips payment
 * but runs the same cycles and workflows as a paying client. Ending it (or
 * letting the end date pass) puts the account back on normal billing rules.
 */
export function ComplimentaryAccessDialog({ client, adminPassword, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  // What the server holds after our own save, until the parent refreshes.
  const [saved, setSaved] = useState<ComplimentaryClient>(client);

  useEffect(() => setSaved(client), [client]);

  useEffect(() => {
    if (!open) return;
    setEnabled(!!saved.billing_bypass);
    setReason(saved.billing_bypass_reason ?? "");
    setUntil(saved.billing_bypass ? toDateInput(saved.billing_bypass_until) : toDateInput(addDays(new Date(), DEFAULT_COMP_DAYS).toISOString()));
  }, [open, saved]);

  const comped = isActive(saved);
  const expired = !!saved.billing_bypass && !comped;

  const save = async () => {
    if (enabled && !reason.trim()) {
      toast({ title: "Add a reason", description: "Say why this account has free access (e.g. a relative testing).", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const untilIso = enabled && until ? new Date(`${until}T23:59:59`).toISOString() : null;
      const data: Record<string, unknown> = enabled
        ? {
            billing_bypass: true,
            billing_bypass_reason: reason.trim(),
            billing_bypass_until: untilIso,
            billing_bypass_at: new Date().toISOString(),
          }
        : { billing_bypass: false, billing_bypass_until: null };
      // An account the billing sweep paused comes straight back on.
      if (enabled && saved.status === "paused" && saved.paused_for_billing) {
        data.status = "active";
        data.paused_for_billing = false;
      }

      const { error } = await callAdminApi(adminPassword, {
        action: "update",
        table: "client_accounts",
        id: client.id,
        data,
      });
      if (error) {
        toast({ title: "Couldn't save", description: error, variant: "destructive" });
        return;
      }

      setSaved({ ...saved, ...(data as Partial<ComplimentaryClient>) });
      setOpen(false);
      onChanged?.();

      if (enabled) {
        // Same workflow as a paying client: open the cycle now. If this
        // misses, the hourly sweep opens it anyway.
        supabase.functions
          .invoke("start-client-cycle", { body: { client_id: client.id, password: adminPassword } })
          .catch((e) => console.error("start-client-cycle:", e));
        toast({ title: "Free access on", description: `${client.business_name} runs the normal cycles without payment.` });
      } else {
        toast({ title: "Free access ended", description: "This account follows normal billing rules again." });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 shrink-0"
        onClick={() => setOpen(true)}
        title="Let this client use the product without paying"
      >
        <Gift className="w-4 h-4" />
        <span className="hidden sm:inline">{comped ? "Free access" : "Comp"}</span>
        {comped && <Badge variant="secondary" className="bg-green-100 text-green-800">On</Badge>}
        {expired && <Badge variant="secondary" className="bg-amber-100 text-amber-800">Expired</Badge>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Free access: {client.business_name}</DialogTitle>
            <DialogDescription>
              The client skips payment but goes through the same cycles and workflows as everyone else.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="comp-switch" className="font-medium">Free access</Label>
              <Switch id="comp-switch" checked={enabled} onCheckedChange={setEnabled} />
            </div>

            {enabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="comp-reason">Reason (required)</Label>
                  <Textarea
                    id="comp-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Baker's relative, testing the product"
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comp-until">Ends on (leave empty for no end date)</Label>
                  <Input id="comp-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
                  <p className="text-xs text-muted-foreground">
                    After this date the account is billed like any other. Default is {DEFAULT_COMP_DAYS} days.
                  </p>
                </div>
              </>
            )}

            {!enabled && saved.billing_bypass && (
              <p className="text-sm text-amber-700">
                Turning this off puts the account back on normal billing. With no subscription it will be paused by the billing check.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
