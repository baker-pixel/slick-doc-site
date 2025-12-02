import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResumeEmailRequest {
  email: string;
  firstName: string;
  resumeToken: string;
  currentStep: number;
  totalSteps: number;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, firstName, resumeToken, currentStep, totalSteps }: ResumeEmailRequest = await req.json();

    console.log("Sending resume link to:", email);

    const resumeUrl = `https://orangedoormarketing.com/gap-analysis?resume=${resumeToken}`;
    const progress = Math.round((currentStep / totalSteps) * 100);

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; margin: 0; padding: 20px;">
          <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 24px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 20px;">Continue Your Gap Analysis</h1>
            </div>

            <div style="padding: 24px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-top: 0;">
                Hi ${firstName},
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                We saved your progress! You're <strong>${progress}%</strong> complete with your SYSTEM Gap Analysis.
              </p>

              <div style="background: #fef7ed; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                  <span style="color: #9a3412; font-weight: 600;">Progress: ${currentStep} of ${totalSteps} steps</span>
                </div>
                <div style="background: #fed7aa; border-radius: 4px; height: 8px; overflow: hidden;">
                  <div style="background: #f97316; height: 100%; width: ${progress}%;"></div>
                </div>
              </div>

              <div style="text-align: center; margin: 24px 0;">
                <a href="${resumeUrl}" style="display: inline-block; background: #f97316; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600;">
                  Continue Where You Left Off →
                </a>
              </div>

              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-bottom: 0;">
                This link will take you directly back to your assessment. Your answers have been saved.
              </p>
            </div>

            <div style="background: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 12px; margin: 0;">
                Orange Door Consultants • East Tennessee's Growth Partner
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const emailResponse = await resend.emails.send({
      from: "Orange Door Consultants <hello@orangedoormarketing.com>",
      to: [email],
      subject: "Continue Your Gap Analysis - Progress Saved!",
      html: emailHtml,
    });

    console.log("Resume email sent:", emailResponse);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error sending resume email:", error);
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
