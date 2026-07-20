import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getClientBrandKit, brandKitToPromptBlock } from "../_shared/brandKit.ts";
import { callAIJson } from "../_shared/ai.ts";
import { checkClientOrAdminAuth } from "../_shared/auth.ts";
import { unlockReadySteps } from "../_shared/workflowUnlock.ts";

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
  groqKey: string,
): Promise<AiFixResult | null> {
  const missingAltImages = page.images.filter(i => i.missing_alt);
  const altTextSection = missingAltImages.length > 0
    ? `Images missing alt text (image IDs): ${missingAltImages.map(i => i.id).join(", ")}`
    : "";

  const systemPrompt = `You are an SEO expert. Generate optimized fixes for WordPress pages.
Return ONLY a valid JSON object — no markdown, no explanation.

${brandBlock}`;

  const userPrompt = `Generate SEO fixes for this page.

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
  "meta_title": "string under 60 chars — only if missing or needs improvement",
  "meta_desc": "string under 155 chars — only if missing or needs improvement",
  "focus_keyword": "1-3 word phrase — only if missing",
  "alt_text": { "<image_id>": "descriptive alt text" }
}
Omit any field that does not need a fix.`;

  try {
    return await callAIJson<AiFixResult>({
      source: "scan-wordpress-site",
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 512,
    });
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

    // 3. Count issues
    const allPages: WpPage[] = [...(scanData.posts ?? []), ...(scanData.pages ?? [])];
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

    // 6. Generate AI fixes for pages with issues
    const groqKey = Deno.env.get("GROQ_API_KEY");
    let fixesGenerated = 0;

    if (groqKey && clientId && scanRecord) {
      const brandKit = await getClientBrandKit(supabase, clientId, false);
      const brandBlock = brandKitToPromptBlock(brandKit);
      const industry = brandKit.business.industry ?? "General";

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
        const fixes = await generateFixes(page, brandBlock, industry, groqKey);
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
        .catch(() => {});
    }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
