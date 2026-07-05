import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate, callGroq, parseJsonFromAi } from "../shared.ts";

export async function createLeadMagnet(supabase: any, client: ClientData, inputData?: Record<string, unknown>) {
  const reportDate = formatDate();
  const magnetType = (inputData?.type as string) || "guide";

  const systemPrompt = `You are a lead generation expert. Create a complete lead magnet including content, landing page copy, and follow-up email sequence.
Output valid JSON only.`;

  const userPrompt = `Create a high-value lead magnet for ${client.business_name}.
Industry: ${client.industry || "local services"}
Type: ${magnetType} (guide, checklist, or template)
Tone: ${client.tone || "professional and helpful"}

Return JSON:
{
  "title": "...",
  "subtitle": "...",
  "type": "guide|checklist|template",
  "target_pain_point": "...",
  "sections": [
    {"heading": "...", "content": "...", "key_takeaway": "..."}
  ],
  "landing_page": {
    "headline": "...",
    "subheadline": "...",
    "benefits": ["...", "...", "..."],
    "cta": "...",
    "form_fields": ["First Name", "Email"]
  },
  "thank_you_email": {
    "subject": "...",
    "body": "..."
  },
  "follow_up_sequence": [
    {"day": 1, "subject": "...", "preview": "..."},
    {"day": 3, "subject": "...", "preview": "..."},
    {"day": 7, "subject": "...", "preview": "..."}
  ]
}`;

  const aiContent = await callGroq(userPrompt, systemPrompt, 3500);
  const parsed = parseJsonFromAi(aiContent);

  await supabase.from("generated_content").insert({
    client_id: client.id,
    content_type: "lead_magnet",
    title: parsed?.title || `Lead Magnet – ${client.business_name}`,
    content: JSON.stringify(parsed),
    metadata: { type: magnetType },
  });

  if (parsed?.follow_up_sequence?.length) {
    const emails = parsed.follow_up_sequence.map((e: any) => ({
      delay_days: e.day,
      subject: e.subject,
      template_slug: "lead_magnet_followup",
      preview: e.preview,
    }));
    await supabase.from("email_sequences").insert({
      name: `Lead Magnet Follow-up – ${client.business_name}`,
      trigger_type: "lead_magnet_download",
      is_active: true,
      emails,
    });
  }

  const markdownDoc = `# Lead Magnet: ${parsed?.title || "Custom Lead Magnet"} – ${client.business_name}

## Status: Complete ✅

*Generated on ${reportDate}*

---

## Overview

**Type:** ${parsed?.type || magnetType}
**Title:** ${parsed?.title}
**Subtitle:** ${parsed?.subtitle}
**Pain Point Addressed:** ${parsed?.target_pain_point}

---

## Content Outline

${(parsed?.sections || []).map((s: any, i: number) => `### Section ${i + 1}: ${s.heading}

${s.content}

**Key Takeaway:** *${s.key_takeaway}*`).join("\n\n")}

---

## Landing Page Copy

**Headline:** ${parsed?.landing_page?.headline}

**Subheadline:** ${parsed?.landing_page?.subheadline}

**Benefits:**
${(parsed?.landing_page?.benefits || []).map((b: string) => `- ${b}`).join("\n")}

**CTA Button:** ${parsed?.landing_page?.cta}

**Form Fields:** ${(parsed?.landing_page?.form_fields || ["First Name", "Email"]).join(", ")}

---

## Thank You Email

**Subject:** ${parsed?.thank_you_email?.subject}

${parsed?.thank_you_email?.body}

---

## Follow-Up Email Sequence

| Day | Subject | Preview |
|-----|---------|---------|
${(parsed?.follow_up_sequence || []).map((e: any) => `| Day ${e.day} | ${e.subject} | ${e.preview} |`).join("\n")}

---

## Implementation Checklist

- [ ] Design lead magnet PDF using content above
- [ ] Build landing page from copy provided
- [ ] Connect form to CRM and trigger thank you email
- [ ] Activate follow-up email sequence in CRM
- [ ] Add lead magnet CTA to website homepage and blog posts

*Lead magnet content and sequences are ready for production.*`;

  await createDeliverable(supabase, client.id, `Lead Magnet: ${parsed?.title || "Custom"} – ${reportDate}`, markdownDoc, "content");

  return { created: true, title: parsed?.title, sequenceEmails: parsed?.follow_up_sequence?.length || 0, deliverableCreated: true };
}
