import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

import { checkClientOrAdminAuth } from "../_shared/auth.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";
import { logActivity } from "../_shared/activityLog.ts";
import { refreshProspectProject } from "../_shared/prospectProject.ts";
import { ensureClientICP, suggestDiscoveryQueries } from "../_shared/icp.ts";
import { recentDiscoveryRun } from "../_shared/discoveryCooldown.ts";
import { insertNewProspects } from "../_shared/prospectInsert.ts";

// Client-portal callers can self-serve discovery ("Find leads now"), but
// with no per-click cost control that's an open tap on billed Maps/OpenAI
// calls. Admins get no cooldown -- they're trusted to run manual searches
// back-to-back while refining a query.
const CLIENT_COOLDOWN_MS = 60 * 60 * 1000;

interface DiscoverRequest {
  client_id: string;
  // Omit both to let the ICP drive discovery: queries are generated from the
  // client's ideal customer profile and searched automatically.
  query?: string;      // e.g. "HVAC companies"
  location?: string;   // e.g. "Toronto, ON"
  max_results?: number; // default 20, max 60
  password?: string;
}

interface PlacesResult {
  name: string;
  place_id: string;
  formatted_address: string;
  website?: string;
  formatted_phone_number?: string;
  rating?: number;
  types?: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body: DiscoverRequest = await req.json();
    const { client_id, query, location, max_results = 20, password } = body;

    const auth = await checkClientOrAdminAuth(req, supabase, client_id, password);
    if (!auth.authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!client_id) {
      return new Response(
        JSON.stringify({ error: "client_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if ((query && !location) || (!query && location)) {
      return new Response(
        JSON.stringify({ error: "query and location must be given together, or both omitted to auto-derive from the ICP" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (auth.role === "client" && await recentDiscoveryRun(supabase, client_id, CLIENT_COOLDOWN_MS)) {
      return new Response(
        JSON.stringify({ error: "Discovery already ran recently for this account -- try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const mapsKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!mapsKey) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_MAPS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verify client exists
    const { data: client, error: clientErr } = await supabase
      .from("client_accounts")
      .select("id, business_name, industry, icp, context_profile, tier")
      .eq("id", client_id)
      .single();

    if (clientErr || !client) {
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Tier gate: prospecting is a plan feature. Volume comes from tier
    // policy, capped by whatever the caller asked for.
    const policy = tierPolicy((client as { tier?: string }).tier).prospect;
    if (!policy.enabled) {
      return new Response(
        JSON.stringify({ error: "This client's plan tier does not include prospect discovery." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const batchCap = Math.min(max_results, policy.discoveryBatch);

    // No query/location given -> the ICP drives discovery: derive a handful
    // of Maps searches from it and run all of them, splitting the batch cap
    // across them. This is the smart/automatic path used by the client
    // portal and the discovery cron; admins can still type a manual query.
    let searchPairs: { query: string; location: string }[];
    if (query && location) {
      searchPairs = [{ query, location }];
    } else {
      const icp = await ensureClientICP(supabase, client);
      if (!icp) {
        return new Response(
          JSON.stringify({ error: "Could not derive an ideal customer profile yet -- fill in the company context first" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const suggestions = await suggestDiscoveryQueries(client_id, icp);
      if (suggestions.length === 0) {
        return new Response(
          JSON.stringify({ error: "Could not generate discovery queries from the ICP" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      searchPairs = suggestions;
    }

    // Step 1: Text Search via Places API, one call per query/location pair,
    // splitting the batch cap evenly across them.
    const perQueryCap = Math.max(1, Math.ceil(batchCap / searchPairs.length));
    const searchResults = await Promise.all(
      searchPairs.map(async ({ query: q, location: loc }) => {
        const searchUrl = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
        searchUrl.searchParams.set("query", `${q} in ${loc}`);
        searchUrl.searchParams.set("key", mapsKey);

        const searchResp = await fetch(searchUrl.toString());
        const searchData = await searchResp.json();

        if (searchData.status !== "OK" && searchData.status !== "ZERO_RESULTS") {
          console.error(`Google Maps error for "${q} in ${loc}": ${searchData.status} — ${searchData.error_message ?? ""}`);
          return { ok: false, results: [] as PlacesResult[] };
        }
        return { ok: true, results: (searchData.results?.slice(0, perQueryCap) ?? []) as PlacesResult[] };
      }),
    );

    // Every query erroring out (quota exhausted, bad key, Maps outage) looks
    // identical to "the ICP genuinely matched nothing" unless called out
    // explicitly -- surface it as a failure instead of a quiet zero.
    if (searchResults.every((r) => !r.ok)) {
      return new Response(
        JSON.stringify({ error: "Google Maps search failed for every query -- check function logs for the underlying status." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rawResults: PlacesResult[] = searchResults.flatMap((r) => r.results).slice(0, batchCap);

    // Step 2: Fetch place details (website + phone) for each result
    const enriched: PlacesResult[] = await Promise.all(
      rawResults.map(async (place) => {
        try {
          const detailUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
          detailUrl.searchParams.set("place_id", place.place_id);
          detailUrl.searchParams.set("fields", "name,formatted_phone_number,website,formatted_address,rating,types");
          detailUrl.searchParams.set("key", mapsKey);

          const detailResp = await fetch(detailUrl.toString());
          const detailData = await detailResp.json();
          const r = detailData.result ?? {};

          return {
            ...place,
            website: r.website,
            formatted_phone_number: r.formatted_phone_number,
            formatted_address: r.formatted_address ?? place.formatted_address,
            rating: r.rating ?? place.rating,
            types: r.types ?? place.types,
          };
        } catch {
          return place;
        }
      }),
    );

    // Step 3: Deduplicate against existing prospects for this client
    const websites = enriched
      .map((p) => p.website)
      .filter(Boolean) as string[];

    const { data: existing } = await supabase
      .from("prospects")
      .select("website_url")
      .eq("client_id", client_id)
      .in("website_url", websites);

    const existingUrls = new Set((existing ?? []).map((p) => p.website_url));

    const noWebsite = enriched.filter((p) => !p.website).length;
    const newProspects = enriched.filter(
      (p) => p.website && !existingUrls.has(p.website),
    );
    const skippedDuplicates = enriched.length - noWebsite - newProspects.length;
    const emailEnrichment = !!Deno.env.get("HUNTER_API_KEY");

    if (newProspects.length === 0) {
      return new Response(
        JSON.stringify({
          discovered: 0,
          skipped_duplicates: skippedDuplicates,
          skipped_no_website: noWebsite,
          email_enrichment: emailEnrichment,
          message: "No new businesses found (duplicates or missing websites)",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 4: Insert with status 'discovered' (awaiting admin review)
    const rows = newProspects.map((p) => ({
      client_id,
      name: p.name,
      email: "",  // unknown until research phase — placeholder
      website_url: p.website ?? "",
      phone: p.formatted_phone_number ?? null,
      city: extractCity(p.formatted_address),
      source: "outbound",
      status: "discovered",
      business_type: extractBusinessType(p.types ?? []),
    }));

    const inserted = await insertNewProspects(supabase, client_id, rows);

    // Track Maps API usage
    const queriesRun = searchPairs.map((p) => `${p.query} in ${p.location}`);
    await supabase.from("client_usage").insert({
      client_id,
      event_type: "maps_api_call",
      units: rawResults.length,
      source_fn: "discover-prospects",
      metadata: { queries: queriesRun, auto: !query, found: rawResults.length, inserted: inserted?.length ?? 0 },
    });

    await logActivity(supabase, client_id, {
      type: "prospect_discovery",
      title: `Discovered ${inserted?.length ?? 0} prospects${query ? ` near ${location}` : " via ICP-driven search"}`,
      description: queriesRun.join("; "),
      icon: "search",
      metadata: { source: "maps", queries: queriesRun, auto: !query, discovered: inserted?.length ?? 0 },
    });

    await refreshProspectProject(supabase, client_id);

    // Fire context enrichment immediately so prospects have context_profile before
    // the admin reviews them — enables better personalized drip emails later.
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    fetch(`${supabaseUrl}/functions/v1/backfill-prospect-context`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: "{}",
    }).catch((e) => console.error("backfill-prospect-context trigger failed:", e));

    console.log(`discover-prospects: client=${client_id} found=${rawResults.length} inserted=${inserted?.length ?? 0} duplicates=${skippedDuplicates} no_website=${noWebsite}`);

    return new Response(
      JSON.stringify({
        discovered: inserted?.length ?? 0,
        skipped_duplicates: skippedDuplicates,
        skipped_no_website: noWebsite,
        email_enrichment: emailEnrichment,
        prospects: inserted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("discover-prospects error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function extractCity(address: string): string | null {
  // "123 Main St, Toronto, ON M5V 1A1, Canada" → "Toronto"
  // "Toronto, ON M5V 1A1, Canada" → "Toronto"; "Toronto, Canada" → "Toronto"
  const parts = address.split(",").map((s) => s.trim());
  if (parts.length >= 3) return parts[parts.length - 3] || null;
  if (parts.length === 2) return parts[0] || null;
  return null;
}

function extractBusinessType(types: string[]): string | null {
  const skip = new Set(["point_of_interest", "establishment", "premise", "political", "locality"]);
  const readable = types.find((t) => !skip.has(t));
  if (!readable) return null;
  return readable.replace(/_/g, " ");
}
