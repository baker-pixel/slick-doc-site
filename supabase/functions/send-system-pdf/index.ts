import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PdfRequest {
  email: string;
  firstName?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, firstName }: PdfRequest = await req.json();
    
    console.log("Received PDF request for:", email);

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store the lead in the database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error: dbError } = await supabase
      .from("pdf_leads")
      .insert({ email, first_name: firstName, source: "system_brochure" });

    if (dbError) {
      console.error("Database error:", dbError);
    }

    // Generate the PDF download link (hosted PDF or generate dynamically)
    const pdfDownloadLink = `${supabaseUrl}/storage/v1/object/public/assets/SYSTEM-Brochure.pdf`;

    // Send email with download information
    const emailResponse = await resend.emails.send({
      from: "Orange Door Marketing <onboarding@resend.dev>",
      to: [email],
      subject: "Your SYSTEM Methodology Brochure is Ready!",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="background: linear-gradient(135deg, #f97316, #ea580c); width: 60px; height: 60px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
              <span style="color: white; font-weight: bold; font-size: 28px;">O</span>
            </div>
            <h1 style="color: #1a1a1a; margin: 0; font-size: 24px;">Orange Door Marketing</h1>
          </div>

          <h2 style="color: #1a1a1a; margin-bottom: 16px;">Hi${firstName ? ` ${firstName}` : ''},</h2>
          
          <p style="margin-bottom: 24px;">
            Thank you for your interest in the <strong>SYSTEM Methodology</strong>! We're excited to share our proven 6-step framework for building a complete digital marketing engine.
          </p>

          <div style="background: linear-gradient(135deg, #fff7ed, #ffedd5); border: 1px solid #fed7aa; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <h3 style="color: #c2410c; margin: 0 0 12px 0;">The 6-Step SYSTEM Framework:</h3>
            <ul style="margin: 0; padding-left: 20px; color: #78350f;">
              <li><strong>S</strong> - Search & Visibility</li>
              <li><strong>Y</strong> - Yield Optimization</li>
              <li><strong>S</strong> - Sequence & Nurture</li>
              <li><strong>T</strong> - Transaction Activation</li>
              <li><strong>E</strong> - Engagement & Retention</li>
              <li><strong>M</strong> - Metrics & Improvement</li>
            </ul>
          </div>

          <p style="margin-bottom: 24px;">
            This comprehensive guide explains each step in detail, including:
          </p>
          <ul style="margin-bottom: 24px; padding-left: 20px;">
            <li>What each step involves</li>
            <li>Key strategies and tactics</li>
            <li>Expected outcomes</li>
            <li>How it all works together</li>
          </ul>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${pdfDownloadLink}" style="display: inline-block; background: linear-gradient(135deg, #f97316, #ea580c); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Download Your PDF Brochure
            </a>
          </div>

          <p style="margin-bottom: 24px;">
            Ready to see how your business measures up? Take our free <strong>Gap Analysis</strong> to get a personalized SYSTEM Scorecard and recommendations.
          </p>

          <div style="text-align: center; margin: 24px 0;">
            <a href="https://orangedoormarketing.com/gap-analysis" style="display: inline-block; background: #1a1a1a; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">
              Start Your Free Gap Analysis →
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;">

          <p style="color: #666; font-size: 14px; text-align: center;">
            Questions? Just reply to this email - we'd love to hear from you!
          </p>
          
          <p style="color: #666; font-size: 14px; text-align: center;">
            Best regards,<br>
            <strong>The Orange Door Team</strong>
          </p>
        </body>
        </html>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-system-pdf function:", error);
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
