import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Info, Radar, TrendingUp, Users, CheckCircle2 } from "lucide-react";

interface Prospect {
  id: string;
  name: string;
  business_type: string | null;
  city: string | null;
  status: string;
  source: string;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending:   "bg-blue-100 text-blue-800 border-blue-200",
  nurture:   "bg-purple-100 text-purple-800 border-purple-200",
  converted: "bg-green-100 text-green-800 border-green-200",
  rejected:  "bg-gray-100 text-gray-500 border-gray-200",
};

const STATUS_LABELS: Record<string, string> = {
  pending:   "Queued",
  nurture:   "In Outreach",
  converted: "Converted",
  rejected:  "Skipped",
};

export default function ClientProspectsTab({ clientAccountId }: { clientAccountId: string }) {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [allProspects, setAllProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("prospects")
        .select("id, name, business_type, city, status, source, created_at")
        .eq("client_id", clientAccountId)
        .order("created_at", { ascending: false })
        .limit(200);
      const rows = data ?? [];
      setAllProspects(rows);
      setProspects(rows.filter(p => p.status !== "discovered"));
      setLoading(false);
    };
    load();
  }, [clientAccountId]);

  const count = (status: string) => allProspects.filter(p => p.status === status).length;

  const stats = [
    { label: "Discovered",  value: allProspects.length,         icon: Radar,       color: "text-orange-500" },
    { label: "In Outreach", value: count("nurture"),             icon: TrendingUp,  color: "text-purple-600" },
    { label: "Converted",   value: count("converted"),           icon: CheckCircle2,color: "text-green-600"  },
    { label: "Queued",      value: count("pending"),             icon: Users,       color: "text-blue-600"   },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map(s => (
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
          Orange Door is running outreach on your behalf. Prospects below were found based on your
          ideal customer profile and are being contacted through a personalised email sequence.
        </span>
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : prospects.length === 0 ? (
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
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Source</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Found</th>
                </tr>
              </thead>
              <tbody>
                {prospects.map(p => (
                  <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3 text-muted-foreground text-xs">{p.business_type ?? "—"}</td>
                    <td className="p-3 text-muted-foreground text-xs">{p.city ?? "—"}</td>
                    <td className="p-3">
                      <Badge variant="outline" className={`text-xs ${STATUS_STYLES[p.status] ?? ""}`}>
                        {STATUS_LABELS[p.status] ?? p.status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs capitalize">{p.source}</Badge>
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
    </div>
  );
}
