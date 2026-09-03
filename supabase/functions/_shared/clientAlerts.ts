import { filterEngagedClients } from "./engagedClients.ts";

const RESEND_API_URL = "https://api.resend.com";

interface BlockerParams {
  /** Groups related alerts and doubles as the dedupe key alongside title. */
  notificationType: string;
  title: string;
  description: string;
  /** Don't re-notify for the same title within this window. Default 24h. */
  dedupeHours?: number;
}

function buildBlockerEmail(firstName: string, title: string, description: string, portalUrl: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:20px auto;background:#ffffff;border-radius:8px;overflow:hidden;">
  <div style="background:#1a1a1a;padding:24px 40px;">
    <div style="color:#E8521A;font-weight:bold;font-size:13px;letter-spacing:2px;">ORANGE DOOR</div>
  </div>
  <div style="padding:30px 40px;font-size:15px;color:#444;line-height:1.7;">
    <p>Hi ${firstName},</p>
    <p><strong>${title}</strong></p>
    <p>${description}</p>
    <div style="text-align:center;margin:25px 0;">
      <a href="${portalUrl}" style="display:inline-block;padding:14px 28px;background:#E8521A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Open Your Portal</a>
    </div>
    <p>— The Orange Door Team</p>
  </div>
</div>
</body></html>`;
}

// Fires whenever automation hits something only the client can fix (a
// disconnected platform, a missing WP plugin, etc). Writes the in-portal
// notification bell (client_notifications) and, best-effort, an email via
// Resend -- deduped per (client, notification_type, title) so a cron retrying
// every 15 min doesn't re-email the client every cycle while the blocker
// stays unresolved.
export async function notifyClientBlocked(
  supabase: any,
  clientId: string,
  params: BlockerParams,
): Promise<void> {
  if (!clientId) return;
  const dedupeHours = params.dedupeHours ?? 24;
  const cutoff = new Date(Date.now() - dedupeHours * 60 * 60 * 1000).toISOString();

  const { data: recent } = await supabase
    .from("client_notifications")
    .select("id")
    .eq("client_account_id", clientId)
    .eq("notification_type", params.notificationType)
    .eq("title", params.title)
    .gt("created_at", cutoff)
    .limit(1);
  if (recent && recent.length > 0) return;

  await supabase.from("client_notifications").insert({
    client_account_id: clientId,
    notification_type: params.notificationType,
    title: params.title,
    description: params.description,
    priority: "high",
    is_read: false,
  });

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) return;

    const { data: client } = await supabase
      .from("client_accounts")
      .select("email, first_name, status")
      .eq("id", clientId)
      .eq("status", "active")
      .maybeSingle();
    if (!client?.email || !client.email.includes("@")) return;

    // Same as send-approval-reminders -- don't email a portal link to
    // someone who never accepted the invite and can't log in yet.
    const [engaged] = await filterEngagedClients(supabase, [{ id: clientId }]);
    if (!engaged) return;

    const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "Orange Door <hello@orangedoormarketing.com>";
    const PORTAL_URL = Deno.env.get("CLIENT_PORTAL_URL") || "https://client.orangedoormarketing.com";

    const res = await fetch(`${RESEND_API_URL}/emails`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [client.email],
        subject: params.title,
        html: buildBlockerEmail(client.first_name || "there", params.title, params.description, `${PORTAL_URL}/portal`),
      }),
    });
    if (!res.ok) console.error(`notifyClientBlocked email to ${client.email} failed:`, await res.text());
  } catch (e) {
    console.error("notifyClientBlocked email send errored:", e instanceof Error ? e.message : e);
  }
}
