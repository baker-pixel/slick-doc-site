import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { handleOptions, jsonResponse, errorResponse } from "../_shared/http.ts";
import { checkAdminAuth } from "../_shared/auth.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Weekly cron (see migration 20260917170000): Monday 8am UTC, after the
// 5am sync-ga4-analytics pull. Emails each active client a real recap --
// website traffic (from client_analytics, GA4-sourced) and new leads (from
// prospects) -- unless every portal user on that account has turned the
// toggle off (client_portal_preferences.weekly_recap_email, default true).
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
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    for (const client of (clients ?? []) as ClientRow[]) {
      try {
        // No preference row at all means nobody's touched the toggle --
        // default to opted-in, same as the column's own DB default.
        const { data: prefRows } = await supabase
          .from("client_portal_preferences")
          .select("weekly_recap_email")
          .eq("client_account_id", client.id);
        const optedIn = !prefRows || prefRows.length === 0 || prefRows.some((p: { weekly_recap_email: boolean }) => p.weekly_recap_email !== false);
        if (!optedIn) {
          results[client.id] = "skipped: opted out";
          continue;
        }

        const [analyticsRes, leadsRes] = await Promise.all([
          supabase
            .from("client_analytics")
            .select("metrics")
            .eq("client_account_id", client.id)
            .order("period_end", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("prospects")
            .select("id", { count: "exact", head: true })
            .eq("client_id", client.id)
            .gte("created_at", sevenDaysAgo),
        ]);

        const websiteVisits = (analyticsRes.data?.metrics as { website_visits?: number } | undefined)?.website_visits;
        const leadsGenerated = leadsRes.count ?? 0;

        // Never send a recap with nothing real to say -- e.g. no GA4
        // property connected yet and no prospects this week.
        if (websiteVisits == null && leadsGenerated === 0) {
          results[client.id] = "skipped: no real data to report yet";
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
            <p>Here's how ${client.business_name} did this past week.</p>
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
          },
        });

        results[client.id] = `sent: traffic=${websiteVisits ?? "n/a"}, leads=${leadsGenerated}`;
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
