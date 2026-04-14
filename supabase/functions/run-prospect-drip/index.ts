import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

interface Prospect {
  id: string;
  name: string;
  email: string;
  business_type: string | null;
  website_url: string;
  gap_score: number | null;
  top_weaknesses: string[] | null;
  recommended_tier: string | null;
  status: string;
  drip_step: number;
  created_at: string;
}

// Days after nurture begins for each drip step
const DRIP_SCHEDULE: Record<number, number> = {
  1: 2,  // Day 2
  2: 4,  // Day 4
  3: 7,  // Day 7
  4: 10, // Day 10
};

function getFirstName(name: string): string {
  return name?.split(" ")[0] || "there";
}

function buildEmail(prospect: Prospect, step: number): { subject: string; html: string } | null {
  const firstName = getFirstName(prospect.name);
  const weaknesses = prospect.top_weaknesses || [];
  const topWeakness = weaknesses[0] || "your online visibility";
  const businessType = prospect.business_type || "local business";
  const url = prospect.website_url;

  const wrapHtml = (body: string, email: string = '') => `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;margin-top:20px;margin-bottom:20px;">
  <div style="background:#1a1a1a;padding:24px 40px;text-align:center;">
    <h1 style="color:#E8521A;margin:0;font-size:20px;">Orange Door Consulting</h1>
  </div>
  <div style="padding:30px 40px;font-size:15px;color:#444;line-height:1.7;">
    ${body}
  </div>
  <div style="background:#f5f5f5;padding:16px 40px;text-align:center;font-size:12px;color:#999;">
    <a href="https://slick-doc-site.lovable.app/email-preferences?email=${encodeURIComponent(email)}" style="color:#999;">Unsubscribe</a>
  </div>
</div>
</body></html>`;

  const callCta = `<div style="text-align:center;margin:25px 0;"><a href="https://slick-doc-site.lovable.app/schedule" style="display:inline-block;padding:14px 28px;background:#E8521A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Book a Free Call</a></div>`;
  const signupCta = `<div style="text-align:center;margin:10px 0;"><a href="https://slick-doc-site.lovable.app/pricing" style="color:#E8521A;font-weight:bold;text-decoration:underline;">See Our Plans</a></div>`;

  switch (step) {
    case 1:
      return {
        subject: `The #1 thing holding ${url} back`,
        html: wrapHtml(`
          <p>Hi ${firstName},</p>
          <p>When we analyzed your website, one thing stood out above everything else: <strong>${topWeakness}</strong>.</p>
          <p>Here's what that means in plain English — right now, potential customers in your area are searching for exactly what you offer, but they're finding your competitors instead.</p>
          <p>Every day this isn't fixed, you're losing real customers to businesses that might not even be as good as yours.</p>
          <p>The good news? This is one of the easiest things to fix, and we do it for you — no technical knowledge needed on your end.</p>
          ${callCta}
          <p>Talk soon,<br><strong>The Orange Door Team</strong></p>
        `, prospect.email),
      };

    case 2:
      return {
        subject: "Most local businesses have this exact problem",
        html: wrapHtml(`
          <p>Hi ${firstName},</p>
          <p>Here's something we hear from ${businessType} owners all the time:</p>
          <p style="padding:15px 20px;background:#f9f5f0;border-left:3px solid #E8521A;font-style:italic;">"I know I need to do more marketing, but I just don't have the time or the team to handle it."</p>
          <p>You're not alone. Most local businesses are run by people who are great at what they do — but marketing is a full-time job on its own.</p>
          <p>That's exactly why Orange Door exists. We become your entire marketing team:</p>
          <ul style="padding-left:20px;">
            <li>We make sure people can find you on Google</li>
            <li>We create content that brings in new customers</li>
            <li>We manage your social media so you stay visible</li>
            <li>We send emails that keep customers coming back</li>
            <li>We track everything and send you a simple monthly report</li>
          </ul>
          <p>You focus on running your business. We handle the rest.</p>
          ${callCta}
          <p>Best,<br><strong>The Orange Door Team</strong></p>
        `, prospect.email),
      };

    case 3:
      return {
        subject: "Here's everything we do for you each month",
        html: wrapHtml(`
          <p>Hi ${firstName},</p>
          <p>People always ask us: "What exactly do you do?" Here's the full list:</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <tr><td style="padding:8px 0;">✅</td><td style="padding:8px;">Make your website easier to find on Google (SEO)</td></tr>
            <tr><td style="padding:8px 0;">✅</td><td style="padding:8px;">Write blog posts and website content that attracts customers</td></tr>
            <tr><td style="padding:8px 0;">✅</td><td style="padding:8px;">Create and schedule social media posts</td></tr>
            <tr><td style="padding:8px 0;">✅</td><td style="padding:8px;">Set up and manage email campaigns</td></tr>
            <tr><td style="padding:8px 0;">✅</td><td style="padding:8px;">Manage your Google Business Profile</td></tr>
            <tr><td style="padding:8px 0;">✅</td><td style="padding:8px;">Track your leads and follow up automatically</td></tr>
            <tr><td style="padding:8px 0;">✅</td><td style="padding:8px;">Send you a plain-English monthly performance report</td></tr>
            <tr><td style="padding:8px 0;">✅</td><td style="padding:8px;">Run paid ads if your plan includes them</td></tr>
          </table>
          <p><strong>All of this is done for you.</strong> You don't need to learn any tools, write any content, or figure out any tech. We handle everything.</p>
          ${callCta}
          ${signupCta}
          <p>Cheers,<br><strong>The Orange Door Team</strong></p>
        `, prospect.email),
      };

    case 4:
      return {
        subject: `Quick question about ${businessType}`,
        html: wrapHtml(`
          <p>Hi ${firstName},</p>
          <p>Just a quick question — is handling your own marketing still working for you?</p>
          <p>If the honest answer is "not really" or "I don't have time for it," we should talk.</p>
          <p>No pressure, no long sales pitch. Just a 15-minute call to see if we can help.</p>
          <div style="text-align:center;margin:25px 0;">
            <a href="https://slick-doc-site.lovable.app/schedule" style="display:inline-block;padding:14px 28px;background:#E8521A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin:5px;">Schedule a Call</a>
            <a href="https://slick-doc-site.lovable.app/pricing" style="display:inline-block;padding:14px 28px;background:#fff;color:#E8521A;text-decoration:none;border-radius:6px;font-weight:bold;border:2px solid #E8521A;margin:5px;">Sign Up Now</a>
          </div>
          <p>Either way, I hope the free report was helpful!</p>
          <p>— The Orange Door Team</p>
        `, prospect.email),
      };

    default:
      return null;
  }
}

async function buildPersonalizedEmail(
  prospect: Prospect & { context_profile?: Record<string, unknown> },
  step: number,
  lovableApiKey: string
): Promise<{ subject: string; html: string } | null> {
  const ctx = prospect.context_profile;
  if (!ctx) return null;

  const services = Array.isArray(ctx.services) && (ctx.services as string[]).length > 0
    ? (ctx.services as string[]).join(', ')
    : prospect.business_type || 'your business';

  const differentiators = Array.isArray(ctx.differentiators) && (ctx.differentiators as string[]).length > 0
    ? (ctx.differentiators as string[]).join('; ')
    : null;

  const primaryGoal = Array.isArray(ctx.primary_goals) && (ctx.primary_goals as string[]).length > 0
    ? (ctx.primary_goals as string[])[0]
    : null;

  const painPoint = Array.isArray(ctx.pain_points) && (ctx.pain_points as string[]).length > 0
    ? (ctx.pain_points as string[])[0]
    : (prospect.top_weaknesses?.[0] || 'online visibility');

  const stepThemes: Record<number, string> = {
    1: "Lead with their single biggest gap/weakness. Make it feel urgent but solvable. One clear CTA to book a call.",
    2: "Empathize with the time/resource problem. Show how Orange Door becomes their full marketing team. One clear CTA.",
    3: "Show the full list of what Orange Door does every month. Emphasize done-for-you. CTA to see plans or book call.",
    4: "Final follow-up. Low-pressure question about whether DIY marketing is working. Two CTAs: schedule call + see pricing.",
  };

  const theme = stepThemes[step];
  if (!theme) return null;

  const prompt = `You are writing a nurture email for Orange Door Marketing (East Tennessee SMB consultancy) to send to a prospect.

Prospect context:
- First name: ${prospect.name?.split(' ')[0] || 'there'}
- Business type: ${services}
- Their website: ${prospect.website_url || 'unknown'}
- Their gap score: ${prospect.gap_score ?? 'unknown'}/100
- Their biggest gap: ${painPoint}
${differentiators ? `- Their key differentiator: ${differentiators}` : ''}
${primaryGoal ? `- Their #1 business goal: ${primaryGoal}` : ''}
${ctx.success_criteria ? `- What would make marketing worth it for them: ${ctx.success_criteria}` : ''}
${ctx.fears ? `- Their biggest fear about agencies: ${ctx.fears}` : ''}

Email theme for step ${step}: ${theme}

Orange Door CTAs:
- Book a call: https://slick-doc-site.lovable.app/schedule
- See plans: https://slick-doc-site.lovable.app/pricing

Rules:
- Write ONLY the email body HTML (no <html>, <head>, or <body> tags — just the inner content paragraphs, lists, CTAs)
- Keep it under 200 words
- Sound like a helpful human, not a salesperson
- Reference their specific business type and at least one specific detail from the context above
- Include exactly one CTA button styled: <a href="URL" style="display:inline-block;padding:14px 28px;background:#E8521A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">CTA TEXT</a>
- End with: <p>— The Orange Door Team</p>

Return JSON: { "subject": "email subject line", "html": "body html" }`;

  try {
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiResponse.ok) {
      console.error(`AI email gen failed: ${aiResponse.status}`);
      return null;
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.subject || !parsed.html) return null;

    return { subject: parsed.subject, html: parsed.html };
  } catch (err) {
    console.error("buildPersonalizedEmail error:", err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "Orange Door Consultants <hello@orangedoormarketing.com>";

  if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "Email API keys not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const now = new Date();
    let emailsSent = 0;
    let prospectsNurtured = 0;

    // 1. Move pending prospects (48h+ old) to nurture
    const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const { data: pendingProspects } = await supabase
      .from("prospects")
      .select("id")
      .eq("status", "pending")
      .lte("created_at", cutoff);

    if (pendingProspects && pendingProspects.length > 0) {
      const ids = pendingProspects.map((p: { id: string }) => p.id);
      await supabase
        .from("prospects")
        .update({ status: "nurture", drip_step: 0 })
        .in("id", ids);
      prospectsNurtured = ids.length;
      console.log(`Moved ${ids.length} prospects to nurture status`);
    }

    // 2. Process drip emails for nurture prospects
    const { data: nurtureProspects } = await supabase
      .from("prospects")
      .select("*")
      .eq("status", "nurture")
      .lt("drip_step", 4);

    if (nurtureProspects) {
      for (const prospect of nurtureProspects as Prospect[]) {
        const nextStep = prospect.drip_step + 1;
        const daysRequired = DRIP_SCHEDULE[nextStep];
        if (!daysRequired) continue;

        // Calculate days since created
        const createdAt = new Date(prospect.created_at);
        const daysSinceCreated = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

        // Only send if enough days have passed
        if (daysSinceCreated < daysRequired) continue;

        const emailContent = buildEmail(prospect, nextStep);
        if (!emailContent) continue;

        try {
          const emailRes = await fetch(`${GATEWAY_URL}/emails`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "X-Connection-Api-Key": RESEND_API_KEY,
            },
            body: JSON.stringify({
              from: EMAIL_FROM,
              to: [prospect.email],
              subject: emailContent.subject,
              html: emailContent.html,
            }),
          });

          if (emailRes.ok) {
            await supabase
              .from("prospects")
              .update({ drip_step: nextStep })
              .eq("id", prospect.id);
            emailsSent++;
            console.log(`Drip email ${nextStep} sent to ${prospect.email}`);
          } else {
            const errText = await emailRes.text();
            console.error(`Failed to send drip ${nextStep} to ${prospect.email}:`, errText);
          }
        } catch (sendErr) {
          console.error(`Error sending drip to ${prospect.email}:`, sendErr);
        }
      }
    }

    // 3. Mark completed drip sequences (step 4 done, 10+ days old)
    const { data: completedProspects } = await supabase
      .from("prospects")
      .select("id")
      .eq("status", "nurture")
      .gte("drip_step", 4);

    // These just stay as nurture with drip_step=4, no further emails

    console.log(`Drip run complete: ${prospectsNurtured} nurtured, ${emailsSent} emails sent`);

    return new Response(
      JSON.stringify({ success: true, prospectsNurtured, emailsSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("run-prospect-drip error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
