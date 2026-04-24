import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FixRequest {
  client_account_id: string;
  source: "seo" | "content" | "ads" | "email" | "qa";
  source_reference_id?: string;
  issue_title: string;
  issue_summary?: string;
  context?: Record<string, unknown>;
  severity?: "low" | "medium" | "high" | "critical";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json()) as FixRequest;
    if (!body.client_account_id || !body.source || !body.issue_title) {
      return new Response(
        JSON.stringify({ error: "client_account_id, source and issue_title are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: client } = await supabase
      .from("client_accounts")
      .select("business_name, industry, website_url, website_summary, context_profile, tier")
      .eq("id", body.client_account_id)
      .single();

    const { data: creds } = await supabase
      .from("client_credentials")
      .select("wordpress_url, wordpress_username, wordpress_app_password")
      .eq("client_id", body.client_account_id)
      .maybeSingle();

    const hasWordPress = !!(creds?.wordpress_url && creds?.wordpress_username && creds?.wordpress_app_password);

    const ctxProfile = (client?.context_profile ?? {}) as Record<string, unknown>;

    const prompt = `You are an expert ${body.source.toUpperCase()} consultant for Orange Door Marketing.
A client has an issue and needs a clear fix plan.

CLIENT
- Business: ${client?.business_name || "Unknown"}
- Industry: ${client?.industry || "Unknown"}
- Website: ${client?.website_url || "Unknown"}
- Tier: ${client?.tier || "Unknown"}
- Audience: ${(ctxProfile.target_audience as string) || "Unknown"}

ISSUE (source: ${body.source})
- Title: ${body.issue_title}
- Summary: ${body.issue_summary || "(no summary)"}
- Context: ${JSON.stringify(body.context || {}).slice(0, 2000)}

CAPABILITIES
- WordPress auto-publish available: ${hasWordPress ? "YES" : "NO"}

Return a JSON object with this exact shape:
{
  "explanation": "2-3 sentence plain-English explanation of why this matters",
  "impact": "1 sentence describing the business consequence of leaving it",
  "steps": ["Step 1...", "Step 2...", "..."],
  "ready_to_apply": {
    "type": "wp_meta_title" | "wp_meta_description" | "wp_image_alt" | "copy_to_clipboard" | "manual_only",
    "payload": { "value": "the new content to apply", "post_url": "(if known)", "image_src": "(if image alt)" }
  },
  "manual_fallback": "Step-by-step instructions a human can follow if auto-apply isn't possible"
}

Rules:
- Use type "wp_meta_title" for page title fixes, "wp_meta_description" for meta descriptions, "wp_image_alt" for image alt text — but ONLY if the issue clearly maps to one of these AND WordPress is available.
- For everything else (H1 changes, body rewrites, schema, speed, etc.) use type "copy_to_clipboard" with the new copy in payload.value.
- For non-text fixes (theme work, hosting, third-party tools) use "manual_only" and provide great manual_fallback instructions.
- Be concrete and prescriptive. Write like a senior consultant, not generic advice.

Return ONLY the JSON. No markdown, no fences, no preamble.`;

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) throw new Error("Rate limit exceeded — try again shortly");
      if (aiRes.status === 402) throw new Error("AI credits exhausted — please add credits");
      throw new Error(`AI gateway error: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const raw = aiData.content?.[0]?.text || "";
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("AI returned invalid JSON for fix plan");
    }

    const fix_plan = {
      explanation: parsed.explanation || "",
      impact: parsed.impact || "",
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      manual_fallback: parsed.manual_fallback || "",
    };
    const ready = (parsed.ready_to_apply ?? null) as { type?: string; payload?: unknown } | null;
    // If WP is unavailable but AI suggested wp_*, downgrade to manual
    let readyOut = ready;
    if (!hasWordPress && ready?.type && String(ready.type).startsWith("wp_")) {
      readyOut = { type: "copy_to_clipboard", payload: ready.payload };
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("ai_fixes")
      .insert({
        client_account_id: body.client_account_id,
        source: body.source,
        source_reference_id: body.source_reference_id ?? null,
        issue_title: body.issue_title,
        issue_summary: body.issue_summary ?? null,
        severity: body.severity ?? "medium",
        fix_plan,
        ready_to_apply: readyOut,
        status: "proposed",
        apply_target: hasWordPress ? "wordpress" : null,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({ success: true, fix: inserted, can_auto_apply: hasWordPress && readyOut?.type && String(readyOut.type).startsWith("wp_") }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-fix-plan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});