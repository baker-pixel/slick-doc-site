import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MousePointerClick, Download } from "lucide-react";
import { warmLeadsCsv, type WarmLead } from "@/lib/warmLeads";

/**
 * Leads whose email sequence finished, who clicked a link, and never replied:
 * the best candidates for a personal follow-up. Hidden when there are none, or
 * when the server function isn't available yet.
 */
export function WarmLeadsCard({ clientAccountId }: { clientAccountId: string }) {
  const [leads, setLeads] = useState<WarmLead[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase.rpc as any)("client_warm_leads", { p_client_account_id: clientAccountId });
      if (cancelled || error) return;
      setLeads((data ?? []) as WarmLead[]);
    })();
    return () => { cancelled = true; };
  }, [clientAccountId]);

  if (leads.length === 0) return null;

  const download = () => {
    const blob = new Blob([warmLeadsCsv(leads)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interested-no-reply-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        <MousePointerClick className="w-5 h-5 mt-0.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm">
            {leads.length} {leads.length === 1 ? "lead" : "leads"} showed interest but haven't replied
          </div>
          <p className="text-sm text-muted-foreground">
            They clicked a link in your emails and our sequence has finished. A short personal message from you is the best next step.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={download} className="shrink-0">
          <Download className="w-3.5 h-3.5 mr-1.5" /> Download CSV
        </Button>
      </div>
      <ul className="divide-y rounded-md border bg-background text-sm">
        {leads.slice(0, 10).map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
            <span className="font-medium">{l.name}</span>
            <span className="text-muted-foreground truncate">{l.website_url.replace(/^https?:\/\/(www\.)?/, "")}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              Clicked {format(new Date(l.clicked_at), "d MMM")} · {l.emails_sent} {l.emails_sent === 1 ? "email" : "emails"} sent
            </span>
          </li>
        ))}
      </ul>
      {leads.length > 10 && (
        <p className="text-xs text-muted-foreground">Showing 10 of {leads.length}. The CSV has all of them.</p>
      )}
    </Card>
  );
}
