import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

function getTierLabel(score: number): string {
  if (score <= 39) return "Transformation";
  if (score <= 64) return "Growth";
  return "Optimization";
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
    const { prospectId } = await req.json();
    if (!prospectId) throw new Error("prospectId is required");

    // Fetch prospect
    const { data: prospect, error: fetchError } = await supabase
      .from("prospects")
      .select("*")
      .eq("id", prospectId)
      .single();

    if (fetchError || !prospect) throw new Error("Prospect not found");

    const score = prospect.gap_score;
    const weaknesses: string[] = prospect.top_weaknesses || [];
    const tierLabel = score != null ? getTierLabel(score) : "Growth";
    const firstName = prospect.name?.split(" ")[0] || "there";

    const weaknessHtml = weaknesses.length > 0
      ? weaknesses.map((w: string, i: number) => `<tr><td style="padding:8px 12px;font-weight:bold;color:#E8521A;vertical-align:top;width:30px;">${i + 1}.</td><td style="padding:8px 12px;">${w}</td></tr>`).join("")
      : `<tr><td style="padding:8px 12px;">We're putting the finishing touches on your full analysis.</td></tr>`;

    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;margin-top:20px;margin-bottom:20px;">
  <div style="background:#1a1a1a;padding:30px 40px;text-align:center;">
    <h1 style="color:#E8521A;margin:0;font-size:24px;">Orange Door Consulting</h1>
    <p style="color:#999;margin:8px 0 0;font-size:14px;">Your Free Website Marketing Report</p>
  </div>
  <div style="padding:30px 40px;">
    <p style="font-size:16px;color:#333;">Hi ${firstName},</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Thanks for checking your website with us! Here's what our AI found when it analyzed <strong>${prospect.website_url}</strong>.
    </p>

    ${score != null ? `
    <div style="text-align:center;margin:25px 0;">
      <div style="display:inline-block;width:100px;height:100px;border-radius:50%;background:${score >= 65 ? '#dcfce7' : score >= 40 ? '#fef9c3' : '#fee2e2'};line-height:100px;font-size:36px;font-weight:bold;color:${score >= 65 ? '#16a34a' : score >= 40 ? '#ca8a04' : '#dc2626'};">
        ${score}
      </div>
      <p style="margin:10px 0 0;font-size:14px;color:#888;">out of 100</p>
      <p style="margin:5px 0;font-size:16px;font-weight:bold;color:#333;">Recommended: ${tierLabel} Tier</p>
    </div>
    ` : ""}

    <h2 style="font-size:18px;color:#333;margin:25px 0 10px;">Your Top Areas to Improve</h2>
    <p style="font-size:14px;color:#666;margin-bottom:15px;">Here's where you're leaving the most customers on the table:</p>
    <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:6px;overflow:hidden;">
      ${weaknessHtml}
    </table>

    <div style="text-align:center;margin:30px 0;">
      <a href="https://slick-doc-site.lovable.app/schedule" style="display:inline-block;padding:14px 32px;background:#E8521A;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">Book a Free Strategy Call</a>
    </div>

    <p style="font-size:14px;color:#666;line-height:1.6;">
      We'll walk you through your report, answer any questions, and show you exactly how we'd fix these issues — no obligation, no sales pressure.
    </p>

    <p style="font-size:14px;color:#666;margin-top:25px;">
      Talk soon,<br><strong>The Orange Door Team</strong>
    </p>
  </div>
  <div style="background:#f5f5f5;padding:20px 40px;text-align:center;font-size:12px;color:#999;">
    Orange Door Consulting • AI-Powered Marketing for Local Businesses
  </div>
</div>
</body></html>`;

    // Send via Resend gateway
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "Orange Door Consultants <hello@orangedoormarketing.com>";

    if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
      throw new Error("Email API keys not configured");
    }

    const emailRes = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [prospect.email],
        subject: `Your free marketing report for ${prospect.website_url}`,
        html,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error("Resend error:", errText);
      throw new Error("Failed to send report email");
    }

    console.log(`Report email sent to ${prospect.email} for prospect ${prospectId}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-prospect-report error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
