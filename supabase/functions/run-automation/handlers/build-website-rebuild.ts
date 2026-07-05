import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate, callGroq, parseJsonFromAi } from "../shared.ts";

export async function buildWebsiteRebuild(supabase: any, client: ClientData, inputData?: Record<string, unknown>) {
  const reportDate = formatDate();
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  const systemPrompt = `You are a senior web strategist. Create a comprehensive website rebuild brief.
Output valid JSON only.`;

  const userPrompt = `Create a full website rebuild brief for ${client.business_name}.
Industry: ${client.industry || "local services"}
Existing site: ${client.website_url || "none"}

Return JSON:
{
  "site_goals": ["goal 1", "goal 2"],
  "pages_required": [{"name": "...", "purpose": "...", "key_sections": ["..."]}],
  "conversion_architecture": "...",
  "technical_requirements": ["req 1", "req 2"],
  "seo_foundations": ["..."],
  "integrations_needed": ["CRM", "..."],
  "content_needed": ["..."],
  "timeline_weeks": 8,
  "discovery_questions": ["question 1", "question 2"]
}`;

  const aiContent = await callGroq(userPrompt, systemPrompt, 2500);
  const parsed = parseJsonFromAi(aiContent);

  if (RESEND_API_KEY) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Orange Door Consultants <hello@orangedoormarketing.com>",
        to: client.email,
        subject: `Your Website Rebuild Has Started – ${client.business_name}`,
        html: `
          <h2>Your Website Rebuild Is Underway, ${client.first_name || client.business_name}!</h2>
          <p>We've kicked off your new website project. Here's what happens next:</p>
          <ol>
            <li><strong>Discovery:</strong> We'll review your answers and brand assets</li>
            <li><strong>Design:</strong> Wireframes and mockups for your approval</li>
            <li><strong>Development:</strong> Build with conversion-optimized architecture</li>
            <li><strong>Launch:</strong> QA, SEO setup, and go-live</li>
          </ol>
          <p><strong>Estimated timeline:</strong> ${parsed?.timeline_weeks || 8} weeks</p>
          <p>Questions? Reply to this email or reach us at hello@orangedoormarketing.com</p>
          <p>Best regards,<br/>The Orange Door Team</p>
        `,
      }),
    });
  }

  const markdownDoc = `# Website Rebuild Project Brief – ${client.business_name}

## Status: Initiated ✅

*Generated on ${reportDate}*

---

## Site Goals
${(parsed?.site_goals || ["Increase lead volume", "Improve brand credibility"]).map((g: string) => `- ${g}`).join("\n")}

## Pages Required
${(parsed?.pages_required || []).map((p: any) => `
### ${p.name}
**Purpose:** ${p.purpose}
**Key Sections:** ${(p.key_sections || []).join(", ")}`).join("\n")}

## Conversion Architecture
${parsed?.conversion_architecture || "Homepage → Service pages → Lead capture → Thank you"}

## Technical Requirements
${(parsed?.technical_requirements || []).map((r: string) => `- ${r}`).join("\n")}

## SEO Foundations to Build In
${(parsed?.seo_foundations || []).map((s: string) => `- ${s}`).join("\n")}

## Integrations Needed
${(parsed?.integrations_needed || ["CRM", "Analytics", "Chat widget"]).map((i: string) => `- ${i}`).join("\n")}

## Content Needed
${(parsed?.content_needed || []).map((c: string) => `- ${c}`).join("\n")}

## Discovery Questions for Client
${(parsed?.discovery_questions || []).map((q: string, i: number) => `${i + 1}. ${q}`).join("\n")}

## Timeline
**Estimated Duration:** ${parsed?.timeline_weeks || 8} weeks

| Week | Milestone |
|------|-----------|
| 1-2 | Discovery & wireframes |
| 3-4 | Design mockups & client approval |
| 5-6 | Development |
| 7 | QA & content loading |
| 8 | Launch & post-launch monitoring |

---

*Client notified by email. Kickoff discovery call to be scheduled.*`;

  await createDeliverable(supabase, client.id, `Website Rebuild Brief – ${reportDate}`, markdownDoc, "general");

  return { briefCreated: true, emailSent: !!RESEND_API_KEY, deliverableCreated: true };
}
