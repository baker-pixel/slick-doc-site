import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Processing email queue...");

    // Get pending emails that are due
    const { data: pendingEmails, error: fetchError } = await supabase
      .from("email_queue")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .limit(50);

    if (fetchError) {
      console.error("Error fetching pending emails:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${pendingEmails?.length || 0} emails to process`);

    const results = [];

    for (const email of pendingEmails || []) {
      try {
        console.log(`Sending email to ${email.recipient_email}: ${email.subject}`);

        const emailResponse = await resend.emails.send({
          from: "Orange Door Marketing <hello@orangedoormarketing.com>",
          to: [email.recipient_email],
          subject: email.subject,
          html: email.html_content,
        });

        console.log("Email sent:", emailResponse);

        // Update queue status
        await supabase
          .from("email_queue")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", email.id);

        // Log the sent email
        await supabase.from("email_logs").insert({
          recipient_email: email.recipient_email,
          subject: email.subject,
          status: "sent",
          resend_id: emailResponse.data?.id,
          metadata: email.metadata,
        });

        results.push({ id: email.id, status: "sent" });
      } catch (emailError: any) {
        console.error(`Error sending email ${email.id}:`, emailError);

        // Update queue with error
        await supabase
          .from("email_queue")
          .update({ status: "failed", error_message: emailError.message })
          .eq("id", email.id);

        // Log the failure
        await supabase.from("email_logs").insert({
          recipient_email: email.recipient_email,
          subject: email.subject,
          status: "failed",
          metadata: { ...email.metadata, error: emailError.message },
        });

        results.push({ id: email.id, status: "failed", error: emailError.message });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in process-email-queue:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
