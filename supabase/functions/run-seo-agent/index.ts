import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let taskId: string | null = null;

  try {
    const body = await req.json();
    taskId = body.task_id;

    if (!taskId) {
      return new Response(
        JSON.stringify({ error: "task_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the task
    const { data: task, error: taskError } = await supabase
      .from("workflow_tasks")
      .select("*")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      return new Response(
        JSON.stringify({ error: "Task not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the client
    const { data: client, error: clientError } = await supabase
      .from("client_accounts")
      .select("business_name, industry, website_url, website_summary")
      .eq("id", task.client_id)
      .single();

    if (clientError || !client) {
      await supabase
        .from("workflow_tasks")
        .update({ status: "failed", result: { error: "Client not found" } })
        .eq("id", taskId);
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch real HTML from the website for actual SEO signals
    let htmlSignals = "";
    let fetchFailed = false;
    if (client.website_url) {
      try {
        const siteRes = await fetch(client.website_url, {
          headers: { "User-Agent": "OrangeDoorSEOBot/1.0" },
          signal: AbortSignal.timeout(10000),
        });
        if (siteRes.ok) {
          const html = (await siteRes.text()).slice(0, 50000);
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
          const h1Matches = html.match(/<h1[^>]*>([^<]+)<\/h1>/gi) || [];
          const h1Tags = h1Matches.map(h => h.replace(/<[^>]+>/g, "").trim());
          const imgMatches = html.match(/<img[^>]*>/gi) || [];
          const imgsMissingAlt = imgMatches.filter(img => !img.includes("alt=") || img.includes('alt=""')).length;
          const hasViewport = html.toLowerCase().includes('name="viewport"');
          const textContent = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;

          htmlSignals = `
REAL HTML SIGNALS (from crawling ${client.website_url}):
- Page Title: ${titleMatch ? titleMatch[1].trim() : "MISSING"}
- Meta Description: ${metaDescMatch ? metaDescMatch[1].trim() : "MISSING"}
- H1 Tags: ${h1Tags.length > 0 ? h1Tags.join(", ") : "NONE"}
- Word Count: ${wordCount}
- Images: ${imgMatches.length} total, ${imgsMissingAlt} missing alt text
- Viewport Meta: ${hasViewport ? "Present" : "MISSING"}
- Content Preview (first 500 chars): ${textContent.slice(0, 500)}`;
        } else {
          fetchFailed = true;
          htmlSignals = `\nNote: Website returned HTTP ${siteRes.status} — could not crawl. Using metadata only.`;
        }
      } catch (e) {
        fetchFailed = true;
        htmlSignals = `\nNote: Website fetch failed (${e instanceof Error ? e.message : "timeout"}) — using metadata only.`;
      }
    } else {
      htmlSignals = "\nNote: No website URL configured for this client.";
    }

    const prompt = `You are an expert SEO analyst. Analyse the following business and return a structured SEO audit.

Business name: ${client.business_name || "Unknown"}
Industry: ${client.industry || "General"}
Website URL: ${client.website_url || "Not provided"}
Website summary: ${client.website_summary || "No summary available"}
${htmlSignals}

Return your response as a valid JSON object with exactly this structure:
{
  "seo_score": number between 0 and 100,
  "working_well": ["point 1", "point 2", ...],
  "needs_improvement": ["point 1", "point 2", ...],
  "recommended_keywords": ["keyword1", "keyword2", ...],
  "action_summary": "one paragraph summary of what to do next"
}

${fetchFailed ? "Note: The website could not be fetched. Be transparent about this limitation in action_summary and score conservatively." : "Base your scores on the REAL HTML signals above, not assumptions."}

Return only the JSON. No extra text, no markdown, no code blocks.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) throw new Error("Rate limit exceeded. Please try again later.");
      if (aiResponse.status === 402) throw new Error("AI credits exhausted. Please add funds.");
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from response (strip markdown fences if present)
    let parsed;
    try {
      const cleaned = rawContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("Failed to parse SEO audit JSON from AI response");
    }

    // Validate structure
    const result = {
      seo_score: typeof parsed.seo_score === "number" ? parsed.seo_score : 50,
      working_well: Array.isArray(parsed.working_well) ? parsed.working_well.slice(0, 5) : [],
      needs_improvement: Array.isArray(parsed.needs_improvement) ? parsed.needs_improvement.slice(0, 5) : [],
      recommended_keywords: Array.isArray(parsed.recommended_keywords) ? parsed.recommended_keywords.slice(0, 8) : [],
      action_summary: typeof parsed.action_summary === "string" ? parsed.action_summary : "No summary available.",
      generated_at: new Date().toISOString(),
    };

    await supabase
      .from("workflow_tasks")
      .update({ status: "completed", result })
      .eq("id", taskId);

    return new Response(
      JSON.stringify({ success: true, task_id: taskId, status: "completed", result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("run-seo-agent error:", e);

    await supabase.from('automation_alerts').insert({
      alert_type: 'function_error',
      severity: 'error',
      title: `Error in run-seo-agent`,
      message: e instanceof Error ? e.message : 'Unknown error',
      source: 'run-seo-agent',
      metadata: {
        function_name: 'run-seo-agent',
        client_id: null,
        error_message: e instanceof Error ? e.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    }).catch(console.error);

    if (taskId) {
      await supabase
        .from("workflow_tasks")
        .update({
          status: "failed",
          result: { error: e instanceof Error ? e.message : "Unknown error" },
        })
        .eq("id", taskId);
    }

    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
