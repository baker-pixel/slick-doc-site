import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate, callGroq, parseJsonFromAi } from "../shared.ts";

export async function buildLandingPages(supabase: any, client: ClientData, inputData?: Record<string, unknown>) {
  const reportDate = formatDate();
  const pageCount = (inputData?.pageCount as number) || 4;

  const systemPrompt = `You are an expert conversion copywriter. Generate landing page copy for a local service business.
Output valid JSON only. No markdown outside the JSON.`;

  const userPrompt = `Create ${pageCount} high-converting landing page copy structures for ${client.business_name}.
Industry: ${client.industry || "local services"}
Tone: ${client.tone || "professional and friendly"}
Website: ${client.website_url || "N/A"}

Return JSON:
{
  "pages": [
    {
      "slug": "service-name",
      "headline": "...",
      "subheadline": "...",
      "benefits": ["benefit 1", "benefit 2", "benefit 3"],
      "social_proof": "...",
      "cta_primary": "...",
      "cta_secondary": "...",
      "faq": [{"q": "...", "a": "..."}],
      "target_audience": "...",
      "primary_keyword": "..."
    }
  ]
}`;

  const aiContent = await callGroq(userPrompt, systemPrompt, 3000);
  const parsed = parseJsonFromAi(aiContent);
  const pages = parsed?.pages || [];

  for (const page of pages) {
    await supabase.from("generated_content").insert({
      client_id: client.id,
      content_type: "landing_page",
      title: page.headline,
      content: JSON.stringify(page),
      metadata: { slug: page.slug, keyword: page.primary_keyword },
    });
  }

  const markdownDoc = `# Landing Page Pack – ${client.business_name}

## Status: Complete ✅

*Generated on ${reportDate}*

**Pages Created:** ${pages.length}

---

${pages.map((p: any, i: number) => `## Page ${i + 1}: ${p.slug || `Page ${i + 1}`}

### Headline
${p.headline}

### Subheadline
${p.subheadline}

### Target Audience
${p.target_audience}

### Primary Keyword
${p.primary_keyword}

### Key Benefits
${(p.benefits || []).map((b: string) => `- ${b}`).join("\n")}

### Social Proof
${p.social_proof}

### CTAs
- **Primary:** ${p.cta_primary}
- **Secondary:** ${p.cta_secondary}

### FAQ
${(p.faq || []).map((f: any) => `**Q:** ${f.q}\n**A:** ${f.a}`).join("\n\n")}

---`).join("\n\n")}

## Next Steps

1. Review copy for brand voice accuracy
2. Hand to developer to build pages from this structure
3. Set up tracking & A/B test CTA variants

*All landing page copy ready for development.*`;

  await createDeliverable(supabase, client.id, `Landing Page Pack – ${reportDate}`, markdownDoc, "content");

  return { pagesCreated: pages.length, pages, deliverableCreated: true };
}
