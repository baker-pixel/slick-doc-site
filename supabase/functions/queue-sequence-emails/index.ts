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

// US Federal Holidays (fixed dates and floating holidays calculated per year)
function getUSHolidays(year: number): string[] {
  const holidays: string[] = [];
  
  // Fixed holidays
  holidays.push(`${year}-01-01`); // New Year's Day
  holidays.push(`${year}-07-04`); // Independence Day
  holidays.push(`${year}-11-11`); // Veterans Day
  holidays.push(`${year}-12-25`); // Christmas Day
  
  // MLK Day - 3rd Monday of January
  holidays.push(getNthWeekdayOfMonth(year, 0, 1, 3));
  
  // Presidents Day - 3rd Monday of February
  holidays.push(getNthWeekdayOfMonth(year, 1, 1, 3));
  
  // Memorial Day - Last Monday of May
  holidays.push(getLastWeekdayOfMonth(year, 4, 1));
  
  // Labor Day - 1st Monday of September
  holidays.push(getNthWeekdayOfMonth(year, 8, 1, 1));
  
  // Columbus Day - 2nd Monday of October
  holidays.push(getNthWeekdayOfMonth(year, 9, 1, 2));
  
  // Thanksgiving - 4th Thursday of November
  holidays.push(getNthWeekdayOfMonth(year, 10, 4, 4));
  
  return holidays;
}

function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): string {
  const firstDay = new Date(year, month, 1);
  let dayOffset = weekday - firstDay.getDay();
  if (dayOffset < 0) dayOffset += 7;
  const day = 1 + dayOffset + (n - 1) * 7;
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getLastWeekdayOfMonth(year: number, month: number, weekday: number): string {
  const lastDay = new Date(year, month + 1, 0);
  let dayOffset = lastDay.getDay() - weekday;
  if (dayOffset < 0) dayOffset += 7;
  const day = lastDay.getDate() - dayOffset;
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isUSHoliday(date: Date): boolean {
  const year = date.getFullYear();
  const dateStr = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const holidays = getUSHolidays(year);
  return holidays.includes(dateStr);
}

function skipExcludedDays(date: Date, excludeWeekends: boolean, excludeHolidays: boolean): Date {
  const result = new Date(date);
  let iterations = 0;
  const maxIterations = 14; // Max 2 weeks of skipping
  
  while (iterations < maxIterations) {
    const isExcluded = (excludeWeekends && isWeekend(result)) || (excludeHolidays && isUSHoliday(result));
    if (!isExcluded) break;
    result.setDate(result.getDate() + 1);
    iterations++;
  }
  
  return result;
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
  exclude_weekends?: boolean;
  exclude_holidays?: boolean;
}

interface QueueRequest {
  triggerType: string;
  recipientEmail: string;
  recipientName: string;
  recipientTimezone?: string;
  tier?: string;
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

    const { triggerType, recipientEmail, recipientName, recipientTimezone, tier, data }: QueueRequest = await req.json();

    console.log(`Queueing sequence for trigger: ${triggerType}, recipient: ${recipientEmail}, tier: ${tier || 'any'}`);

    // Try tier-specific sequence first, then fall back to generic (tier IS NULL)
    let sequence: any = null;

    if (tier) {
      const { data: tierSeq } = await supabase
        .from("email_sequences")
        .select("*")
        .eq("trigger_type", triggerType)
        .eq("tier", tier.toLowerCase())
        .eq("is_active", true)
        .maybeSingle();

      if (tierSeq) {
        sequence = tierSeq;
        console.log(`Found tier-specific sequence for ${tier}`);
      }
    }

    if (!sequence) {
      const { data: genericSeq } = await supabase
        .from("email_sequences")
        .select("*")
        .eq("trigger_type", triggerType)
        .is("tier", null)
        .eq("is_active", true)
        .maybeSingle();

      sequence = genericSeq;
      if (sequence) console.log("Using generic (tierless) sequence");
    }

    if (!sequence) {
      // Final fallback: any active sequence for this trigger
      const { data: anySeq } = await supabase
        .from("email_sequences")
        .select("*")
        .eq("trigger_type", triggerType)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      sequence = anySeq;
    }

    if (!sequence) {
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
    const excludeWeekends = settings.exclude_weekends ?? false;
    const excludeHolidays = settings.exclude_holidays ?? false;
    
    // Determine timezone to use
    const timezone = useRecipientTimezone && recipientTimezone 
      ? recipientTimezone 
      : defaultTimezone;

    console.log(`Using timezone: ${timezone}, optimal send: ${optimalSendEnabled}, exclude weekends: ${excludeWeekends}, exclude holidays: ${excludeHolidays}`);

    const emails = sequence.emails as Array<{ 
      delay_hours: number; 
      subject: string; 
      template: string;
      optimal_send_time?: boolean;
    }>;
    const queuedEmails = [];

    for (const emailConfig of emails) {
      let subject: string;
      let html: string;

      // Skip if no template defined
      if (!emailConfig.template) {
        console.warn(`No template defined for email config:`, emailConfig);
        continue;
      }

      // Check if it's a custom template
      if (emailConfig.template.startsWith("custom:")) {
        const templateSlug = emailConfig.template.replace("custom:", "");
        const { data: customTemplate, error: templateError } = await supabase
          .from("email_templates")
          .select("subject, html_content")
          .eq("slug", templateSlug)
          .eq("is_active", true)
          .single();

        if (templateError || !customTemplate) {
          console.warn(`Custom template not found: ${templateSlug}`);
          continue;
        }

        // Replace variables in custom template
        subject = customTemplate.subject;
        html = customTemplate.html_content;
        
        const templateData = { ...data, firstName: recipientName };
        Object.entries(templateData).forEach(([key, value]) => {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
          subject = subject.replace(regex, String(value || ""));
          html = html.replace(regex, String(value || ""));
        });
      } else {
        // Use built-in template
        const template = templates[emailConfig.template];
        if (!template) {
          console.warn(`Template not found: ${emailConfig.template}`);
          continue;
        }
        const result = template({ ...data, firstName: recipientName });
        subject = result.subject;
        html = result.html;
      }
      
      // Calculate scheduled time
      let scheduledFor = new Date(Date.now() + emailConfig.delay_hours * 60 * 60 * 1000);
      
      // Skip excluded days (weekends/holidays)
      if (excludeWeekends || excludeHolidays) {
        scheduledFor = skipExcludedDays(scheduledFor, excludeWeekends, excludeHolidays);
        console.log(`Skipped excluded days, new date: ${scheduledFor.toISOString()}`);
      }
      
      // Apply optimal send time if enabled for this email
      const useOptimalTime = optimalSendEnabled && (emailConfig.optimal_send_time ?? true);
      if (useOptimalTime) {
        scheduledFor = getNextOptimalSendTime(scheduledFor, timezone);
        // Re-check for excluded days after optimal time adjustment
        if (excludeWeekends || excludeHolidays) {
          scheduledFor = skipExcludedDays(scheduledFor, excludeWeekends, excludeHolidays);
        }
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
