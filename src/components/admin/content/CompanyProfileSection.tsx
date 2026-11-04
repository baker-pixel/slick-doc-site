import { useState } from "react";
import { format } from "date-fns";
import { FileText, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";

export interface ProfileRun {
  status: "running" | "complete" | "failed" | "skipped";
  created_at: string;
  path: string | null;
  filled: string[];
  suggestions_count: number;
  dropped_count: number;
  pages_read: number | null;
  note: string | null;
  error: string | null;
}

interface Claim { text: string; evidence: { url: string; quote: string }[] }
interface Detail {
  created_at: string;
  path: string | null;
  tool_calls: number | null;
  proposal: { summary: Claim | null; industry: Claim | null; target_audience: Claim | null; services: Claim[]; differentiators: Claim[]; locations: Claim[]; facts: Claim[] } | null;
  dropped: { field: string; text: string; reason: string }[] | null;
}

const FIELD_LABELS: Record<string, string> = {
  website_summary: "Website summary", business_summary: "Business summary", industry: "Industry", target_audience: "Target audience",
  services: "Services", differentiators: "Differentiators", location: "Location",
};
const LIST_SECTIONS: [keyof NonNullable<Detail["proposal"]>, string][] = [
  ["services", "Services"], ["differentiators", "What sets them apart"], ["locations", "Places"], ["facts", "Facts the site states"],
];

interface Props {
  clientId: string;
  adminPassword: string | null | undefined;
  profile: ProfileRun | null;
  /** true between clicking Rebuild and the new run showing up */
  pending: boolean;
  /** only when a finished crawl exists to read */
  canBuild: boolean;
  onRebuild: () => void;
}

function ClaimList({ title, claims }: { title: string; claims: Claim[] }) {
  if (!claims.length) return null;
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">{title}</div>
      <ul className="space-y-1.5">
        {claims.map((c, i) => (
          <li key={i} className="text-sm">
            {c.text}
            {c.evidence.slice(0, 2).map((e, j) => (
              <div key={j} className="text-xs text-muted-foreground ml-3 border-l pl-2 mt-0.5">
                “{e.quote}” <a href={e.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground break-all">{new URL(e.url).pathname}</a>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CompanyProfileSection({ clientId, adminPassword, profile, pending, canBuild, onRebuild }: Props) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("site-crawl", { body: { action: "profile_detail", client_id: clientId, password: adminPassword } });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Couldn't load the evidence");
      }
      setDetail(data?.profile ?? null);
    } catch (e) {
      toast({ title: "Couldn't load the evidence", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
      setOpen(false);
    } finally { setLoading(false); }
  };

  const running = pending || profile?.status === "running";
  const p = profile;

  return (
    <div className="border-t pt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-sm font-medium"><FileText className="w-4 h-4 text-orange-500" /> Company profile</div>
        {running && <Badge variant="secondary" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" /> building</Badge>}
        <div className="flex-1" />
        {p?.status === "complete" && <Button variant="ghost" size="sm" onClick={toggle}>{open ? "Hide evidence" : "Show evidence"}</Button>}
        <Button variant="outline" size="sm" onClick={onRebuild} disabled={running || !canBuild} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" /> {p ? "Rebuild" : "Build from website"}
        </Button>
      </div>

      {running && <p className="text-sm text-muted-foreground">Reading the pages to work out what the business does, who it serves and where. This takes a minute or two.</p>}
      {!running && !p && <p className="text-sm text-muted-foreground">Not built yet. It runs automatically after each crawl, or press the button.</p>}
      {!running && p?.status === "complete" && (
        <div className="space-y-1">
          <p className="text-sm">
            Built {format(new Date(p.created_at), "MMM d, h:mm a")}{p.pages_read ? ` from ${p.pages_read} pages` : ""}.
            {p.filled.length > 0 ? <> Filled in: <span className="font-medium">{p.filled.map((f) => FIELD_LABELS[f] ?? f).join(", ")}</span>.</> : " Nothing needed filling: the record already had those details."}
            {p.suggestions_count > 0 && <> {p.suggestions_count} suggestion{p.suggestions_count === 1 ? "" : "s"} waiting in the client's Company Context.</>}
          </p>
          {p.path === "fallback" && <p className="text-xs text-amber-600">Built from the website's own markup only. {p.note}</p>}
          {p.dropped_count > 0 && <p className="text-xs text-muted-foreground">{p.dropped_count} claim{p.dropped_count === 1 ? " was" : "s were"} rejected because the website didn't back them up.</p>}
        </div>
      )}
      {!running && p?.status === "skipped" && <p className="text-sm text-muted-foreground">{p.note ?? "Skipped."}</p>}
      {!running && p?.status === "failed" && <p className="text-sm text-red-600">The last attempt failed: {p.error}</p>}

      {open && (
        <div className="rounded border bg-muted/20 p-3 space-y-3">
          {loading && <div className="text-xs text-muted-foreground">Loading…</div>}
          {!loading && !detail?.proposal && <div className="text-xs text-muted-foreground">No finished profile to show.</div>}
          {detail?.proposal && (
            <>
              <ClaimList title="Summary" claims={detail.proposal.summary ? [detail.proposal.summary] : []} />
              <ClaimList title="Industry" claims={detail.proposal.industry ? [detail.proposal.industry] : []} />
              <ClaimList title="Who they serve" claims={detail.proposal.target_audience ? [detail.proposal.target_audience] : []} />
              {LIST_SECTIONS.map(([k, label]) => <ClaimList key={k} title={label} claims={(detail.proposal![k] as Claim[]) ?? []} />)}
              {(detail.dropped?.length ?? 0) > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Rejected claims ({detail.dropped!.length})</summary>
                  <ul className="mt-1 ml-4 list-disc space-y-0.5">
                    {detail.dropped!.map((d, i) => <li key={i}><span className="text-foreground">{d.field}: {d.text}</span>: {d.reason}</li>)}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
