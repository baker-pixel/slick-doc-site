import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { tierPolicy } from "../_shared/tierPolicy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cron-driven re-audit (architecture v2, closing the loop). Finds clients
// whose latest complete SEO audit is older than their tier's re-audit cadence
// and runs a fresh audit for a few of them per invocation. Bounded per run
// because each audit takes ~40s; running daily drains any backlog quickly.
const MAX_PER_RUN = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { data: clients } = await supabase
      .from("client_accounts")
      .select("id, business_name, tier, website_url")
      .eq("status", "active")
      .not("website_url", "is", null)
      .neq("website_url", "");

    const now = Date.now();
    const due: { id: string; name: string }[] = [];

    for (const c of clients ?? []) {
      const cadenceDays = tierPolicy(c.tier).seo.reauditCadenceDays;
      const { data: latest } = await supabase
        .from("seo_audits")
        .select("created_at")
        .eq("client_account_id", c.id).eq("status", "complete")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      const isDue = !latest ||
        (now - new Date(latest.created_at).getTime()) / 86_400_000 >= cadenceDays;
      if (isDue) due.push({ id: c.id, name: c.business_name });
    }

    // Run a bounded number this invocation; the rest are picked up next run.
    const toRun = due.slice(0, MAX_PER_RUN);
    const results: { client: string; status: string }[] = [];
    for (const c of toRun) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/seo-audit`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ clientId: c.id }),
        });
        const data = await res.json().catch(() => ({}));
        results.push({ client: c.name, status: res.ok ? (data.status ?? "ok") : `error ${res.status}` });
      } catch (e) {
        results.push({ client: c.name, status: `error: ${e instanceof Error ? e.message : e}` });
      }
    }

    console.log(`seo-reaudit-scan: ${due.length} due, ran ${toRun.length}`);
    return json({ due: due.length, ran: toRun.length, results, remaining: Math.max(0, due.length - toRun.length) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("seo-reaudit-scan error:", msg);
    return json({ error: msg }, 500);
  }
});
