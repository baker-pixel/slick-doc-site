import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate } from "../shared.ts";
import { callAI, extractJson } from "../../_shared/ai.ts";
import { getClientBrandKit, brandKitToPromptBlock } from "../../_shared/brandKit.ts";
import {
  getRecentContentFeedback, feedbackToPromptBlock,
  getRecentApprovedContent, approvedContentToPromptBlock,
} from "../../_shared/contentFeedback.ts";
import { critiqueContentBatch, qaNeedsAttention, type QaVerdict } from "../../_shared/contentQa.ts";

const BRAND_VOICE_JOB_TYPES = new Set(["content_generation", "email_sequence"]);

// Thin, named wrapper for callers that want to be explicit about generating
// "the usual monthly report" (run-ai-batch's cron, the generate_monthly_
// report/generate_report legacy job types). The "report" case below
// defaults to last-calendar-month itself when no period is given, so this
// no longer needs to compute dates -- it's the same call as
// runAiAutomation(supabase, client, "report") with no inputData.
export async function generateMonthlyReport(supabase: any, client: ClientData) {
  return runAiAutomation(supabase, client, "report");
}

export async function runAiAutomation(supabase: any, client: ClientData, jobType: string, inputData?: Record<string, unknown>) {
  const categoryMap: Record<string, string> = {
    email_sequence: "email_sequences",
    content_generation: "content_generation",
    report: "reporting",
  };

  const { data: sops } = await supabase
    .from("sop_documents")
    .select("*")
    .eq("tier", client.tier)
    .eq("category", categoryMap[jobType] || jobType)
    .eq("is_active", true);

  const sopContent = sops?.map((s: any) => s.parsed_content || s.description).join("\n\n") || "";

  // Brand voice + prior-content context — best-effort, never blocks
  // generation. Only fetched for the two jobTypes where tone/voice actually
  // matters; "report" is data-driven, not brand-voice-sensitive.
  let brandContextBlock = "";
  if (BRAND_VOICE_JOB_TYPES.has(jobType)) {
    const [brandKit, feedback, approved] = await Promise.all([
      getClientBrandKit(supabase, client.id).catch(() => null),
      getRecentContentFeedback(supabase, client.id),
      getRecentApprovedContent(supabase, client.id),
    ]);
    brandContextBlock = [
      brandKit ? brandKitToPromptBlock(brandKit) : "",
      approvedContentToPromptBlock(approved),
      feedbackToPromptBlock(feedback),
    ].filter(Boolean).join("\n\n");
  }

  let systemPrompt = "";
  let userPrompt = "";

  switch (jobType) {
    case "email_sequence":
      systemPrompt = `You are an expert email marketing specialist. Create a personalized email sequence.\n\n${brandContextBlock}\n\nSOPs:\n${sopContent}\n\nOutput JSON: { "sequence_name": "string", "emails": [{ "subject": "string", "body": "string (HTML)", "send_delay_days": number, "purpose": "string" }] }`;
      userPrompt = `Create a ${client.tier}-tier email sequence for ${client.business_name}. Additional context: ${JSON.stringify(inputData || {})}`;
      break;
    case "content_generation":
      const industryContext = client.industry ? `The business is in the ${client.industry} industry.` : "";
      systemPrompt = `You are a digital marketing content expert specializing in creating industry-specific, engaging content. Create content that speaks directly to the target audience and incorporates industry best practices and terminology.\n\n${industryContext}\n\n${brandContextBlock}\n\nOutput JSON: { "content_pieces": [{ "type": "blog_post | social_post | ad_copy", "title": "string", "content": "string", "platform": "string", "target_audience": "string", "key_message": "string" }] }`;
      userPrompt = `Create ${client.tier}-tier content for ${client.business_name}${client.industry ? ` (${client.industry} industry)` : ""}.

Make sure the content:
- Uses industry-specific language and terminology
- Addresses common pain points in the ${client.industry || "their"} industry
- Includes relevant calls-to-action
- Is optimized for the target platform

Context: ${JSON.stringify(inputData || {})}`;
      break;
    case "report": {
      // Default to "last calendar month" when no explicit period is given,
      // so this one tool covers both "just give me the usual report" and
      // "report on this specific period" -- previously two separate tools
      // (generate_monthly_report / report) existed for exactly this
      // distinction, which just meant an agent calling this had to guess
      // which one to use and sometimes called both for the same goal.
      const defaultPeriodStart = new Date();
      defaultPeriodStart.setMonth(defaultPeriodStart.getMonth() - 1);
      const periodStart = ((inputData as any)?.periodStart as string | undefined) ?? defaultPeriodStart.toISOString().split("T")[0];
      const periodEnd = ((inputData as any)?.periodEnd as string | undefined) ?? new Date().toISOString().split("T")[0];

      // Real, cheaply-available counts to ground the report in -- the
      // previous version of this prompt (and a separate, now-removed
      // duplicate in run-ai-batch) asked the model to "use placeholder
      // metrics" with no real data behind them, which produced an actual
      // client-facing email full of invented percentages. There's no
      // traffic/ads/CRM analytics pipeline in this codebase to pull real
      // percentages from, so the honest fix is: report only what's
      // verifiably true, and never let the model invent a number.
      const [{ count: contentCount }, { data: latestAudit }, { count: tasksCount }] = await Promise.all([
        supabase.from("generated_content").select("id", { count: "exact", head: true })
          .eq("client_id", client.id).in("status", ["approved", "client_approved", "published"])
          .gte("updated_at", periodStart).lte("updated_at", periodEnd),
        supabase.from("seo_audits").select("score, created_at")
          .eq("client_account_id", client.id).not("score", "is", null)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("client_tasks").select("id", { count: "exact", head: true })
          .eq("client_account_id", client.id).eq("status", "completed")
          .gte("completed_at", periodStart).lte("completed_at", periodEnd),
      ]);

      const realData = [
        `Content pieces approved/published this period: ${contentCount ?? 0}`,
        `Automation tasks completed this period: ${tasksCount ?? 0}`,
        latestAudit ? `Most recent SEO audit score: ${latestAudit.score}/100 (as of ${latestAudit.created_at})` : "No SEO audit on file.",
      ].join("\n");

      systemPrompt = `You are a marketing analytics expert. Generate an honest, grounded performance report using ONLY the real data provided -- never invent a specific number, percentage, or metric that isn't derivable from it. If you don't have enough real data for a metric, omit it from "metrics" rather than making one up; write the narrative around what actually happened (work completed, content shipped) instead of guessed traffic/conversion figures.\n\nOutput JSON: { "executive_summary": "string", "metrics": {}, "insights": ["string"], "recommendations": [{ "priority": "high|medium|low", "action": "string", "expected_impact": "string" }] }`;
      userPrompt = `Generate a performance report for ${client.business_name}. Period: ${periodStart} to ${periodEnd}.\n\nREAL DATA FOR THIS PERIOD:\n${realData}`;
      break;
    }
  }

  const aiContent = await callAI({
    source: "run-automation:ai_task",
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 2048,
    jsonMode: true,
  });

  let parsedOutput: Record<string, unknown> = {};
  try {
    parsedOutput = extractJson<Record<string, unknown>>(aiContent);
  } catch (_e) {
    parsedOutput = { raw_content: aiContent };
  }

  const reportDate = formatDate();

  // Store results and create deliverables based on type
  if (jobType === "content_generation" && parsedOutput.content_pieces) {
    const pieces = parsedOutput.content_pieces as Array<{ type: string; title: string; content: string; platform?: string }>;

    // Self-QA: cheap second-model critique, best-effort, one call for the
    // whole batch of pieces rather than one call per piece. Never blocks a
    // piece from reaching admin review -- only flags it.
    const qaResults = await critiqueContentBatch(
      pieces.map((piece) => ({ content: piece.content, contentType: piece.type || "content" })),
      client.tone || "professional",
      client.id,
    );

    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      await supabase.from("generated_content").insert({
        client_id: client.id,
        content_type: piece.type || "other",
        title: piece.title,
        content: piece.content,
        metadata: { platform: piece.platform, ...(qaResults[i] ? { qa: qaResults[i] } : {}) },
      });
    }

    const flagged = pieces
      .map((piece, i) => ({ piece, qa: qaResults[i] }))
      .filter(({ qa }) => qaNeedsAttention(qa));

    if (flagged.length > 0) {
      await supabase.from("activity_feed").insert({
        client_account_id: client.id,
        activity_type: "content_draft_ready",
        title: `Content draft ready for review — ${flagged.length} piece(s) flagged by QA`,
        description: flagged
          .map(({ piece, qa }) => `"${piece.title}" (score ${qa!.score}/10): ${qa!.issues.join("; ") || "brand tone mismatch"}`)
          .join(" | "),
        icon: "alert-triangle",
        metadata: { qa_flagged: flagged.map(({ piece, qa }) => ({ title: piece.title, qa })) },
      }).catch(() => {});
    }

    await createDeliverable(
      supabase,
      client.id,
      `Content Generation - ${reportDate}`,
      `# Generated Content

## Summary

*Generated on ${reportDate} for ${client.business_name}*

**Pieces Created:** ${pieces.length}

## Content Items

${pieces.map((p, i) => `### ${i + 1}. ${p.title}
**Type:** ${p.type}
**Platform:** ${p.platform || 'General'}

${p.content.substring(0, 300)}${p.content.length > 300 ? '...' : ''}`).join('\n\n')}

## Next Steps

- Review each content piece for accuracy
- Approve or request revisions
- Schedule for publishing

*All content is ready for your review!*`,
      "content"
    );
  }

  if (jobType === "email_sequence") {
    const sequenceName = (parsedOutput as any).sequence_name || "Custom Sequence";
    const emails = (parsedOutput as any).emails || [];

    const qaResults: (QaVerdict | null)[] = await critiqueContentBatch(
      emails.map((e: any) => ({ content: e.body || "", contentType: "email" })),
      client.tone || "professional",
      client.id,
    );
    const flagged = emails
      .map((e: any, i: number) => ({ email: e, qa: qaResults[i] }))
      .filter(({ qa }: { qa: QaVerdict | null }) => qaNeedsAttention(qa));

    if (flagged.length > 0) {
      await supabase.from("activity_feed").insert({
        client_account_id: client.id,
        activity_type: "content_draft_ready",
        title: `Email sequence "${sequenceName}" ready for review — ${flagged.length} email(s) flagged by QA`,
        description: flagged
          .map(({ email, qa }: { email: any; qa: QaVerdict | null }) => `"${email.subject}" (score ${qa!.score}/10): ${qa!.issues.join("; ") || "brand tone mismatch"}`)
          .join(" | "),
        icon: "alert-triangle",
        metadata: { qa_flagged: flagged.map(({ email, qa }: { email: any; qa: QaVerdict | null }) => ({ subject: email.subject, qa })) },
      }).catch(() => {});
    }

    await createDeliverable(
      supabase,
      client.id,
      `Email Sequence: ${sequenceName} - ${reportDate}`,
      `# Email Sequence Created

## ${sequenceName}

*Generated on ${reportDate} for ${client.business_name}*

**Total Emails:** ${emails.length}

## Sequence Overview

${emails.map((e: any, i: number) => `### Email ${i + 1}: ${e.subject}
**Send Delay:** ${e.send_delay_days} days
**Purpose:** ${e.purpose}

Preview:
> ${e.body?.replace(/<[^>]*>/g, '').substring(0, 150)}...`).join('\n\n')}

## Next Steps

- Review each email for brand voice
- Approve or request revisions
- Once approved, sequence will be activated

*Your email sequence is ready for review!*`,
      "content"
    );
  }

  if (jobType === "report") {
    // Same "default to last calendar month" fallback used to build the
    // prompt above -- must match, otherwise the stored report_period_start/
    // end columns (today-to-today) would contradict what the report text
    // itself says the period was.
    const fallbackStart = new Date();
    fallbackStart.setMonth(fallbackStart.getMonth() - 1);
    const periodStart = (inputData as any)?.periodStart || fallbackStart.toISOString().split("T")[0];
    const periodEnd = (inputData as any)?.periodEnd || new Date().toISOString().split("T")[0];

    // client_reports has no dedicated executive_summary column -- fold it in
    // as the lead item so it isn't silently dropped when this report is
    // previewed or emailed.
    const summaryLine = typeof parsedOutput.executive_summary === "string" ? parsedOutput.executive_summary : null;
    const insightsWithSummary = [
      ...(summaryLine ? [summaryLine] : []),
      ...((parsedOutput.insights as string[] | undefined) || []),
    ];

    await supabase.from("client_reports").insert({
      client_id: client.id,
      report_type: "monthly",
      report_period_start: periodStart,
      report_period_end: periodEnd,
      metrics: parsedOutput.metrics || {},
      insights: insightsWithSummary,
      recommendations: parsedOutput.recommendations || [],
    });

    const insights = insightsWithSummary;
    const recommendations = (parsedOutput.recommendations || []) as Array<{ priority: string; action: string; expected_impact: string }>;

    await createDeliverable(
      supabase,
      client.id,
      `Monthly Performance Report - ${reportDate}`,
      `# Monthly Performance Report

## Period: ${periodStart} to ${periodEnd}

*Generated on ${reportDate} for ${client.business_name}*

## Executive Summary

${(parsedOutput as any).executive_summary || 'Performance data has been analyzed for this period.'}

## Key Insights

${insights.map((insight: string) => `- ${insight}`).join('\n')}

## Recommendations

${recommendations.map((r: any) => `### ${r.priority?.toUpperCase()} Priority
**Action:** ${r.action}
**Expected Impact:** ${r.expected_impact}`).join('\n\n')}

## What's Next

Your marketing team will:
1. Implement high-priority recommendations
2. Continue optimizing current campaigns
3. Provide updates at our next check-in

*Thank you for your partnership!*`,
      "report"
    );
  }

  return { ...parsedOutput, deliverableCreated: true };
}
