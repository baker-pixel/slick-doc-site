import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { clientId, url } = await req.json();

    if (!clientId || !url) {
      return new Response(
        JSON.stringify({ error: "clientId and url are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert a pending report first so the UI can show scanning state
    const { data: pendingReport, error: insertErr } = await supabase
      .from("qa_reports")
      .insert({
        client_account_id: clientId,
        url,
        status: "in_progress",
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    const reportId = pendingReport.id;
    const startTime = Date.now();

    // Fetch the page
    let html = "";
    let fetchFailed = false;
    try {
      const pageRes = await fetch(url, {
        headers: { "User-Agent": "OrangeDoorQABot/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!pageRes.ok) throw new Error(`HTTP ${pageRes.status}`);
      html = await pageRes.text();
    } catch (e) {
      console.error("Page fetch failed:", e);
      fetchFailed = true;
    }

    const loadTimeMs = Date.now() - startTime;

    if (fetchFailed || !html) {
      await supabase
        .from("qa_reports")
        .update({ status: "failed" })
        .eq("id", reportId);
      return new Response(
        JSON.stringify({ error: "Failed to fetch the page" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Parse page title ---
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].trim() : null;

    // --- Check for missing metadata ---
    const missingMetadata: Array<{ type: string; description: string }> = [];
    if (!titleMatch || !titleMatch[1].trim()) {
      missingMetadata.push({ type: "title", description: "Page is missing a <title> tag" });
    }
    const hasMetaDesc = /<meta[^>]*name=["']description["'][^>]*content=["'][^"']+["']/i.test(html);
    if (!hasMetaDesc) {
      missingMetadata.push({ type: "meta_description", description: "Missing meta description" });
    }
    const hasH1 = /<h1[\s>]/i.test(html);
    if (!hasH1) {
      missingMetadata.push({ type: "h1", description: "Page has no H1 heading" });
    }
    const hasViewport = /name=["']viewport["']/i.test(html);
    if (!hasViewport) {
      missingMetadata.push({ type: "viewport", description: "Missing viewport meta tag (mobile unfriendly)" });
    }
    const hasCanonical = /<link[^>]*rel=["']canonical["']/i.test(html);
    if (!hasCanonical) {
      missingMetadata.push({ type: "canonical", description: "Missing canonical link tag" });
    }

    // --- Find broken links (check href values that look like URLs) ---
    const linkRegex = /<a[^>]*href=["']([^"'#?]+)["']/gi;
    const hrefMatches = [...html.matchAll(linkRegex)].map(m => m[1]);
    const urlDomain = new URL(url).origin;

    const brokenLinks: Array<{ url: string; statusCode: number }> = [];
    const linksToCheck = hrefMatches
      .filter(href => href.startsWith("http") || href.startsWith("/"))
      .map(href => href.startsWith("/") ? `${urlDomain}${href}` : href)
      .filter((href, i, arr) => arr.indexOf(href) === i) // dedupe
      .slice(0, 20); // limit checks

    await Promise.all(
      linksToCheck.map(async (href) => {
        try {
          const res = await fetch(href, {
            method: "HEAD",
            headers: { "User-Agent": "OrangeDoorQABot/1.0" },
            signal: AbortSignal.timeout(8000),
            redirect: "follow",
          });
          if (res.status >= 400) {
            brokenLinks.push({ url: href, statusCode: res.status });
          }
        } catch {
          brokenLinks.push({ url: href, statusCode: 0 });
        }
      })
    );

    // --- Mobile issues ---
    const mobileIssues: Array<{ issue: string; element: string }> = [];
    if (!hasViewport) {
      mobileIssues.push({ issue: "No viewport meta tag", element: "<head>" });
    }
    // Check for fixed-width elements
    const fixedWidthMatches = html.match(/width\s*:\s*\d{4,}px/g) || [];
    if (fixedWidthMatches.length > 0) {
      mobileIssues.push({ issue: "Fixed pixel widths may break on mobile", element: fixedWidthMatches[0] });
    }
    // Check for small tap targets (font-size < 12px)
    const smallFontMatches = html.match(/font-size\s*:\s*([1-9]|1[01])px/g) || [];
    if (smallFontMatches.length > 0) {
      mobileIssues.push({ issue: "Very small font sizes may be unreadable on mobile", element: smallFontMatches[0] });
    }

    // --- Accessibility issues ---
    const accessibilityIssues: Array<{ issue: string; wcag: string; severity: string }> = [];
    const imgTags = html.match(/<img[^>]*>/gi) || [];
    const imgsMissingAlt = imgTags.filter(
      img => !img.includes("alt=") || /alt=["']\s*["']/.test(img)
    );
    if (imgsMissingAlt.length > 0) {
      accessibilityIssues.push({
        issue: `${imgsMissingAlt.length} image(s) missing alt text`,
        wcag: "WCAG 1.1.1",
        severity: "high",
      });
    }
    const hasLangAttr = /html[^>]*lang=["'][a-z]/i.test(html);
    if (!hasLangAttr) {
      accessibilityIssues.push({
        issue: "HTML element missing lang attribute",
        wcag: "WCAG 3.1.1",
        severity: "medium",
      });
    }
    const hasSkipLink = /skip[\s-]?(to[\s-]?)?(?:main|content)/i.test(html);
    if (!hasSkipLink) {
      accessibilityIssues.push({
        issue: "No skip navigation link found",
        wcag: "WCAG 2.4.1",
        severity: "medium",
      });
    }

    // --- Spelling errors (lightweight — flag common misspellings) ---
    const COMMON_MISSPELLINGS: Record<string, string[]> = {
      "recieve": ["receive"],
      "seperate": ["separate"],
      "occured": ["occurred"],
      "accomodate": ["accommodate"],
      "untill": ["until"],
      "definately": ["definitely"],
      "occassion": ["occasion"],
      "professinal": ["professional"],
      "busines": ["business"],
      "experiance": ["experience"],
    };
    const textContent = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ");

    const spellingErrors: Array<{ word: string; suggestions: string[]; context: string }> = [];
    for (const [misspelling, suggestions] of Object.entries(COMMON_MISSPELLINGS)) {
      const regex = new RegExp(`\\b${misspelling}\\b`, "gi");
      const match = regex.exec(textContent);
      if (match) {
        const start = Math.max(0, match.index - 40);
        const end = Math.min(textContent.length, match.index + misspelling.length + 40);
        spellingErrors.push({
          word: misspelling,
          suggestions,
          context: textContent.slice(start, end).replace(/\s+/g, " ").trim(),
        });
      }
    }

    // --- Calculate overall score ---
    let score = 100;
    score -= brokenLinks.length * 10;
    score -= missingMetadata.filter(m => ["title", "meta_description", "h1"].includes(m.type)).length * 10;
    score -= missingMetadata.filter(m => !["title", "meta_description", "h1"].includes(m.type)).length * 5;
    score -= mobileIssues.length * 7;
    score -= accessibilityIssues.filter(a => a.severity === "high").length * 10;
    score -= accessibilityIssues.filter(a => a.severity === "medium").length * 5;
    score -= spellingErrors.length * 3;
    if (loadTimeMs > 5000) score -= 15;
    else if (loadTimeMs > 3000) score -= 8;
    const overallScore = Math.max(0, Math.min(100, score));

    // --- Update the report ---
    const { data: report, error: updateErr } = await supabase
      .from("qa_reports")
      .update({
        page_title: pageTitle,
        broken_links: brokenLinks,
        spelling_errors: spellingErrors,
        missing_metadata: missingMetadata,
        mobile_issues: mobileIssues,
        accessibility_issues: accessibilityIssues,
        load_time_ms: loadTimeMs,
        overall_score: overallScore,
        auto_fixes_applied: [],
        status: "completed",
      })
      .eq("id", reportId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({ success: true, report }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("run-qa-scan error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
