import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Optimal send windows (in local time)
const OPTIMAL_SEND_WINDOWS = {
  default: { start: 9, end: 17 }, // 9am-5pm
  marketing: { start: 10, end: 14 }, // 10am-2pm
};

// Calculate next optimal send time
function getNextOptimalSendTime(baseTime: Date, timezone: string): Date {
  const localHour = getHourInTimezone(baseTime, timezone);
  const window = OPTIMAL_SEND_WINDOWS.default;
  
  // If within optimal window, return as-is
  if (localHour >= window.start && localHour < window.end) {
    return baseTime;
  }
  
  // Calculate next optimal time
  const result = new Date(baseTime);
  
  if (localHour >= window.end) {
    // After window - schedule for next day
    result.setDate(result.getDate() + 1);
  }
  
  // Set to start of optimal window
  const offset = getTimezoneOffset(timezone);
  result.setUTCHours(window.start - offset / 60, 0, 0, 0);
  
  return result;
}

// Get current hour in a specific timezone
function getHourInTimezone(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone
    });
    return parseInt(formatter.format(date));
  } catch {
    return date.getUTCHours() - 5; // Default to EST
  }
}

// Get timezone offset in minutes
function getTimezoneOffset(timezone: string): number {
  const offsets: Record<string, number> = {
    "America/New_York": -300,
    "America/Chicago": -360,
    "America/Denver": -420,
    "America/Los_Angeles": -480,
    "America/Anchorage": -540,
    "Pacific/Honolulu": -600,
    "UTC": 0,
  };
  return offsets[timezone] ?? -300;
}

// Email templates
const templates: Record<string, (data: any) => { subject: string; html: string }> = {
  immediate_report: (data) => ({
    subject: "Your SYSTEM Gap Report is Ready!",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #F97316;">Hi ${data.firstName}!</h1>
        <p>Great news - your personalized SYSTEM Gap Report is ready.</p>
        <p>We've analyzed your responses and identified key opportunities to strengthen your digital marketing.</p>
        <p><strong>What happens next?</strong></p>
        <ul>
          <li>Review your customized report</li>
          <li>See where you're excelling and where there's room to grow</li>
          <li>Get actionable recommendations tailored to ${data.businessName}</li>
        </ul>
        <p style="margin: 30px 0;">
          <a href="https://orangedoormarketing.com/report?token=${data.resumeToken}" 
             style="background: #F97316; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
            View Your Report
          </a>
        </p>
        <p style="color: #666;">Questions? Just reply to this email - we read every one.</p>
        <p>— The Orange Door Team</p>
      </div>
    `
  }),
  
  followup_1: (data) => ({
    subject: "Did you have a chance to review your report?",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #F97316;">Hi ${data.firstName},</h1>
        <p>Just checking in - did you get a chance to review your SYSTEM Gap Report?</p>
        <p>I know you're busy running ${data.businessName}, so I wanted to highlight the most important finding:</p>
        <p style="background: #FFF7ED; padding: 20px; border-left: 4px solid #F97316;">
          <strong>Your biggest opportunity:</strong> Based on your responses, focusing on your lead nurturing system could have the fastest impact on your revenue.
        </p>
        <p>If you have 15 minutes this week, I'd love to walk you through the report and answer any questions.</p>
        <p style="margin: 30px 0;">
          <a href="https://orangedoormarketing.com/schedule" 
             style="background: #F97316; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
            Schedule a Quick Call
          </a>
        </p>
        <p>— The Orange Door Team</p>
      </div>
    `
  }),
  
  followup_2: (data) => ({
    subject: "Quick question about your marketing goals",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #F97316;">${data.firstName}, quick question...</h1>
        <p>I've been thinking about ${data.businessName}'s marketing situation.</p>
        <p>When you filled out the gap analysis, you mentioned you're looking to improve your digital presence. I'm curious:</p>
        <p style="font-style: italic; color: #666;">What's the #1 thing holding you back from getting more customers right now?</p>
        <p>Hit reply and let me know - I read every email personally and might have some ideas that could help.</p>
        <p>— Jason @ Orange Door</p>
      </div>
    `
  }),
  
  followup_3: (data) => ({
    subject: "Ready to take the next step?",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #F97316;">Hi ${data.firstName},</h1>
        <p>It's been about a week since you completed your SYSTEM Gap Report.</p>
        <p>I wanted to reach out one more time because I genuinely believe we can help ${data.businessName} grow.</p>
        <p><strong>Here's what working with Orange Door looks like:</strong></p>
        <ul>
          <li>✅ We handle EVERYTHING - you focus on your business</li>
          <li>✅ No long-term contracts - results speak for themselves</li>
          <li>✅ Local East Tennessee team who understands your market</li>
        </ul>
        <p>If you're ready to stop doing marketing yourself and start seeing real results, let's talk.</p>
        <p style="margin: 30px 0;">
          <a href="https://orangedoormarketing.com/schedule" 
             style="background: #F97316; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
            Let's Talk
          </a>
        </p>
        <p>No pressure - if now isn't the right time, I understand. But when you're ready, we'll be here.</p>
        <p>— Jason @ Orange Door</p>
      </div>
    `
  }),
  
  resume_reminder_1: (data) => ({
    subject: "Your gap analysis is waiting for you",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #F97316;">Hi ${data.firstName}!</h1>
        <p>I noticed you started a SYSTEM Gap Analysis for ${data.businessName} but didn't finish.</p>
        <p>No worries - life gets busy! Your progress is saved, and you can pick up right where you left off.</p>
        <p><strong>You were ${data.progress}% complete.</strong></p>
        <p style="margin: 30px 0;">
          <a href="https://orangedoormarketing.com/gap-analysis?token=${data.resumeToken}" 
             style="background: #F97316; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
            Continue Your Analysis
          </a>
        </p>
        <p style="color: #666;">The full analysis takes about 10 minutes and gives you a complete picture of where your marketing stands.</p>
        <p>— The Orange Door Team</p>
      </div>
    `
  }),
  
  resume_reminder_2: (data) => ({
    subject: "Don't lose your progress!",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #F97316;">Last chance, ${data.firstName}!</h1>
        <p>Your partially completed gap analysis for ${data.businessName} is still waiting.</p>
        <p>You were ${data.progress}% of the way through - it would be a shame to lose that progress!</p>
        <p style="background: #FFF7ED; padding: 20px; border-left: 4px solid #F97316;">
          <strong>What you'll get:</strong> A personalized report showing exactly where your marketing is strong and where there's opportunity to improve.
        </p>
        <p style="margin: 30px 0;">
          <a href="https://orangedoormarketing.com/gap-analysis?token=${data.resumeToken}" 
             style="background: #F97316; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
            Finish Your Analysis
          </a>
        </p>
        <p>— The Orange Door Team</p>
      </div>
    `
  }),
  
  contact_immediate: (data) => ({
    subject: "Thanks for reaching out!",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #F97316;">Hi ${data.firstName}!</h1>
        <p>Thanks for reaching out to Orange Door Marketing. We received your message and will get back to you within 24 hours.</p>
        <p>In the meantime, here are a few resources you might find helpful:</p>
        <ul>
          <li><a href="https://orangedoormarketing.com/gap-analysis">Take our free SYSTEM Gap Analysis</a></li>
          <li><a href="https://orangedoormarketing.com/system">Learn about our done-for-you marketing system</a></li>
        </ul>
        <p>Talk soon!</p>
        <p>— The Orange Door Team</p>
      </div>
    `
  }),
  
  contact_followup: (data) => ({
    subject: "Following up on your inquiry",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #F97316;">Hi ${data.firstName},</h1>
        <p>I wanted to follow up on your recent inquiry to Orange Door Marketing.</p>
        <p>If you haven't had a chance to connect with us yet, I'd love to schedule a quick call to learn more about ${data.businessName || 'your business'} and how we might be able to help.</p>
        <p style="margin: 30px 0;">
          <a href="https://orangedoormarketing.com/schedule" 
             style="background: #F97316; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
            Schedule a Call
          </a>
        </p>
        <p>Looking forward to connecting!</p>
        <p>— Jason @ Orange Door</p>
      </div>
    `
  })
};

interface SequenceSettings {
  use_recipient_timezone?: boolean;
  default_timezone?: string;
  optimal_send_enabled?: boolean;
}

interface QueueRequest {
  triggerType: string;
  recipientEmail: string;
  recipientName: string;
  recipientTimezone?: string;
  data: Record<string, any>;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { triggerType, recipientEmail, recipientName, recipientTimezone, data }: QueueRequest = await req.json();

    console.log(`Queueing sequence for trigger: ${triggerType}, recipient: ${recipientEmail}`);

    // Get the active sequence for this trigger
    const { data: sequence, error: seqError } = await supabase
      .from("email_sequences")
      .select("*")
      .eq("trigger_type", triggerType)
      .eq("is_active", true)
      .single();

    if (seqError || !sequence) {
      console.log("No active sequence found for trigger:", triggerType);
      return new Response(JSON.stringify({ message: "No active sequence found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse sequence settings
    const settings: SequenceSettings = (sequence as any).settings || {};
    const useRecipientTimezone = settings.use_recipient_timezone ?? true;
    const defaultTimezone = settings.default_timezone || "America/New_York";
    const optimalSendEnabled = settings.optimal_send_enabled ?? false;
    
    // Determine timezone to use
    const timezone = useRecipientTimezone && recipientTimezone 
      ? recipientTimezone 
      : defaultTimezone;

    console.log(`Using timezone: ${timezone}, optimal send: ${optimalSendEnabled}`);

    const emails = sequence.emails as Array<{ 
      delay_hours: number; 
      subject: string; 
      template: string;
      optimal_send_time?: boolean;
    }>;
    const queuedEmails = [];

    for (const emailConfig of emails) {
      const template = templates[emailConfig.template];
      if (!template) {
        console.warn(`Template not found: ${emailConfig.template}`);
        continue;
      }

      const { subject, html } = template({ ...data, firstName: recipientName });
      
      // Calculate scheduled time
      let scheduledFor = new Date(Date.now() + emailConfig.delay_hours * 60 * 60 * 1000);
      
      // Apply optimal send time if enabled for this email
      const useOptimalTime = optimalSendEnabled && (emailConfig.optimal_send_time ?? true);
      if (useOptimalTime) {
        scheduledFor = getNextOptimalSendTime(scheduledFor, timezone);
        console.log(`Optimized send time for ${emailConfig.template}: ${scheduledFor.toISOString()}`);
      }

      const { data: queuedEmail, error: queueError } = await supabase
        .from("email_queue")
        .insert({
          recipient_email: recipientEmail,
          recipient_name: recipientName,
          recipient_timezone: timezone,
          optimal_send_time: useOptimalTime,
          subject: emailConfig.subject || subject,
          html_content: html,
          scheduled_for: scheduledFor.toISOString(),
          metadata: {
            sequence_id: sequence.id,
            trigger_type: triggerType,
            template: emailConfig.template,
            optimal_send_applied: useOptimalTime,
            ...data,
          },
        })
        .select()
        .single();

      if (queueError) {
        console.error("Error queueing email:", queueError);
      } else {
        queuedEmails.push(queuedEmail);
        console.log(`Queued email: ${emailConfig.template} for ${scheduledFor.toISOString()}`);
      }
    }

    return new Response(JSON.stringify({ queued: queuedEmails.length, emails: queuedEmails }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in queue-sequence-emails:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
