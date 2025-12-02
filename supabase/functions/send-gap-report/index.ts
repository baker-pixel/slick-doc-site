import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScoreItem {
  category: string;
  label: string;
  score: number;
  status: string;
}

interface Recommendation {
  title: string;
  description: string;
  priority: string;
}

interface ReportEmailRequest {
  email: string;
  firstName: string;
  businessName: string;
  scorecard: {
    scores: ScoreItem[];
    overallScore: number;
    overallStatus: string;
  };
  analysis: {
    executiveSummary: string;
    strengths: string[];
    gaps: string[];
    recommendations: Recommendation[];
  };
}

const getScoreColor = (score: number): string => {
  if (score >= 70) return "#10b981";
  if (score >= 50) return "#eab308";
  if (score >= 30) return "#f97316";
  return "#ef4444";
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, firstName, businessName, scorecard, analysis }: ReportEmailRequest = await req.json();

    console.log("Sending gap report to:", email);

    const scoreRows = scorecard?.scores?.map((s) => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">
          <strong style="color: #f97316;">${s.category.replace('S2', 'S')}</strong> ${s.label}
        </td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
          <span style="color: ${getScoreColor(s.score)}; font-weight: bold;">${s.score}</span>
        </td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
          <span style="text-transform: capitalize; color: ${getScoreColor(s.score)};">${s.status}</span>
        </td>
      </tr>
    `).join("") || "";

    const strengthsList = analysis?.strengths?.map((s) => `<li style="margin-bottom: 6px; color: #374151;">${s}</li>`).join("") || "";
    const gapsList = analysis?.gaps?.map((g) => `<li style="margin-bottom: 6px; color: #374151;">${g}</li>`).join("") || "";
    const recommendationsList = analysis?.recommendations?.map((r) => `
      <div style="background: #f9fafb; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <strong style="color: #111827;">${r.title}</strong>
          <span style="background: #f97316; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${r.priority}</span>
        </div>
        <p style="margin: 0; color: #6b7280; font-size: 14px;">${r.description}</p>
      </div>
    `).join("") || "";

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Your SYSTEM Gap Report</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 32px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Your SYSTEM Gap Report</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Prepared for ${businessName}</p>
            </div>

            <!-- Content -->
            <div style="padding: 32px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                Hi ${firstName},
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                Thank you for completing the Orange Door Gap Analysis. Here's your comprehensive SYSTEM health assessment for ${businessName}.
              </p>

              <!-- Overall Score -->
              ${scorecard ? `
              <div style="text-align: center; padding: 24px; background: #fef7ed; border-radius: 12px; margin: 24px 0;">
                <div style="font-size: 48px; font-weight: bold; color: #f97316; margin-bottom: 8px;">
                  ${scorecard.overallScore}
                </div>
                <div style="color: #9a3412; font-size: 14px;">
                  ${scorecard.overallStatus}
                </div>
              </div>

              <!-- Scorecard Table -->
              <h2 style="color: #111827; font-size: 18px; margin: 24px 0 16px;">SYSTEM Breakdown</h2>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                <thead>
                  <tr style="background: #f9fafb;">
                    <th style="padding: 10px 12px; text-align: left; color: #6b7280; font-size: 12px; text-transform: uppercase;">Category</th>
                    <th style="padding: 10px 12px; text-align: center; color: #6b7280; font-size: 12px; text-transform: uppercase;">Score</th>
                    <th style="padding: 10px 12px; text-align: center; color: #6b7280; font-size: 12px; text-transform: uppercase;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${scoreRows}
                </tbody>
              </table>
              ` : ""}

              ${analysis?.executiveSummary ? `
              <!-- Executive Summary -->
              <h2 style="color: #111827; font-size: 18px; margin: 24px 0 12px;">Executive Summary</h2>
              <p style="color: #374151; font-size: 14px; line-height: 1.7; background: #f9fafb; padding: 16px; border-radius: 8px;">
                ${analysis.executiveSummary}
              </p>
              ` : ""}

              ${strengthsList ? `
              <!-- Strengths -->
              <h2 style="color: #111827; font-size: 18px; margin: 24px 0 12px;">✓ Key Strengths</h2>
              <ul style="padding-left: 20px; margin: 0;">
                ${strengthsList}
              </ul>
              ` : ""}

              ${gapsList ? `
              <!-- Gaps -->
              <h2 style="color: #111827; font-size: 18px; margin: 24px 0 12px;">⚠ Critical Gaps</h2>
              <ul style="padding-left: 20px; margin: 0;">
                ${gapsList}
              </ul>
              ` : ""}

              ${recommendationsList ? `
              <!-- Recommendations -->
              <h2 style="color: #111827; font-size: 18px; margin: 24px 0 12px;">💡 Top Recommendations</h2>
              ${recommendationsList}
              ` : ""}

              <!-- CTA -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="https://orangedoormarketing.com/contact" style="display: inline-block; background: #f97316; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600;">
                  Schedule Your Strategy Call
                </a>
              </div>

              <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
                Our team will reach out within 24-48 hours to schedule a complimentary strategy call where we'll dive deeper into your results and discuss how we can help grow your business.
              </p>
            </div>

            <!-- Footer -->
            <div style="background: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 14px; margin: 0;">
                Orange Door Consultants<br>
                East Tennessee's Growth Partner for SMBs
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const emailResponse = await resend.emails.send({
      from: "Orange Door Consultants <onboarding@resend.dev>",
      to: [email],
      subject: `Your SYSTEM Gap Report for ${businessName}`,
      html: emailHtml,
    });

    console.log("Report email sent:", emailResponse);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error sending gap report:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
