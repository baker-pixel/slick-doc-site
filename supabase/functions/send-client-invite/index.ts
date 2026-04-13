import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { invitationId, email, firstName, businessName, token }: InviteRequest = await req.json();

    console.log(`Sending client portal invitation to ${email} for ${businessName}`);

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the origin from the request or use a default
    const origin = req.headers.get("origin") || "https://orangedoormarketing.com";
    const inviteLink = `${origin}/portal/auth?invite=${token}`;

    const greeting = firstName ? `Hi ${firstName}` : "Hi there";

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Client Portal Invitation</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
  <div style="background: linear-gradient(135deg, #F97316 0%, #EA580C 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Orange Door Marketing</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Client Portal</p>
  </div>
  
  <div style="background: white; padding: 40px 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <h2 style="color: #1a1a1a; margin-top: 0;">${greeting},</h2>
    
    <p style="font-size: 16px; color: #4a4a4a;">
      You've been invited to access <strong>${businessName}</strong>'s client portal at Orange Door Marketing.
    </p>
    
    <p style="font-size: 16px; color: #4a4a4a;">
      Through your portal, you'll be able to:
    </p>
    
    <ul style="color: #4a4a4a; font-size: 15px; padding-left: 20px;">
      <li style="margin-bottom: 8px;">📊 View project progress and milestones</li>
      <li style="margin-bottom: 8px;">✅ Review and approve content</li>
      <li style="margin-bottom: 8px;">📈 Access performance analytics</li>
      <li style="margin-bottom: 8px;">💳 View invoices and payment history</li>
    </ul>
    
    <div style="text-align: center; margin: 35px 0;">
      <a href="${inviteLink}" 
         style="background: linear-gradient(135deg, #F97316 0%, #EA580C 100%); 
                color: white; 
                padding: 16px 40px; 
                text-decoration: none; 
                border-radius: 8px; 
                font-weight: 600; 
                font-size: 16px; 
                display: inline-block;
                box-shadow: 0 4px 14px rgba(249, 115, 22, 0.4);">
        Accept Invitation
      </a>
    </div>
    
    <p style="font-size: 14px; color: #666; margin-top: 30px;">
      This invitation expires in 7 days. If you didn't expect this invitation, you can safely ignore this email.
    </p>
    
    <p style="font-size: 13px; color: #999; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
      Can't click the button? Copy and paste this link into your browser:<br>
      <a href="${inviteLink}" style="color: #F97316; word-break: break-all;">${inviteLink}</a>
    </p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
    <p style="margin: 0;">© ${new Date().getFullYear()} Orange Door Marketing. All rights reserved.</p>
  </div>
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
        from: "Orange Door Marketing <hello@orangedoormarketing.com>",
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
      const _sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
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