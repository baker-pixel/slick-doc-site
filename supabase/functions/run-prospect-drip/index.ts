import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/http.ts";
import { callAIJson } from "../_shared/ai.ts";

const RESEND_API_URL = "https://api.resend.com";

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
  approved_at: string | null;
  client_id: string | null;
  context_profile?: Record<string, unknown> | null;
}

interface ClientAccount {
  id: string;
  business_name: string;
  email: string;
  website_url?: string | null;
  business_type?: string | null;
  context_profile?: Record<string, unknown> | null;
  brand_voice?: Record<string, unknown> | null;
}

// Days after nurture begins for each drip step
const DRIP_SCHEDULE: Record<number, number> = {
  1: 2,
  2: 4,
  3: 7,
  4: 10,
};

function getFirstName(name: string): string {
  return name?.split(" ")[0] || "there";
}

const wrapHtml = (body: string, unsubEmail: string = "") => `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;margin-top:20px;margin-bottom:20px;">
  <div style="background:#1a1a1a;padding:24px 40px;">
    <div style="color:#E8521A;font-weight:bold;font-size:13px;letter-spacing:2px;">ORANGE DOOR</div>
    <div style="color:#666;font-size:9px;letter-spacing:1.5px;margin-top:2px;">MANAGED OUTREACH</div>
  </div>
  <div style="padding:30px 40px;font-size:15px;color:#444;line-height:1.7;">
    ${body}
  </div>
  <div style="background:#f5f5f5;padding:16px 40px;text-align:center;font-size:12px;color:#999;">
    <a href="https://orangedoormarketing.com/email-preferences?email=${encodeURIComponent(unsubEmail)}" style="color:#999;">Unsubscribe</a>
  </div>
</div>
</body></html>`;

function buildClientCtaButton(client: ClientAccount): string {
  const url = client.website_url || "https://orangedoormarketing.com/schedule";
  return `<div style="text-align:center;margin:25px 0;"><a href="${url}" style="display:inline-block;padding:14px 28px;background:#E8521A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Get in Touch with ${client.business_name}</a></div>`;
}

// Generic fallback — only fires if Groq is down. No placeholders.
function buildStaticOutreachEmail(
  prospect: Prospect,
  client: ClientAccount,
  step: number,
): { subject: string; html: string } | null {
  const firstName = getFirstName(prospect.name);
  const bizType = prospect.business_type || "your industry";
  const clientName = client.business_name;
  const cta = buildClientCtaButton(client);

  switch (step) {
    case 1:
      return {
        subject: `Quick note from ${clientName}`,
        html: wrapHtml(`
          <p>Hi ${firstName},</p>
          <p>I came across your business and wanted to reach out — we work with a number of ${bizType} businesses and thought there could be a good fit.</p>
          <p>We're <strong>${clientName}</strong> and we help businesses like yours grow and operate more efficiently. I'd love to hear a bit about what you're working on and see if we can add any value.</p>
          <p>No pitch — just a quick conversation.</p>
          ${cta}
          <p>Talk soon,<br><strong>${clientName}</strong></p>
        `, prospect.email),
      };

    case 2:
      return {
        subject: `Following up — ${clientName}`,
        html: wrapHtml(`
          <p>Hi ${firstName},</p>
          <p>Just following up on my last note. One thing we hear from a lot of ${bizType} owners is that they know what they need to do to grow — they just don't have the bandwidth to do it all.</p>
          <p>That's where we come in. <strong>${clientName}</strong> works alongside businesses like yours to take things off your plate and help you move faster. Happy to share some examples of what that looks like in practice.</p>
          ${cta}
          <p>Best,<br><strong>${clientName}</strong></p>
        `, prospect.email),
      };

    case 3:
      return {
        subject: `What working with ${clientName} actually looks like`,
        html: wrapHtml(`
          <p>Hi ${firstName},</p>
          <p>People always ask us: "What exactly do you do?" — so here's the straightforward answer:</p>
          <p>We partner with ${bizType} businesses to help them grow. Everything we do is hands-on, results-focused, and tailored to what your business actually needs — not a one-size-fits-all package.</p>
          <p>If you're curious whether there's a fit, the fastest way to find out is a short call.</p>
          ${cta}
          <p>Cheers,<br><strong>${clientName}</strong></p>
        `, prospect.email),
      };

    case 4:
      return {
        subject: `Last note — ${clientName}`,
        html: wrapHtml(`
          <p>Hi ${firstName},</p>
          <p>I'll keep this one short — just wanted to check in before I close the loop.</p>
          <p>If growing your business is something you're actively thinking about, even a 15-minute call with us tends to be worth it. No obligation, no pressure.</p>
          ${cta}
          <p>Either way, best of luck — hope things are going well.</p>
          <p>— <strong>${clientName}</strong></p>
        `, prospect.email),
      };

    default:
      return null;
  }
}

async function buildPersonalizedOutreachEmail(
  prospect: Prospect,
  client: ClientAccount,
  step: number,
): Promise<{ subject: string; html: string } | null> {
  const ctx = prospect.context_profile;
  const clientCtx = client.context_profile;
  const brandVoice = client.brand_voice;

  // ── Prospect signals ──────────────────────────────────────────
  const prospectServices = ctx && Array.isArray(ctx.services) && (ctx.services as string[]).length > 0
    ? (ctx.services as string[]).join(", ")
    : prospect.business_type || null;

  const prospectAudience = ctx && typeof ctx.target_audience === "string" ? ctx.target_audience : null;
  const prospectSummary = ctx && typeof ctx.business_summary === "string" ? ctx.business_summary : null;

  const prospectPainPoints = ctx && Array.isArray(ctx.pain_points) && (ctx.pain_points as string[]).length > 0
    ? (ctx.pain_points as string[]).slice(0, 2).join("; ")
    : prospect.top_weaknesses?.[0] || null;

  const prospectDiffs = ctx && Array.isArray(ctx.differentiators) && (ctx.differentiators as string[]).length > 0
    ? (ctx.differentiators as string[]).slice(0, 2).join("; ")
    : null;

  // ── Client signals ────────────────────────────────────────────
  const clientServices = clientCtx && Array.isArray(clientCtx.services) && (clientCtx.services as string[]).length > 0
    ? (clientCtx.services as string[]).join(", ")
    : client.business_type || null;

  const clientDifferentiators = clientCtx && Array.isArray(clientCtx.differentiators) && (clientCtx.differentiators as string[]).length > 0
    ? (clientCtx.differentiators as string[]).join("; ")
    : null;

  const clientSummary = clientCtx && typeof clientCtx.business_summary === "string"
    ? clientCtx.business_summary
    : null;

  const clientTone = brandVoice && typeof brandVoice.tone === "string"
    ? brandVoice.tone
    : "professional but warm and direct";

  const ctaUrl = client.website_url || "https://orangedoormarketing.com/schedule";

  const stepThemes: Record<number, string> = {
    1: `Warm intro from the sender. Hook on one specific thing about the prospect's business — their industry, what they likely do for customers, or a common challenge in that space. Goal: start a conversation. One clear CTA. Under 150 words.`,
    2: `Follow-up. Empathise with a real problem the prospect likely faces in their day-to-day. Show specifically how the sender solves it. Social proof line optional ("businesses like yours..."). One CTA. Under 160 words.`,
    3: `Show exactly what working with the sender looks like — specific services, what the prospect gets, why it's different. Emphasise done-for-you. End with a single clear CTA. Under 180 words.`,
    4: `Final low-pressure follow-up. Very short. Ask if it's worth a 15-minute call — no pitch, just a question. One CTA. Under 100 words.`,
  };

  const theme = stepThemes[step];
  if (!theme) return null;

  const prospectBlock = [
    `- First name: ${getFirstName(prospect.name)}`,
    prospectServices ? `- Their business / services: ${prospectServices}` : `- Business type: ${prospect.business_type || "unknown"}`,
    prospect.website_url ? `- Website: ${prospect.website_url}` : null,
    prospectSummary ? `- Business summary: ${prospectSummary}` : null,
    prospectAudience ? `- Who they serve: ${prospectAudience}` : null,
    prospectPainPoints ? `- Known pain points / gaps: ${prospectPainPoints}` : null,
    prospectDiffs ? `- Their differentiators: ${prospectDiffs}` : null,
  ].filter(Boolean).join("\n");

  const clientBlock = [
    `- Business name: ${client.business_name}`,
    clientServices ? `- What they offer: ${clientServices}` : null,
    clientSummary ? `- About them: ${clientSummary}` : null,
    clientDifferentiators ? `- What sets them apart: ${clientDifferentiators}` : null,
    `- Tone / voice: ${clientTone}`,
  ].filter(Boolean).join("\n");

  const prompt = `You are writing a B2B outreach email on behalf of a business called "${client.business_name}".

SENDER (writing the email):
${clientBlock}

RECIPIENT (prospect):
${prospectBlock}

EMAIL GOAL FOR STEP ${step}:
${theme}

CTA button URL: ${ctaUrl}

RULES:
- Write ONLY the email body HTML — no <html>/<head>/<body> tags, just paragraphs, lists, and one CTA button
- Use this exact CTA button style: <a href="${ctaUrl}" style="display:inline-block;padding:14px 28px;background:#E8521A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">BUTTON TEXT</a>
- Sound like a thoughtful human, not a template — reference at least one specific thing about the prospect
- Never use placeholder brackets like [X] or [Y] — if you don't know a detail, write around it naturally
- End with: <p>— ${client.business_name}</p>

Return ONLY valid JSON on one line: { "subject": "...", "html": "..." }`;

  try {
    const parsed = await callAIJson<{ subject?: string; html?: string }>({
      source: "run-prospect-drip",
      prompt,
      maxTokens: 800,
    });
    if (!parsed.subject || !parsed.html) return null;

    return { subject: parsed.subject, html: parsed.html };
  } catch (err) {
    console.error("buildPersonalizedOutreachEmail error:", err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  if (!GROQ_API_KEY || !RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "GROQ_API_KEY or RESEND_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const now = new Date();
    let emailsSent = 0;
    let prospectsNurtured = 0;

    // 1. Move pending prospects (48h+ after approval) to nurture
    const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const { data: pendingProspects } = await supabase
      .from("prospects")
      .select("id")
      .eq("status", "pending")
      .lte("approved_at", cutoff);

    if (pendingProspects && pendingProspects.length > 0) {
      const ids = pendingProspects.map((p: { id: string }) => p.id);
      const { count } = await supabase
        .from("prospects")
        .update({ status: "nurture", drip_step: 0 })
        .in("id", ids)
        .eq("status", "pending")
        .select("id", { count: "exact", head: true });
      prospectsNurtured = count ?? ids.length;
      console.log(`Moved ${ids.length} prospects to nurture`);
    }

    // 2. Fetch nurture prospects
    const { data: nurtureProspects } = await supabase
      .from("prospects")
      .select("*")
      .eq("status", "nurture")
      .lt("drip_step", 4);

    if (!nurtureProspects || nurtureProspects.length === 0) {
      return new Response(
        JSON.stringify({ success: true, prospectsNurtured, emailsSent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Batch-fetch all relevant client accounts
    const clientIds = [...new Set(
      (nurtureProspects as Prospect[])
        .map(p => p.client_id)
        .filter(Boolean) as string[]
    )];

    const clientMap = new Map<string, ClientAccount>();
    if (clientIds.length > 0) {
      const { data: clientRows } = await supabase
        .from("client_accounts")
        .select("id, business_name, email, website_url, business_type, context_profile, brand_voice")
        .in("id", clientIds)
        .eq("status", "active");
      for (const c of (clientRows ?? [])) {
        clientMap.set(c.id, c as ClientAccount);
      }
    }

    // 4. Build suppression set — skip prospects whose email matches an active client
    const { data: allClientRows } = await supabase
      .from("client_accounts")
      .select("email")
      .eq("status", "active");
    const clientEmailSet = new Set(
      (allClientRows ?? []).map((c: { email: string }) => c.email.toLowerCase()),
    );

    // 5. Send drip emails
    for (const prospect of nurtureProspects as Prospect[]) {
      if (!prospect.email || !prospect.email.includes("@")) {
        console.log(`Skipping prospect ${prospect.id} — no valid email`);
        continue;
      }

      if (clientEmailSet.has(prospect.email.toLowerCase())) {
        await supabase.from("prospects").update({ status: "converted" }).eq("id", prospect.id);
        console.log(`Prospect ${prospect.email} is now a client — marked converted`);
        continue;
      }

      if (!prospect.client_id) {
        console.warn(`Skipping prospect ${prospect.id} — no client_id assigned`);
        continue;
      }

      const client = clientMap.get(prospect.client_id);
      if (!client) {
        console.warn(`Skipping prospect ${prospect.id} — client ${prospect.client_id} not found or inactive`);
        continue;
      }

      const nextStep = prospect.drip_step + 1;
      const daysRequired = DRIP_SCHEDULE[nextStep];
      if (!daysRequired) continue;

      // Clock starts from when nurture began (approved_at + 48h), not created_at.
      // This prevents outbound prospects discovered days ago from firing all steps at once.
      const nurtureStart = prospect.approved_at
        ? new Date(new Date(prospect.approved_at).getTime() + 48 * 60 * 60 * 1000)
        : new Date(prospect.created_at);
      const daysSinceNurture = (now.getTime() - nurtureStart.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceNurture < daysRequired) continue;

      let emailContent = await buildPersonalizedOutreachEmail(prospect, client, nextStep);
      if (!emailContent) {
        emailContent = buildStaticOutreachEmail(prospect, client, nextStep);
      }
      if (!emailContent) continue;

      if (emailContent.html && !emailContent.html.includes("<!DOCTYPE")) {
        emailContent = {
          subject: emailContent.subject,
          html: wrapHtml(emailContent.html, prospect.email),
        };
      }

      try {
        const fromAddress = `${client.business_name} Team <hello@orangedoormarketing.com>`;
        const emailRes = await fetch(`${RESEND_API_URL}/emails`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: fromAddress,
            reply_to: client.email,
            to: [prospect.email],
            subject: emailContent.subject,
            html: emailContent.html,
          }),
        });

        if (emailRes.ok) {
          const { count: updated } = await supabase
            .from("prospects")
            .update({ drip_step: nextStep })
            .eq("id", prospect.id)
            .eq("drip_step", prospect.drip_step)
            .select("id", { count: "exact", head: true });
          if (updated && updated > 0) emailsSent++;
          console.log(`Drip step ${nextStep} sent to ${prospect.email} from ${fromAddress}`);
        } else {
          console.error(`Failed drip ${nextStep} to ${prospect.email}:`, await emailRes.text());
        }
      } catch (sendErr) {
        console.error(`Error sending drip to ${prospect.email}:`, sendErr);
      }
    }

    console.log(`Drip run complete: ${prospectsNurtured} nurtured, ${emailsSent} emails sent`);

    return new Response(
      JSON.stringify({ success: true, prospectsNurtured, emailsSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("run-prospect-drip error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
