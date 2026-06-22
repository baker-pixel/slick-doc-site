import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface DiscoverRequest {
  client_id: string;
  query: string;      // e.g. "HVAC companies"
  location: string;   // e.g. "Toronto, ON"
  max_results?: number; // default 20, max 60
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
    const { client_id, query, location, max_results = 20 } = body;

    if (!client_id || !query || !location) {
      return new Response(
        JSON.stringify({ error: "client_id, query, and location are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
      .select("id, business_name, icp")
      .eq("id", client_id)
      .single();

    if (clientErr || !client) {
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 1: Text Search via Places API
    const searchUrl = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    searchUrl.searchParams.set("query", `${query} in ${location}`);
    searchUrl.searchParams.set("key", mapsKey);

    const searchResp = await fetch(searchUrl.toString());
    const searchData = await searchResp.json();

    if (searchData.status !== "OK" && searchData.status !== "ZERO_RESULTS") {
      throw new Error(`Google Maps error: ${searchData.status} — ${searchData.error_message ?? ""}`);
    }

    const rawResults: PlacesResult[] = searchData.results?.slice(0, max_results) ?? [];

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

    const newProspects = enriched.filter(
      (p) => p.website && !existingUrls.has(p.website),
    );

    if (newProspects.length === 0) {
      return new Response(
        JSON.stringify({
          discovered: 0,
          skipped_duplicates: enriched.length,
          message: "All discovered businesses already exist for this client",
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

    const { data: inserted, error: insertErr } = await supabase
      .from("prospects")
      .insert(rows)
      .select("id, name, website_url, city");

    if (insertErr) throw insertErr;

    // Track Maps API usage
    await supabase.from("client_usage").insert({
      client_id,
      event_type: "maps_api_call",
      units: rawResults.length,
      source_fn: "discover-prospects",
      metadata: { query, location, found: rawResults.length, inserted: inserted?.length ?? 0 },
    });

    console.log(`discover-prospects: client=${client_id} found=${rawResults.length} inserted=${inserted?.length ?? 0} skipped=${enriched.length - newProspects.length}`);

    return new Response(
      JSON.stringify({
        discovered: inserted?.length ?? 0,
        skipped_duplicates: enriched.length - newProspects.length,
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
  const parts = address.split(",").map((s) => s.trim());
  return parts.length >= 2 ? parts[parts.length - 3] ?? parts[1] ?? null : null;
}

function extractBusinessType(types: string[]): string | null {
  const skip = new Set(["point_of_interest", "establishment", "premise", "political", "locality"]);
  const readable = types.find((t) => !skip.has(t));
  if (!readable) return null;
  return readable.replace(/_/g, " ");
}
