import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// dayOfWeek: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
// weekFilter: only create in these week-of-month numbers (1–5). Omit = every week.
type WeeklySlot = {
  dayOfWeek: number;
  platform: string;
  content_type: string;
  titlePrefix: string;
  weekFilter?: number[];
};

// ─── Tier-based weekly content schedules ────────────────────────────────────
//
// Foundation  (~5 pieces/month)
//   GBP post every Monday
//   Blog post on the 1st Monday of each month
//
// Growth  (~20 pieces/month)
//   GBP: Mon + Thu
//   LinkedIn: Tue + Fri
//   Email newsletter: Wed
//   Blog: 2nd and 4th Monday
//
// Transformation  (~40 pieces/month)
//   GBP: Mon + Wed + Fri
//   LinkedIn: Tue + Thu
//   Facebook: Mon + Thu
//   Instagram: Wed + Fri
//   Email: Tue (weekly)
//   Blog: every Monday

const TIER_SCHEDULE: Record<string, WeeklySlot[]> = {
  foundation: [
    { dayOfWeek: 1, platform: "google_business", content_type: "social_post",  titlePrefix: "Google Business Profile Post" },
    { dayOfWeek: 1, platform: "blog",             content_type: "blog_post",    titlePrefix: "Blog Article",                 weekFilter: [1] },
  ],
  growth: [
    { dayOfWeek: 1, platform: "google_business", content_type: "social_post",  titlePrefix: "Google Business Profile Post" },
    { dayOfWeek: 2, platform: "linkedin",         content_type: "social_post",  titlePrefix: "LinkedIn Post" },
    { dayOfWeek: 3, platform: "email",            content_type: "email_copy",   titlePrefix: "Email Newsletter" },
    { dayOfWeek: 4, platform: "google_business", content_type: "social_post",  titlePrefix: "Google Business Profile Post" },
    { dayOfWeek: 5, platform: "linkedin",         content_type: "social_post",  titlePrefix: "LinkedIn Post" },
    { dayOfWeek: 1, platform: "blog",             content_type: "blog_post",    titlePrefix: "Blog Article",                 weekFilter: [2, 4] },
  ],
  transformation: [
    { dayOfWeek: 1, platform: "google_business", content_type: "social_post",  titlePrefix: "Google Business Profile Post" },
    { dayOfWeek: 1, platform: "facebook",         content_type: "social_post",  titlePrefix: "Facebook Post" },
    { dayOfWeek: 1, platform: "blog",             content_type: "blog_post",    titlePrefix: "Blog Article" },
    { dayOfWeek: 2, platform: "linkedin",         content_type: "social_post",  titlePrefix: "LinkedIn Post" },
    { dayOfWeek: 2, platform: "email",            content_type: "email_copy",   titlePrefix: "Email Newsletter" },
    { dayOfWeek: 3, platform: "google_business", content_type: "social_post",  titlePrefix: "Google Business Profile Post" },
    { dayOfWeek: 3, platform: "instagram",        content_type: "social_post",  titlePrefix: "Instagram Post" },
    { dayOfWeek: 4, platform: "linkedin",         content_type: "social_post",  titlePrefix: "LinkedIn Post" },
    { dayOfWeek: 4, platform: "facebook",         content_type: "social_post",  titlePrefix: "Facebook Post" },
    { dayOfWeek: 5, platform: "google_business", content_type: "social_post",  titlePrefix: "Google Business Profile Post" },
    { dayOfWeek: 5, platform: "instagram",        content_type: "social_post",  titlePrefix: "Instagram Post" },
  ],
};

// Return the Monday of the week containing `from`
function getMondayOfWeek(from: Date): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d;
}

function weekOfMonth(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

function dateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
    const body = await req.json().catch(() => ({}));
    const specificClientId: string | undefined = body.client_id;

    // Fetch active clients
    let clientQuery = supabase
      .from("client_accounts")
      .select("id, tier, business_name")
      .eq("status", "active");

    if (specificClientId) {
      clientQuery = clientQuery.eq("id", specificClientId);
    }

    const { data: clients, error: clientsErr } = await clientQuery;
    if (clientsErr) throw new Error(`Failed to fetch clients: ${clientsErr.message}`);
    if (!clients || clients.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active clients found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 28-day rolling window starting from this week's Monday
    const windowStart = getMondayOfWeek(new Date());
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + 28);

    // Fetch all existing slots in the window in one query (all clients)
    const clientIds = clients.map((c: any) => c.id);
    const { data: existingSlots } = await supabase
      .from("content_calendar")
      .select("client_account_id, platform, scheduled_for")
      .in("client_account_id", clientIds)
      .not("status", "in", '("failed")')
      .gte("scheduled_for", windowStart.toISOString())
      .lt("scheduled_for", windowEnd.toISOString());

    // Dedup set: "clientId:platform:YYYY-MM-DD"
    const occupied = new Set<string>();
    for (const slot of existingSlots || []) {
      occupied.add(`${slot.client_account_id}:${slot.platform}:${dateKey(new Date(slot.scheduled_for))}`);
    }

    const allRows: any[] = [];
    const summary: { client: string; tier: string; created: number }[] = [];

    for (const client of clients) {
      const tier = (client.tier || "foundation").toLowerCase();
      // Fall back to foundation if tier is unrecognised
      const plan: WeeklySlot[] = TIER_SCHEDULE[tier] ?? TIER_SCHEDULE["foundation"];
      const clientRows: any[] = [];

      for (let week = 0; week < 4; week++) {
        const mondayOfThisWeek = new Date(windowStart);
        mondayOfThisWeek.setDate(mondayOfThisWeek.getDate() + week * 7);

        for (const item of plan) {
          const slotDate = new Date(mondayOfThisWeek);
          slotDate.setDate(slotDate.getDate() + (item.dayOfWeek - 1)); // Mon+0, Tue+1 ...
          slotDate.setHours(9, 0, 0, 0);

          // Respect month-based filters (blog once/twice a month)
          if (item.weekFilter && !item.weekFilter.includes(weekOfMonth(slotDate))) {
            continue;
          }

          const key = `${client.id}:${item.platform}:${dateKey(slotDate)}`;
          if (occupied.has(key)) continue; // already have content for that day/platform

          clientRows.push({
            client_account_id: client.id,
            title: `${item.titlePrefix} — ${dateLabel(slotDate)}`,
            content: `[Auto-generated placeholder — content will be created by AI]`,
            content_type: item.content_type,
            platform: item.platform,
            scheduled_for: slotDate.toISOString(),
            status: "draft",
            client_approved: false,
          });

          occupied.add(key); // prevent same slot appearing twice if plan has duplicates
        }
      }

      summary.push({ client: client.business_name, tier, created: clientRows.length });
      allRows.push(...clientRows);
    }

    if (allRows.length > 0) {
      const { error: insertErr } = await supabase.from("content_calendar").insert(allRows);
      if (insertErr) throw new Error(`Batch insert failed: ${insertErr.message}`);
    }

    console.log(`auto-schedule-content: ${allRows.length} slots across ${clients.length} clients`);

    return new Response(
      JSON.stringify({ success: true, total_created: allRows.length, clients: summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("auto-schedule-content error:", error);

    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb.from("automation_alerts").insert({
        alert_type: "function_error",
        severity: "error",
        title: "Error in auto-schedule-content",
        message: error instanceof Error ? error.message : "Unknown error",
        source: "auto-schedule-content",
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (_) { /* ignore */ }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
