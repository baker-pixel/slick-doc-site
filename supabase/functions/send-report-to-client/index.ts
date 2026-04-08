import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

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
}

const formatJsonForEmail = (data: Record<string, unknown> | string | null): string => {
  if (!data) return "<p style='color: #6b7280;'>No data available</p>";
  
  if (typeof data === "string") {
    return `<p>${data.replace(/\n/g, "<br>")}</p>`;
  }
  
  // Handle object data
  const entries = Object.entries(data);
  if (entries.length === 0) return "<p style='color: #6b7280;'>No data available</p>";
  
  return entries.map(([key, value]) => {
    const formattedKey = key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
    const formattedValue = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
    return `<div style="margin-bottom: 8px;"><strong>${formattedKey}:</strong> ${formattedValue}</div>`;
  }).join("");
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
    }: ReportEmailRequest = await req.json();

    console.log(`Sending report to ${clientEmail} for ${businessName}`);

    const formattedPeriod = `${new Date(periodStart).toLocaleDateString("en-US", { month: "long", day: "numeric" })} - ${new Date(periodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;

    const emailResponse = await resend.emails.send({
      from: "Orange Door Marketing <hello@orangedoormarketing.com>",
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
                ${formatJsonForEmail(metrics as Record<string, unknown>)}
              </div>
            </div>
            ` : ""}
            
            ${insights ? `
            <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h2 style="font-size: 16px; color: #92400e; margin: 0 0 15px 0; display: flex; align-items: center;">
                💡 Insights
              </h2>
              <div style="font-size: 14px; color: #374151;">
                ${formatJsonForEmail(insights as Record<string, unknown>)}
              </div>
            </div>
            ` : ""}
            
            ${recommendations ? `
            <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h2 style="font-size: 16px; color: #166534; margin: 0 0 15px 0; display: flex; align-items: center;">
                🎯 Recommendations
              </h2>
              <div style="font-size: 14px; color: #374151;">
                ${formatJsonForEmail(recommendations as Record<string, unknown>)}
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
      const _sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
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
      }).catch(console.error);
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
