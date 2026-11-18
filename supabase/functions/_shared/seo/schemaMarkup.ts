// Deterministic schema.org JSON-LD generation for the AEO "missing_schema"
// fix. No LLM call -- Organization/LocalBusiness markup is fully derivable
// from facts we already have on file (business_name, website_url, phone,
// address), and a deterministic builder can't hallucinate a fact we don't
// actually know.

export interface BusinessFacts {
  name: string;
  url: string;
  phone?: string | null;
  address?: string | null;
}

export function buildOrganizationJsonLd(business: BusinessFacts): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": business.address ? "LocalBusiness" : "Organization",
    name: business.name,
    url: business.url,
  };
  if (business.phone) schema.telephone = business.phone;
  if (business.address) schema.address = { "@type": "PostalAddress", streetAddress: business.address };
  return schema;
}

// FAQPage JSON-LD for the AEO "missing_faq_schema" fix. Built only from Q&A
// pairs already extracted off the live page (seoSignals.extractQaPairs) --
// this marks up existing content, it never invents a question or answer.
export interface FaqItem {
  question: string;
  answer: string;
}

export function buildFaqJsonLd(items: FaqItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}
