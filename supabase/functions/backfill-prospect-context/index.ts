import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ensureClientICP, scoreProspectFit, type ClientICP } from "../_shared/icp.ts";
import { getConversionWins } from "../_shared/outcomes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Auth check
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (token !== serviceKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let processed = 0;
  let fromForm = 0;
  let fromWebsite = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Fetch prospects with null context_profile
    const { data: prospects, error: fetchErr } = await supabase
      .from("prospects")
      .select("*")
      .is("context_profile", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (fetchErr) throw fetchErr;

    // Note: no early return when empty — the Hunter email enrichment pass
    // below must still run for prospects that have context but no email.
    for (const prospect of prospects ?? []) {
      try {
        // Path A: has submission_id → extract from gap form
        if (prospect.submission_id) {
          const { data: sub, error: subErr } = await supabase
            .from("gap_analysis_submissions")
            .select("*")
            .eq("id", prospect.submission_id)
            .maybeSingle();

          if (subErr || !sub) {
            console.error("Backfill error for prospect", prospect.id, subErr || "submission not found");
            errors++;
            continue;
          }

          const rawGoals = sub.top_business_goals;
          const primaryGoals: string[] = Array.isArray(rawGoals)
            ? rawGoals
            : (typeof rawGoals === "string" && rawGoals ? [rawGoals] : []);

          const rawDiff = sub.unique_differentiator;
          const differentiators: string[] = typeof rawDiff === "string" && rawDiff.trim()
            ? [rawDiff.trim()]
            : [];

          const rawFrustration = sub.biggest_marketing_frustration;
          const painPoints: string[] = typeof rawFrustration === "string" && rawFrustration.trim()
            ? [rawFrustration.trim()]
            : [];

          const contextProfile = {
            services: [] as string[],
            primary_goals: primaryGoals,
            differentiators,
            pain_points: painPoints,
            target_audience: typeof sub.primary_customer_sources === "string" ? sub.primary_customer_sources : "",
            success_criteria: typeof sub.what_makes_it_worth_it === "string" ? sub.what_makes_it_worth_it : "",
            urgency: typeof sub.fastest_impact === "string" ? sub.fastest_impact : "",
            fears: typeof sub.biggest_agency_fear === "string" ? sub.biggest_agency_fear : "",
            business_summary: `${sub.business_name || "A local business"} focused on ${primaryGoals.join(", ") || "growing their customer base"}.`,
            partial: false,
            source: "gap_form" as const,
          };

          await supabase.from("prospects").update({ context_profile: contextProfile }).eq("id", prospect.id);

          // Also save to submission if missing
          if (!sub.context_profile) {
            await supabase.from("gap_analysis_submissions").update({ context_profile: contextProfile }).eq("id", sub.id);
          }

          processed++;
          fromForm++;
          continue;
        }

        // Path B: no submission but has website_url → call analyze-website
        if (prospect.website_url && prospect.website_url.trim()) {
          const res = await fetch(`${supabaseUrl}/functions/v1/analyze-website`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ url: prospect.website_url }),
          });

          if (!res.ok) throw new Error(`analyze-website returned ${res.status}`);
          const result = await res.json();
          const websiteCtx = result.analysis?.context_profile;
          if (!websiteCtx) throw new Error("No context_profile in analyze-website response");

          const contextProfile = {
            ...websiteCtx,
            source: "website_scan",
            partial: false,
          };

          await supabase.from("prospects").update({ context_profile: contextProfile }).eq("id", prospect.id);

          processed++;
          fromWebsite++;

          // Rate limit between website calls
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }

        // Path C: nothing to work with
        console.log("Skipping prospect", prospect.id, "— no submission_id or website_url");
        skipped++;
      } catch (err) {
        console.error("Backfill error for prospect", prospect.id, err);
        errors++;
      }
    }

    // ── Email enrichment via Hunter.io ─────────────────────────
    // Outbound prospects from Google Maps have no email. When a
    // HUNTER_API_KEY is configured, look one up from their domain so
    // the drip can run without manual email entry.
    let emailsEnriched = 0;
    const hunterKey = Deno.env.get("HUNTER_API_KEY");
    if (hunterKey) {
      const { data: noEmail } = await supabase
        .from("prospects")
        .select("id, website_url, client_id")
        .or("email.is.null,email.eq.")
        .not("website_url", "is", null)
        .neq("website_url", "")
        .in("status", ["discovered", "pending"])
        .limit(25);

      for (const p of noEmail ?? []) {
        try {
          const domain = new URL(
            p.website_url.startsWith("http") ? p.website_url : `https://${p.website_url}`,
          ).hostname.replace(/^www\./, "");

          const res = await fetch(
            `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=5&api_key=${hunterKey}`,
          );
          if (!res.ok) {
            if (res.status === 429) {
              console.warn("Hunter rate limit hit — stopping enrichment for this run");
              break;
            }
            console.warn(`Hunter lookup failed for ${domain}: ${res.status}`);
            continue;
          }

          const data = await res.json();
          const emails: { value: string; confidence: number }[] = data?.data?.emails ?? [];
          const best = emails.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];

          if (best?.value && (best.confidence ?? 0) >= 50) {
            await supabase
              .from("prospects")
              .update({ email: best.value })
              .eq("id", p.id);
            emailsEnriched++;

            if (p.client_id) {
              await supabase.from("client_usage").insert({
                client_id: p.client_id,
                event_type: "prospect_research",
                units: 1,
                source_fn: "backfill-prospect-context",
                metadata: { kind: "hunter_email_lookup", domain, confidence: best.confidence },
              });
            }
          }

          await new Promise((r) => setTimeout(r, 600));
        } catch (e) {
          console.warn("Hunter enrichment error for prospect", p.id, e);
        }
      }
      console.log(`Hunter enrichment: ${emailsEnriched} emails found`);
    }

    // ── ICP fit scoring ────────────────────────────────────────
    // Score enriched prospects against their client's ICP so the review
    // queue can rank by fit instead of showing an undifferentiated list.
    // Runs after context enrichment so the scorer has real signals.
    let scored = 0;
    {
      const { data: unscored } = await supabase
        .from("prospects")
        .select("id, name, business_type, city, website_url, context_profile, client_id")
        .not("context_profile", "is", null)
        .not("client_id", "is", null)
        .is("icp_fit_score", null)
        .in("status", ["discovered", "pending"])
        .limit(20);

      if (unscored && unscored.length > 0) {
        const icpCache = new Map<string, ClientICP | null>();
        const winsCache = new Map<string, Awaited<ReturnType<typeof getConversionWins>>>();
        for (const p of unscored) {
          try {
            if (!icpCache.has(p.client_id)) {
              const { data: client } = await supabase
                .from("client_accounts")
                .select("id, business_name, industry, icp, context_profile")
                .eq("id", p.client_id)
                .single();
              icpCache.set(p.client_id, client ? await ensureClientICP(supabase, client) : null);
              // Feedback loop: this client's real conversions calibrate scoring.
              winsCache.set(p.client_id, await getConversionWins(supabase, p.client_id));
            }
            const icp = icpCache.get(p.client_id);
            if (!icp) continue;

            const fit = await scoreProspectFit(p, icp, p.client_id, winsCache.get(p.client_id) ?? []);
            if (fit) {
              await supabase
                .from("prospects")
                .update({ icp_fit_score: fit.score, icp_fit_reason: fit.reason })
                .eq("id", p.id);
              scored++;
            }
          } catch (e) {
            console.warn("Fit scoring error for prospect", p.id, e);
          }
        }
        console.log(`ICP fit scoring: ${scored}/${unscored.length} prospects scored`);
      }
    }

    // Alert if errors
    if (errors > 0) {
      await supabase.from("automation_alerts").insert({
        alert_type: "backfill_partial_failure",
        severity: "warning",
        title: "Prospect context backfill completed with errors",
        message: `${errors} prospects failed during backfill`,
        source: "backfill-prospect-context",
        metadata: { processed, fromForm, fromWebsite, skipped, errors },
      });
    }

    // Check if more remain
    const { count } = await supabase
      .from("prospects")
      .select("id", { count: "exact", head: true })
      .is("context_profile", null);

    return new Response(
      JSON.stringify({ success: true, processed, fromForm, fromWebsite, skipped, errors, emailsEnriched, scored, hasMore: (count ?? 0) > 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Backfill fatal error:", err);
    return new Response(
      JSON.stringify({ error: "Backfill failed", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
