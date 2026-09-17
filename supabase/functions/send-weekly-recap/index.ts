import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { handleOptions, jsonResponse, errorResponse } from "../_shared/http.ts";
import { checkAdminAuth } from "../_shared/auth.ts";
import { logActivity } from "../_shared/activityLog.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Weekly cron (see migration 20260917170000): Monday 8am UTC, three hours
// after sync-ga4-analytics. Two jobs in one pass over active clients:
//
// 1. Persist real leads_generated + email_opens into the SAME
//    client_analytics period row sync-ga4-analytics just wrote (same
//    trailing-7-day window, so both metrics land together) -- this runs
//    for every active client regardless of the email toggle, because the
//    Home tab's stat cards read this table directly and shouldn't go stale
//    just because someone opted out of the email.
// 2. Email the recap, skipped only when every portal user on the account
//    has turned client_portal_preferences.weekly_recap_email off (no
//    preference row at all defaults to opted-in).
//
// A request naming a single `client_id` is an admin manually resending one
// client's recap, same shape as sync-ga4-analytics' manual-trigger mode.

interface ClientRow {
  id: string;
  business_name: string;
  email: string;
}

function formatVisits(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const opts = handleOptions(req);
  if (opts) return opts;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: Record<string, string> = {};

  try {
    const { client_id: onlyClientId, password } = await req.json().catch(() => ({}));

    if (onlyClientId) {
      const auth = await checkAdminAuth(req, supabase, password);
      if (!auth.authorized) {
        return errorResponse("Unauthorized", 401);
      }
    }

    const clientQuery = supabase
      .from("client_accounts")
      .select("id, business_name, email")
      .eq("status", "active")
      .not("email", "is", null);
    const { data: clients, error: clientsError } = onlyClientId
      ? await clientQuery.eq("id", onlyClientId)
      : await clientQuery;
    if (clientsError) throw clientsError;

    if (onlyClientId && (clients ?? []).length === 0) {
      return errorResponse("Client not found, inactive, or has no email set", 404);
    }

    const portalUrl = "https://client.orangedoormarketing.com";

    // Same trailing-7-day window as sync-ga4-analytics (yesterday back 6
    // days), so this upsert lands on the exact same period row.
    const periodEnd = new Date();
    periodEnd.setUTCDate(periodEnd.getUTCDate() - 1);
    const periodStart = new Date(periodEnd);
    periodStart.setUTCDate(periodStart.getUTCDate() - 6);
    const periodStartStr = isoDate(periodStart);
    const periodEndStr = isoDate(periodEnd);
    const periodStartIso = periodStart.toISOString();
    const periodEndIsoExclusive = new Date(periodEnd.getTime() + 24 * 60 * 60 * 1000).toISOString();

    for (const client of (clients ?? []) as ClientRow[]) {
      try {
        const [leadsRes, opensRes, existingRes] = await Promise.all([
          supabase.from("prospects").select("id", { count: "exact", head: true })
            .eq("client_id", client.id).gte("created_at", periodStartIso).lt("created_at", periodEndIsoExclusive),
          supabase.from("prospects").select("id", { count: "exact", head: true })
            .eq("client_id", client.id).gte("opened_at", periodStartIso).lt("opened_at", periodEndIsoExclusive),
          supabase.from("client_analytics").select("id, metrics")
            .eq("client_account_id", client.id).eq("period_start", periodStartStr).eq("period_end", periodEndStr)
            .maybeSingle(),
        ]);

        const leadsGenerated = leadsRes.count ?? 0;
        const emailOpens = opensRes.count ?? 0;
        const existingMetrics = (existingRes.data?.metrics as Record<string, number>) ?? {};
        const mergedMetrics = { ...existingMetrics, leads_generated: leadsGenerated, email_opens: emailOpens };

        if (existingRes.data) {
          await supabase.from("client_analytics").update({ metrics: mergedMetrics }).eq("id", existingRes.data.id);
        } else {
          await supabase.from("client_analytics").insert({
            client_account_id: client.id,
            period_start: periodStartStr,
            period_end: periodEndStr,
            metrics: mergedMetrics,
          });
        }

        const websiteVisits = mergedMetrics.website_visits as number | undefined;

        // Respect the toggle for the email itself only -- the metrics above
        // are persisted either way. No preference row at all means nobody's
        // touched it, which defaults to opted-in.
        const { data: prefRows } = await supabase
          .from("client_portal_preferences")
          .select("weekly_recap_email")
          .eq("client_account_id", client.id);
        const optedIn = !prefRows || prefRows.length === 0 || prefRows.some((p: { weekly_recap_email: boolean }) => p.weekly_recap_email !== false);
        if (!optedIn) {
          results[client.id] = `metrics saved, email skipped: opted out (leads=${leadsGenerated}, opens=${emailOpens})`;
          continue;
        }

        const statCards = [
          websiteVisits != null
            ? `<div style="flex:1;background:#f4f4f5;border-radius:8px;padding:16px;"><p style="margin:0;font-size:12px;color:#666;">Website Traffic</p><p style="margin:4px 0 0;font-size:24px;font-weight:bold;color:#1a1a1a;">${formatVisits(websiteVisits)}</p></div>`
            : "",
          `<div style="flex:1;background:#f4f4f5;border-radius:8px;padding:16px;"><p style="margin:0;font-size:12px;color:#666;">New Leads</p><p style="margin:4px 0 0;font-size:24px;font-weight:bold;color:#1a1a1a;">${leadsGenerated}</p></div>`,
        ].filter(Boolean).join("");

        const subject = `${client.business_name}'s weekly recap`;
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a1a1a;">Your weekly recap</h1>
            <p>Here's how ${client.business_name} did this past week (${periodStartStr} to ${periodEndStr}).</p>
            <div style="display:flex;gap:12px;margin:20px 0;">${statCards}</div>
            <a href="${portalUrl}" style="display: inline-block; background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Full Dashboard</a>
            <p style="color: #888; margin-top: 30px; font-size: 12px;">You're getting this because weekly recap emails are on for your portal account. Manage this anytime in Settings.</p>
          </div>
        `;

        await resend.emails.send({
          from: "Orange Door Consultants <hello@orangedoormarketing.com>",
          to: [client.email],
          subject,
          html,
        });

        await supabase.from("email_logs").insert({
          recipient_email: client.email,
          subject,
          status: "sent",
          metadata: {
            type: "weekly_recap",
            client_account_id: client.id,
            website_visits: websiteVisits ?? null,
            leads_generated: leadsGenerated,
            email_opens: emailOpens,
          },
        });

        // Client-visible confirmation that the recap actually went out --
        // shows up in the Home tab's Recent Activity feed.
        await logActivity(supabase, client.id, {
          type: "weekly_recap_sent",
          title: "Weekly recap emailed",
          description: `${leadsGenerated} new lead${leadsGenerated === 1 ? "" : "s"}${websiteVisits != null ? `, ${formatVisits(websiteVisits)} website visits` : ""} this week`,
          icon: "send",
          metadata: { website_visits: websiteVisits ?? null, leads_generated: leadsGenerated, email_opens: emailOpens },
        });

        results[client.id] = `sent: traffic=${websiteVisits ?? "n/a"}, leads=${leadsGenerated}, opens=${emailOpens}`;
      } catch (e) {
        results[client.id] = `error: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    return jsonResponse({ results });
  } catch (e) {
    console.error("send-weekly-recap failed:", e);
    return errorResponse(e);
  }
});
