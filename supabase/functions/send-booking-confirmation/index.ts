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
  rawDate: string; // ISO date string for calendar
}

// Parse time string like "9:00 AM" to hours and minutes
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return { hours: 9, minutes: 0 };
  
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  
  return { hours, minutes };
}

// Format date for ICS (YYYYMMDDTHHMMSS)
function formatICSDate(dateStr: string, timeStr: string): string {
  const date = new Date(dateStr);
  const { hours, minutes } = parseTime(timeStr);
  
  date.setHours(hours, minutes, 0, 0);
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(hours).padStart(2, '0');
  const min = String(minutes).padStart(2, '0');
  
  return `${year}${month}${day}T${hour}${min}00`;
}

// Generate ICS file content
function generateICS(
  firstName: string,
  lastName: string,
  email: string,
  businessName: string,
  rawDate: string,
  time: string
): string {
  const startDate = formatICSDate(rawDate, time);
  
  // Add 30 minutes for end time
  const { hours, minutes } = parseTime(time);
  const endMinutes = minutes + 30;
  const endHours = hours + Math.floor(endMinutes / 60);
  const endMins = endMinutes % 60;
  
  const date = new Date(rawDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const endDate = `${year}${month}${day}T${String(endHours).padStart(2, '0')}${String(endMins).padStart(2, '0')}00`;
  
  const uid = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@orangedoor.com`;
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Orange Door Consultants//Strategy Call//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${now}
DTSTART;TZID=America/New_York:${startDate}
DTEND;TZID=America/New_York:${endDate}
SUMMARY:Strategy Call with Orange Door Consultants
DESCRIPTION:30-minute strategy call to review your marketing performance and identify growth opportunities for ${businessName}.\\n\\nAttendee: ${firstName} ${lastName}\\nEmail: ${email}\\n\\nWe'll discuss:\\n- Current marketing performance\\n- Quick wins and opportunities\\n- Customized recommendations
ORGANIZER;CN=Orange Door Consultants:mailto:hello@orangedoor.com
ATTENDEE;CN=${firstName} ${lastName};RSVP=TRUE:mailto:${email}
STATUS:CONFIRMED
SEQUENCE:0
BEGIN:VALARM
TRIGGER:-PT15M
ACTION:DISPLAY
DESCRIPTION:Strategy Call with Orange Door Consultants starts in 15 minutes
END:VALARM
END:VEVENT
END:VCALENDAR`;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-booking-confirmation function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { firstName, lastName, email, businessName, date, time, rawDate }: BookingRequest = await req.json();
    
    console.log(`Sending booking confirmation to ${email} for ${date} at ${time}`);

    // Generate ICS calendar file
    const icsContent = generateICS(firstName, lastName, email, businessName, rawDate, time);
    const icsBase64 = btoa(icsContent);

    console.log("Generated ICS file for calendar attachment");

    const emailResponse = await resend.emails.send({
      from: "Orange Door Consultants <hello@orangedoormarketing.com>",
      reply_to: "hello@orangedoormarketing.com",
      to: [email],
      subject: "Your Strategy Call is Booked! 🎯",
      attachments: [
        {
          filename: "strategy-call.ics",
          content: icsBase64,
        },
      ],
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
                    <h1 style="margin: 0; color: #1a1a1a; font-size: 24px;">Orange Door Consultants</h1>
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
                  
                  <!-- Calendar Button -->
                  <div style="text-align: center; margin-bottom: 24px;">
                    <p style="color: #4a5568; font-size: 14px; margin-bottom: 8px;">
                      📎 We've attached a calendar file (.ics) - open it to add this event to your calendar!
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
                      <strong>Next Steps:</strong> We'll send you a meeting link closer to your appointment. If you need to reschedule, simply reply to this email.
                    </p>
                  </div>
                  
                  <!-- Footer -->
                  <div style="border-top: 1px solid #e2e8f0; padding-top: 24px; text-align: center;">
                    <p style="color: #718096; font-size: 14px; margin: 0 0 8px 0;">
                      Questions? Reply to this email or call us.
                    </p>
                    <p style="color: #a0aec0; font-size: 12px; margin: 0;">
                      Orange Door Consultants | East Tennessee
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

    try {
      const _sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await _sb.from('automation_alerts').insert({
        alert_type: 'function_error',
        severity: 'error',
        title: `Error in send-booking-confirmation`,
        message: error instanceof Error ? error.message : 'Unknown error',
        source: 'send-booking-confirmation',
        metadata: {
          function_name: 'send-booking-confirmation',
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
