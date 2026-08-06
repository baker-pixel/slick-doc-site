import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getClientBrandKit, brandKitToPromptBlock } from "../_shared/brandKit.ts";
import { callAIJson, MODELS } from "../_shared/ai.ts";
import { checkClientOrAdminAuth } from "../_shared/auth.ts";
import { unlockReadySteps } from "../_shared/workflowUnlock.ts";
import { fetchHtml, parseOnPage } from "../_shared/seoSignals.ts";

// wp_fix_queue's field names -> the canonical seo-audit finding types that
// cover the same underlying WordPress field. Where the canonical engine
// already has an open, applyable finding for a page, this scan skips
// generating its own AI suggestion for that exact field -- otherwise a
// client sees two different suggested titles/descriptions for the same
// page from two independent AI calls, and could apply both.
const FIXTYPE_TO_LEGACY_FIELD: Record<string, string> = {
  wp_meta_title: "meta_title",
  wp_meta_description: "meta_desc",
  wp_image_alt: "alt_text",
};

const normalizeUrl = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();

/** Page URL -> set of legacy wp_fix_queue field names the canonical audit already covers. */
// deno-lint-ignore no-explicit-any
async function getCanonicallyCoveredFields(
  supabase: any,
  clientId: string,
): Promise<Map<string, Set<string>>> {
  const covered = new Map<string, Set<string>>();
  const { data: audit } = await supabase
    .from("seo_audits")
    .select("results")
    .eq("client_account_id", clientId)
    .not("rubric_version", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const findings = (audit?.results as { findings?: { fix?: { type?: string }; pages?: string[]; status?: string; wp_applyable?: boolean }[] } | null)?.findings ?? [];
  for (const f of findings) {
    if (f.status !== "open" || !f.wp_applyable) continue;
    const legacyField = f.fix?.type ? FIXTYPE_TO_LEGACY_FIELD[f.fix.type] : undefined;
    if (!legacyField) continue;
    for (const page of f.pages ?? []) {
      const key = normalizeUrl(page);
      if (!covered.has(key)) covered.set(key, new Set());
      covered.get(key)!.add(legacyField);
    }
  }
  return covered;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIMEOUT_MS    = 10_000;
const MAX_PAGES_AI  = 15;  // cap AI fix generation to top N pages with issues

interface WpPage {
  id: number;
  type: string;
  title: string;
  url: string;
  meta_title: string;
  meta_desc: string;
  focus_keyword: string;
  h1_count: number;
  word_count: number;
  issues: { field: string; severity: string; message: string }[];
  images: { id: number; url: string; alt_text: string; missing_alt: boolean }[];
}

interface ScanData {
  posts: WpPage[];
  pages: WpPage[];
  media: { id: number; url: string; filename: string; alt_text: string; missing_alt: boolean }[];
}

interface AiFixResult {
  meta_title?: string;
  meta_desc?: string;
  focus_keyword?: string;
  alt_text?: Record<string, string>;
}

// The plugin reads meta_title/meta_desc from raw Yoast/RankMath postmeta and
// h1/word count from the raw post_content DB field -- both miss real,
// visible content: an SEO plugin's title/description TEMPLATE renders a real
// value with no per-post override needed (confirmed live: Navtech's
// /insights/ has a real title and description in the browser, Yoast shows
// green, but the plugin reported both empty), and any page-builder-rendered
// content lives outside post_content entirely (word_count: 0 for a real,
// non-empty page is the tell). The rendered page is ground truth for what a
// visitor or Google actually sees -- re-verify against it, using the same
// crawl the canonical seo-audit engine already trusts, before generating a
// fix for something that was never actually missing. Only pages the plugin
// already flagged are re-checked, to avoid a full extra crawl per scan.
async function verifyRenderedMeta(page: WpPage): Promise<void> {
  const relevantFields = new Set(["meta_title", "meta_desc", "h1", "content"]);
  if (!(page.issues ?? []).some((i) => relevantFields.has(i.field))) return;

  try {
    const { html } = await fetchHtml(page.url);
    if (!html) return;
    const rendered = parseOnPage(html, page.url);

    if (rendered.title) page.meta_title = rendered.title;
    if (rendered.meta_description) page.meta_desc = rendered.meta_description;
    page.h1_count = rendered.h1_count;
    page.word_count = rendered.word_count;

    // Recompute these 4 checks fresh against the corrected values rather
    // than trying to selectively patch the plugin's own list -- its rules
    // are simple enough to mirror exactly (see od_detect_issues in the
    // plugin source).
    page.issues = (page.issues ?? []).filter((i) => !relevantFields.has(i.field));
    if (!page.meta_title) page.issues.push({ field: "meta_title", severity: "error", message: "Missing meta title" });
    else if (page.meta_title.length > 60) page.issues.push({ field: "meta_title", severity: "warning", message: "Meta title too long (over 60 chars)" });
    if (!page.meta_desc) page.issues.push({ field: "meta_desc", severity: "error", message: "Missing meta description" });
    else if (page.meta_desc.length > 155) page.issues.push({ field: "meta_desc", severity: "warning", message: "Meta description too long (over 155 chars)" });
    if (page.h1_count === 0) page.issues.push({ field: "h1", severity: "error", message: "Missing H1 tag" });
    else if (page.h1_count > 1) page.issues.push({ field: "h1", severity: "warning", message: "Multiple H1 tags found" });
    if (page.word_count < 300) page.issues.push({ field: "content", severity: "warning", message: "Thin content (under 300 words)" });
  } catch (e) {
    console.error(`verifyRenderedMeta failed for ${page.url}:`, e);
  }
}

async function fetchWithRetry(url: string, opts: RequestInit, retries = 1): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(TIMEOUT_MS) });
      return res;
    } catch (e) {
      if (i === retries) throw e;
    }
  }
  throw new Error("unreachable");
}

async function generateFixes(
  page: WpPage,
  brandBlock: string,
  industry: string,
  // Fields the canonical seo-audit already has an open, applyable finding
  // for on this page -- skip asking the AI for them at all, not just
  // discarding the result, since it's the same underlying suggestion twice.
  skipFields: Set<string>,
): Promise<AiFixResult | null> {
  const missingAltImages = skipFields.has("alt_text") ? [] : page.images.filter(i => i.missing_alt);
  const altTextSection = missingAltImages.length > 0
    ? `Images missing alt text (image IDs): ${missingAltImages.map(i => i.id).join(", ")}`
    : "";

  // meta_title/meta_desc/focus_keyword are graded as ONE coherent set by SEO
  // plugins like Yoast (keyword-in-title, keyword-in-description, length
  // bounds) -- generating them as three independent fields with no minimum
  // length and no requirement that they agree with each other produced
  // exactly what a real client hit: technically-valid-length copy that Yoast
  // still flagged red because the title/description didn't actually contain
  // the keyword they were supposedly built around.
  const wantsTitle = !skipFields.has("meta_title");
  const wantsDesc = !skipFields.has("meta_desc");
  const wantsKeyword = !skipFields.has("focus_keyword");
  const existingKeyword = page.focus_keyword?.trim();

  const wantedFields = [
    wantsTitle && `  "meta_title": "50-60 chars, keyword at or near the start",`,
    wantsDesc && `  "meta_desc": "120-155 chars, reads as a natural sentence and includes the keyword once, ends with a reason to click",`,
    wantsKeyword && !existingKeyword && `  "focus_keyword": "the 1-3 word phrase this page should rank for -- pick ONE real phrase a customer would search, not a generic industry term",`,
    !skipFields.has("alt_text") && `  "alt_text": { "<image_id>": "descriptive alt text" }`,
  ].filter(Boolean);
  if (wantedFields.length === 0) return null;

  const systemPrompt = `You are an SEO copywriter optimizing WordPress pages to score well in on-page SEO tools (Yoast, RankMath). Those tools grade meta_title, meta_desc, and the focus keyword as ONE set, not independently: they check the keyword appears in the title (ideally near the start), appears again in the description, and that both fall within length bounds. A title/description that ignores the keyword will score red even if the length is correct -- write for that grading, not just for humans.
Return ONLY a valid JSON object — no markdown, no explanation.

${brandBlock}`;

  const userPrompt = `Write SEO fixes for this page. ${existingKeyword ? `The focus keyword is already set to "${existingKeyword}" -- build the title and description around exactly this phrase, do not pick a different one.` : "No focus keyword is set yet -- choose one real phrase and use it consistently across every field you return."}

Page title: ${page.title || "(none)"}
Page URL: ${page.url}
Current meta title: ${page.meta_title || "(empty — missing)"}
Current meta description: ${page.meta_desc || "(empty — missing)"}
Current focus keyword: ${page.focus_keyword || "(empty — missing)"}
H1 count: ${page.h1_count}
Word count: ${page.word_count}
Industry: ${industry}
${altTextSection}

Issues detected:
${page.issues.map(i => `- [${i.severity}] ${i.message}`).join("\n")}

Return a JSON object with ONLY the fields that need fixing:
{
${wantedFields.join("\n")}
}
Omit any field that does not need a fix. The keyword used in meta_title and meta_desc must be identical to focus_keyword (the existing one if already set, or the one you chose).`;

  try {
    const result = await callAIJson<AiFixResult>({
      source: "scan-wordpress-site",
      model: MODELS.quality,
      fallbackModels: [MODELS.default],
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 512,
    });
    // Trimming the requested schema above is a prompt, not a contract --
    // strip skipped fields here too rather than trusting the model to have
    // actually left them out (confirmed live: it didn't, for meta_title
    // specifically, while meta_desc was fine on the same request shape).
    for (const field of skipFields) delete (result as Record<string, unknown>)[field];
    return result;
  } catch (e) {
    console.error("generateFixes error:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let siteId: string | null = null;

  try {
    const body = await req.json();
    siteId = body.site_id as string;
    if (!siteId) throw new Error("site_id required");

    // Fetch site record
    const { data: site, error: siteErr } = await supabase
      .from("connected_sites")
      .select("*")
      .eq("id", siteId)
      .single();
    if (siteErr || !site) throw new Error("Site not found");

    const { site_url, token, client_id: clientId, status: siteStatus } = site as {
      site_url: string; token: string; client_id: string | null; status: string;
    };

    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const isServer = bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!isServer) {
      const auth = await checkClientOrAdminAuth(req, supabase, clientId, body.password as string | undefined);
      if (!auth.authorized) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!token || siteStatus === "pending") {
      throw new Error("WordPress plugin not yet activated. Install and activate the OrangeDoor plugin on your WordPress site first.");
    }

    // 1. Ping to verify connection
    const pingRes = await fetchWithRetry(
      `${site_url}/wp-json/orangedoor/v1/ping`,
      { headers: { "X-OD-Token": token } },
    ).catch(() => null);

    if (!pingRes || !pingRes.ok) {
      await supabase
        .from("connected_sites")
        .update({ status: "unreachable", updated_at: new Date().toISOString() })
        .eq("id", siteId);
      throw new Error("Site unreachable — ping failed");
    }

    // 2. Fetch full scan
    const scanRes = await fetchWithRetry(
      `${site_url}/wp-json/orangedoor/v1/scan`,
      { headers: { "X-OD-Token": token } },
    );
    if (!scanRes.ok) throw new Error(`Scan endpoint returned ${scanRes.status}`);

    const scanData = (await scanRes.json()) as ScanData;

    // 2b. Re-verify meta_title/meta_desc/h1/content against the actually
    // rendered page before trusting the plugin's raw-DB-field read (see
    // verifyRenderedMeta). Only for pages it already flagged, run with
    // limited concurrency so a large site doesn't serialize dozens of fetches.
    const allPagesForVerify: WpPage[] = [...(scanData.posts ?? []), ...(scanData.pages ?? [])];
    const VERIFY_CONCURRENCY = 5;
    for (let i = 0; i < allPagesForVerify.length; i += VERIFY_CONCURRENCY) {
      await Promise.all(allPagesForVerify.slice(i, i + VERIFY_CONCURRENCY).map(verifyRenderedMeta));
    }

    // 3. Count issues
    const allPages: WpPage[] = allPagesForVerify;
    let errors = 0, warnings = 0, notices = 0;
    for (const p of allPages) {
      for (const iss of p.issues ?? []) {
        if (iss.severity === "error")   errors++;
        else if (iss.severity === "warning") warnings++;
        else notices++;
      }
    }
    // Count missing alt text as errors
    const missingAlt = (scanData.media ?? []).filter(m => m.missing_alt).length;
    errors += missingAlt;
    const totalIssues = errors + warnings + notices;

    // 4. Store scan_result
    const { data: scanRecord } = await supabase
      .from("scan_results")
      .insert({
        site_id:      siteId,
        raw_data:     scanData,
        total_issues: totalIssues,
        errors,
        warnings,
        notices,
      })
      .select("id")
      .single();

    // 5. Clear existing pending/failed fixes before generating fresh ones
    await supabase
      .from("wp_fix_queue")
      .delete()
      .eq("site_id", siteId)
      .in("status", ["pending", "failed"]);

    // 6. Generate AI fixes for pages with issues. MODELS.quality (Claude)
    // needs ANTHROPIC_API_KEY; it falls back to the Groq default automatically
    // if that's not set, so either key unlocks this.
    const hasLlmKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("GROQ_API_KEY");
    let fixesGenerated = 0;

    if (hasLlmKey && clientId && scanRecord) {
      const brandKit = await getClientBrandKit(supabase, clientId, false);
      const brandBlock = brandKitToPromptBlock(brandKit);
      const industry = brandKit.business.industry ?? "General";
      const canonicallyCovered = await getCanonicallyCoveredFields(supabase, clientId);

      // Prioritise errors first, then warnings; cap at MAX_PAGES_AI
      const pagesWithIssues = allPages
        .filter(p => p.issues?.length > 0)
        .sort((a, b) => {
          const score = (p: WpPage) =>
            (p.issues.filter(i => i.severity === "error").length * 10) +
            (p.issues.filter(i => i.severity === "warning").length * 5);
          return score(b) - score(a);
        })
        .slice(0, MAX_PAGES_AI);

      for (const page of pagesWithIssues) {
        const pageCovered = canonicallyCovered.get(normalizeUrl(page.url)) ?? new Set<string>();
        const fixes = await generateFixes(page, brandBlock, industry, pageCovered);
        if (!fixes) continue;

        const rows: Record<string, unknown>[] = [];

        if (fixes.meta_title) {
          rows.push({
            site_id: siteId, scan_id: scanRecord.id,
            post_id: page.id, page_title: page.title, page_url: page.url,
            field: "meta_title", current_value: page.meta_title || null,
            suggested_value: fixes.meta_title, status: "pending",
          });
        }
        if (fixes.meta_desc) {
          rows.push({
            site_id: siteId, scan_id: scanRecord.id,
            post_id: page.id, page_title: page.title, page_url: page.url,
            field: "meta_desc", current_value: page.meta_desc || null,
            suggested_value: fixes.meta_desc, status: "pending",
          });
        }
        if (fixes.focus_keyword) {
          rows.push({
            site_id: siteId, scan_id: scanRecord.id,
            post_id: page.id, page_title: page.title, page_url: page.url,
            field: "focus_keyword", current_value: page.focus_keyword || null,
            suggested_value: fixes.focus_keyword, status: "pending",
          });
        }
        if (fixes.alt_text) {
          for (const [imgId, altText] of Object.entries(fixes.alt_text)) {
            const img = page.images?.find(i => String(i.id) === imgId);
            rows.push({
              site_id: siteId, scan_id: scanRecord.id,
              post_id: page.id, media_id: parseInt(imgId, 10),
              page_title: page.title, page_url: page.url,
              field: "alt_text", current_value: img?.alt_text || null,
              suggested_value: altText, status: "pending",
            });
          }
        }

        if (rows.length > 0) {
          await supabase.from("wp_fix_queue").insert(rows);
          fixesGenerated += rows.length;
        }
      }

      // Also handle media with missing alt text (standalone, not attached to a page)
      const standaloneMissingAlt = (scanData.media ?? [])
        .filter(m => m.missing_alt)
        .slice(0, 10);

      if (standaloneMissingAlt.length > 0) {
        const altRows = standaloneMissingAlt.map(m => ({
          site_id: siteId, scan_id: scanRecord.id,
          media_id: m.id, page_title: m.filename, page_url: m.url,
          field: "alt_text", current_value: m.alt_text || null,
          suggested_value: `Image: ${m.filename.replace(/[-_]/g, " ").replace(/\.[^.]+$/, "")}`,
          status: "pending",
        }));
        await supabase.from("wp_fix_queue").insert(altRows);
        fixesGenerated += altRows.length;
      }
    }

    // 7. Update last_scanned_at
    await supabase
      .from("connected_sites")
      .update({ last_scanned_at: new Date().toISOString(), status: "connected", updated_at: new Date().toISOString() })
      .eq("id", siteId);

    // 8. Close the loop with the client portal's "Analyze current website
    // performance" onboarding step -- a real WP scan already covers what
    // that step promises, so a connected+scanned site should satisfy it
    // instead of leaving the client staring at "In progress..." forever
    // waiting on the unrelated PageSpeed automation.
    if (clientId) {
      const { data: activeWf } = await supabase
        .from("client_workflows")
        .select("id")
        .eq("client_id", clientId)
        .eq("status", "active")
        .maybeSingle();

      if (activeWf) {
        const { data: analysisStep } = await supabase
          .from("workflow_steps")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            result: { source: "wordpress_scan", scan_id: scanRecord?.id, total_issues: totalIssues },
          })
          .eq("workflow_id", activeWf.id)
          .eq("task_type", "website_analysis")
          .eq("status", "in_progress")
          .select("step_number")
          .maybeSingle();

        if (analysisStep) {
          await unlockReadySteps(supabase, activeWf.id, analysisStep.step_number, clientId).catch((e) =>
            console.error("unlockReadySteps failed after wp scan:", e),
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ scan_id: scanRecord?.id, total_issues: totalIssues, fixes_generated: fixesGenerated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("scan-wordpress-site error:", msg);

    if (siteId) {
      await supabase
        .from("connected_sites")
        .update({ status: "unreachable", updated_at: new Date().toISOString() })
        .eq("id", siteId)
        .then(undefined, () => {});
    }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
