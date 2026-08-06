import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAdminAuth } from "../_shared/auth.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InviteRequest {
  invitationId: string;
  email: string;
  firstName?: string;
  businessName: string;
  token: string;
  portalOrigin?: string;
  password?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

      const _sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { invitationId, email, firstName, businessName, token, portalOrigin, password }: InviteRequest = await req.json();

    const auth = await checkAdminAuth(req, _sb, password);
    if (!auth.authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Sending client portal invitation to ${email} for ${businessName}`);

    // client_portal_users rows are only created when an invite is *accepted*,
    // never when sent -- so if this client account already has one, whoever
    // we're inviting now is joining an existing team, not setting up the
    // account for the first time. Determined server-side (not passed by the
    // caller) so it stays correct regardless of which flow triggers the send.
    const { data: invitationRow } = await _sb
      .from("client_invitations")
      .select("client_account_id")
      .eq("id", invitationId)
      .maybeSingle();
    let isFirstUser = true;
    if (invitationRow?.client_account_id) {
      const { count } = await _sb
        .from("client_portal_users")
        .select("id", { count: "exact", head: true })
        .eq("client_account_id", invitationRow.client_account_id);
      isFirstUser = !count;
    }

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prefer explicit portalOrigin; fall back to env var; fall back to request origin
    const origin = portalOrigin
      || Deno.env.get("CLIENT_PORTAL_URL")
      || req.headers.get("origin")
      || "https://client.orangedoormarketing.com";
    const inviteLink = `${origin}/portal/auth?invite=${token}`;

    const greeting = firstName ? `Hi ${firstName}` : "Hi there";
    const introCopy = isFirstUser
      ? `Great news -- <strong>${businessName}</strong>'s account is approved. Set up your login to get into your client portal:`
      : `You've been added as a collaborator on <strong>${businessName}</strong>'s account. Your portal gives you a
          direct line into the work in progress:`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Client Portal Invitation</title>
</head>
<body style="font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 40px 20px; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; margin: 0 auto;">
    <tr>
      <td style="padding-bottom: 28px;">
        <span style="font-size: 15px; font-weight: 700; letter-spacing: 0.02em; color: #1a1a1a;">ORANGE DOOR</span>
      </td>
    </tr>
    <tr>
      <td style="background: #ffffff; border: 1px solid #e5e5e5; border-radius: 10px; padding: 40px;">
        <p style="font-size: 15px; color: #1a1a1a; margin: 0 0 20px 0;">${greeting},</p>

        <p style="font-size: 15px; color: #3f3f46; margin: 0 0 20px 0;">
          ${introCopy}
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; margin: 0 0 28px 0;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #3f3f46;">Project progress and milestones</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #3f3f46;">Content review and approvals</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #3f3f46;">Performance analytics and reporting</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 14px; color: #3f3f46;">Invoices and payment history</td>
          </tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" bgcolor="#F97316" style="border-radius: 6px;">
              <a href="${inviteLink}"
                 style="display: inline-block; padding: 13px 28px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; border-radius: 6px; background-color: #F97316; mso-padding-alt: 13px 28px;">
                Set up your account
              </a>
            </td>
          </tr>
        </table>

        <p style="font-size: 13px; color: #71717a; margin: 28px 0 0 0;">
          This link expires in 7 days. If you weren't expecting this, you can ignore this email.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px 4px 0 4px; font-size: 12px; color: #a1a1aa;">
        <p style="margin: 0 0 4px 0;">Trouble with the button? Paste this link into your browser:</p>
        <p style="margin: 0; word-break: break-all;"><a href="${inviteLink}" style="color: #a1a1aa;">${inviteLink}</a></p>
        <p style="margin: 16px 0 0 0;">© ${new Date().getFullYear()} Orange Door Marketing</p>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Orange Door Consultants <hello@orangedoormarketing.com>",
        to: [email],
        subject: `You're invited to ${businessName}'s Client Portal`,
        html: htmlContent,
      }),
    });

    const emailResult = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Resend API error:", emailResult);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: emailResult }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully sent invitation email to ${email}, Resend ID: ${emailResult.id}`);

    return new Response(
      JSON.stringify({ success: true, messageId: emailResult.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending client invitation:", error);

    try {
      await _sb.from('automation_alerts').insert({
        alert_type: 'function_error',
        severity: 'error',
        title: `Error in send-client-invite`,
        message: error instanceof Error ? error.message : 'Unknown error',
        source: 'send-client-invite',
        metadata: {
          function_name: 'send-client-invite',
          client_id: null,
          error_message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (_alertErr) { console.error('Failed to log alert:', _alertErr); }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});