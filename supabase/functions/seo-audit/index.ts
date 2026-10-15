import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAdminAuth, isServiceRequest } from "../_shared/auth.ts";
import { callAI } from "../_shared/ai.ts";
import { discoverPages, gatherPageSignals, type PageSignals } from "../_shared/seoSignals.ts";
import { gatherSiteHealth, runSiteChecks } from "../_shared/crawlHealth.ts";
import { LIMITS, buildCopyPrompt, buildCopySystem, checkDraft, cleanDraft, fitToLength, stockOpener, tooSimilar, type CopyKind } from "../_shared/seoCopy.ts";
import { CHECKS, RUBRIC_VERSION, computeScores, type CheckDef, type SeoCategory, type Severity } from "../_shared/seoRubric.ts";
import { runChecks, mk, type Finding } from "../_shared/seoChecks.ts";
import { upsertSeoProject } from "../_shared/seoProject.ts";
import { buildOrganizationJsonLd, buildFaqJsonLd } from "../_shared/schemaMarkup.ts";
import { buildLlmsTxt } from "../_shared/llmsTxt.ts";
import { auditWebsite } from "../_shared/websiteAudit.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";
import { logActivity } from "../_shared/activityLog.ts";
import { recordOutcome } from "../_shared/outcomes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Absolute safety ceiling so a run always converges in cost/time. The
// per-client crawl depth comes from tier policy and is capped by this.
const MAX_PAGES = 15;
// Every wp-fixable title/meta finding needs a drafted value or the admin UI
// can't offer Apply. 2 findings/page x MAX_PAGES = 30 covers a full crawl;
// drafts run in parallel so the cap costs tokens, not wall-clock.
const MAX_REWRITE_CALLS = 30;

// Deterministic hash → stable finding identity across audits (enables diff).
async function findingId(checkId: string, page: string): Promise<string> {
  const data = new TextEncoder().encode(`${checkId}::${page}`);
  const buf = await crypto.subtle.digest("SHA-1", data);
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json().catch(() => ({}));
    // Read-only analysis endpoint. Accepts service-role (server-to-server) or
    // an admin session/password. It holds NO write-to-site capability.
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const isServer = isServiceRequest(req);
    if (!isServer) {
      const auth = await checkAdminAuth(req, supabase, body.password);
      if (!auth.authorized) return json({ error: "Unauthorized" }, 401);
    }

    const clientId: string = body.clientId ?? body.client_id;
    if (!clientId) return json({ error: "clientId is required" }, 400);

    const { data: client, error: cErr } = await supabase
      .from("client_accounts").select("id, business_name, website_url, context_profile, tone, icp, tier").eq("id", clientId).single();
    if (cErr || !client) return json({ error: "Client not found" }, 404);
    if (!client.website_url) return json({ error: "Client has no website_url configured" }, 422);

    // Crawl depth is governed by the client's plan tier.
    const policy = tierPolicy(client.tier);
    const crawlCap = Math.min(policy.seo.crawlPages, MAX_PAGES);

    // Inconclusive, NOT a low score. Used whenever the crawl itself is too
    // degraded for the resulting numbers to mean anything.
    const saveInconclusive = async (reason: string) => {
      const { data: row } = await supabase.from("seo_audits").insert({
        client_account_id: clientId, audit_type: "full", status: "inconclusive",
        rubric_version: RUBRIC_VERSION, score: null,
        results: { status: "inconclusive", reason, pages_analyzed: [], findings: [], action_plan: [], subscores: {} },
      }).select("id").single();
      return json({ status: "inconclusive", audit_id: row?.id, message: reason });
    };

    // ── Discover (robots-aware, bounded) ──
    const { pages, robots_blocked } = await discoverPages(client.website_url, crawlCap);
    if (pages.length === 0) {
      return await saveInconclusive(robots_blocked
        ? "robots.txt disallows crawling the site, so no pages could be audited. If this is unintended, Google can't crawl it either."
        : "Site could not be crawled (unreachable, blocked, or robots-disallowed).");
    }

    // ── Gather signals (parallel; PageSpeed sampled, not per-page) ──
    // On-page parse is cheap and runs on every page; PageSpeed is slow, so it
    // runs only on the homepage as a site-wide performance sample. Pages are
    // fetched concurrently to stay well under the request timeout.
    const targets = pages.slice(0, crawlCap);
    // Sample PageSpeed on a few pages (concurrently) so one slow/failed call
    // doesn't leave performance unmeasured for the whole audit.
    const PAGESPEED_PAGES = 3;
    const settled = await Promise.allSettled(
      targets.map((url, i) => gatherPageSignals(url, i < PAGESPEED_PAGES)),
    );
    const signals: PageSignals[] = settled
      .filter((r): r is PromiseFulfilledResult<PageSignals> => r.status === "fulfilled")
      .map((r) => r.value);

    // ── Crawl-quality gate: sitemap discovery can list pages that no longer
    // respond, and transient fetch failures can gut the signal set. Scoring a
    // mostly-failed crawl produces garbage (false 100s or score crashes), so
    // treat it as inconclusive rather than a real result.
    const reachableSignals = signals.filter((s) => s.reachable);
    if (reachableSignals.length === 0) {
      return await saveInconclusive(`${pages.length} pages were discovered but none could be fetched (site down, blocking requests, or stale sitemap).`);
    }
    if (reachableSignals.length < targets.length / 2) {
      return await saveInconclusive(`Only ${reachableSignals.length} of ${targets.length} pages could be fetched — partial crawl, results would be unreliable.`);
    }

    // ── Deterministic findings + stable identity + diff scaffolding ──
    const performanceMeasured = signals.some((s) => s.performance !== null);
    const raw = signals.flatMap(runChecks);
    // Site-level "performance not measured" (once), only if no page got data.
    if (!performanceMeasured && signals.length > 0) {
      raw.push(mk(CHECKS.perf_not_measured, signals[0].url,
        "Page speed wasn't measured this run.",
        "PageSpeed data unavailable (no API key, API disabled, or request error).",
        { performance: null }));
    }
    // Site-wide crawl health (HTTPS, www split, sitemap, broken links, duplicate
    // titles). Best-effort and time-boxed: a failure here must not fail the audit.
    try {
      const origin = new URL(client.website_url).origin;
      raw.push(...runSiteChecks(await gatherSiteHealth(origin, signals), signals));
    } catch (e) {
      console.error("site crawl-health failed:", e instanceof Error ? e.message : e);
    }
    const siteOrigin = (() => { try { return new URL(client.website_url).origin; } catch { return ""; } })();
    const findings: Finding[] = [];
    for (const f of raw) {
      // Site-wide findings keep one identity per site, however many pages they list.
      findings.push({ ...f, id: await findingId(f.check_id, f.scope === "site" ? siteOrigin : f.pages[0]), status: "open" });
    }

    // ── Schema JSON-LD fix payload (deterministic, no LLM) ──
    // Organization/LocalBusiness markup is fully derivable from facts already
    // on file -- a template fill, not something worth spending a model call
    // on, and it can't hallucinate a NAP fact we don't actually have.
    const ctx = (client.context_profile ?? {}) as Record<string, unknown>;
    const schemaJsonLd = JSON.stringify(buildOrganizationJsonLd({
      name: client.business_name,
      url: client.website_url,
      phone: typeof ctx.phone === "string" ? ctx.phone : null,
      address: typeof ctx.address === "string" ? ctx.address : null,
    }));
    for (const f of findings) {
      if (f.fix?.type === "wp_schema_jsonld") {
        f.fix.payload = { value: schemaJsonLd, post_url: f.pages[0] };
      }
    }

    // ── FAQ schema fix payload (deterministic, extracted from on-page Q&A
    // this same crawl already found -- never invented) ──
    for (const f of findings) {
      if (f.fix?.type !== "wp_faq_jsonld") continue;
      const sig = signals.find((s) => s.url === f.pages[0]);
      if (sig && sig.qa_pairs.length > 0) {
        f.fix.payload = { value: JSON.stringify(buildFaqJsonLd(sig.qa_pairs)), post_url: f.pages[0] };
      }
    }

    // ── llms.txt fix (site-level, once per audit, not per page) ──
    // Same deterministic-facts-only rule as the schema fix: built from the
    // client's own name/url/summary plus the real page titles this crawl
    // found, nothing invented.
    try {
      const origin = new URL(client.website_url).origin;
      const llmsRes = await fetch(`${origin}/llms.txt`, { signal: AbortSignal.timeout(6000) }).catch(() => null);
      const llmsBody = llmsRes?.ok ? await llmsRes.text() : "";
      if (!llmsRes?.ok || llmsBody.trim().length < 50) {
        const llmsTxt = buildLlmsTxt({
          name: client.business_name,
          url: client.website_url,
          description: typeof ctx.business_summary === "string" ? ctx.business_summary : null,
          pages: signals.filter((s) => s.reachable && s.title).map((s) => ({ title: s.title, url: s.url })),
        });
        const homepage = signals.find((s) => s.reachable)?.url ?? client.website_url;
        findings.push({
          ...mk(CHECKS.missing_llms_txt, homepage,
            "No llms.txt file -- a growing convention AI crawlers check for a clean, structured summary of the site.",
            "No /llms.txt found (or it was near-empty).",
            { llms_txt_present: false },
            { type: "wp_llms_txt", payload: { value: llmsTxt, post_url: homepage }, expected_baseline: null }),
          id: await findingId(CHECKS.missing_llms_txt.id, homepage), status: "open",
        });
      }
    } catch (e) {
      console.error("llms.txt check failed:", e instanceof Error ? e.message : e);
    }

    // ── AEO/AI-readiness score (site-level, recomputed every run) ──
    // Previously only ever written once, at onboarding, by the marketing
    // site's gap-analysis scan (keyed by submission_id/prospect_id) -- so a
    // client's AEO score never moved again even as they fixed schema/llms.txt
    // issues through this same audit. Recompute it here too, keyed by
    // client_id, reusing the exact fetch+parse+score helper the onboarding
    // scan uses so the two numbers stay comparable.
    try {
      const homepageUrl = signals.find((s) => s.reachable)?.url ?? client.website_url;
      const audit = await auditWebsite(homepageUrl);
      if (audit) {
        const { error: readinessErr } = await supabase.from("ai_readiness_scores").upsert(
          { client_id: clientId, ...audit.readiness },
          { onConflict: "client_id" },
        );
        if (readinessErr) console.error("ai_readiness_scores upsert failed:", readinessErr.message);
      }
    } catch (e) {
      console.error("AEO readiness check failed:", e instanceof Error ? e.message : e);
    }

    // ── LLM rewrites for applyable title/meta findings (bounded, untrusted) ──
    // The model only drafts fix copy for findings that ALREADY exist from the
    // rules -- it can't invent findings. Page content is passed as untrusted
    // data, never as instructions.
    const rewritable = findings
      .filter((f) => f.fix && (f.fix.type === "wp_meta_title" || f.fix.type === "wp_meta_description"))
      .sort((a, b) => b.impact - a.impact)
      .slice(0, MAX_REWRITE_CALLS);
    if (rewritable.length > 0 && Deno.env.get("GROQ_API_KEY")) {
      const icpSummary = ((client.icp as Record<string, unknown> | null)?.summary as string) || "";
      const kindOf = (f: Finding): CopyKind => (f.fix!.type === "wp_meta_title" ? "title" : "meta");

      // One model call. Plain text, not callAIJson -- confirmed live that wrapping
      // a single string value in {"value":"..."} JSON mode made every meta_desc
      // rewrite fail Groq's own JSON validator with an empty completion; there is
      // no structure here worth JSON mode's failure surface.
      const draftOnce = async (f: Finding, extra: { avoid?: string[]; feedback?: string } = {}): Promise<string> => {
        const s = signals.find((x) => x.url === f.pages[0]);
        if (!s) return "";
        const kind = kindOf(f);
        const raw = await callAI({
          source: "seo-audit",
          clientId,
          maxTokens: 200,
          promptId: "seo-rewrite.v2",
          // Best-effort copy draft: a failure is non-fatal (the finding just ships
          // without pre-drafted copy), and the Groq gpt-oss empty-completion flake
          // is expected, so it shouldn't page anyone.
          silent: true,
          system: buildCopySystem(kind, { business: client.business_name, tone: client.tone || "professional" }),
          prompt: buildCopyPrompt(kind, {
            business: client.business_name, tone: client.tone || "professional", idealCustomer: icpSummary,
            url: s.url, currentTitle: s.title, currentMeta: s.meta_description,
            h1: s.h1_text ?? "", content: s.content_sample || s.text_sample, ...extra,
          }),
        });
        return cleanDraft(raw);
      };

      // Pass 1: every page in parallel. A draft that breaks the length/quality rules
      // gets one retry that says exactly what was wrong.
      const drafts = new Map<string, string>();
      await Promise.all(rewritable.map(async (f) => {
        try {
          const kind = kindOf(f);
          let v = await draftOnce(f);
          let verdict = checkDraft(kind, v);
          if (!verdict.ok) { v = await draftOnce(f, { feedback: verdict.reason }); verdict = checkDraft(kind, v); }
          // Still over the limit after a retry: cut cleanly rather than ship something Google truncates.
          if (!verdict.ok && v.length > LIMITS[kind].max) { v = fitToLength(kind, v); verdict = checkDraft(kind, v); }
          // Valid but formulaic ("Discover...", "Explore..."): one retry, keep whichever is valid and fresher.
          if (verdict.ok) {
            const soft = stockOpener(v);
            if (soft) {
              const v2 = await draftOnce(f, { feedback: soft });
              if (checkDraft(kind, v2).ok && !stockOpener(v2)) v = v2;
            }
          }
          if (verdict.ok) drafts.set(f.id, v);
          else console.error(`[seo-audit] rejected rewrite for ${f.id} (${f.fix!.type}): ${verdict.reason}: "${v.slice(0, 120)}"`);
        } catch (e) { console.error("rewrite failed", f.id, e); }
      }));

      // Pass 2: pages whose draft is a near-copy of another draft, or of a description
      // another page already has, are redone once with those lines as "do not resemble".
      for (const kind of ["meta", "title"] as CopyKind[]) {
        const group = rewritable.filter((f) => kindOf(f) === kind && drafts.has(f.id));
        const current = (url: string) => signals.filter((x) => x.url !== url).map((x) => (kind === "meta" ? x.meta_description : x.title)).filter(Boolean);
        const clashes = tooSimilar(group.map((f) => drafts.get(f.id)!), (i) => current(group[i].pages[0]));
        await Promise.all(group.map(async (f, i) => {
          if (!clashes[i].length) return;
          try {
            const v = await draftOnce(f, { avoid: clashes[i] });
            // Keep the redo only if it is valid and now clearly different; otherwise ship no
            // suggestion rather than a known near-duplicate (the admin can write one).
            if (checkDraft(kind, v).ok && !tooSimilar([v], clashes[i])[0].length) drafts.set(f.id, v);
            else drafts.delete(f.id);
          } catch (e) { console.error("dedupe rewrite failed", f.id, e); drafts.delete(f.id); }
        }));
      }

      for (const f of rewritable) {
        const v = drafts.get(f.id);
        if (v) f.fix!.payload = { value: v, post_url: f.pages[0] };
      }
    }

    // ── Score against the rubric (per-page average; renormalized) ──
    const { overall_score, subscores } = computeScores(
      findings.map((f) => ({ category: f.category, severity: f.severity, check_id: f.check_id, page: f.pages[0], site: f.scope === "site" })),
      {
        pages: signals.filter((s) => s.reachable).map((s) => s.url),
        performancePages: signals.filter((s) => s.performance !== null).map((s) => s.url),
      },
    );

    // ── Diff vs previous audit → regressions + resolved count ──
    const { data: prev } = await supabase
      .from("seo_audits").select("id, score, results")
      .eq("client_account_id", clientId).eq("status", "complete")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    // Score-crash guard: a wholesale collapse vs the previous audit is almost
    // always crawl noise (failed fetches, unrendered SPA shells parsing as
    // empty pages), not the site genuinely breaking overnight. Only trust a
    // big drop when the crawl itself was clean.
    const emptySpaCount = signals.filter((s) => s.looks_like_empty_spa).length;
    const crawlDegraded = reachableSignals.length < targets.length || emptySpaCount > reachableSignals.length / 2;
    if (typeof prev?.score === "number" && prev.score - overall_score >= 40 && crawlDegraded) {
      return await saveInconclusive(`Score would have dropped ${prev.score}→${overall_score} but the crawl looks degraded (${reachableSignals.length}/${targets.length} pages fetched, ${emptySpaCount} unrendered) — not saving an unreliable result.`);
    }

    let resolvedCount = 0;
    if (prev?.results) {
      const prevFindings: Finding[] = (prev.results as { findings?: Finding[] }).findings ?? [];
      const prevById = new Map(prevFindings.map((f) => [f.id, f]));
      const nowIds = new Set(findings.map((f) => f.id));
      // A previously applied/verified issue that's back = regression.
      for (const f of findings) {
        const was = prevById.get(f.id);
        if (was && (was.status === "applied" || was.status === "verified")) f.status = "regressed";
      }
      // Previously-open findings now gone = resolved.
      for (const pf of prevFindings) {
        if (!nowIds.has(pf.id) && pf.status !== "dismissed") resolvedCount++;
      }
    }

    // action plan: impact/effort ranking (high impact, low effort first)
    const action_plan = [...findings]
      .sort((a, b) => (b.impact / b.effort) - (a.impact / a.effort))
      .map((f) => f.id);

    const results = {
      status: "complete",
      overall_score, subscores,
      pages_analyzed: signals.map((s) => ({ url: s.url, fetched_via: s.fetched_via, reachable: s.reachable })),
      findings, action_plan,
      diff: { previous_audit_id: prev?.id ?? null, regressed: findings.filter((f) => f.status === "regressed").length, resolved: resolvedCount },
    };

    const { data: row, error: insErr } = await supabase.from("seo_audits").insert({
      client_account_id: clientId, audit_type: "full", status: "complete",
      rubric_version: RUBRIC_VERSION, previous_audit_id: prev?.id ?? null,
      score: overall_score, results,
    }).select("id").single();
    if (insErr) throw insErr;

    // Turn the audit into the client's SEO Project plan (best-effort: a
    // project failure must not fail the audit that already saved).
    let projectId: string | null = null;
    try {
      projectId = await upsertSeoProject(supabase, clientId, { id: row.id, score: overall_score, results });
    } catch (e) {
      console.error("upsertSeoProject failed:", e instanceof Error ? e.message : e);
    }

    // Log the audit as work done, so reporting can narrate it truthfully.
    await logActivity(supabase, clientId, {
      type: "seo_audit",
      title: `SEO audit completed — score ${overall_score}/100`,
      description: `${signals.length} pages analyzed, ${findings.length} findings.` +
        (resolvedCount > 0 ? ` ${resolvedCount} resolved since last audit.` : "") +
        (results.diff.regressed > 0 ? ` ${results.diff.regressed} regressed.` : ""),
      icon: "search",
      metadata: { audit_id: row.id, score: overall_score, findings: findings.length, resolved: resolvedCount, regressed: results.diff.regressed, project_id: projectId },
    });

    // Outcome signal: the SEO score over time (feeds trend + reporting).
    await recordOutcome(supabase, clientId, { source: "seo", metric: "seo_score", value: overall_score, metadata: { audit_id: row.id } });

    console.log(`seo-audit ${client.business_name}: score=${overall_score} pages=${signals.length} findings=${findings.length} regressed=${results.diff.regressed} resolved=${resolvedCount} project=${projectId}`);
    return json({ status: "complete", audit_id: row.id, project_id: projectId, overall_score, pages: signals.length, findings: findings.length, regressed: results.diff.regressed, resolved: resolvedCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("seo-audit error:", msg);
    try {
      await supabase.from("automation_alerts").insert({ alert_type: "function_error", severity: "error", title: "seo-audit failed", message: msg, source: "seo-audit" });
    } catch { /* best-effort */ }
    return json({ error: msg }, 500);
  }
});
