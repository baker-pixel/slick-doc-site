import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { tierPolicy } from "../_shared/tierPolicy.ts";
import { filterEngagedClients } from "../_shared/engagedClients.ts";
import { queueCrawl } from "../_shared/crawler/queue.ts";

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
    const { data: rawClients } = await supabase
      .from("client_accounts")
      .select("id, business_name, tier, website_url")
      .eq("status", "active")
      .not("website_url", "is", null)
      .neq("website_url", "");

    // Skip clients whose portal invite was never accepted -- they can't see
    // audit results in the portal, so re-auditing them just burns PageSpeed
    // quota and crawl time for nobody.
    const clients = await filterEngagedClients(supabase, rawClients ?? []);

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

    // Start a bounded number of crawls this invocation. Each crawl is incremental when a recent one
    // exists (only changed pages are re-read), and when it finishes the worker queues the audit on the
    // durable agent_jobs queue -- so a due client gets: crawl -> audit, with retries at every step.
    const toRun = due.slice(0, MAX_PER_RUN);
    const results: { client: string; status: string }[] = [];
    for (const c of toRun) {
      const q = await queueCrawl(supabase, c.id, { trigger: "scheduled", runAudit: true });
      results.push({ client: c.name, status: !q.ok ? `not queued: ${q.error}` : q.started ? "crawl started" : "already running" });
    }

    console.log(`seo-reaudit-scan: ${due.length} due, started ${toRun.length}`);
    return json({ due: due.length, started: toRun.length, results, remaining: Math.max(0, due.length - toRun.length) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("seo-reaudit-scan error:", msg);
    return json({ error: msg }, 500);
  }
});
