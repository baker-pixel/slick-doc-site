import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { tierPolicy } from "../_shared/tierPolicy.ts";
import { filterEngagedClients } from "../_shared/engagedClients.ts";
import { hasBusinessContext } from "../_shared/businessContext.ts";

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

// ─── Schedule derived from tier policy ──────────────────────────────────────
// tierPolicy.social is the single source of truth: contentTypes gates which
// channels a plan gets, postsPerMonth is the volume budget. Candidates are
// taken in order while they fit the budget, so scheduled volume never exceeds
// what the tier is sold as (the old hardcoded table produced ~2x).
//
// policyType maps to tierPolicy contentTypes; content_type on the slot is
// what fill-scheduled-content's prompt switch expects.
// google_post and email_newsletter candidates removed -- both only ever
// published via n8n (now fully removed, see git history), and neither has a
// replacement publisher. Social platforms are scheduled regardless of Post
// for Me connection status -- content generation shouldn't be blocked on
// that, publishing (publish-scheduled-content) fails safely per-post if the
// platform isn't connected by the time a post is due.
const SLOT_CANDIDATES: Array<{ policyType: string; perMonth: number; slot: WeeklySlot }> = [
  { policyType: "social_post",      perMonth: 4, slot: { dayOfWeek: 2, platform: "linkedin",  content_type: "social_post", titlePrefix: "LinkedIn Post" } },
  { policyType: "social_post",      perMonth: 4, slot: { dayOfWeek: 1, platform: "facebook",  content_type: "social_post", titlePrefix: "Facebook Post" } },
  { policyType: "social_post",      perMonth: 2, slot: { dayOfWeek: 5, platform: "instagram", content_type: "social_post", titlePrefix: "Instagram Post", weekFilter: [1, 3] } },
  { policyType: "blog_post",        perMonth: 2, slot: { dayOfWeek: 1, platform: "blog",      content_type: "blog_post",   titlePrefix: "Blog Article",   weekFilter: [2, 4] } },
  { policyType: "social_post",      perMonth: 2, slot: { dayOfWeek: 4, platform: "twitter",   content_type: "social_post", titlePrefix: "Twitter Post",   weekFilter: [1, 3] } },
];

// Candidates for a platform the client has actually connected go first --
// matters once postsPerMonth budgeting is back on (see git history for the
// LinkedIn-only-forever bug this ordering fixes).
// ponytail: postsPerMonth budget cap disabled per request -- every candidate
// matching the tier's allowed content types gets scheduled, uncapped. Re-add
// the `c.perMonth > budget` check (removed here) to bring the cap back.
function buildWeeklyPlan(tier: string | null | undefined, connectedPlatforms: Set<string>): WeeklySlot[] {
  const social = tierPolicy(tier).social;
  const allowed = new Set(social.contentTypes);
  const candidates = [...SLOT_CANDIDATES].sort((a, b) =>
    Number(connectedPlatforms.has(b.slot.platform)) - Number(connectedPlatforms.has(a.slot.platform))
  );
  const plan: WeeklySlot[] = [];
  for (const c of candidates) {
    if (!allowed.has(c.policyType)) continue;
    plan.push(c.slot);
  }
  return plan;
}

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
      .select("id, tier, business_name, industry, context_profile")
      .eq("status", "active");

    if (specificClientId) {
      clientQuery = clientQuery.eq("id", specificClientId);
    }

    const { data: rawClients, error: clientsErr } = await clientQuery;
    if (clientsErr) throw new Error(`Failed to fetch clients: ${clientsErr.message}`);
    // Skip clients whose portal invite was never accepted -- nobody could
    // review the drafts, so scheduling for them just burns spend on content
    // that auto-deletes unseen.
    const engagedClients = await filterEngagedClients(supabase, rawClients ?? []);
    // Skip clients missing real business info too -- fill-scheduled-content
    // would refuse to fill these slots anyway (same hasBusinessContext gate),
    // so creating them here just leaves dead placeholders in the calendar.
    const clients = engagedClients.filter((c: any) => hasBusinessContext(c));
    if (!clients || clients.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active clients with accepted portal access found" }),
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

    const { data: connectedAccounts } = await supabase
      .from("client_postforme_accounts")
      .select("client_id, platform")
      .in("client_id", clientIds)
      .eq("status", "connected");
    const connectedByClient = new Map<string, Set<string>>();
    for (const acct of connectedAccounts || []) {
      if (!connectedByClient.has(acct.client_id)) connectedByClient.set(acct.client_id, new Set());
      connectedByClient.get(acct.client_id)!.add(acct.platform);
    }

    const allRows: any[] = [];
    const summary: { client: string; tier: string; created: number }[] = [];

    for (const client of clients) {
      const tier = (client.tier || "foundation").toLowerCase();
      const plan: WeeklySlot[] = buildWeeklyPlan(tier, connectedByClient.get(client.id) ?? new Set());
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
