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
    const { reportId, fixType } = await req.json();

    if (!reportId || !fixType) {
      return new Response(
        JSON.stringify({ error: "reportId and fixType are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the report
    const { data: report, error: fetchErr } = await supabase
      .from("qa_reports")
      .select("*")
      .eq("id", reportId)
      .single();

    if (fetchErr || !report) {
      return new Response(
        JSON.stringify({ error: "Report not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

    let fixDescription = "";

    // Generate AI-powered fix suggestion if possible
    if (GROQ_API_KEY) {
      const fixContext = buildFixContext(report, fixType);

      try {
        const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            max_tokens: 512,
            messages: [
              { role: "system", content: "You are a web QA specialist. Provide a concise, actionable fix description in 1-3 sentences." },
              { role: "user", content: fixContext },
            ],
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          fixDescription = aiData.choices?.[0]?.message?.content?.trim() || "";
        }
      } catch (aiErr) {
        console.error("AI fix generation failed:", aiErr);
      }
    }

    if (!fixDescription) {
      fixDescription = getFallbackFixDescription(fixType);
    }

    // Append to auto_fixes_applied
    const existingFixes: Array<{ fix: string; applied_at: string }> = report.auto_fixes_applied || [];
    const updatedFixes = [
      ...existingFixes,
      { fix: `[${fixType}] ${fixDescription}`, applied_at: new Date().toISOString() },
    ];

    const { error: updateErr } = await supabase
      .from("qa_reports")
      .update({ auto_fixes_applied: updatedFixes })
      .eq("id", reportId);

    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({ success: true, fixDescription }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("apply-qa-fix error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildFixContext(report: any, fixType: string): string {
  const parts = [`Page: ${report.url}`, `Fix type requested: ${fixType}`];

  if (fixType === "broken_links" && report.broken_links?.length) {
    parts.push(`Broken links: ${JSON.stringify(report.broken_links.slice(0, 3))}`);
  }
  if (fixType === "spelling_errors" && report.spelling_errors?.length) {
    parts.push(`Spelling errors: ${JSON.stringify(report.spelling_errors.slice(0, 3))}`);
  }
  if (fixType === "missing_metadata" && report.missing_metadata?.length) {
    parts.push(`Missing metadata: ${JSON.stringify(report.missing_metadata)}`);
  }
  if (fixType === "mobile_issues" && report.mobile_issues?.length) {
    parts.push(`Mobile issues: ${JSON.stringify(report.mobile_issues.slice(0, 3))}`);
  }
  if (fixType === "accessibility_issues" && report.accessibility_issues?.length) {
    parts.push(`Accessibility issues: ${JSON.stringify(report.accessibility_issues.slice(0, 3))}`);
  }

  parts.push("Provide a specific, actionable fix recommendation for the web developer.");
  return parts.join("\n");
}

function getFallbackFixDescription(fixType: string): string {
  const fallbacks: Record<string, string> = {
    broken_links: "Update or remove broken links. Check href values and ensure target pages exist.",
    spelling_errors: "Correct the identified spelling errors in the page content.",
    missing_metadata: "Add the missing meta tags to the <head> section of the HTML.",
    mobile_issues: "Fix mobile layout issues by using responsive CSS (max-width, flexbox, or grid).",
    accessibility_issues: "Address WCAG violations by adding alt text, lang attributes, and skip navigation links.",
  };
  return fallbacks[fixType] || "Apply the recommended fix to improve the page quality score.";
}
