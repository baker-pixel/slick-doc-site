import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Info, Radar, TrendingUp, Users, CheckCircle2, Mail, Target, AlertTriangle, MapPin } from "lucide-react";
import { CompanyContextCard } from "./CompanyContextCard";
import { ProspectIcpCard } from "./ProspectIcpCard";

interface Prospect {
  id: string;
  name: string;
  business_type: string | null;
  city: string | null;
  website_url: string;
  status: string;
  source: string;
  created_at: string;
  gap_score: number | null;
  icp_fit_score: number | null;
  icp_fit_reason: string | null;
  personalization_hook: string | null;
  top_weaknesses: string[] | null;
  drip_step: number;
}

interface ProspectEmail {
  subject: string;
  status: string;
  sent_at: string;
  drip_step: number | null;
}

const STATUS_STYLES: Record<string, string> = {
  discovered: "bg-orange-100 text-orange-800 border-orange-200",
  pending:    "bg-blue-100 text-blue-800 border-blue-200",
  nurture:    "bg-purple-100 text-purple-800 border-purple-200",
  converted:  "bg-green-100 text-green-800 border-green-200",
  rejected:   "bg-gray-100 text-gray-500 border-gray-200",
  exhausted:  "bg-gray-100 text-gray-500 border-gray-200",
};

const STATUS_LABELS: Record<string, string> = {
  discovered: "Reviewing",
  pending:    "Queued",
  nurture:    "In Outreach",
  converted:  "Converted",
  rejected:   "Skipped",
  exhausted:  "Sequence Complete",
};

export default function ClientProspectsTab({ clientAccountId }: { clientAccountId: string }) {
  const [allProspects, setAllProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [emails, setEmails] = useState<ProspectEmail[] | null>(null);
  const [emailsLoading, setEmailsLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("prospects")
        .select("id, name, business_type, city, website_url, status, source, created_at, gap_score, icp_fit_score, icp_fit_reason, personalization_hook, top_weaknesses, drip_step")
        .eq("client_id", clientAccountId)
        .order("created_at", { ascending: false })
        .limit(200);
      setAllProspects(data ?? []);
      setLoading(false);
    };
    load();
  }, [clientAccountId]);

  const openDetail = async (p: Prospect) => {
    setSelected(p);
    setEmails(null);
    setEmailsLoading(true);
    const { data, error } = await (supabase.rpc as any)("client_get_prospect_emails", {
      p_client_account_id: clientAccountId,
      p_prospect_id: p.id,
    });
    setEmails(error ? [] : (data as ProspectEmail[]));
    setEmailsLoading(false);
  };

  const visible = allProspects.filter((p) => p.status !== "discovered");
  const count = (status: string) => allProspects.filter((p) => p.status === status).length;

  const stats = [
    { label: "Discovered",  value: count("discovered"), icon: Radar,       color: "text-orange-500" },
    { label: "In Outreach", value: count("nurture"),     icon: TrendingUp,  color: "text-purple-600" },
    { label: "Converted",   value: count("converted"),   icon: CheckCircle2,color: "text-green-600"  },
    { label: "Queued",      value: count("pending"),     icon: Users,       color: "text-blue-600"   },
  ];

  return (
    <div className="space-y-6">
      <ProspectIcpCard clientAccountId={clientAccountId} />
      <CompanyContextCard clientAccountId={clientAccountId} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-3">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <div>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary/60" />
        <span>
          Orange Door is running outreach on your behalf, based on the ideal customer profile above. Click a lead
          below to see why it was matched and what's been sent.
        </span>
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Radar className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No outreach has started yet.</p>
            <p className="text-sm text-muted-foreground">
              Orange Door will begin finding prospects for your business shortly.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Business</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">City</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Fit</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Found</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => openDetail(p)}
                    className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3 text-muted-foreground text-xs">{p.business_type ?? "—"}</td>
                    <td className="p-3 text-muted-foreground text-xs">{p.city ?? "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {p.icp_fit_score != null ? `${p.icp_fit_score}/100` : "—"}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={`text-xs ${STATUS_STYLES[p.status] ?? ""}`}>
                        {STATUS_LABELS[p.status] ?? p.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {format(new Date(p.created_at), "MMM d, yyyy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selected.name}
                  <Badge variant="outline" className={`text-xs ${STATUS_STYLES[selected.status] ?? ""}`}>
                    {STATUS_LABELS[selected.status] ?? selected.status}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4 shrink-0" />
                  {selected.business_type ?? "Business"}{selected.city ? ` · ${selected.city}` : ""}
                  {selected.website_url && (
                    <a href={selected.website_url} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate">
                      {selected.website_url}
                    </a>
                  )}
                </div>

                {selected.icp_fit_score != null && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Target className="w-4 h-4 text-primary" />
                      Fit score: {selected.icp_fit_score}/100
                    </div>
                    {selected.icp_fit_reason && (
                      <p className="text-muted-foreground text-xs">{selected.icp_fit_reason}</p>
                    )}
                  </div>
                )}

                {selected.top_weaknesses && selected.top_weaknesses.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-medium text-xs uppercase tracking-wide text-muted-foreground">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Gaps we're using as the hook
                    </div>
                    <ul className="list-disc list-inside text-muted-foreground text-xs space-y-0.5">
                      {selected.top_weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}

                {selected.personalization_hook && (
                  <div className="space-y-1">
                    <div className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Personalization angle</div>
                    <p className="text-muted-foreground text-xs">{selected.personalization_hook}</p>
                  </div>
                )}

                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center gap-2 font-medium text-xs uppercase tracking-wide text-muted-foreground">
                    <Mail className="w-3.5 h-3.5" />
                    Outreach sent
                  </div>
                  {emailsLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : !emails || emails.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nothing sent yet — this lead is still in the queue.</p>
                  ) : (
                    <ul className="space-y-2">
                      {emails.map((e, i) => (
                        <li key={i} className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-xs">
                          <div>
                            <div className="font-medium">{e.subject}</div>
                            <div className="text-muted-foreground">
                              {e.drip_step ? `Step ${e.drip_step} · ` : ""}{format(new Date(e.sent_at), "MMM d, yyyy")}
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs capitalize shrink-0">{e.status}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
