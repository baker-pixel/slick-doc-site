import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { History, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";

interface Change {
  id: string;
  field: string;
  page_url: string | null;
  image_src: string | null;
  new_value: string;
  before_value: string | null;
  status: string;
  verify_note: string | null;
  error_message: string | null;
  created_at: string;
  applied_at: string | null;
}

const FIELD_LABEL: Record<string, string> = {
  meta_title: "Page title",
  meta_desc: "Meta description",
  focus_keyword: "Focus keyword",
  canonical: "Canonical link",
  alt_text: "Image description",
  schema_jsonld: "Business details for Google",
  faq_jsonld: "FAQ markup",
  llms_txt: "AI visibility file",
};

const STATUS: Record<string, { label: string; tone: string }> = {
  queued: { label: "Waiting for your site", tone: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  delivered: { label: "Applying…", tone: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  applied: { label: "Saved", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  verified: { label: "Live on your site", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  unverified: { label: "Saved, not showing yet", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  failed: { label: "Couldn't apply", tone: "bg-destructive/15 text-destructive" },
  revert_queued: { label: "Undoing…", tone: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  revert_delivered: { label: "Undoing…", tone: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  reverted: { label: "Undone", tone: "bg-muted text-muted-foreground" },
};

const BUSY = new Set(["queued", "delivered", "revert_queued", "revert_delivered"]);
const CAN_UNDO = new Set(["applied", "verified", "unverified"]);

function target(c: Change): string {
  const raw = c.page_url ?? c.image_src;
  if (!raw) return "Whole site";
  try {
    const u = new URL(raw);
    const last = u.pathname.replace(/\/+$/, "").split("/").pop();
    return c.image_src && !c.page_url ? (last || u.hostname) : u.pathname === "/" ? "Home page" : u.pathname;
  } catch {
    return raw;
  }
}

/** Changes made to the client's WordPress site through the Orange Door plugin, each with an Undo. */
export function WpChangeHistory({ siteId }: { siteId: string }) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Change | null>(null);

  const load = useCallback(async () => {
    // site_changes is newer than the generated database types.
    const { data } = await (supabase as any)
      .from("site_changes")
      .select("id, field, page_url, image_src, new_value, before_value, status, verify_note, error_message, created_at, applied_at")
      .eq("site_id", siteId)
      .order("created_at", { ascending: false })
      .limit(25);
    setChanges((data ?? []) as Change[]);
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  // Something is on its way to or from the site: keep looking until it settles.
  const busy = (changes ?? []).some((c) => BUSY.has(c.status));
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [busy, load]);

  async function undo(c: Change) {
    setUndoing(c.id);
    try {
      const { data, error } = await supabase.functions.invoke("revert-site-change", { body: { change_id: c.id } });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Could not undo");
      }
      toast.success("Undo queued. Your site puts it back at its next check-in, usually within 5 minutes.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not undo");
    } finally {
      setUndoing(null);
      setConfirm(null);
    }
  }

  if (!changes || changes.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Changes made to your site
            <Badge variant="secondary">{changes.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {changes.map((c) => {
            const st = STATUS[c.status] ?? { label: c.status, tone: "bg-muted text-muted-foreground" };
            const when = c.applied_at ?? c.created_at;
            return (
              <div key={c.id} className="px-4 py-3 border-t first:border-t-0 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {FIELD_LABEL[c.field] ?? c.field}
                      <span className="text-muted-foreground font-normal"> · {target(c)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(when), { addSuffix: true })}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={`border-transparent ${st.tone}`}>
                      {BUSY.has(c.status) && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      {st.label}
                    </Badge>
                    {CAN_UNDO.has(c.status) && (
                      <Button size="sm" variant="ghost" className="gap-1 h-7" disabled={undoing === c.id} onClick={() => setConfirm(c)}>
                        <Undo2 className="h-3.5 w-3.5" /> Undo
                      </Button>
                    )}
                  </div>
                </div>
                {(c.status === "unverified" || c.status === "failed") && (c.verify_note || c.error_message) && (
                  <p className="text-xs text-muted-foreground">{c.status === "failed" ? c.error_message : c.verify_note}</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this change?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && (
                <>
                  Your site goes back to how {FIELD_LABEL[confirm.field]?.toLowerCase() ?? confirm.field} looked before Orange Door first
                  changed it{confirm.before_value ? <>: “{confirm.before_value.slice(0, 120)}”</> : " (it had nothing set)"}.
                  This takes effect at your site's next check-in.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && undo(confirm)}>Undo change</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
