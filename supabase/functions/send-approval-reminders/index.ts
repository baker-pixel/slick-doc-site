import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { filterEngagedClients } from "../_shared/engagedClients.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_URL = "https://api.resend.com";

interface PendingApproval {
  id: string;
  client_account_id: string;
  title: string;
  content_type: string;
  submitted_at: string;
  reminder_sent_at: string | null;
}

function buildReminderEmail(
  firstName: string,
  businessName: string,
  approvals: PendingApproval[],
  portalUrl: string,
): { subject: string; html: string } {
  const count = approvals.length;
  const rows = approvals
    .map((a) => {
      const days = Math.floor((Date.now() - new Date(a.submitted_at).getTime()) / (1000 * 60 * 60 * 24));
      return `<tr>
        <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;">${a.title}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#999;white-space:nowrap;">waiting ${days} day${days === 1 ? "" : "s"}</td>
      </tr>`;
    })
    .join("");

  return {
    subject: count === 1
      ? `1 draft is waiting for your approval`
      : `${count} drafts are waiting for your approval`,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:20px auto;background:#ffffff;border-radius:8px;overflow:hidden;">
  <div style="background:#1a1a1a;padding:24px 40px;">
    <div style="color:#E8521A;font-weight:bold;font-size:13px;letter-spacing:2px;">ORANGE DOOR</div>
  </div>
  <div style="padding:30px 40px;font-size:15px;color:#444;line-height:1.7;">
    <p>Hi ${firstName},</p>
    <p>Just a friendly nudge — the following content for <strong>${businessName}</strong> is ready and waiting for your review:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#fafafa;border-radius:6px;">
      ${rows}
    </table>
    <p>Nothing goes live until you approve it, so a quick review keeps your marketing on schedule.</p>
    <div style="text-align:center;margin:25px 0;">
      <a href="${portalUrl}" style="display:inline-block;padding:14px 28px;background:#E8521A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Review &amp; Approve</a>
    </div>
    <p>— The Orange Door Team</p>
  </div>
</div>
</body></html>`,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "Orange Door <hello@orangedoormarketing.com>";
  const PORTAL_URL = Deno.env.get("APP_URL") || "https://client.orangedoormarketing.com";

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const now = Date.now();
    const submittedCutoff = new Date(now - 48 * 60 * 60 * 1000).toISOString();
    const reminderCutoff = new Date(now - 72 * 60 * 60 * 1000).toISOString();

    // Drafts pending >48h, not reminded in the last 72h. "pending" is the
    // canonical awaiting-client status the pipeline writes (the old
    // "pending_review" filter matched nothing — reminders never fired).
    const { data: pending, error: fetchErr } = await supabase
      .from("content_approvals")
      .select("id, client_account_id, title, content_type, submitted_at, reminder_sent_at")
      .eq("status", "pending")
      .lt("submitted_at", submittedCutoff)
      .or(`reminder_sent_at.is.null,reminder_sent_at.lt.${reminderCutoff}`);

    if (fetchErr) throw fetchErr;
    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ success: true, remindersSent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group per client
    const byClient = new Map<string, PendingApproval[]>();
    for (const a of pending as PendingApproval[]) {
      const list = byClient.get(a.client_account_id) ?? [];
      list.push(a);
      byClient.set(a.client_account_id, list);
    }

    const { data: rawClients } = await supabase
      .from("client_accounts")
      .select("id, business_name, email, first_name")
      .in("id", [...byClient.keys()])
      .eq("status", "active");

    // Skip clients whose portal invite was never accepted -- the reminder
    // links straight to portal login, which they can't use yet.
    const clients = await filterEngagedClients(supabase, rawClients ?? []);

    let remindersSent = 0;

    for (const client of clients ?? []) {
      const approvals = byClient.get(client.id)!;
      if (!client.email || !client.email.includes("@")) continue;

      const { subject, html } = buildReminderEmail(
        client.first_name || "there",
        client.business_name,
        approvals,
        `${PORTAL_URL}/portal`,
      );

      try {
        const res = await fetch(`${RESEND_API_URL}/emails`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({ from: EMAIL_FROM, to: [client.email], subject, html }),
        });

        if (res.ok) {
          await supabase
            .from("content_approvals")
            .update({ reminder_sent_at: new Date().toISOString() })
            .in("id", approvals.map((a) => a.id));
          remindersSent++;
          console.log(`Reminder sent to ${client.email} (${approvals.length} drafts)`);
        } else {
          console.error(`Reminder to ${client.email} failed:`, await res.text());
        }
      } catch (e) {
        console.error(`Reminder to ${client.email} errored:`, e);
      }
    }

    return new Response(JSON.stringify({ success: true, remindersSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-approval-reminders error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
