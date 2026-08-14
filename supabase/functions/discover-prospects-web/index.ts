import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkClientOrAdminAuth } from "../_shared/auth.ts";
import { ensureClientICP } from "../_shared/icp.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";
import { logActivity } from "../_shared/activityLog.ts";
import { refreshProspectProject } from "../_shared/prospectProject.ts";
import { recentDiscoveryRun } from "../_shared/discoveryCooldown.ts";
import { insertNewProspects } from "../_shared/prospectInsert.ts";

// See discover-prospects.ts for why this only applies to client callers.
const CLIENT_COOLDOWN_MS = 60 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Company discovery for clients whose customers aren't local physical
// businesses (B2B / national / global) -- Google Maps can't find "enterprises
// in regulated industries". Apollo's organization-search API is the primary
// source when APOLLO_API_KEY is configured (real B2B company database,
// filterable by industry/location/size). Falls back to an LLM with the
// OpenAI web_search tool when Apollo isn't configured or returns nothing --
// that was the only source before Apollo was wired in, so it stays as a
// safety net rather than being ripped out.

interface RequestBody {
  client_id: string;
  /** Optional focus within the ICP, e.g. "fintech compliance teams". */
  focus?: string;
  /** Optional geography hint; ICP geography used when omitted. */
  geography?: string;
  max_results?: number;
  password?: string;
}

interface FoundCompany {
  name: string;
  website_url: string;
  city?: string;
  business_type?: string;
  why_fit?: string;
}

const OPENAI_API = "https://api.openai.com/v1";
const APOLLO_API = "https://api.apollo.io/api/v1";

// "10-200 employees" / "10 to 200" -> "10,200" (Apollo's range format).
// Returns undefined for "any" or anything unparseable -- an omitted filter
// searches all sizes, which is the safer default over guessing wrong.
function parseEmployeeRange(companySize?: string): string | undefined {
  if (!companySize) return undefined;
  const nums = companySize.match(/\d+/g);
  if (!nums || nums.length < 2) return undefined;
  return `${nums[0]},${nums[1]}`;
}

async function apolloSearchCompanies(
  apolloKey: string,
  icp: { industries: string[]; company_size?: string; geography: string },
  geography: string,
  maxResults: number,
  focus?: string,
): Promise<FoundCompany[]> {
  const body: Record<string, unknown> = {
    q_organization_keyword_tags: focus?.trim() ? [...icp.industries, focus.trim()] : icp.industries,
    per_page: Math.min(maxResults, 100),
    page: 1,
  };
  if (!/global/i.test(geography)) body.organization_locations = [geography];
  const employeeRange = parseEmployeeRange(icp.company_size);
  if (employeeRange) body.organization_num_employees_ranges = [employeeRange];

  const res = await fetch(`${APOLLO_API}/mixed_companies/search`, {
    method: "POST",
    headers: { "x-api-key": apolloKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Apollo organization search failed (${res.status}: ${(await res.text()).slice(0, 300)})`);
  }

  const data = await res.json();
  const orgs: any[] = data?.organizations ?? [];
  // Apollo's search response doesn't include city/industry/employee-count
  // fields (those need a separate per-org enrichment call) -- leave city and
  // business_type unset rather than fabricate them.
  return orgs
    .map((o) => ({
      name: o.name as string,
      website_url: (o.website_url || (o.primary_domain ? `https://${o.primary_domain}` : "")) as string,
    }))
    .filter((c) => c.name && c.website_url);
}

async function webSearchCompanies(
  openaiKey: string,
  prompt: string,
): Promise<FoundCompany[]> {
  // Model fallback: newest small search-capable model first.
  const models = ["gpt-5-mini", "gpt-4o-mini"];
  let lastErr = "";

  for (const model of models) {
    const res = await fetch(`${OPENAI_API}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        tools: [{ type: "web_search" }],
        input: prompt,
      }),
    });

    if (!res.ok) {
      lastErr = `${res.status}: ${(await res.text()).slice(0, 300)}`;
      // Model not available / tool unsupported -> try the next one
      if (res.status === 400 || res.status === 404) continue;
      throw new Error(`OpenAI web search failed (${lastErr})`);
    }

    const data = await res.json();
    const text = (data.output ?? [])
      .filter((item: any) => item.type === "message")
      .flatMap((item: any) => item.content ?? [])
      .filter((c: any) => c.type === "output_text")
      .map((c: any) => c.text)
      .join("\n");

    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end <= start) {
      throw new Error("Web search response contained no JSON array");
    }

    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as FoundCompany[];
      return parsed.filter((c) => c && c.name && c.website_url);
    } catch {
      throw new Error("Failed to parse company list from web search response");
    }
  }

  throw new Error(`OpenAI web search failed on all models (${lastErr})`);
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body: RequestBody = await req.json();

    if (!body.client_id) return json({ error: "client_id is required" }, 400);

    const auth = await checkClientOrAdminAuth(req, supabase, body.client_id, body.password);
    if (!auth.authorized) return json({ error: "Unauthorized" }, 401);

    if (auth.role === "client" && await recentDiscoveryRun(supabase, body.client_id, CLIENT_COOLDOWN_MS)) {
      return json({ error: "Discovery already ran recently for this account -- try again later." }, 429);
    }

    const apolloKey = Deno.env.get("APOLLO_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apolloKey && !openaiKey) return json({ error: "Neither APOLLO_API_KEY nor OPENAI_API_KEY is configured" }, 503);

    const { data: client, error: clientErr } = await supabase
      .from("client_accounts")
      .select("id, business_name, industry, icp, context_profile, tier")
      .eq("id", body.client_id)
      .single();

    if (clientErr || !client) return json({ error: "Client not found" }, 404);

    // Tier gate: prospecting is a plan feature; batch size from tier policy.
    const prospectPolicy = tierPolicy((client as { tier?: string }).tier).prospect;
    if (!prospectPolicy.enabled) {
      return json({ error: "This client's plan tier does not include prospect discovery." }, 403);
    }

    const icp = await ensureClientICP(supabase, client);
    if (!icp) return json({ error: "Could not derive an ICP for this client -- fill in its context profile first" }, 422);

    const maxResults = Math.min(Math.max(body.max_results ?? 15, 1), prospectPolicy.discoveryBatch);
    const geography = body.geography?.trim() || icp.geography;

    const prompt = `Research real, currently-operating companies that match this ideal customer profile. Use web search to find them -- do not invent companies or URLs.

IDEAL CUSTOMER PROFILE:
- Summary: ${icp.summary}
- Industries: ${icp.industries.join(", ")}
- Company size: ${icp.company_size || "any"}
- Geography: ${geography}
- Disqualifiers: ${(icp.disqualifiers || []).join("; ") || "none"}
${body.focus?.trim() ? `- Extra focus for this search: ${body.focus.trim()}` : ""}

Find up to ${maxResults} distinct companies. Each MUST have a real, working company website you found via search. Skip directories, aggregators, franchises' corporate parents, and companies that hit a disqualifier.

Respond with ONLY a JSON array, no prose:
[{ "name": "...", "website_url": "https://...", "city": "city/region or null", "business_type": "short type", "why_fit": "one short sentence" }]`;

    let companies: FoundCompany[] = [];
    let via: "apollo" | "web_search" = "web_search";
    if (apolloKey) {
      try {
        companies = await apolloSearchCompanies(apolloKey, icp, geography, maxResults, body.focus);
        via = "apollo";
      } catch (e) {
        console.error("Apollo search failed, falling back to web search:", e instanceof Error ? e.message : e);
      }
    }
    if (companies.length === 0 && openaiKey) {
      companies = await webSearchCompanies(openaiKey, prompt);
      via = "web_search";
    }

    if (companies.length === 0) {
      return json({ discovered: 0, skipped_duplicates: 0, skipped_no_website: 0, email_enrichment: !!Deno.env.get("HUNTER_API_KEY"), message: "No matching companies found" });
    }

    // Dedupe against existing prospects for this client (normalized URL)
    const { data: existing } = await supabase
      .from("prospects")
      .select("website_url")
      .eq("client_id", body.client_id);

    const existingNorm = new Set((existing ?? []).map((p: { website_url: string }) => normalizeUrl(p.website_url || "")));

    const seen = new Set<string>();
    const fresh = companies.filter((c) => {
      const norm = normalizeUrl(c.website_url);
      if (!norm || existingNorm.has(norm) || seen.has(norm)) return false;
      seen.add(norm);
      return true;
    });

    let inserted: { id: string; name: string; website_url: string; city: string | null }[] = [];
    if (fresh.length > 0) {
      const rows = fresh.map((c) => ({
        client_id: body.client_id,
        name: c.name,
        email: "",
        website_url: c.website_url,
        phone: null,
        city: c.city || null,
        source: "outbound",
        status: "discovered",
        business_type: c.business_type || null,
        research_snapshot: { via, why_fit: c.why_fit || null, focus: body.focus || null, geography },
      }));

      inserted = await insertNewProspects(supabase, body.client_id, rows);

      await supabase.from("client_usage").insert({
        client_id: body.client_id,
        event_type: "prospect_research",
        units: inserted.length,
        source_fn: "discover-prospects-web",
        metadata: { kind: via === "apollo" ? "apollo_discovery" : "web_search_discovery", focus: body.focus || null, geography, found: companies.length, inserted: inserted.length },
      });

      await logActivity(supabase, body.client_id, {
        type: "prospect_discovery",
        title: `Discovered ${inserted.length} prospects via ${via === "apollo" ? "Apollo" : "web research"}`,
        description: `${icp.industries.join(", ")} — ${geography}`,
        icon: "search",
        metadata: { source: via, geography, discovered: inserted.length },
      });

      await refreshProspectProject(supabase, body.client_id);

      // Same as the Maps path: enrich context + score fit before review.
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      fetch(`${supabaseUrl}/functions/v1/backfill-prospect-context`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: "{}",
      }).catch((e) => console.error("backfill-prospect-context trigger failed:", e));
    }

    console.log(`discover-prospects-web: client=${body.client_id} via=${via} found=${companies.length} inserted=${inserted.length}`);

    return json({
      discovered: inserted.length,
      skipped_duplicates: companies.length - fresh.length,
      skipped_no_website: 0,
      email_enrichment: !!Deno.env.get("HUNTER_API_KEY"),
      prospects: inserted,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("discover-prospects-web error:", msg);
    return json({ error: msg }, 500);
  }
});
