import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ContentEmailRequest {
  contentId: string;
  clientEmail: string;
  clientName: string;
  businessName: string;
  contentTitle: string;
  contentType: string;
  content: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      clientEmail, 
      clientName, 
      businessName, 
      contentTitle, 
      contentType, 
      content 
    }: ContentEmailRequest = await req.json();

    console.log(`Sending content to ${clientEmail} for ${businessName}`);

    // Format content for email (convert newlines to breaks)
    const formattedContent = content.replace(/\n/g, "<br>");

    const emailResponse = await resend.emails.send({
      from: "Orange Door Marketing <onboarding@resend.dev>",
      to: [clientEmail],
      subject: `New ${contentType}: ${contentTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #f97316, #ea580c); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">New Content Ready!</h1>
          </div>
          
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; margin-bottom: 20px;">
              Hi ${clientName},
            </p>
            
            <p style="font-size: 16px; margin-bottom: 20px;">
              We've prepared new ${contentType.toLowerCase()} content for <strong>${businessName}</strong> that's ready for your review.
            </p>
            
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h2 style="font-size: 18px; color: #111827; margin: 0 0 15px 0; border-bottom: 2px solid #f97316; padding-bottom: 10px;">
                ${contentTitle}
              </h2>
              <p style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 15px;">
                ${contentType}
              </p>
              <div style="font-size: 14px; color: #374151; white-space: pre-wrap;">
                ${formattedContent}
              </div>
            </div>
            
            <p style="font-size: 14px; color: #6b7280; margin-top: 25px;">
              If you have any questions or would like to request changes, please don't hesitate to reach out.
            </p>
            
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

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-content-to-client function:", error);
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
