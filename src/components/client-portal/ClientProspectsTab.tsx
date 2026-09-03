import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, Info, Radar, TrendingUp, Users, CheckCircle2, Mail, Target, AlertTriangle, MapPin, Sparkles, Eye, MousePointerClick } from "lucide-react";
import { CompanyContextCard } from "./CompanyContextCard";
import { ProspectIcpCard } from "./ProspectIcpCard";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";

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
  opened_at: string | null;
  clicked_at: string | null;
}

interface ProspectEmail {
  subject: string;
  status: string;
  sent_at: string;
  drip_step: number | null;
}

interface SequenceStep {
  step_number: number;
  delay_days: number;
  cumulative_days: number;
}

// Mirrors the step themes run-prospect-drip actually writes into each
// prospect's personalized email (see stepThemes in that function) --
// client-facing summaries of the same four goals, not the raw AI prompt.
const SEQUENCE_STEP_LABELS: Record<number, { title: string; description: string }> = {
  1: { title: "Introduction", description: "A warm, personalized first note referencing something specific about the lead's business." },
  2: { title: "Follow-up", description: "Speaks to a pain point common in the lead's space and how you solve it." },
  3: { title: "What working with you looks like", description: "Concrete services and what sets you apart, aimed at booking a call." },
  4: { title: "Final check-in", description: "Short, low-pressure close asking if a quick call is worth it." },
};

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
  const [nextEmail, setNextEmail] = useState<{ subject: string; scheduled_for: string } | null>(null);
  const [icpLocal, setIcpLocal] = useState(true);
  const [findingLeads, setFindingLeads] = useState(false);
  const [sequenceSteps, setSequenceSteps] = useState<SequenceStep[] | null>(null);

  const loadProspects = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("prospects")
      .select("id, name, business_type, city, website_url, status, source, created_at, gap_score, icp_fit_score, icp_fit_reason, personalization_hook, top_weaknesses, drip_step, opened_at, clicked_at")
      .eq("client_id", clientAccountId)
      .order("created_at", { ascending: false })
      .limit(200);
    setAllProspects(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadProspects();
    supabase.from("client_accounts").select("icp").eq("id", clientAccountId).single()
      .then(({ data }) => {
        const icp = data?.icp as { local?: boolean } | null;
        if (icp && typeof icp.local === "boolean") setIcpLocal(icp.local);
      });
    (supabase.rpc as any)("client_get_outreach_sequence").then(({ data }: { data: SequenceStep[] | null }) => {
      setSequenceSteps(data ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientAccountId]);

  const findLeadsNow = async () => {
    setFindingLeads(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        icpLocal ? "discover-prospects" : "discover-prospects-web",
        { body: { client_id: clientAccountId } },
      );
      const errMsg = await getEdgeErrorMessage(error, data);
      if (errMsg) throw new Error(friendlyEdgeMessage(errMsg));
      toast({ title: `${data.discovered ?? 0} new leads found`, description: "They'll be reviewed and added to your outreach queue shortly." });
      if ((data.discovered ?? 0) > 0) loadProspects();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Couldn't find new leads", description: msg, variant: "destructive" });
    } finally {
      setFindingLeads(false);
    }
  };

  const openDetail = async (p: Prospect) => {
    setSelected(p);
    setEmails(null);
    setNextEmail(null);
    setEmailsLoading(true);
    const [{ data, error }, { data: nextData }] = await Promise.all([
      (supabase.rpc as any)("client_get_prospect_emails", {
        p_client_account_id: clientAccountId,
        p_prospect_id: p.id,
      }),
      (supabase.rpc as any)("client_get_prospect_next_email", {
        p_client_account_id: clientAccountId,
        p_prospect_id: p.id,
      }),
    ]);
    setEmails(error ? [] : (data as ProspectEmail[]));
    setNextEmail((nextData?.[0] as { subject: string; scheduled_for: string }) ?? null);
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
        <span className="flex-1">
          Orange Door is running outreach on your behalf, based on the ideal customer profile above. Click a lead
          below to see why it was matched and what's been sent.
        </span>
        <Button size="sm" variant="outline" className="gap-2 shrink-0" onClick={findLeadsNow} disabled={findingLeads}>
          {findingLeads ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {findingLeads ? "Searching..." : "Find leads now"}
        </Button>
      </div>

      {sequenceSteps && sequenceSteps.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 font-medium text-sm">
            <Mail className="w-4 h-4 text-primary" />
            Your outreach sequence
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Every matched lead automatically goes through these {sequenceSteps.length} emails, personalized per business — this is the campaign running on your behalf, before any lead reaches a given step.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {sequenceSteps.map((s) => {
              const label = SEQUENCE_STEP_LABELS[s.step_number];
              return (
                <div key={s.step_number} className="rounded-lg border bg-muted/30 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step {s.step_number}</span>
                    <Badge variant="outline" className="text-xs">Day {s.cumulative_days}</Badge>
                  </div>
                  <div className="text-sm font-medium">{label?.title ?? `Step ${s.step_number}`}</div>
                  <p className="text-xs text-muted-foreground">{label?.description ?? ""}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

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
                      <div className="flex items-center gap-1.5">
                        {p.clicked_at ? (
                          <MousePointerClick className="w-3.5 h-3.5 text-emerald-600"><title>Clicked a link</title></MousePointerClick>
                        ) : p.opened_at ? (
                          <Eye className="w-3.5 h-3.5 text-blue-500"><title>Opened an email</title></Eye>
                        ) : null}
                        <Badge variant="outline" className={`text-xs ${STATUS_STYLES[p.status] ?? ""}`}>
                          {STATUS_LABELS[p.status] ?? p.status}
                        </Badge>
                      </div>
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

                {(selected.opened_at || selected.clicked_at) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {selected.clicked_at ? (
                      <>
                        <MousePointerClick className="w-3.5 h-3.5 text-emerald-600" />
                        Clicked a link {format(new Date(selected.clicked_at), "MMM d, yyyy")}
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-blue-500" />
                        Opened an email {format(new Date(selected.opened_at!), "MMM d, yyyy")}
                      </>
                    )}
                  </div>
                )}

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

                {!emailsLoading && nextEmail && (
                  <div className="space-y-1 border-t pt-3">
                    <div className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Next scheduled</div>
                    <div className="rounded-lg border border-dashed bg-background px-3 py-2 text-xs">
                      <div className="font-medium">{nextEmail.subject}</div>
                      <div className="text-muted-foreground">
                        {format(new Date(nextEmail.scheduled_for), "MMM d, yyyy 'at' h:mm a")}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
