// Ground-truth (regex-detected, not LLM-guessed) signals for the two SYSTEM
// categories a website scan can honestly speak to beyond SEO/conversion:
// Engagement & Retention (reviews/testimonials/social proof) and Metrics &
// Improvement (analytics/tracking installed). Deliberately NOT scored by an
// LLM guessing whether a business "has a CRM" or "tracks close rate" --
// those aren't observable from a page fetch, so Quick Analysis leaves them
// locked (see QuickAnalysis.tsx) instead of fabricating a number for them.

export interface SystemVisibleCategory {
  score: number;
  findings: string[];
  recommendations: string[];
}

export function scoreEngagementRetention(html: string): SystemVisibleCategory {
  const signals: string[] = [];
  if (/"aggregaterating"|"@type"\s*:\s*"review"/i.test(html)) signals.push("Review/rating schema markup");
  if (/testimonial/i.test(html)) signals.push("Testimonials section");
  if (/trustpilot\.com|g2\.com\/reviews|yelp\.com\/biz|reviews\.google\.com|g\.page\/r\//i.test(html)) signals.push("Link to a third-party review platform");
  if (/★|⭐|class=["'][^"']*star-rating/i.test(html)) signals.push("Star rating display");

  if (signals.length === 0) {
    return {
      score: 20,
      findings: ["No reviews, testimonials, or ratings visible on the page — visitors see no social proof of past customer satisfaction."],
      recommendations: ["Add a testimonials section and link out to your Google Business reviews."],
    };
  }
  return {
    score: Math.min(90, 40 + signals.length * 20),
    findings: [`Found on the page: ${signals.join(", ")}.`],
    recommendations: signals.length < 2
      ? ["Add more visible proof — a star rating widget or a direct link to your review platform."]
      : ["Keep review/testimonial content current as new reviews come in."],
  };
}

export function scoreMetricsImprovement(html: string): SystemVisibleCategory {
  const detected: string[] = [];
  if (/googletagmanager\.com\/gtm\.js/i.test(html)) detected.push("Google Tag Manager");
  if (/gtag\(|google-analytics\.com\/analytics\.js|googletagmanager\.com\/gtag\/js/i.test(html)) detected.push("Google Analytics");
  if (/connect\.facebook\.net\/[^"']*\/fbevents\.js|fbq\(/i.test(html)) detected.push("Meta Pixel");
  if (/js\.hs-scripts\.com|hs-analytics\.net/i.test(html)) detected.push("HubSpot tracking");
  if (/plausible\.io\/js|static\.hotjar\.com|cdn\.segment\.com|cdn\.mxpnl\.com/i.test(html)) detected.push("Another analytics tool");

  if (detected.length === 0) {
    return {
      score: 15,
      findings: ["No analytics or tracking scripts (Google Analytics, Tag Manager, Meta Pixel) detected on the page — little visibility into what visitors actually do on the site."],
      recommendations: ["Install Google Analytics or Google Tag Manager so traffic and conversions are actually measurable."],
    };
  }
  return {
    score: Math.min(90, 45 + detected.length * 25),
    findings: [`Tracking detected: ${detected.join(", ")}.`],
    recommendations: detected.length < 2
      ? ["Consider adding conversion/goal tracking on top of the analytics already installed."]
      : ["Review these tools' dashboards regularly — installed tracking is only useful if someone's looking at it."],
  };
}
