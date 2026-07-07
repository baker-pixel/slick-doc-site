import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ADMIN_EMAIL = "yash.ch@navtech.io";
const FROM_EMAIL  = "Orange Door System <alerts@orangedoormarketing.com>";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Fetch unacknowledged error/warning alerts from the last 2 hours
    const windowStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    // Only alert on hard errors — batch_complete/info warnings are noise
    const { data: alerts, error } = await supabase
      .from("automation_alerts")
      .select("id, alert_type, severity, title, message, source, source_id, created_at, metadata")
      .is("acknowledged_at", null)
      .eq("severity", "error")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!alerts || alerts.length === 0) {
      return new Response(JSON.stringify({ sent: false, reason: "no_alerts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const errorCount   = alerts.length;
    const warningCount = 0;

    const rows = alerts.map(a => `
      <tr style="border-bottom:1px solid #E4E2DC;">
        <td style="padding:10px 12px;font-family:monospace;font-size:12px;color:${a.severity === "error" ? "#DC2626" : "#D97706"};">
          ${a.severity.toUpperCase()}
        </td>
        <td style="padding:10px 12px;font-size:13px;font-weight:600;">${escapeHtml(a.title)}</td>
        <td style="padding:10px 12px;font-size:12px;color:#6B6B6F;">${escapeHtml(a.source)}</td>
        <td style="padding:10px 12px;font-size:12px;color:#6B6B6F;">
          ${new Date(a.created_at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} ET
        </td>
        <td style="padding:10px 12px;font-size:12px;">${escapeHtml(a.message)}</td>
      </tr>`).join("");

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F9F8F5;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:720px;margin:32px auto;background:#fff;border:1px solid #E4E2DC;border-radius:8px;overflow:hidden;">

    <div style="background:#1E3A5F;padding:20px 28px;display:flex;align-items:center;gap:12px;">
      <div style="background:#F97316;width:28px;height:28px;border-radius:6px;display:inline-block;"></div>
      <div>
        <div style="color:#fff;font-size:15px;font-weight:700;">Orange Door — System Alerts</div>
        <div style="color:rgba(255,255,255,.6);font-size:12px;font-family:monospace;">axbeaqpjyzzmbvyaofbn</div>
      </div>
    </div>

    <div style="padding:24px 28px;">
      <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#18181A;">
        ${errorCount > 0 ? `⚠️ ${errorCount} error${errorCount !== 1 ? "s" : ""}` : ""}
        ${warningCount > 0 ? `${errorCount > 0 ? " · " : ""}${warningCount} warning${warningCount !== 1 ? "s" : ""}` : ""}
        <span style="font-weight:400;color:#6B6B6F;font-size:16px;"> in the last 2 hours</span>
      </p>
      <p style="margin:0 0 24px;color:#6B6B6F;font-size:13px;">
        These require your attention. Acknowledge them in the admin panel or the alerts will repeat next check.
      </p>

      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#F9F8F5;">
              <th style="padding:8px 12px;text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#6B6B6F;border-bottom:2px solid #E4E2DC;">Severity</th>
              <th style="padding:8px 12px;text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#6B6B6F;border-bottom:2px solid #E4E2DC;">Title</th>
              <th style="padding:8px 12px;text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#6B6B6F;border-bottom:2px solid #E4E2DC;">Source</th>
              <th style="padding:8px 12px;text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#6B6B6F;border-bottom:2px solid #E4E2DC;">Time</th>
              <th style="padding:8px 12px;text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#6B6B6F;border-bottom:2px solid #E4E2DC;">Message</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div style="margin-top:24px;padding:16px;background:#FEF2F2;border-left:4px solid #DC2626;border-radius:4px;">
        <p style="margin:0;font-size:13px;color:#DC2626;font-weight:600;">Action required</p>
        <p style="margin:4px 0 0;font-size:13px;color:#6B6B6F;">
          Review the admin alerts panel and acknowledge resolved issues to stop repeat notifications.
        </p>
      </div>
    </div>

    <div style="padding:16px 28px;background:#F9F8F5;border-top:1px solid #E4E2DC;font-size:11px;color:#6B6B6F;font-family:monospace;">
      Automated alert — ${new Date().toUTCString()} · Orange Door Marketing
    </div>
  </div>
</body>
</html>`;

    // Send via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not set");

    const sendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [ADMIN_EMAIL],
        subject: `[Orange Door] ${errorCount > 0 ? `${errorCount} error${errorCount !== 1 ? "s" : ""}` : `${warningCount} warning${warningCount !== 1 ? "s" : ""}`} — action required`,
        html,
      }),
    });

    if (!sendResp.ok) {
      const errText = await sendResp.text();
      throw new Error(`Resend error ${sendResp.status}: ${errText}`);
    }

    // Do NOT auto-acknowledge here. The email tells the admin to acknowledge
    // in the admin panel or the alert repeats next check (30 min) -- that
    // promise only holds if sending the digest doesn't itself mark the alert
    // resolved. Auto-acknowledging on send meant every alert was silently
    // marked "acknowledged by check-alerts-cron" the instant the email went
    // out, whether or not anyone read it or fixed anything, so unresolved
    // errors could vanish from the radar after exactly one notification.

    console.log(`check-alerts: sent digest for ${alerts.length} alerts (${errorCount} errors, ${warningCount} warnings)`);

    return new Response(
      JSON.stringify({ sent: true, count: alerts.length, errorCount, warningCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("check-alerts error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escapeHtml(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
