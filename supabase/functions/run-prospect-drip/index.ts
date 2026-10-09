import { clientIdsWithMailbox } from "../_shared/outreachMailbox.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/http.ts";
import { callAIJson } from "../_shared/ai.ts";
import { recordOutcome } from "../_shared/outcomes.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";
import { logActivity } from "../_shared/activityLog.ts";
import { refreshProspectProject } from "../_shared/prospectProject.ts";
import { logAlert } from "../_shared/alerts.ts";
import { checkPipelineAuth } from "../_shared/auth.ts";
import {
  type Audience,
  campaignBlock,
  findOutreachViolations,
  OUTREACH_STYLE_RULES,
  outreachGreeting,
  senderFactsBlock,
  stepBrief,
  toneInstruction,
} from "../_shared/outreachPrompt.ts";
// logActivity for "email sent" moved to process-email-queue -- that's where
// the actual send now happens (this function only enrolls/schedules).

// Cap on how many prospects get (re-)enrolled per run -- each enrollment
// makes up to 4 AI calls to draft the full sequence upfront, so this bounds
// LLM spend per run, not send volume (sending/rate-limiting is
// process-email-queue's job now, not this function's).
const MAX_ENROLLMENTS_PER_RUN = 25;
// Stop starting new prospects once this much wall-clock has elapsed: each
// prospect drafts up to 4 emails with the LLM, and an edge function killed
// mid-run leaves the rest for the next hourly run (enrollment is resumable
// per step, see below) instead of dying half-way with nothing logged.
const RUN_TIME_BUDGET_MS = 100_000;

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
  // Set for campaign leads (CSV upload): a real person's details.
  campaign_id?: string | null;
  contact_first_name?: string | null;
  contact_title?: string | null;
  personalization_hook?: string | null;
}

interface Campaign {
  id: string;
  status: string;
  max_steps: number;
  audience: Audience;
  topic: string | null;
  topic_details: string | null;
}

interface ClientAccount {
  id: string;
  business_name: string;
  email: string;
  website_url?: string | null;
  industry?: string | null;
  tier?: string | null;
  // The portal's Company Context card saves tone here and verified_facts /
  // never_say inside context_profile; brand_voice is a legacy column.
  tone?: string | null;
  context_profile?: Record<string, unknown> | null;
  brand_voice?: Record<string, unknown> | null;
  outreach_settings?: {
    signature?: { name?: string; title?: string } | null;
    cta?: { label?: string; url?: string } | null;
  } | null;
}

// "— {name}, {title}" when the client's set a signature, falling back to
// the business name (the only signoff that existed before this setting).
function getSignOff(client: ClientAccount): string {
  const name = client.outreach_settings?.signature?.name?.trim();
  if (!name) return client.business_name;
  const title = client.outreach_settings?.signature?.title?.trim();
  return title ? `${name}, ${title}` : name;
}

function getCta(client: ClientAccount): { url: string; label: string } {
  const url = client.outreach_settings?.cta?.url?.trim() || client.website_url || "https://orangedoormarketing.com/schedule";
  const label = client.outreach_settings?.cta?.label?.trim() || url;
  return { url, label };
}

interface SequenceStep {
  delay_days?: number;
}

// Cold outreach reads as spam the moment it looks like a template -- no
// branded header, no card, no colored button. Plain text on a white
// background, like a person actually typed it.
// The preferences page rejects a link without the token (base64 of the
// email, same scheme as the unsubscribe function), so include it.
const wrapHtml = (body: string, unsubEmail: string = "") => `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:20px auto;font-size:15px;color:#222;line-height:1.6;">
  ${body}
  <p style="font-size:12px;color:#999;margin-top:32px;">
    <a href="https://orangedoormarketing.com/email-preferences?email=${encodeURIComponent(unsubEmail)}&token=${unsubEmail ? btoa(unsubEmail) : ""}&unsub=1" style="color:#999;">Unsubscribe</a>
  </p>
</div>
</body></html>`;

function buildClientCtaButton(client: ClientAccount): string {
  const { url, label } = getCta(client);
  return `<p><a href="${url}">${label}</a></p>`;
}

// Fallback -- only used if the AI call fails or keeps breaking the style
// rules. Deliberately makes NO claims about the sender's customers, results
// or capabilities beyond the client's own business summary, and never uses
// the prospect's company name as a first name.
function buildStaticOutreachEmail(
  prospect: Prospect,
  client: ClientAccount,
  step: number,
): { subject: string; html: string } | null {
  const greeting = outreachGreeting(prospect.email, prospect.contact_first_name);
  const clientName = client.business_name;
  const signOff = getSignOff(client);
  const cta = buildClientCtaButton(client);
  const summary = typeof client.context_profile?.business_summary === "string"
    ? client.context_profile.business_summary.trim().replace(/\.$/, "")
    : "";
  const about = summary ? `${summary}.` : `We're ${clientName}.`;

  switch (step) {
    case 1:
      return {
        subject: `quick question`,
        html: wrapHtml(`
          <p>${greeting}</p>
          <p>${about} I thought it might be relevant to what you're working on.</p>
          <p>Would it be worth a short conversation?</p>
          ${cta}
          <p>— ${signOff}</p>
        `, prospect.email),
      };

    case 2:
      return {
        subject: `following up`,
        html: wrapHtml(`
          <p>${greeting}</p>
          <p>Following up on my last note. ${about}</p>
          <p>If it's not relevant, no problem. If it is, I'm happy to explain more.</p>
          ${cta}
          <p>— ${signOff}</p>
        `, prospect.email),
      };

    case 3:
      return {
        subject: `what ${clientName} does`,
        html: wrapHtml(`
          <p>${greeting}</p>
          <p>In case it helps, here's the short version of what we do. ${about}</p>
          <p>Is that something you'd want to look at?</p>
          ${cta}
          <p>— ${signOff}</p>
        `, prospect.email),
      };

    case 4:
      return {
        subject: `last note`,
        html: wrapHtml(`
          <p>${greeting}</p>
          <p>I'll leave it here so I don't clutter your inbox. If the timing is ever right, you can find us below.</p>
          ${cta}
          <p>— ${signOff}</p>
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
  campaign: Campaign | null,
): Promise<{ subject: string; html: string } | null> {
  const ctx = prospect.context_profile;
  const clientCtx = client.context_profile;

  const brief = stepBrief(step, campaign?.audience ?? "cold");
  if (!brief) return null;

  // ── Prospect signals (only what we actually know) ─────────────
  const prospectServices = ctx && Array.isArray(ctx.services) && (ctx.services as string[]).length > 0
    ? (ctx.services as string[]).join(", ")
    : prospect.business_type || null;
  const prospectAudience = ctx && typeof ctx.target_audience === "string" ? ctx.target_audience : null;
  const prospectSummary = ctx && typeof ctx.business_summary === "string" ? ctx.business_summary : null;
  const prospectPainPoints = ctx && Array.isArray(ctx.pain_points) && (ctx.pain_points as string[]).length > 0
    ? (ctx.pain_points as string[]).slice(0, 2).join("; ")
    : prospect.top_weaknesses?.[0] || null;

  // Tone: the portal's Brand Tone setting (client_accounts.tone, mirrored in
  // context_profile.tone); legacy brand_voice.tone still honoured.
  const legacyTone = client.brand_voice && typeof client.brand_voice.tone === "string" ? client.brand_voice.tone : null;
  const tone = toneInstruction(client.tone || (clientCtx?.tone as string | undefined) || legacyTone);

  const neverSay = Array.isArray(clientCtx?.never_say)
    ? (clientCtx!.never_say as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  const { url: ctaUrl, label: ctaLabel } = getCta(client);
  const signOff = getSignOff(client);
  const greeting = outreachGreeting(prospect.email, prospect.contact_first_name);

  const prospectLines = [
    `- Company: ${prospect.name}`,
    prospectServices ? `- What they do: ${prospectServices}` : null,
    prospect.website_url ? `- Website: ${prospect.website_url}` : null,
    prospectSummary ? `- Summary: ${prospectSummary}` : null,
    prospectAudience ? `- Who they serve: ${prospectAudience}` : null,
    prospectPainPoints ? `- Known gaps: ${prospectPainPoints}` : null,
    prospect.contact_title ? `- Their role: ${prospect.contact_title}` : null,
    // Written by the client about this person (CSV "note" column): safe to use.
    prospect.personalization_hook ? `- Note from the sender about them: ${prospect.personalization_hook}` : null,
  ].filter(Boolean).join("\n");
  const knownLittle = !prospectSummary && !prospectServices && !prospectAudience && !prospectPainPoints && !prospect.personalization_hook;

  const basePrompt = `Write one cold outreach email for "${client.business_name}", as a real person at that business typing a quick note.

SENDER:
${senderFactsBlock(clientCtx, client.business_name)}
- Voice: ${tone}

RECIPIENT (a person at this company):
${prospectLines}${knownLittle ? "\n- Little is known about them. Do not pretend otherwise." : ""}

${campaignBlock(campaign) ? campaignBlock(campaign) + "\n\n" : ""}STEP ${step}/${campaign?.max_steps ?? 4}: ${brief.theme} Max ${brief.maxWords} words.

${OUTREACH_STYLE_RULES}

Body must start with <p>${greeting}</p>, then plain <p> paragraphs only, and end with <p>— ${signOff}</p>. Optional link: <a href="${ctaUrl}">${ctaLabel}</a>
Return ONLY JSON: {"subject":"...","html":"..."}`;

  let feedback = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const parsed = await callAIJson<{ subject?: string; html?: string }>({
        source: "run-prospect-drip",
        clientId: client.id,
        promptId: "prospect-outreach-email.v2",
        prompt: feedback ? `${basePrompt}\n\n${feedback}` : basePrompt,
        maxTokens: 700,
        temperature: 0.7,
      });
      if (!parsed.subject || !parsed.html) return null;

      const violations = findOutreachViolations(
        { subject: parsed.subject, html: parsed.html },
        { greeting, maxWords: Math.round(brief.maxWords * 1.25), neverSay },
      );
      if (violations.length === 0) return { subject: parsed.subject, html: parsed.html };

      console.warn(`outreach draft step ${step} for ${prospect.email} broke rules (attempt ${attempt}): ${violations.join("; ")}`);
      feedback = `YOUR PREVIOUS DRAFT WAS REJECTED for: ${violations.join("; ")}. Rewrite it from scratch fixing every point, keeping all the rules above.`;
    } catch (err) {
      console.error("buildPersonalizedOutreachEmail error:", err);
      return null;
    }
  }

  // Two failed drafts: hand back null so the caller uses the honest static
  // fallback rather than queueing copy we already know breaks the rules.
  return null;
}

// Cancels any not-yet-sent queued steps for a prospect who became
// disqualified (converted/unsubscribed/bounced) after enrollment -- without
// this, steps already queued ahead would still go out on schedule even
// though the prospect converted or opted out days ago.
async function cancelPendingQueuedEmails(supabase: any, prospectId: string): Promise<void> {
  await supabase
    .from("email_queue")
    .update({ status: "cancelled" })
    .filter("metadata->>prospect_id", "eq", prospectId)
    .eq("status", "pending");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Cron (x-internal-secret), service key, or an admin -- never a bare anon key.
  if (!(await checkPipelineAuth(req, supabase, null))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const now = new Date();
    const runStartedAt = Date.now();
    let prospectsNurtured = 0;
    let prospectsEnrolled = 0;

    // 0. Load the campaign definition. Cadence (delay_days per step) is
    // data-driven from here -- reusing the same email_sequences model that
    // already powers inbound marketing-lead nurture, instead of a hardcoded
    // schedule living in this function's source code. Content is NOT driven
    // by this row's own templating (that's flat merge-field substitution,
    // built for uniform marketing copy) -- it's generated per-prospect below,
    // which is what makes cold outreach actually work.
    const { data: sequence, error: sequenceErr } = await supabase
      .from("email_sequences")
      .select("id, emails")
      .eq("trigger_type", "prospect_outreach")
      .eq("is_active", true)
      .is("tier", null)
      .maybeSingle();

    if (sequenceErr || !sequence) {
      await logAlert(supabase, {
        source: "run-prospect-drip",
        alertType: "function_error",
        severity: "error",
        title: "No active prospect_outreach sequence found",
        message: sequenceErr?.message ?? "email_sequences has no active, tier-less row for trigger_type=prospect_outreach",
      });
      return new Response(JSON.stringify({ error: "No active prospect_outreach sequence configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const steps = (sequence.emails as SequenceStep[] | null) ?? [];

    // 1. Move pending prospects (48h+ after approval) to nurture
    const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const { data: pendingProspects } = await supabase
      .from("prospects")
      .select("id")
      .eq("status", "pending")
      .lte("approved_at", cutoff);

    if (pendingProspects && pendingProspects.length > 0) {
      const ids = pendingProspects.map((p: { id: string }) => p.id);
      const { data: moved } = await supabase
        .from("prospects")
        .update({ status: "nurture", drip_step: 0 })
        .in("id", ids)
        .eq("status", "pending")
        .select("id");
      prospectsNurtured = moved?.length ?? 0;
      console.log(`Moved ${ids.length} prospects to nurture`);
    }

    // 2. Fetch nurture prospects who haven't finished the sequence
    const { data: nurtureProspects } = await supabase
      .from("prospects")
      .select("*")
      .eq("status", "nurture")
      .lt("drip_step", steps.length);

    if (!nurtureProspects || nurtureProspects.length === 0) {
      return new Response(
        JSON.stringify({ success: true, prospectsNurtured, prospectsEnrolled }),
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
    const prospectingDisabled = new Set<string>();
    if (clientIds.length > 0) {
      const { data: clientRows, error: clientRowsErr } = await supabase
        .from("client_accounts")
        .select("id, business_name, email, website_url, industry, tone, context_profile, brand_voice, tier, outreach_settings")
        .in("id", clientIds)
        .eq("status", "active");
      if (clientRowsErr) {
        // This exact silent failure (destructuring only `data`, never
        // `error`) is why the whole drip system sent zero emails for an
        // unknown length of time: the select referenced a column that
        // doesn't exist on client_accounts (business_type -- prospects has
        // that column, client_accounts never did), PostgREST rejected the
        // query, and clientRows silently fell through to an empty array via
        // `?? []`, so every prospect's client lookup missed and got skipped
        // with no error, no alert, nothing.
        await logAlert(supabase, {
          source: "run-prospect-drip",
          alertType: "function_error",
          severity: "error",
          title: "Failed to fetch client_accounts for drip",
          message: clientRowsErr.message,
          metadata: { clientIds },
        });
      }
      const mailboxClients = await clientIdsWithMailbox(supabase, clientIds);
      for (const c of (clientRows ?? [])) {
        // No connected mailbox -> no outreach (never the shared sender).
        if (!mailboxClients.has(c.id)) {
          prospectingDisabled.add(c.id);
          continue;
        }
        // Tier gate: plans without prospecting never send outreach, even if
        // prospects were somehow discovered/approved for them.
        if (!tierPolicy((c as { tier?: string }).tier).prospect.enabled) {
          prospectingDisabled.add(c.id);
          continue;
        }
        clientMap.set(c.id, c as ClientAccount);
      }
    }

    // 4. Build suppression sets
    // a) prospects whose email matches an active client → converted
    const { data: allClientRows } = await supabase
      .from("client_accounts")
      .select("email")
      .eq("status", "active");
    const clientEmailSet = new Set(
      (allClientRows ?? []).map((c: { email: string }) => c.email.toLowerCase()),
    );

    // Query with both stored and lowercased forms -- table rows may differ
    // in case from what the prospect row holds; set membership below is
    // always compared lowercase.
    const nurtureEmails = [...new Set(
      (nurtureProspects as Prospect[])
        .filter(p => p.email)
        .flatMap(p => [p.email, p.email.toLowerCase()]),
    )];

    // b) opt-outs -- every drip email links to /email-preferences, which
    // writes this table. Not honoring it = CAN-SPAM/CASL violation.
    const unsubscribedSet = new Set<string>();
    const bouncedSet = new Set<string>();
    if (nurtureEmails.length > 0) {
      const { data: optOuts } = await supabase
        .from("email_preferences")
        .select("email")
        .eq("subscribed", false)
        .in("email", nurtureEmails);
      for (const r of optOuts ?? []) unsubscribedSet.add((r as { email: string }).email.toLowerCase());

      // c) hard bounces / spam complaints recorded by resend-webhook --
      // retrying these tanks the sending domain's reputation.
      const { data: badSends } = await supabase
        .from("email_logs")
        .select("recipient_email, status")
        .in("status", ["bounced", "complained"])
        .in("recipient_email", nurtureEmails);
      for (const r of badSends ?? []) bouncedSet.add((r as { recipient_email: string }).recipient_email.toLowerCase());
    }

    // 5. For every eligible prospect: disqualify (and cancel anything
    // already queued) or enroll their remaining steps.
    // Campaigns the nurture prospects belong to (status, step cap, topic).
    const campaignIds = [...new Set(
      (nurtureProspects as Prospect[]).map((p) => p.campaign_id).filter((id): id is string => !!id),
    )];
    const campaignMap = new Map<string, Campaign>();
    if (campaignIds.length > 0) {
      const { data: campaignRows, error: campaignErr } = await supabase
        .from("prospect_campaigns")
        .select("id, status, max_steps, audience, topic, topic_details")
        .in("id", campaignIds);
      if (campaignErr) {
        // Without campaign rows we cannot tell paused from active -- skip campaign
        // leads this run rather than emailing people from a paused campaign.
        await logAlert(supabase, {
          source: "run-prospect-drip",
          alertType: "function_error",
          severity: "error",
          title: "Failed to fetch prospect_campaigns for drip",
          message: campaignErr.message,
        });
      }
      for (const c of (campaignRows ?? []) as Campaign[]) campaignMap.set(c.id, c);
    }

    // Drafting is the expensive part (one LLM call per step). A big uploaded
    // list must not be drafted weeks ahead of when it can actually be sent, so
    // stop enrolling a client once about a week of sends is already queued.
    const pendingByClient = new Map<string, number>();
    const pendingFor = async (clientId: string): Promise<number> => {
      if (!pendingByClient.has(clientId)) {
        const { count } = await supabase
          .from("email_queue")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .filter("metadata->>client_id", "eq", clientId);
        pendingByClient.set(clientId, count ?? 0);
      }
      return pendingByClient.get(clientId)!;
    };

    const touchedClients = new Set<string>();
    for (const prospect of nurtureProspects as Prospect[]) {
      if (prospect.client_id && prospectingDisabled.has(prospect.client_id)) continue;
      if (!prospect.email || !prospect.email.includes("@")) continue;

      const emailLower = prospect.email.toLowerCase();

      if (clientEmailSet.has(emailLower)) {
        await supabase.from("prospects").update({ status: "converted", converted_at: new Date().toISOString() }).eq("id", prospect.id);
        await cancelPendingQueuedEmails(supabase, prospect.id);
        // Outcome signal + feedback input: a real conversion. getConversionWins
        // reads these back to calibrate future fit scoring for this client.
        if (prospect.client_id) {
          await recordOutcome(supabase, prospect.client_id, {
            source: "prospect", metric: "prospect_converted", value: 1,
            metadata: { prospect_id: prospect.id, business_type: prospect.business_type },
          });
          touchedClients.add(prospect.client_id);
        }
        console.log(`Prospect ${prospect.email} is now a client — marked converted, queue cancelled`);
        continue;
      }

      if (unsubscribedSet.has(emailLower)) {
        await supabase.from("prospects").update({ status: "unsubscribed" }).eq("id", prospect.id);
        await cancelPendingQueuedEmails(supabase, prospect.id);
        console.log(`Prospect ${prospect.email} unsubscribed — removed from drip, queue cancelled`);
        continue;
      }

      if (bouncedSet.has(emailLower)) {
        await supabase.from("prospects").update({ status: "bounced" }).eq("id", prospect.id);
        await cancelPendingQueuedEmails(supabase, prospect.id);
        console.log(`Prospect ${prospect.email} previously bounced/complained — removed from drip, queue cancelled`);
        continue;
      }

      if (!prospect.client_id) continue;
      const client = clientMap.get(prospect.client_id);
      if (!client) continue;

      if (prospectsEnrolled >= MAX_ENROLLMENTS_PER_RUN) continue;
      if (Date.now() - runStartedAt > RUN_TIME_BUDGET_MS) continue;

      // Campaign gate: paused/archived (or unknown) campaigns enroll nothing.
      const campaign = prospect.campaign_id ? campaignMap.get(prospect.campaign_id) ?? null : null;
      if (prospect.campaign_id && campaign?.status !== "active") continue;
      const stepLimit = Math.min(steps.length, campaign?.max_steps ?? steps.length);
      if (prospect.drip_step >= stepLimit) continue;

      const sendCap = tierPolicy(client.tier).prospect.dailySendCap;
      if (sendCap > 0 && (await pendingFor(client.id)) >= sendCap * 7) continue;

      // Which steps are already queued? email_queue rows persist with status
      // flipped to sent/failed/cancelled, never deleted, so any row for a step
      // counts as "handled". Tracked per step (not per prospect) so a run that
      // died or failed part-way through drafting the sequence is completed by
      // the next run instead of leaving the prospect stranded with only some
      // of their steps queued.
      const { data: existingQueueRows } = await supabase
        .from("email_queue")
        .select("metadata")
        .filter("metadata->>prospect_id", "eq", prospect.id)
        .filter("metadata->>sequence_id", "eq", sequence.id);
      const alreadyQueuedSteps = new Set(
        (existingQueueRows ?? []).map((r: { metadata: { drip_step?: number } | null }) => r.metadata?.drip_step),
      );
      if (alreadyQueuedSteps.size >= stepLimit) continue;

      // Clock starts from when nurture began (approved_at + 48h), not
      // created_at -- prevents prospects discovered days ago from firing
      // every step at once.
      const nurtureStart = prospect.approved_at
        ? new Date(new Date(prospect.approved_at).getTime() + 48 * 60 * 60 * 1000)
        : new Date(prospect.created_at);

      // Work out each missing step's send time first. A step whose nominal
      // time is already past (late enrollment: email found days after
      // approval, run cap, client un-paused) is pushed to "now", and each
      // later step keeps at least its own delay_days after the one before --
      // otherwise a late prospect would get several emails in the same batch.
      const missing: { stepNumber: number; scheduledFor: Date }[] = [];
      let cumulativeDays = 0;
      let previousSendAt: Date | null = null;
      for (let i = 0; i < stepLimit; i++) {
        const stepNumber = i + 1;
        const delayDays = steps[i].delay_days ?? 0;
        cumulativeDays += delayDays;
        if (stepNumber <= prospect.drip_step) continue; // already sent under this or a prior run
        if (alreadyQueuedSteps.has(stepNumber)) {
          previousSendAt = new Date(nurtureStart.getTime() + cumulativeDays * 24 * 60 * 60 * 1000);
          continue;
        }
        let sendAt = new Date(nurtureStart.getTime() + cumulativeDays * 24 * 60 * 60 * 1000);
        if (sendAt < now) sendAt = now;
        if (previousSendAt) {
          const earliest = new Date(previousSendAt.getTime() + delayDays * 24 * 60 * 60 * 1000);
          if (sendAt < earliest) sendAt = earliest;
        }
        missing.push({ stepNumber, scheduledFor: sendAt });
        previousSendAt = sendAt;
      }

      // Draft the missing steps concurrently -- they're independent LLM calls.
      const drafted = await Promise.all(missing.map(async ({ stepNumber }) => {
        const content = (await buildPersonalizedOutreachEmail(prospect, client, stepNumber, campaign))
          ?? buildStaticOutreachEmail(prospect, client, stepNumber);
        return { stepNumber, content };
      }));

      let enrolledAny = false;
      for (const { stepNumber, content } of drafted) {
        if (!content) continue;
        const html = content.html.includes("<!DOCTYPE")
          ? content.html
          : wrapHtml(content.html, prospect.email);
        const scheduledFor = missing.find((m) => m.stepNumber === stepNumber)!.scheduledFor;
        const isFinalStep = stepNumber >= stepLimit;

        const { error: queueErr } = await supabase.from("email_queue").insert({
          recipient_email: prospect.email,
          recipient_name: prospect.name,
          subject: content.subject,
          html_content: html,
          scheduled_for: scheduledFor.toISOString(),
          status: "pending",
          metadata: {
            source: "run-prospect-drip",
            sequence_id: sequence.id,
            prospect_id: prospect.id,
            client_id: prospect.client_id,
            drip_step: stepNumber,
            is_final_step: isFinalStep,
          },
        });
        if (queueErr) {
          console.error(`Failed to queue step ${stepNumber} for ${prospect.email}:`, queueErr.message);
          await logAlert(supabase, {
            source: "run-prospect-drip",
            alertType: "function_error",
            severity: "error",
            title: "Failed to queue an outreach step",
            message: `Step ${stepNumber} for ${prospect.email}: ${queueErr.message}`,
            metadata: { prospect_id: prospect.id, step: stepNumber },
          });
          continue;
        }
        enrolledAny = true;
        pendingByClient.set(client.id, (pendingByClient.get(client.id) ?? 0) + 1);
      }

      if (enrolledAny) {
        prospectsEnrolled++;
        touchedClients.add(prospect.client_id);
        console.log(`Enrolled ${prospect.email} into prospect_outreach sequence from step ${prospect.drip_step + 1}`);
      }
    }

    // Keep each touched client's Lead Generation Plan project current.
    for (const cid of touchedClients) {
      await refreshProspectProject(supabase, cid);
    }

    console.log(`Drip run complete: ${prospectsNurtured} nurtured, ${prospectsEnrolled} enrolled`);

    return new Response(
      JSON.stringify({ success: true, prospectsNurtured, prospectsEnrolled }),
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
