import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BookingRequest {
  firstName: string;
  lastName: string;
  email: string;
  businessName: string;
  date: string;
  time: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-booking-confirmation function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { firstName, lastName, email, businessName, date, time }: BookingRequest = await req.json();
    
    console.log(`Sending booking confirmation to ${email} for ${date} at ${time}`);

    const emailResponse = await resend.emails.send({
      from: "Orange Door Marketing <onboarding@resend.dev>",
      to: [email],
      subject: "Your Strategy Call is Booked! 🎯",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa;">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <tr>
              <td>
                <div style="background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                  <!-- Logo/Header -->
                  <div style="text-align: center; margin-bottom: 32px;">
                    <div style="display: inline-block; width: 50px; height: 50px; background-color: #F97316; border-radius: 10px; line-height: 50px; font-size: 28px; font-weight: bold; color: white;">O</div>
                    <h1 style="margin: 16px 0 0 0; color: #1a1a1a; font-size: 24px;">Orange Door Marketing</h1>
                  </div>
                  
                  <!-- Main Content -->
                  <h2 style="color: #1a1a1a; font-size: 22px; margin-bottom: 16px; text-align: center;">
                    You're All Set, ${firstName}! 🎉
                  </h2>
                  
                  <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                    Thank you for scheduling a strategy call with us. We're excited to learn more about ${businessName} and explore how we can help grow your digital presence.
                  </p>
                  
                  <!-- Appointment Details Box -->
                  <div style="background-color: #FFF7ED; border: 2px solid #F97316; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
                    <h3 style="color: #F97316; margin: 0 0 16px 0; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">Your Appointment</h3>
                    <p style="color: #1a1a1a; font-size: 18px; margin: 0 0 8px 0; font-weight: 600;">
                      📅 ${date}
                    </p>
                    <p style="color: #1a1a1a; font-size: 18px; margin: 0; font-weight: 600;">
                      🕐 ${time} (Eastern Time)
                    </p>
                  </div>
                  
                  <!-- What to Expect -->
                  <h3 style="color: #1a1a1a; font-size: 18px; margin-bottom: 12px;">What to Expect:</h3>
                  <ul style="color: #4a5568; font-size: 15px; line-height: 1.8; padding-left: 20px; margin-bottom: 24px;">
                    <li>A 30-minute focused conversation about your business</li>
                    <li>Review of your current marketing performance</li>
                    <li>Identification of quick wins and opportunities</li>
                    <li>Customized recommendations (no obligation)</li>
                  </ul>
                  
                  <!-- Next Steps -->
                  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                    <p style="color: #4a5568; font-size: 14px; margin: 0;">
                      <strong>Next Steps:</strong> We'll send you a calendar invite with a video meeting link within 24 hours. If you need to reschedule, simply reply to this email.
                    </p>
                  </div>
                  
                  <!-- Footer -->
                  <div style="border-top: 1px solid #e2e8f0; padding-top: 24px; text-align: center;">
                    <p style="color: #718096; font-size: 14px; margin: 0 0 8px 0;">
                      Questions? Reply to this email or call us.
                    </p>
                    <p style="color: #a0aec0; font-size: 12px; margin: 0;">
                      Orange Door Marketing | East Tennessee
                    </p>
                  </div>
                </div>
              </td>
            </tr>
          </table>
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
    console.error("Error in send-booking-confirmation function:", error);
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
