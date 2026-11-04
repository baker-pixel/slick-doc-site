import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { checkInternalSecret, isServiceRequest } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ensureClientICP, scoreProspectFit, type ClientICP } from "../_shared/icp.ts";
import { getConversionWins } from "../_shared/outcomes.ts";
import { gateVerdict, isDroppable, minFitFor, normalizeUrl } from "../_shared/prospectGate.ts";
import { AUTO_APPROVED_BY, selectForAutoApproval, type AutoApproveCandidate } from "../_shared/autoApprove.ts";
import { clientIdsWithMailbox } from "../_shared/outreachMailbox.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";

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

  const supabase = createClient(supabaseUrl, serviceKey);

  // Callers: other edge functions (service key) and the sweep cron
  // (x-internal-secret "pipeline_cron"). Never a bare anon key.
  if (!isServiceRequest(req) && !(await checkInternalSecret(req, supabase as any, "pipeline_cron"))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let processed = 0;
  let fromForm = 0;
  let fromWebsite = 0;
  let skipped = 0;
  let errors = 0;
  // Sites we could not fetch (dead domain, bot-blocked, test data). Expected
  // and handled by the retry/give-up stub below; not worth an alert.
  let unreachable = 0;

  // The gateway cuts a request off at ~150s, and this pass has three stages
  // (website scans, Apollo email lookup, fit scoring). Scans used to run one at
  // a time with no limit, so a batch of 30+ new prospects used up the whole
  // run and the email lookup and scoring never started for them. Scan a few at
  // once, and budget every stage so all three run on every pass.
  const runStart = Date.now();
  const SCAN_BUDGET_MS = 60_000;
  const SCAN_CONCURRENCY = 4;
  const SCORE_DEADLINE_MS = 95_000;
  const EMAIL_DEADLINE_MS = 135_000;

  // Fit gate. Only prospects at/above the client's threshold are worth an email
  // lookup or a place in the client's review queue; the rest are deleted and
  // remembered only as a bare domain (prospect_seen_domains) so discovery
  // doesn't re-find them. Never applies to anything a person has touched.
  const minFitCache = new Map<string, number>();
  const getMinFit = async (clientId: string): Promise<number> => {
    if (!minFitCache.has(clientId)) {
      const { data } = await supabase.from("client_accounts").select("outreach_settings").eq("id", clientId).maybeSingle();
      minFitCache.set(clientId, minFitFor(data?.outreach_settings));
    }
    return minFitCache.get(clientId)!;
  };
  let dropped = 0;

  try {
    // Fetch prospects with null context_profile
    // Also picks up prospects whose website scan failed but is still
    // retryable (see the failure stub below).
    const { data: prospects, error: fetchErr } = await supabase
      .from("prospects")
      .select("*")
      .or("context_profile.is.null,context_profile->>retry.eq.true")
      .order("created_at", { ascending: false })
      .limit(50);

    if (fetchErr) throw fetchErr;

    // Note: no early return when empty — the Hunter email enrichment pass
    // below must still run for prospects that have context but no email.
    const scanProspect = async (prospect: any) => {
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
            return;
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
          return;
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

          if (!res.ok) {
            // analyze-website answers 400 when the site itself can't be
            // fetched. Anything else (5xx, 429, 401) means the scanner is
            // the problem and should still alert.
            throw new Error(`analyze-website returned ${res.status}`, { cause: res.status === 400 ? "unreachable" : undefined });
          }
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
          return;
        }

        // Path C: nothing to work with
        console.log("Skipping prospect", prospect.id, "— no submission_id or website_url");
        skipped++;
      } catch (err) {
        if (err instanceof Error && err.cause === "unreachable") {
          console.warn("Site unreachable for prospect", prospect.id, err.message);
          unreachable++;
        } else {
          console.error("Backfill error for prospect", prospect.id, err);
          errors++;
        }
        // A site that can't be scanned (bot-blocked corporate site, dead
        // domain, timeout) used to stay context_profile=null and get
        // re-scanned -- and re-alerted -- every run forever, hogging the
        // 50-row window and never reaching fit scoring. Retry a few times,
        // then leave an explicit "unavailable" marker so the prospect moves
        // on (scoring still works from name/type/city) instead of vanishing.
        if (!prospect.submission_id) {
          const prev = (prospect.context_profile ?? {}) as { attempts?: number };
          const attempts = (prev.attempts ?? 0) + 1;
          await supabase.from("prospects").update({
            context_profile: {
              source: "website_scan_failed",
              partial: true,
              attempts,
              retry: attempts < 3,
              last_error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
            },
          }).eq("id", prospect.id);
        }
      }
    };

    {
      const queue = [...(prospects ?? [])];
      await Promise.all(Array.from({ length: SCAN_CONCURRENCY }, async () => {
        while (queue.length > 0 && Date.now() - runStart < SCAN_BUDGET_MS) {
          await scanProspect(queue.shift());
        }
      }));
      if (queue.length > 0) console.log(`Website scans: ${queue.length} prospects left for the next pass`);
    }

    // ── ICP fit scoring ────────────────────────────────────────
    // Score enriched prospects against their client's ICP so the review
    // queue can rank by fit instead of showing an undifferentiated list.
    // Runs after context enrichment so the scorer has real signals.
    let scored = 0;
    {
      const { data: unscored } = await supabase
        .from("prospects")
        .select("id, name, business_type, city, website_url, context_profile, client_id, status, approved_at, source, campaign_id, submission_id, research_snapshot")
        .not("context_profile", "is", null)
        .not("client_id", "is", null)
        .is("icp_fit_score", null)
        .in("status", ["discovered", "pending"])
        .limit(20);

      if (unscored && unscored.length > 0) {
        const icpCache = new Map<string, ClientICP | null>();
        const winsCache = new Map<string, Awaited<ReturnType<typeof getConversionWins>>>();
        for (const p of unscored) {
          if (Date.now() - runStart > SCORE_DEADLINE_MS) break;
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

            const attempts = Number((p.research_snapshot as { fit_attempts?: number } | null)?.fit_attempts ?? 0);
            const verdict = gateVerdict(fit ? fit.score : null, attempts, await getMinFit(p.client_id));
            if (verdict === "retry") {
              // Scoring couldn't tell (thin or unreadable site): not a bad fit, so look again next pass.
              await supabase.from("prospects").update({
                research_snapshot: { ...(p.research_snapshot ?? {}), fit_attempts: attempts + 1 },
              }).eq("id", p.id);
            } else if ((verdict === "drop" || verdict === "drop_unscorable") && isDroppable(p)) {
              // Below the bar: keep a bare domain so it isn't re-found, delete everything else.
              await supabase.from("prospect_seen_domains").upsert({
                client_id: p.client_id,
                domain: normalizeUrl(p.website_url || p.name),
                name: p.name,
                fit_score: fit ? fit.score : null,
                reason: (fit?.reason ?? "not enough information").slice(0, 300),
                outcome: verdict === "drop" ? "below_threshold" : "unscorable",
                seen_at: new Date().toISOString(),
              }, { onConflict: "client_id,domain" });
              await supabase.from("prospects").delete().eq("id", p.id);
              dropped++;
            }
          } catch (e) {
            console.warn("Fit scoring error for prospect", p.id, e);
          }
        }
        console.log(`ICP fit scoring: ${scored}/${unscored.length} prospects scored`);
      }
    }

    // ── Email enrichment via Apollo ─────────────────────────────
    // Outbound prospects (Maps or Apollo/web discovery) have no email.
    // Replaces the old Hunter domain-search pattern-guess (a confidence
    // score on how plausible the *guess* looked, never a deliverability
    // check) with Apollo: people-search finds a real decision-maker at the
    // prospect's domain, then people-match returns their actual work email
    // with an email_status Apollo itself verifies -- only "verified" gets
    // written, so a prospect Apollo can't confirm just stays without an
    // email rather than getting a guess that bounces.
    let emailsEnriched = 0;
    const apolloKey = Deno.env.get("APOLLO_API_KEY");
    if (!apolloKey) {
      const { count: waitingForEmail } = await supabase
        .from("prospects")
        .select("id", { count: "exact", head: true })
        .or("email.is.null,email.eq.")
        .not("website_url", "is", null)
        .neq("website_url", "")
        .in("status", ["discovered", "pending"]);

      if ((waitingForEmail ?? 0) > 0) {
        const { data: existingAlert } = await supabase
          .from("automation_alerts")
          .select("id")
          .eq("alert_type", "apollo_api_key_missing")
          .is("acknowledged_at", null)
          .limit(1)
          .maybeSingle();

        if (!existingAlert) {
          await supabase.from("automation_alerts").insert({
            alert_type: "apollo_api_key_missing",
            severity: "warning",
            title: "Prospects stuck without email — APOLLO_API_KEY not configured",
            message: `${waitingForEmail} discovered prospect(s) have no email and can't be enriched or approved because APOLLO_API_KEY is not set in Supabase edge function secrets.`,
            source: "backfill-prospect-context",
            metadata: { waitingForEmail },
          });
        }
      }
    }
    if (apolloKey) {
      // Skip prospects Apollo already gave a definitive "nothing usable" answer
      // for in the last 14 days. Without this, the same dead-end domains were
      // re-queried every run and, once there were 25+ of them, crowded out
      // every prospect that could actually be enriched.
      const LOOKUP_RETRY_MS = 14 * 24 * 60 * 60 * 1000;
      const { data: noEmailAll } = await supabase
        .from("prospects")
        .select("id, website_url, client_id, research_snapshot, icp_fit_score, source, campaign_id")
        .or("email.is.null,email.eq.")
        .not("website_url", "is", null)
        .neq("website_url", "")
        .in("status", ["discovered", "pending"])
        .order("created_at", { ascending: false })
        .limit(150);
      // Gate: a machine-discovered prospect only earns an email lookup once it
      // has a fit score at or above its client's threshold.
      const passing: typeof noEmailAll = [];
      for (const p of noEmailAll ?? []) {
        if (p.source === "outbound" && !p.campaign_id) {
          if (p.icp_fit_score === null || !p.client_id) continue;
          if (p.icp_fit_score < (await getMinFit(p.client_id))) continue;
        }
        passing.push(p);
      }
      const noEmail = passing
        .filter((p: { research_snapshot: { email_lookup?: { at?: string } } | null }) => {
          const at = p.research_snapshot?.email_lookup?.at;
          return !at || Date.now() - new Date(at).getTime() > LOOKUP_RETRY_MS;
        })
        .slice(0, 25);
      const markLookup = (p: { id: string; research_snapshot: Record<string, unknown> | null }, result: string) =>
        supabase.from("prospects").update({
          research_snapshot: { ...(p.research_snapshot ?? {}), email_lookup: { at: new Date().toISOString(), result } },
        }).eq("id", p.id);

      for (const p of noEmail) {
        if (Date.now() - runStart > EMAIL_DEADLINE_MS) break;
        try {
          const domain = new URL(
            p.website_url.startsWith("http") ? p.website_url : `https://${p.website_url}`,
          ).hostname.replace(/^www\./, "");

          // 1. Find a decision-maker at this domain (0 credits -- search
          // itself never returns contact info, see docs.apollo.io/reference/people-api-search).
          const searchRes = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
            method: "POST",
            headers: { "x-api-key": apolloKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              q_organization_domains_list: [domain],
              person_seniorities: ["owner", "founder", "c_suite", "partner", "vp", "head", "director"],
              per_page: 1,
              page: 1,
            }),
          });

          if (!searchRes.ok) {
            if (searchRes.status === 429) {
              console.warn("Apollo rate limit hit — stopping enrichment for this run");
              break;
            }
            console.warn(`Apollo people search failed for ${domain}: ${searchRes.status}`);
            continue;
          }

          const searchData = await searchRes.json();
          const person = (searchData?.people ?? [])[0];
          if (!person?.id) {
            // No decision-maker on file for this domain at all -- a guess
            // would just be inventing an address, so leave it for manual entry.
            await markLookup(p, "no_decision_maker");
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }

          // 2. Reveal that person's real work email + Apollo's own
          // verification status (their default match response, no
          // reveal_personal_emails needed -- that flag is for *personal*
          // inboxes, a work email is already included).
          const matchRes = await fetch("https://api.apollo.io/api/v1/people/match", {
            method: "POST",
            headers: { "x-api-key": apolloKey, "Content-Type": "application/json" },
            body: JSON.stringify({ id: person.id }),
          });

          if (!matchRes.ok) {
            console.warn(`Apollo people match failed for ${domain}: ${matchRes.status}`);
            continue;
          }

          const matchData = await matchRes.json();
          const matched = matchData?.person;

          if (matched?.email && matched.email_status === "verified") {
            await supabase
              .from("prospects")
              .update({ email: matched.email })
              .eq("id", p.id);
            emailsEnriched++;

            if (p.client_id) {
              await supabase.from("client_usage").insert({
                client_id: p.client_id,
                event_type: "prospect_research",
                units: 1,
                source_fn: "backfill-prospect-context",
                metadata: { kind: "apollo_email_lookup", domain, email_status: matched.email_status },
              });
            }
          } else {
            await markLookup(p, matched?.email ? "unverified" : "no_email");
          }

          await new Promise((r) => setTimeout(r, 600));
        } catch (e) {
          console.warn("Apollo enrichment error for prospect", p.id, e);
        }
      }
      console.log(`Apollo enrichment: ${emailsEnriched} emails found`);
    }

    // ── Auto-approval ───────────────────────────────────────────
    // Promote leads that are scored, enriched and emailed straight into the
    // outreach funnel (status "pending", which run-prospect-drip moves to
    // nurture and drafts at its next hourly run). Replaces the manual review
    // queue; the rules and their reasons live in _shared/autoApprove.ts. Runs
    // last so a lead scored or emailed earlier in this same pass is approved
    // in the same pass. A failure here must not fail enrichment.
    let autoApproved = 0;
    try {
      const { data: ready } = await supabase
        .from("prospects")
        .select("id, client_id, status, approved_at, source, campaign_id, submission_id, email, icp_fit_score, context_profile, created_at")
        .eq("status", "discovered")
        .eq("source", "outbound")
        .is("approved_at", null)
        .is("campaign_id", null)
        .is("submission_id", null)
        .not("client_id", "is", null)
        .not("email", "is", null)
        .not("icp_fit_score", "is", null)
        .order("icp_fit_score", { ascending: false })
        .limit(500);

      const byClient = new Map<string, AutoApproveCandidate[]>();
      for (const p of (ready ?? []) as AutoApproveCandidate[]) {
        byClient.set(p.client_id!, [...(byClient.get(p.client_id!) ?? []), p]);
      }

      if (byClient.size > 0) {
        const clientIds = [...byClient.keys()];
        const { data: clientRows } = await supabase
          .from("client_accounts")
          .select("id, business_name, status, tier, paused_for_billing, outreach_settings")
          .in("id", clientIds);
        const mailboxClients = await clientIdsWithMailbox(supabase, clientIds);
        const dayStart = new Date();
        dayStart.setUTCHours(0, 0, 0, 0);

        for (const c of clientRows ?? []) {
          const candidates = byClient.get(c.id) ?? [];
          const policy = tierPolicy(c.tier).prospect;
          // Same pace discovery runs at, so a backlog drains as fast as it
          // was created and the daily send cap is never what overflows.
          const { count: approvedToday } = await supabase
            .from("prospects")
            .select("id", { count: "exact", head: true })
            .eq("client_id", c.id)
            .eq("approved_by", AUTO_APPROVED_BY)
            .gte("approved_at", dayStart.toISOString());
          const budget = policy.discoveryBatch - (approvedToday ?? 0);
          if (budget <= 0) continue;

          // Emails this client already has in the funnel (or a finished one).
          const { data: inFunnel } = await supabase
            .from("prospects")
            .select("email")
            .eq("client_id", c.id)
            .neq("status", "discovered")
            .in("email", candidates.map((p) => p.email!));
          const taken = new Set((inFunnel ?? []).map((r: { email: string }) => r.email.toLowerCase()));

          const chosen = selectForAutoApproval(
            candidates,
            {
              status: c.status,
              paused_for_billing: c.paused_for_billing,
              hasMailbox: mailboxClients.has(c.id),
              prospectingEnabled: policy.enabled,
              outreach_settings: c.outreach_settings,
              minFit: await getMinFit(c.id),
            },
            budget,
            taken,
          );
          if (chosen.length === 0) continue;

          // .eq("status","discovered") so a lead a person rejected in the
          // meantime is not resurrected.
          const { data: updated, error: approveErr } = await supabase
            .from("prospects")
            .update({ status: "pending", approved_at: new Date().toISOString(), approved_by: AUTO_APPROVED_BY })
            .in("id", chosen.map((p) => p.id))
            .eq("status", "discovered")
            .select("id");
          if (approveErr) {
            console.warn(`Auto-approve failed for ${c.business_name}:`, approveErr.message);
            continue;
          }
          autoApproved += updated?.length ?? 0;
          console.log(`Auto-approved ${updated?.length ?? 0} leads for ${c.business_name} (budget ${budget}, ${candidates.length} candidates)`);
        }
      }
    } catch (e) {
      console.warn("Auto-approval stage failed:", e);
    }

    // Alert if errors
    if (errors > 0) {
      await supabase.from("automation_alerts").insert({
        alert_type: "backfill_partial_failure",
        severity: "warning",
        title: "Prospect context backfill completed with errors",
        message: `${errors} prospects failed during backfill`,
        source: "backfill-prospect-context",
        metadata: { processed, fromForm, fromWebsite, skipped, errors, unreachable },
      });
    }

    // Check if more remain
    const { count } = await supabase
      .from("prospects")
      .select("id", { count: "exact", head: true })
      .is("context_profile", null);

    return new Response(
      JSON.stringify({ success: true, processed, fromForm, fromWebsite, skipped, errors, unreachable, emailsEnriched, scored, dropped, autoApproved, hasMore: (count ?? 0) > 0 }),
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
