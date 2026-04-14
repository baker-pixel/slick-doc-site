import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ContentPlan {
  title: string;
  content_type: string;
  platform: string;
  dayOffset: number; // days from today
}

function buildContentPlan(tier: string): ContentPlan[] {
  const t = tier.toLowerCase();
  const plan: ContentPlan[] = [];

  if (t === "foundation" || t === "growth" || t === "transformation") {
    // 4 GBP posts (weekly)
    for (let i = 0; i < 4; i++) {
      plan.push({
        title: `Google Business Profile Post — Week ${i + 1}`,
        content_type: "social_post",
        platform: "google_business",
        dayOffset: i * 7 + 1,
      });
    }
    // 1 blog article
    plan.push({ title: "Blog Article — Month 1", content_type: "blog_post", platform: "blog", dayOffset: 10 });
  }

  if (t === "growth" || t === "transformation") {
    // 4 LinkedIn posts (weekly)
    for (let i = 0; i < 4; i++) {
      plan.push({
        title: `LinkedIn Post — Week ${i + 1}`,
        content_type: "social_post",
        platform: "linkedin",
        dayOffset: i * 7 + 2,
      });
    }
    // 2nd blog
    plan.push({ title: "Blog Article #2 — Month 1", content_type: "blog_post", platform: "blog", dayOffset: 20 });
    // 2 email drafts
    plan.push({ title: "Email Nurture #1", content_type: "email_copy", platform: "email", dayOffset: 5 });
    plan.push({ title: "Email Nurture #2", content_type: "email_copy", platform: "email", dayOffset: 15 });
  }

  if (t === "transformation") {
    // 8 social posts (2×/week rotating platforms)
    const platforms = ["facebook", "twitter", "instagram", "linkedin"];
    for (let i = 0; i < 8; i++) {
      plan.push({
        title: `Social Post ${i + 1} — ${platforms[i % platforms.length]}`,
        content_type: "social_post",
        platform: platforms[i % platforms.length],
        dayOffset: Math.floor(i / 2) * 7 + (i % 2 === 0 ? 1 : 4),
      });
    }
    // Lead magnet outline
    plan.push({ title: "Lead Magnet Outline", content_type: "ad_copy", platform: "blog", dayOffset: 14 });
  }

  return plan;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { client_id, tier } = await req.json();

    if (!client_id || !tier) {
      return new Response(JSON.stringify({ error: "client_id and tier required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const plan = buildContentPlan(tier);
    const today = new Date();

    const rows = plan.map((item) => {
      const schedDate = new Date(today);
      schedDate.setDate(schedDate.getDate() + item.dayOffset);
      schedDate.setHours(9, 0, 0, 0);

      return {
        client_account_id: client_id,
        title: item.title,
        content: `[Auto-generated placeholder — content will be created by your team]`,
        content_type: item.content_type,
        platform: item.platform,
        scheduled_for: schedDate.toISOString(),
        status: "scheduled",
        client_approved: false,
      };
    });

    const { error } = await supabase.from("content_calendar").insert(rows);
    if (error) throw new Error(`Failed to insert calendar items: ${error.message}`);

    console.log(`Auto-scheduled ${rows.length} items for client ${client_id} (${tier})`);

    return new Response(
      JSON.stringify({ success: true, items_created: rows.length, tier }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("auto-schedule-content error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
