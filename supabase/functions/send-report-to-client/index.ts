import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { checkAdminAuth } from "../_shared/auth.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReportEmailRequest {
  reportId: string;
  clientEmail: string;
  clientName: string;
  businessName: string;
  reportType: string;
  periodStart: string;
  periodEnd: string;
  metrics: Record<string, unknown> | null;
  insights: Record<string, unknown> | null;
  recommendations: Record<string, unknown> | null;
  password?: string;
}

const NO_DATA = "<p style='color: #6b7280;'>No data available</p>";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const priorityColor: Record<string, string> = {
  high: "#dc2626",
  medium: "#d97706",
  low: "#65a30d",
};

/** Metrics is a flat key/value object -- generic label: value rendering is fine here. */
const formatMetricsForEmail = (data: Record<string, unknown> | string | null): string => {
  if (!data) return NO_DATA;
  if (typeof data === "string") return `<p>${escapeHtml(data).replace(/\n/g, "<br>")}</p>`;
  const entries = Object.entries(data);
  if (entries.length === 0) return NO_DATA;
  return entries.map(([key, value]) => {
    const formattedKey = key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
    return `<div style="margin-bottom: 8px;"><strong>${escapeHtml(formattedKey)}:</strong> ${escapeHtml(String(value))}</div>`;
  }).join("");
};

/** Insights is an array of plain-text strings (or legacy free text) -- render as a bulleted list. */
const formatInsightsForEmail = (data: unknown): string => {
  if (!data) return NO_DATA;
  if (typeof data === "string") return `<p>${escapeHtml(data).replace(/\n/g, "<br>")}</p>`;
  if (Array.isArray(data)) {
    if (data.length === 0) return NO_DATA;
    return `<ul style="margin: 0; padding-left: 20px;">${data.map((item) => `<li style="margin-bottom: 6px;">${escapeHtml(String(item))}</li>`).join("")}</ul>`;
  }
  // Legacy shape from before this was a proper array: { summary: "..." }
  if (typeof data === "object" && data !== null && "summary" in data) {
    return `<p>${escapeHtml(String((data as Record<string, unknown>).summary)).replace(/\n/g, "<br>")}</p>`;
  }
  return NO_DATA;
};

/** Recommendations is an array of { priority, action, expected_impact } objects. */
const formatRecommendationsForEmail = (data: unknown): string => {
  if (!data) return NO_DATA;
  if (typeof data === "string") return `<p>${escapeHtml(data).replace(/\n/g, "<br>")}</p>`;
  if (Array.isArray(data)) {
    if (data.length === 0) return NO_DATA;
    return data.map((item) => {
      if (typeof item !== "object" || item === null) return `<div style="margin-bottom: 8px;">${escapeHtml(String(item))}</div>`;
      const rec = item as { priority?: string; action?: string; expected_impact?: string };
      const color = priorityColor[rec.priority?.toLowerCase() ?? ""] ?? "#6b7280";
      return `
        <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #d1fae5;">
          ${rec.priority ? `<span style="display: inline-block; font-size: 11px; font-weight: 600; text-transform: uppercase; color: ${color};">${escapeHtml(rec.priority)} priority</span><br>` : ""}
          <strong>${escapeHtml(rec.action ?? "")}</strong>
          ${rec.expected_impact ? `<div style="color: #6b7280; font-size: 13px; margin-top: 2px;">Expected impact: ${escapeHtml(rec.expected_impact)}</div>` : ""}
        </div>`;
    }).join("");
  }
  // Legacy shape: { content: "..." }
  if (typeof data === "object" && data !== null && "content" in data) {
    return `<p>${escapeHtml(String((data as Record<string, unknown>).content)).replace(/\n/g, "<br>")}</p>`;
  }
  return NO_DATA;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

      const _sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { 
      clientEmail, 
      clientName, 
      businessName, 
      reportType,
      periodStart,
      periodEnd,
      metrics,
      insights,
      recommendations,
      password,
    }: ReportEmailRequest = await req.json();

    const auth = await checkAdminAuth(req, _sb, password);
    if (!auth.authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Sending report to ${clientEmail} for ${businessName}`);

    const formattedPeriod = `${new Date(periodStart).toLocaleDateString("en-US", { month: "long", day: "numeric" })} - ${new Date(periodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;

    const emailResponse = await resend.emails.send({
      from: "Orange Door Consultants <hello@orangedoormarketing.com>",
      to: [clientEmail],
      subject: `Your ${reportType} Report is Ready - ${businessName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background: linear-gradient(135deg, #f97316, #ea580c); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">📊 ${reportType} Report</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">${formattedPeriod}</p>
          </div>
          
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; margin-bottom: 20px;">
              Hi ${clientName},
            </p>
            
            <p style="font-size: 16px; margin-bottom: 25px;">
              Your ${reportType.toLowerCase()} marketing report for <strong>${businessName}</strong> is ready. Here's a summary of your performance and our recommendations.
            </p>
            
            ${metrics ? `
            <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h2 style="font-size: 16px; color: #1e40af; margin: 0 0 15px 0; display: flex; align-items: center;">
                📈 Key Metrics
              </h2>
              <div style="font-size: 14px; color: #374151;">
                ${formatMetricsForEmail(metrics as Record<string, unknown>)}
              </div>
            </div>
            ` : ""}
            
            ${insights ? `
            <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h2 style="font-size: 16px; color: #92400e; margin: 0 0 15px 0; display: flex; align-items: center;">
                💡 Insights
              </h2>
              <div style="font-size: 14px; color: #374151;">
                ${formatInsightsForEmail(insights)}
              </div>
            </div>
            ` : ""}
            
            ${recommendations ? `
            <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h2 style="font-size: 16px; color: #166534; margin: 0 0 15px 0; display: flex; align-items: center;">
                🎯 Recommendations
              </h2>
              <div style="font-size: 14px; color: #374151;">
                ${formatRecommendationsForEmail(recommendations)}
              </div>
            </div>
            ` : ""}
            
            <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin-top: 25px; text-align: center;">
              <p style="font-size: 14px; color: #6b7280; margin: 0 0 10px 0;">
                Want to discuss this report or have questions?
              </p>
              <p style="font-size: 14px; color: #374151; margin: 0;">
                Reply to this email or schedule a call with your account manager.
              </p>
            </div>
            
            <p style="font-size: 16px; margin-top: 25px;">
              Best regards,<br>
              <strong>The Orange Door Marketing Team</strong>
            </p>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
            <p>Orange Door Marketing • Helping businesses grow</p>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Report email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-report-to-client function:", error);

    try {
      await _sb.from('automation_alerts').insert({
        alert_type: 'function_error',
        severity: 'error',
        title: `Error in send-report-to-client`,
        message: error instanceof Error ? error.message : 'Unknown error',
        source: 'send-report-to-client',
        metadata: {
          function_name: 'send-report-to-client',
          client_id: null,
          error_message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (_alertErr) { console.error('Failed to log alert:', _alertErr); }
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
