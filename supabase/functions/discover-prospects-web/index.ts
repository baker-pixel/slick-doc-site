import { clientIdsWithMailbox, NO_MAILBOX_MESSAGE } from "../_shared/outreach/outreachMailbox.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkClientOrAdminAuth } from "../_shared/core/auth.ts";
import { ensureClientICP, ensureSearchKeywords, expandSearchKeywords } from "../_shared/outreach/icp.ts";
import { mergeAuditKeywords, validateKeywords } from "../_shared/outreach/keywordQuality.ts";
import { checkApolloContacts, selectReachable } from "../_shared/outreach/apolloContacts.ts";
import { ensurePersonaTitles } from "../_shared/outreach/personaTitles.ts";
import { buildSearchPlans, rotatePlans, widenGeography } from "../_shared/outreach/discoveryRotation.ts";
import { apolloSearchCompanies, parseEmployeeRange, type FoundCompany } from "../_shared/outreach/apolloSearch.ts";
import { filterProspectCandidates } from "../_shared/outreach/prospectFilter.ts";
import { resolveDiscoveryCampaign } from "../_shared/outreach/campaignScope.ts";
import { tierPolicy } from "../_shared/billing/tierPolicy.ts";
import { logActivity } from "../_shared/core/activityLog.ts";
import { refreshProspectProject } from "../_shared/outreach/prospectProject.ts";
import { recentDiscoveryRun } from "../_shared/outreach/discoveryCooldown.ts";
import { insertNewProspects } from "../_shared/outreach/prospectInsert.ts";
import { runInBackground } from "../_shared/core/background.ts";
import { SEEN_MEMORY_DAYS } from "../_shared/outreach/prospectGate.ts";
import {
  applyOutcome,
  buildExcludeList,
  isResting,
  loadSearchState,
  saveSearchState,
  searchKey,
  toBareDomain,
  type SearchStateRow,
} from "../_shared/outreach/apolloSearchState.ts";

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
  /** Tag discovered leads with this (discovery) campaign. */
  campaign_id?: string;
  /** Admin only: probe the client's existing search keywords against Apollo and prune the weak ones, instead of discovering. */
  validate_keywords?: boolean;
  password?: string;
}


const OPENAI_API = "https://api.openai.com/v1";

async function webSearchCompanies(
  openaiKey: string,
  prompt: string,
): Promise<FoundCompany[]> {
  // Model fallback: newest small search-capable model first.
  const models = ["gpt-4.1-mini", "gpt-4o-mini"];
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

/** Companies already judged a poor fit for this client (kept as bare domains after their prospect row is deleted). */
async function recentlyJudgedDomains(supabase: any, clientId: string): Promise<Set<string>> {
  const since = new Date(Date.now() - SEEN_MEMORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase.from("prospect_seen_domains").select("domain").eq("client_id", clientId).gte("seen_at", since);
  return new Set((data ?? []).map((r: { domain: string }) => r.domain));
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

    const campaign = await resolveDiscoveryCampaign(supabase, body.client_id, body.campaign_id);
    if (!campaign.ok) return json({ error: campaign.error }, 400);

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
      .select("id, business_name, industry, icp, context_profile, tier, status")
      .eq("id", body.client_id)
      .single();

    if (clientErr || !client) return json({ error: "Client not found" }, 404);

    if ((client as { status?: string }).status !== "active") {
      return json({ error: "This client's automation is paused." }, 403);
    }
    if (!(await clientIdsWithMailbox(supabase, [body.client_id])).has(body.client_id)) {
      return json({ error: NO_MAILBOX_MESSAGE, code: "no_mailbox" }, 403);
    }

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
    let droppedNonProspects = 0;
    // Social networks, media, job boards, accelerators etc. are never useful
    // outbound targets; drop them before they cost a scoring call (or an email).
    const keepCandidates = (found: FoundCompany[]): FoundCompany[] => {
      const { kept, dropped } = filterProspectCandidates(found);
      droppedNonProspects += dropped.length;
      // Not truncated here: cutting a page to maxResults *before* the known-company
      // check threw away fresh companies ranked below known ones. The batch cap is
      // applied to the fresh list at the end.
      return kept;
    };
    // What this run did, saved with the usage row so a zero-yield run can be explained.
    const strategy: {
      plans_tried: string[];
      expanded_keywords: string[];
      widened_geography: string | null;
      apollo_calls: number;
      rested: string[];
      excluded_domains: number;
      /** Apollo pages spent probing new keywords (separate from apollo_calls). */
      probe_calls: number;
      probes: { tag: string; found: number; fit: number; rate: number | null }[];
      /** Free Apollo people lookups made before inserting, and what they found. */
      contact_checks: number;
      persona_titles: string[];
      contact_rejected: number;
      contact_rate_limited: boolean;
    } = {
      plans_tried: [], expanded_keywords: [], widened_geography: null, apollo_calls: 0, rested: [], excluded_domains: 0,
      probe_calls: 0, probes: [], persona_titles: [], contact_checks: 0, contact_rejected: 0, contact_rate_limited: false,
    };
    let searchedGeography = geography;
    if (apolloKey) {
      try {
        // Newest first, so if the exclusion list is capped the most recent memory is kept.
        const { data: known } = await supabase.from("prospects").select("website_url")
          .eq("client_id", body.client_id).order("created_at", { ascending: false });
        const knownUrls: string[] = (known ?? []).map((p: { website_url: string }) => p.website_url || "");
        const judged = await recentlyJudgedDomains(supabase, body.client_id);
        const knownNorm = new Set(knownUrls.map(normalizeUrl));
        for (const d of judged) knownNorm.add(d);
        // Told to Apollo so pages hold companies this client doesn't already have.
        const excludeDomains = buildExcludeList([...knownUrls, ...judged]);
        strategy.excluded_domains = excludeDomains.length;

        // New keyword tags are probed with one Apollo page each and judged against the
        // ICP before they are kept (see keywordQuality.ts); weak ones never get searched.
        const probeInto = async (tags: string[], minKeep: number): Promise<string[]> => {
          const out = await validateKeywords({ tags, client, icp, apolloKey, geography, excludeDomains, minKeep });
          strategy.probe_calls += out.calls;
          strategy.probes.push(...out.results.map((r) => ({ tag: r.tag, found: r.found, fit: r.fit, rate: r.rate })));
          return out.kept;
        };

        // The ICP's industries are broad labels; derive specific buyer keywords
        // so a niche client doesn't get every "technology" company on earth.
        const keywords = await ensureSearchKeywords(supabase, client, icp, (tags) => probeInto(tags, 2));
        const baseTags = keywords.length > 0 ? keywords : icp.industries;

        // Admin audit: prune a client's existing weak keywords. Manually typed keywords
        // are the client's choice and are left alone; tags beyond the probe budget are kept.
        if (body.validate_keywords && auth.role !== "client") {
          if ((icp as { search_keywords_source?: string }).search_keywords_source === "manual") {
            return json({ audit: "skipped", reason: "keywords were set manually" });
          }
          const before = icp.search_keywords ?? baseTags;
          const out = await validateKeywords({ tags: before, client, icp, apolloKey, geography, excludeDomains, minKeep: 2 });
          const finalKeywords = mergeAuditKeywords(before, out.kept, out.results.map((r) => r.tag));
          const changed = out.results.length > 0 && finalKeywords.length > 0;
          if (changed) {
            await supabase.from("client_accounts").update({ icp: { ...icp, search_keywords: finalKeywords } }).eq("id", client.id);
          }
          return json({ audit: { before, after: changed ? finalKeywords : before, saved: changed, apollo_calls: out.calls, results: out.results } });
        }

        // Manual runs with a focus are one-off explorations: they neither skip nor
        // update the daily searches' memory.
        const trackState = !body.focus?.trim();
        const states = trackState ? await loadSearchState(supabase, body.client_id) : new Map<string, SearchStateRow>();
        const employeeRange = parseEmployeeRange(icp.company_size);
        const outcomes: SearchStateRow[] = [];

        // The same keyword set every day returns the same top-ranked companies, so
        // after a few cycles all of them are known. Instead: lead with a different
        // keyword each run (rotation), walk deeper pages, and if a whole pass finds
        // nothing, expand the keywords and then widen the geography. The number of
        // Apollo calls is capped so a dry client can't run up the bill.
        const MAX_APOLLO_CALLS = 12;
        const MAX_PAGES = 5;
        const { count: priorRuns } = await supabase.from("client_usage").select("id", { count: "exact", head: true })
          .eq("client_id", body.client_id).eq("source_fn", "discover-prospects-web");

        const pool: FoundCompany[] = [];
        const counted = new Set<string>();
        let freshCount = 0;
        const runPlan = async (tags: string[], geo: string) => {
          const label = tags.join(" + ");
          const key = await searchKey(tags, geo, employeeRange);
          if (trackState && isResting(states.get(key))) {
            strategy.rested.push(label); // found nothing new twice in a row; resting, spend no credits
            return;
          }
          strategy.plans_tried.push(label);

          let pagesFetched = 0;
          let found = 0;
          let fresh = 0;
          // Only a search that actually looked at results can be judged dry: an error
          // or a spent call budget before the first page says nothing about the search.
          const record = () => {
            if (!trackState || pagesFetched === 0) return;
            outcomes.push(applyOutcome(states.get(key), { client_id: body.client_id, search_key: key, label: label.slice(0, 300) }, { found, fresh }));
          };

          for (let page = 1; page <= MAX_PAGES && freshCount < maxResults && strategy.apollo_calls < MAX_APOLLO_CALLS; page++) {
            strategy.apollo_calls++;
            let batch: FoundCompany[];
            try {
              batch = keepCandidates(await apolloSearchCompanies(apolloKey, tags, icp, geo, maxResults, body.focus, page, excludeDomains));
            } catch (e) {
              if (pool.length === 0) throw e;
              record();
              return; // keep what earlier pages found
            }
            pagesFetched++;
            if (batch.length === 0) break;
            for (const c of batch) c.found_by = { key, label: label.slice(0, 300) };
            pool.push(...batch);
            found += batch.length;
            for (const c of batch) {
              const n = normalizeUrl(c.website_url);
              if (n && !knownNorm.has(n) && !counted.has(n)) { counted.add(n); freshCount++; fresh++; }
            }
          }
          record();
        };
        const runAll = async (plans: string[][], geo: string) => {
          for (const tags of plans) {
            if (freshCount >= maxResults || strategy.apollo_calls >= MAX_APOLLO_CALLS) return;
            await runPlan(tags, geo);
          }
        };

        const plans = rotatePlans(buildSearchPlans(baseTags), priorRuns ?? 0);
        await runAll(plans, geography);

        if (freshCount === 0) {
          // 1. Every known keyword is searched dry: ask for adjacent buyer segments.
          const added = await expandSearchKeywords(supabase, client, icp, baseTags, (tags) => probeInto(tags, 0));
          strategy.expanded_keywords = added;
          if (added.length > 0) await runAll(buildSearchPlans(added), geography);
        }
        if (freshCount === 0) {
          // 2. Still nothing: one step broader geography (city -> state/country).
          const wider = widenGeography(geography);
          if (wider) {
            strategy.widened_geography = wider;
            searchedGeography = wider;
            await runAll(rotatePlans(buildSearchPlans(baseTags), priorRuns ?? 0), wider);
          }
        }
        // Merge repeat visits to the same search within one run (e.g. a widened pass
        // re-uses a key) so each key is written once; later outcome wins.
        const latest = new Map<string, SearchStateRow>();
        for (const o of outcomes) latest.set(o.search_key, o);
        await saveSearchState(supabase, [...latest.values()]);
        companies = pool;
        via = "apollo";
      } catch (e) {
        console.error("Apollo search failed, falling back to web search:", e instanceof Error ? e.message : e);
      }
    }
    if (companies.length === 0 && openaiKey) {
      companies = keepCandidates(await webSearchCompanies(openaiKey, prompt));
      via = "web_search";
    }

    // Zero-yield runs must still be recorded, or the cooldown (which reads
    // client_usage) never sees them and the daily cron re-runs this client's
    // paid Apollo / web-search discovery forever.
    const recordEmptyRun = () => supabase.from("client_usage").insert({
      client_id: body.client_id,
      event_type: "prospect_research",
      units: 0,
      source_fn: "discover-prospects-web",
      metadata: { kind: via === "apollo" ? "apollo_discovery" : "web_search_discovery", focus: body.focus || null, geography: searchedGeography, found: companies.length, dropped_non_prospects: droppedNonProspects, inserted: 0, strategy },
    });

    if (companies.length === 0) {
      await recordEmptyRun();
      return json({ discovered: 0, skipped_duplicates: 0, skipped_no_website: 0, email_enrichment: !!Deno.env.get("APOLLO_API_KEY"), message: "No matching companies found" });
    }

    // Dedupe against existing prospects for this client (normalized URL)
    const { data: existing } = await supabase
      .from("prospects")
      .select("website_url")
      .eq("client_id", body.client_id);

    const existingNorm = new Set((existing ?? []).map((p: { website_url: string }) => normalizeUrl(p.website_url || "")));
    for (const d of await recentlyJudgedDomains(supabase, body.client_id)) existingNorm.add(d);

    const seen = new Set<string>();
    const candidates = companies.filter((c) => {
      const norm = normalizeUrl(c.website_url);
      if (!norm || existingNorm.has(norm) || seen.has(norm)) return false;
      seen.add(norm);
      return true;
    });

    // Apollo companies only become leads if Apollo has someone reachable there. The
    // lookup is free and fails open (see apolloContacts.ts); unreachable ones are
    // remembered so they are not re-found, instead of being scanned and scored first.
    let fresh = candidates.slice(0, maxResults);
    if (via === "apollo" && apolloKey && candidates.length > 0) {
      // The buyer persona from the ICP decides who counts as a contact (never throws; [] = seniority ladder).
      const personaTitles = await ensurePersonaTitles(supabase, client, icp);
      strategy.persona_titles = personaTitles;
      const sel = await selectReachable(candidates, maxResults, (c) => checkApolloContacts(apolloKey, toBareDomain(c.website_url), fetch, personaTitles));
      fresh = sel.chosen;
      strategy.contact_checks = sel.checks;
      strategy.contact_rejected = sel.rejected.length;
      strategy.contact_rate_limited = sel.rateLimited;
      if (sel.rejected.length > 0) {
        const now = new Date().toISOString();
        const { error: rememberErr } = await supabase.from("prospect_seen_domains").upsert(
          sel.rejected.map(({ item, status }) => ({
            client_id: body.client_id,
            domain: normalizeUrl(item.website_url),
            name: item.name,
            fit_score: null,
            reason: status === "no_people" ? "Apollo has no contacts at this company" : "Apollo has contacts but no email on file",
            outcome: "no_contact",
            seen_at: now,
          })),
          { onConflict: "client_id,domain" },
        );
        if (rememberErr) console.warn("could not remember unreachable companies:", rememberErr.message);
      }
    }

    let inserted: { id: string; name: string; website_url: string; city: string | null }[] = [];
    if (fresh.length === 0) await recordEmptyRun();
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
        research_snapshot: { via, why_fit: c.why_fit || null, focus: body.focus || null, geography, ...(c.found_by ? { found_by: c.found_by } : {}) },
        ...(campaign.campaignId ? { campaign_id: campaign.campaignId } : {}),
      }));

      inserted = await insertNewProspects(supabase, body.client_id, rows);

      await supabase.from("client_usage").insert({
        client_id: body.client_id,
        event_type: "prospect_research",
        units: inserted.length,
        source_fn: "discover-prospects-web",
        metadata: { kind: via === "apollo" ? "apollo_discovery" : "web_search_discovery", focus: body.focus || null, geography: searchedGeography, found: companies.length, dropped_non_prospects: droppedNonProspects, inserted: inserted.length, strategy },
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
      runInBackground(fetch(`${supabaseUrl}/functions/v1/backfill-prospect-context`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: "{}",
      }));
    }

    console.log(`discover-prospects-web: client=${body.client_id} via=${via} found=${companies.length} dropped_non_prospects=${droppedNonProspects} inserted=${inserted.length}`);

    return json({
      discovered: inserted.length,
      skipped_duplicates: companies.length - fresh.length,
      skipped_no_website: 0,
      email_enrichment: !!Deno.env.get("APOLLO_API_KEY"),
      prospects: inserted,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("discover-prospects-web error:", msg);
    return json({ error: msg }, 500);
  }
});
