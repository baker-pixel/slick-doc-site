import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

let resend: Resend;

// Brand palette
const ORANGE     = rgb(0.91,  0.322, 0.141);
const WHITE      = rgb(1,     1,     1    );
const DARK       = rgb(0.102, 0.078, 0.063);
const MED_GRAY   = rgb(0.48,  0.39,  0.33 );
const LIGHT_BG   = rgb(0.98,  0.969, 0.949);
const LIGHT_RULE = rgb(0.941, 0.922, 0.886);
const GREEN      = rgb(0.176, 0.416, 0.31 );
const AMBER      = rgb(0.706, 0.329, 0.035);
const RED        = rgb(0.863, 0.208, 0.208);
const GRAY_TEXT  = rgb(0.6,   0.6,   0.6  );

function scoreColor(score: number) {
  if (score >= 70) return GREEN;
  if (score >= 50) return AMBER;
  if (score >= 30) return ORANGE;
  return RED;
}

function scoreLabel(score: number): string {
  if (score >= 70) return "Strong";
  if (score >= 50) return "Moderate";
  if (score >= 30) return "Weak";
  return "Critical";
}

function getTierLabel(score: number): string {
  if (score <= 39) return "Transformation";
  if (score <= 64) return "Growth";
  return "Optimization";
}

function getTierDesc(score: number): string {
  if (score <= 39) return "Significant gaps exist. Fixing fundamentals will unlock real customer growth online.";
  if (score <= 64) return "A solid foundation with clear opportunities to drive more leads and conversions.";
  return "Strong performance. Strategic refinements will push results to the next level.";
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).length <= maxChars) {
      cur = cur ? cur + " " + w : w;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

type PDFPage = ReturnType<typeof PDFDocument.prototype.addPage>;

function drawPageChrome(
  page: PDFPage, W: number, H: number, reg: any, bold: any,
  pageNum: number, totalPages: number,
) {
  page.drawRectangle({ x: 0, y: H - 3, width: W, height: 3, color: ORANGE });
  page.drawRectangle({ x: 0, y: 0, width: W, height: 36, color: LIGHT_BG });
  page.drawLine({ start: { x: 0, y: 36 }, end: { x: W, y: 36 }, thickness: 0.5, color: LIGHT_RULE });
  page.drawText("Orange Door Consulting", { x: 40, y: 14, size: 8, font: reg, color: MED_GRAY });
  page.drawText("orangedoormarketing.com", { x: W - 172, y: 14, size: 8, font: reg, color: ORANGE });
  const pn = `${pageNum} / ${totalPages}`;
  const pnW = reg.widthOfTextAtSize(pn, 7);
  page.drawText(pn, { x: (W - pnW) / 2, y: 14, size: 7, font: reg, color: MED_GRAY });
}

function drawInnerHeader(
  page: PDFPage, W: number, H: number, bold: any, reg: any,
  title: string, subtitle: string,
) {
  page.drawRectangle({ x: 0, y: H - 73, width: W, height: 70, color: DARK });
  page.drawRectangle({ x: 0, y: H - 3, width: 120, height: 3, color: ORANGE });
  page.drawText(title.toUpperCase(), { x: 40, y: H - 42, size: 17, font: bold, color: WHITE });
  page.drawText(subtitle, { x: 40, y: H - 60, size: 9.5, font: reg, color: GRAY_TEXT });
}

function getCategoryInsights(category: string, score: number): string[] {
  if (category.toLowerCase().includes("seo")) {
    if (score < 40) return [
      "Search engines cannot easily find or rank your pages",
      "Critical on-page elements — title tags, meta descriptions — are missing or broken",
      "Local search presence and structured data need immediate attention",
    ];
    if (score < 60) return [
      "Basic SEO is in place but key optimization signals are absent",
      "Content gaps and keyword targeting opportunities remain untapped",
      "Local listings and schema markup can significantly boost your visibility",
    ];
    if (score < 75) return [
      "Good SEO foundation with consistent on-page signals present",
      "Expanding keyword coverage and content depth will grow organic traffic",
      "Technical refinements will improve crawlability and search rankings",
    ];
    return [
      "Strong SEO signals across titles, descriptions, and content structure",
      "Focus on competitive keywords and building topical authority",
      "Maintain technical health and monitor Core Web Vitals regularly",
    ];
  }
  if (category.toLowerCase().includes("conversion")) {
    if (score < 40) return [
      "Visitors are not being guided toward key conversion actions",
      "Missing clear calls-to-action and trust indicators on critical pages",
      "Landing page structure and messaging need significant restructuring",
    ];
    if (score < 60) return [
      "Some conversion elements present but not placed for maximum impact",
      "Trust signals like testimonials and guarantees need strengthening",
      "Call-to-action clarity and visual prominence need improvement",
    ];
    if (score < 75) return [
      "Good conversion architecture in place with optimization opportunities",
      "Testing headlines and CTA placement can meaningfully increase conversions",
      "Social proof and urgency elements can be leveraged more effectively",
    ];
    return [
      "Strong conversion architecture with clear, guided user journeys",
      "Continue refining messaging and expanding social proof",
      "Explore personalization and post-visit follow-up sequences",
    ];
  }
  // Technical Performance
  if (score < 40) return [
    "Site speed and mobile experience are significantly impacting users",
    "Core Web Vitals are likely failing Google's performance thresholds",
    "Security signals or HTTPS configuration may be deterring visitors",
  ];
  if (score < 60) return [
    "Site loads acceptably but speed improvements can reduce bounce rates",
    "Mobile experience may be inconsistent across device types",
    "Performance optimizations will improve both user experience and rankings",
  ];
  if (score < 75) return [
    "Solid technical foundation with minor performance opportunities",
    "Image optimization and browser caching can further improve load times",
    "Mobile experience is functional and can be refined further",
  ];
  return [
    "Excellent technical performance across speed and mobile metrics",
    "Maintain server response times and Core Web Vitals scores",
    "Focus on advanced performance optimizations for peak-traffic resilience",
  ];
}

interface ProspectData {
  name: string;
  email: string;
  website_url: string;
  gap_score: number | null;
  top_weaknesses: string[] | null;
  seo_score: number | null;
  conversion_score: number | null;
  technical_score: number | null;
  summary: string | null;
  quick_wins: { title: string; description: string }[] | null;
  context_profile?: {
    business_summary?: string;
    services?: string[];
    differentiators?: string[];
    target_audience?: string;
    location?: string;
  } | null;
  business_type?: string | null;
}

async function generateProspectPDF(prospect: ProspectData): Promise<Uint8Array> {
  const doc  = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg  = await doc.embedFont(StandardFonts.Helvetica);
  const W = 612;
  const H = 792;

  const score     = prospect.gap_score ?? 0;
  const sc        = scoreColor(score);
  const tierLabel = getTierLabel(score);
  const firstName = prospect.name?.split(" ")[0] || "there";
  const domain    = prospect.website_url?.replace(/^https?:\/\//, "").replace(/\/$/, "") || "";
  const dateStr   = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const TOTAL     = 4;
  const cp        = prospect.context_profile ?? null;

  const categories = [
    { label: "SEO & Visibility",      score: prospect.seo_score       ?? 0 },
    { label: "Conversion Elements",   score: prospect.conversion_score ?? 0 },
    { label: "Technical Performance", score: prospect.technical_score  ?? 0 },
  ];

  // ═══════════════════════════════════════════════════════════
  // PAGE 1 — COVER: Greeting · Overall Score · Category Bars
  // ═══════════════════════════════════════════════════════════
  const p1 = doc.addPage([W, H]);
  drawPageChrome(p1, W, H, reg, bold, 1, TOTAL);

  // Dark masthead
  p1.drawRectangle({ x: 0, y: H - 140, width: W, height: 137, color: DARK });
  p1.drawRectangle({ x: 0, y: H - 3,   width: 130, height: 3, color: ORANGE });
  p1.drawText("ORANGE DOOR",      { x: 40, y: H - 46,  size: 11,  font: bold, color: ORANGE });
  p1.drawText("DIGITAL MARKETING",{ x: 40, y: H - 60,  size: 7.5, font: reg,  color: GRAY_TEXT });
  p1.drawText("Website Marketing Report", { x: 40, y: H - 100, size: 25, font: bold, color: WHITE });
  p1.drawText(domain, { x: 40, y: H - 120, size: 11, font: reg, color: GRAY_TEXT });
  const dW = reg.widthOfTextAtSize(dateStr, 9);
  p1.drawText(dateStr, { x: W - 40 - dW, y: H - 120, size: 9, font: reg, color: GRAY_TEXT });

  // Greeting
  let y = H - 162;
  p1.drawText(`Hi ${firstName},`, { x: 40, y, size: 14, font: bold, color: DARK });
  y -= 20;
  const introText = `We analyzed ${domain} and identified specific opportunities to attract more customers online. Your personalized report is below — review it before your strategy call so we can go straight to solutions.`;
  for (const line of wrapText(introText, 88)) {
    p1.drawText(line, { x: 40, y, size: 10.5, font: reg, color: MED_GRAY });
    y -= 15;
  }

  // Overall score hero card
  y -= 14;
  const heroH = 128;
  p1.drawRectangle({ x: 40, y: y - heroH, width: W - 80, height: heroH, color: LIGHT_BG });
  p1.drawRectangle({ x: 40, y: y - heroH, width: 4,      height: heroH, color: sc });

  const circleX = 114;
  const circleY = y - heroH / 2;
  p1.drawCircle({ x: circleX, y: circleY, size: 36, color: sc });
  const stW = bold.widthOfTextAtSize(String(score), 28);
  p1.drawText(String(score), { x: circleX - stW / 2, y: circleY - 8,  size: 28, font: bold, color: WHITE });
  p1.drawText("/ 100",       { x: circleX - 14,      y: circleY - 24, size: 8,  font: reg,  color: WHITE });

  const tierX = 178;
  p1.drawText("OVERALL SCORE",          { x: tierX, y: y - 20, size: 8,  font: reg,  color: MED_GRAY });
  p1.drawText(`${tierLabel} Plan`,      { x: tierX, y: y - 38, size: 19, font: bold, color: DARK });
  p1.drawText(scoreLabel(score),        { x: tierX, y: y - 56, size: 11, font: bold, color: sc });
  let tdY = y - 70;
  for (const line of wrapText(getTierDesc(score), 52).slice(0, 3)) {
    p1.drawText(line, { x: tierX, y: tdY, size: 9, font: reg, color: MED_GRAY });
    tdY -= 13;
  }

  y = y - heroH - 22;

  // Category breakdown
  p1.drawText("Category Breakdown", { x: 40, y, size: 13, font: bold, color: DARK });
  p1.drawLine({ start: { x: 40, y: y - 5 }, end: { x: 198, y: y - 5 }, thickness: 1.5, color: ORANGE });
  y -= 22;

  for (const cat of categories) {
    const cc  = scoreColor(cat.score);
    p1.drawText(cat.label, { x: 40, y, size: 10, font: reg, color: DARK });
    const barX = 202;
    const barW = 288;
    p1.drawRectangle({ x: barX, y: y - 3, width: barW,                                      height: 9, color: LIGHT_RULE });
    p1.drawRectangle({ x: barX, y: y - 3, width: Math.max(5, (cat.score / 100) * barW), height: 9, color: cc });
    const snW = bold.widthOfTextAtSize(String(cat.score), 11);
    p1.drawText(String(cat.score),   { x: barX + barW + 10,          y: y - 2, size: 11, font: bold, color: cc });
    p1.drawText(scoreLabel(cat.score), { x: barX + barW + 14 + snW, y: y - 2, size: 9,  font: reg,  color: cc });
    y -= 26;
  }

  // Executive summary pull-quote
  const summaryPreview = prospect.summary || cp?.business_summary || null;
  if (summaryPreview && y > 120) {
    y -= 16;
    p1.drawRectangle({ x: 40, y: y - 62, width: W - 80, height: 62, color: DARK });
    p1.drawRectangle({ x: 40, y: y - 62, width: 4,      height: 62, color: ORANGE });
    p1.drawText("EXECUTIVE SUMMARY", { x: 54, y: y - 16, size: 7.5, font: bold, color: ORANGE });
    let qy = y - 30;
    for (const line of wrapText(summaryPreview, 83).slice(0, 3)) {
      p1.drawText(line, { x: 54, y: qy, size: 9.5, font: reg, color: WHITE });
      qy -= 14;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PAGE 2 — ANALYSIS: Per-Category Deep Dive + Key Finding
  // ═══════════════════════════════════════════════════════════
  const p2 = doc.addPage([W, H]);
  drawPageChrome(p2, W, H, reg, bold, 2, TOTAL);
  drawInnerHeader(p2, W, H, bold, reg,
    "Digital Marketing Analysis",
    "What our AI found when it reviewed your website",
  );

  y = H - 96;

  for (let i = 0; i < categories.length; i++) {
    const cat      = categories[i];
    const cc       = scoreColor(cat.score);
    const insights = getCategoryInsights(cat.label, cat.score);

    // Category header bar
    p2.drawRectangle({ x: 40, y: y - 13, width: W - 80, height: 13, color: LIGHT_BG });
    p2.drawText(cat.label, { x: 52, y: y - 10, size: 11, font: bold, color: DARK });

    const badgeTxt = `${cat.score}  ${scoreLabel(cat.score)}`;
    const badgeW   = bold.widthOfTextAtSize(badgeTxt, 9) + 16;
    p2.drawRectangle({ x: W - 40 - badgeW, y: y - 13, width: badgeW, height: 13, color: cc });
    p2.drawText(badgeTxt, { x: W - 40 - badgeW + 7, y: y - 9, size: 9, font: bold, color: WHITE });

    y -= 20;

    // Full-width progress bar
    p2.drawRectangle({ x: 40, y: y - 5, width: W - 80,                                      height: 5, color: LIGHT_RULE });
    p2.drawRectangle({ x: 40, y: y - 5, width: Math.max(4, (cat.score / 100) * (W - 80)), height: 5, color: cc });
    y -= 14;

    // Insight bullets
    for (const ins of insights) {
      p2.drawCircle({ x: 52, y: y - 1, size: 2.2, color: cc });
      for (const line of wrapText(ins, 82)) {
        p2.drawText(line, { x: 62, y: y - 0.5, size: 9.5, font: reg, color: MED_GRAY });
        y -= 14;
      }
    }

    if (i < categories.length - 1) {
      p2.drawLine({ start: { x: 40, y: y - 6 }, end: { x: W - 40, y: y - 6 }, thickness: 0.4, color: LIGHT_RULE });
      y -= 20;
    }
  }

  // Key finding callout
  const keyFinding = prospect.summary || "";
  if (keyFinding && y > 110) {
    y -= 28;
    const kfH = 74;
    p2.drawRectangle({ x: 40, y: y - kfH, width: W - 80, height: kfH, color: DARK });
    p2.drawRectangle({ x: 40, y: y - kfH, width: 4,      height: kfH, color: ORANGE });
    p2.drawText("KEY FINDING", { x: 54, y: y - 18, size: 8, font: bold, color: ORANGE });
    let kfy = y - 33;
    for (const line of wrapText(keyFinding, 81).slice(0, 4)) {
      p2.drawText(line, { x: 54, y: kfy, size: 10, font: reg, color: WHITE });
      kfy -= 14;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PAGE 3 — ACTION PLAN: Weaknesses + Quick Wins
  // ═══════════════════════════════════════════════════════════
  const p3 = doc.addPage([W, H]);
  drawPageChrome(p3, W, H, reg, bold, 3, TOTAL);
  drawInnerHeader(p3, W, H, bold, reg,
    "Your Action Plan",
    "Prioritised improvements ordered by impact",
  );

  y = H - 96;

  // Areas to Improve
  const weaknesses = (prospect.top_weaknesses || []).slice(0, 6);
  if (weaknesses.length > 0) {
    p3.drawText("Areas That Need Attention", { x: 40, y, size: 14, font: bold, color: DARK });
    p3.drawLine({ start: { x: 40, y: y - 6 }, end: { x: 250, y: y - 6 }, thickness: 1.5, color: ORANGE });
    y -= 24;

    for (let i = 0; i < weaknesses.length; i++) {
      if (y < 130) break;
      p3.drawCircle({ x: 52, y: y + 2, size: 9, color: ORANGE });
      const nw = bold.widthOfTextAtSize(String(i + 1), 8.5);
      p3.drawText(String(i + 1), { x: 52 - nw / 2, y: y - 1.5, size: 8.5, font: bold, color: WHITE });
      for (const line of wrapText(weaknesses[i], 80)) {
        p3.drawText(line, { x: 70, y, size: 10.5, font: reg, color: DARK });
        y -= 15;
      }
      y -= 8;
    }
  }

  // Quick Wins
  const quickWins = (prospect.quick_wins || []).slice(0, 4);
  if (quickWins.length > 0 && y > 170) {
    y -= 8;
    p3.drawText("Quick Wins — Do This Week", { x: 40, y, size: 14, font: bold, color: DARK });
    p3.drawLine({ start: { x: 40, y: y - 6 }, end: { x: 242, y: y - 6 }, thickness: 1.5, color: GREEN });
    y -= 24;

    for (const win of quickWins) {
      if (y < 80) break;
      const cardH = 50;
      p3.drawRectangle({ x: 40, y: y - cardH, width: W - 80, height: cardH, color: LIGHT_BG });
      p3.drawRectangle({ x: 40, y: y - cardH, width: 3,      height: cardH, color: GREEN });

      const tagTxt = "QUICK WIN";
      const tagW   = bold.widthOfTextAtSize(tagTxt, 7) + 14;
      p3.drawRectangle({ x: W - 40 - tagW, y: y - 14, width: tagW, height: 12, color: GREEN });
      p3.drawText(tagTxt, { x: W - 40 - tagW + 7, y: y - 8, size: 7, font: bold, color: WHITE });

      p3.drawText(win.title, { x: 52, y: y - 13, size: 11, font: bold, color: DARK });
      let dy = y - 26;
      for (const dl of wrapText(win.description, 75).slice(0, 2)) {
        p3.drawText(dl, { x: 52, y: dy, size: 9, font: reg, color: MED_GRAY });
        dy -= 12;
      }
      y -= cardH + 7;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PAGE 4 — WHAT HAPPENS NEXT: Summary · Call Items · CTA
  // ═══════════════════════════════════════════════════════════
  const p4 = doc.addPage([W, H]);
  drawPageChrome(p4, W, H, reg, bold, 4, TOTAL);
  drawInnerHeader(p4, W, H, bold, reg,
    "What Happens Next",
    "Your path to more customers online",
  );

  y = H - 100;

  // Full summary
  if (prospect.summary) {
    p4.drawText("Your Report Summary", { x: 40, y, size: 13, font: bold, color: DARK });
    p4.drawLine({ start: { x: 40, y: y - 6 }, end: { x: 168, y: y - 6 }, thickness: 1.5, color: ORANGE });
    y -= 22;
    for (const line of wrapText(prospect.summary, 88).slice(0, 5)) {
      p4.drawText(line, { x: 40, y, size: 10.5, font: reg, color: MED_GRAY });
      y -= 15;
    }
    y -= 12;
  }

  // Business profile card
  if (cp) {
    const profileLines: string[] = [];
    if (Array.isArray(cp.services) && cp.services.length > 0)
      profileLines.push(`Services: ${cp.services.slice(0, 4).join(", ")}`);
    if (cp.target_audience)
      profileLines.push(`Target Audience: ${cp.target_audience}`);
    if (cp.location)
      profileLines.push(`Location: ${cp.location}`);

    if (profileLines.length > 0 && y > 100) {
      const profileH = 16 + profileLines.length * 14;
      p4.drawRectangle({ x: 40, y: y - profileH, width: W - 80, height: profileH, color: LIGHT_BG });
      p4.drawRectangle({ x: 40, y: y - profileH, width: 4,      height: profileH, color: ORANGE });
      p4.drawText("YOUR BUSINESS PROFILE", { x: 54, y: y - 14, size: 7.5, font: bold, color: ORANGE });
      let bpY = y - 26;
      for (const pl of profileLines) {
        const txt = pl.length > 80 ? pl.slice(0, 77) + "..." : pl;
        p4.drawText(txt, { x: 54, y: bpY, size: 9, font: reg, color: DARK });
        bpY -= 14;
      }
      y -= profileH + 16;
    }
  }

  // Strategy call section
  p4.drawText("On Your Free Strategy Call, We'll Cover:", { x: 40, y, size: 13, font: bold, color: DARK });
  p4.drawLine({ start: { x: 40, y: y - 6 }, end: { x: 308, y: y - 6 }, thickness: 1.5, color: ORANGE });
  y -= 22;

  const callItems = [
    {
      num: "1",
      title: "Walk through your report together",
      desc: "We explain exactly what each score means for your business and where you're losing customers.",
    },
    {
      num: "2",
      title: "Identify your top 3 priorities",
      desc: "Based on your goals, budget, and timeline, we focus on what will move the needle fastest.",
    },
    {
      num: "3",
      title: "Build your personalised action roadmap",
      desc: "You leave with a clear, prioritised plan — whether you choose to work with us or not.",
    },
  ];

  for (const item of callItems) {
    if (y < 90) break;
    const itemH = 44;
    p4.drawRectangle({ x: 40, y: y - itemH, width: W - 80, height: itemH, color: LIGHT_BG });
    p4.drawCircle({ x: 60, y: y - itemH / 2, size: 11, color: ORANGE });
    const nw = bold.widthOfTextAtSize(item.num, 10);
    p4.drawText(item.num, { x: 60 - nw / 2, y: y - itemH / 2 - 3.5, size: 10, font: bold, color: WHITE });
    p4.drawText(item.title, { x: 80, y: y - 12, size: 11, font: bold, color: DARK });
    let dY = y - 25;
    for (const dl of wrapText(item.desc, 74).slice(0, 2)) {
      p4.drawText(dl, { x: 80, y: dY, size: 9, font: reg, color: MED_GRAY });
      dY -= 12;
    }
    y -= itemH + 6;
  }

  // CTA box
  const ctaBoxH = 58;
  const ctaY    = Math.max(50, y - 16);
  p4.drawRectangle({ x: 40, y: ctaY, width: W - 80, height: ctaBoxH, color: ORANGE });

  const cta1    = "Ready to close the gap and grow online?";
  const cta1W   = bold.widthOfTextAtSize(cta1, 14);
  p4.drawText(cta1, { x: (W - cta1W) / 2, y: ctaY + 40, size: 14, font: bold, color: WHITE });

  const cta2    = "Book your free 30-minute strategy call — no pressure, no obligation.";
  const cta2W   = reg.widthOfTextAtSize(cta2, 9.5);
  p4.drawText(cta2, { x: (W - cta2W) / 2, y: ctaY + 24, size: 9.5, font: reg, color: WHITE });

  const ctaUrl  = "orangedoormarketing.com/schedule";
  const ctaUrlW = bold.widthOfTextAtSize(ctaUrl, 11);
  p4.drawText(ctaUrl, { x: (W - ctaUrlW) / 2, y: ctaY + 8, size: 11, font: bold, color: WHITE });

  return await doc.save();
}

// ── Email HTML ──────────────────────────────────────────────────────────────

function buildEmailHtml(prospect: ProspectData): string {
  const score      = prospect.gap_score;
  const weaknesses = prospect.top_weaknesses || [];
  const tierLabel  = score != null ? getTierLabel(score) : "Growth";
  const firstName  = prospect.name?.split(" ")[0] || "there";
  const domain     = prospect.website_url?.replace(/^https?:\/\//, "").replace(/\/$/, "") || "";

  const hex  = (s: number) =>
    s >= 70 ? "#2D6A4F" : s >= 50 ? "#B45309" : s >= 30 ? "#E8521A" : "#dc2626";
  const grad = (s: number) =>
    s >= 70 ? "#2D6A4F,#3A8A65" : s >= 50 ? "#B45309,#D97706" : s >= 30 ? "#E8521A,#F97316" : "#dc2626,#ef4444";

  const weaknessRows = weaknesses.length > 0
    ? weaknesses.map((w, i) =>
        `<tr>
          <td style="padding:14px 16px;font-weight:bold;color:#E8521A;vertical-align:top;width:36px;font-size:18px;font-family:Georgia,'Times New Roman',serif;">${i + 1}.</td>
          <td style="padding:14px 16px 14px 0;color:#FAF7F2;font-size:14px;line-height:1.6;">${w}</td>
        </tr>`
      ).join("")
    : `<tr><td colspan="2" style="padding:14px 16px;color:#999;">Detailed analysis attached in your PDF report.</td></tr>`;

  const catRows = [
    { label: "SEO & Visibility",      score: prospect.seo_score       ?? 0 },
    { label: "Conversion Elements",   score: prospect.conversion_score ?? 0 },
    { label: "Technical Performance", score: prospect.technical_score  ?? 0 },
  ].map(cat => {
    const h   = hex(cat.score);
    const pct = Math.max(5, cat.score);
    const lbl = scoreLabel(cat.score);
    return `<tr>
      <td style="padding:10px 0;color:#1A1410;font-size:13px;font-weight:600;width:160px;">${cat.label}</td>
      <td style="padding:10px 0;">
        <div style="background:#F0EBE2;border-radius:4px;height:8px;width:100%;">
          <div style="background:${h};border-radius:4px;height:8px;width:${pct}%;"></div>
        </div>
      </td>
      <td style="padding:10px 0 10px 12px;color:${h};font-weight:bold;font-size:13px;text-align:right;width:90px;">${cat.score} — ${lbl}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Website Marketing Report</title></head>
<body style="margin:0;padding:0;background:#F0EBE2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:620px;margin:24px auto;background:#ffffff;overflow:hidden;">

  <div style="height:4px;background:linear-gradient(90deg,#E8521A,#F97316);"></div>

  <!-- ① Header -->
  <div style="background:#1A1410;padding:36px 40px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <div style="color:#E8521A;font-weight:bold;font-size:13px;letter-spacing:2.5px;margin-bottom:2px;">ORANGE DOOR</div>
        <div style="color:#666;font-size:10px;letter-spacing:1.5px;">DIGITAL MARKETING</div>
      </td>
      <td align="right" valign="top"><span style="color:#666;font-size:11px;">Website Marketing Report</span></td>
    </tr></table>
    <h1 style="color:#fff;margin:24px 0 0;font-size:26px;font-weight:700;line-height:1.2;font-family:Georgia,'Times New Roman',serif;">Your Free Marketing Report</h1>
    <p style="margin:8px 0 0;font-size:13px;"><a href="${prospect.website_url || '#'}" style="color:#E8521A;text-decoration:none;">${domain}</a></p>
  </div>

  <!-- ② Greeting -->
  <div style="padding:36px 40px 0;">
    <p style="font-size:17px;color:#1A1410;margin:0 0 6px;font-weight:600;">Hi ${firstName},</p>
    <p style="font-size:14px;color:#7A6355;line-height:1.7;margin:0 0 28px;">
      We analyzed <a href="${prospect.website_url || '#'}" style="color:#E8521A;">${domain}</a> and found specific opportunities to help you attract more customers online. Your full report is attached as a PDF — here's your summary.
    </p>

  ${score != null ? `
  <!-- ③ Score Card -->
  <div style="background:#1A1410;border-radius:12px;padding:32px 24px;text-align:center;margin-bottom:28px;">
    <div style="display:inline-block;width:96px;height:96px;border-radius:50%;background:linear-gradient(135deg,${grad(score)});text-align:center;line-height:96px;">
      <span style="font-size:36px;font-weight:bold;color:#fff;font-family:Georgia,'Times New Roman',serif;">${score}</span>
    </div>
    <p style="margin:14px 0 4px;font-size:11px;color:#7A6355;letter-spacing:2px;text-transform:uppercase;">Out of 100</p>
    <p style="margin:0 0 6px;font-size:18px;font-weight:bold;color:#FAF7F2;font-family:Georgia,'Times New Roman',serif;">Recommended: ${tierLabel} Plan</p>
    <p style="margin:0;font-size:13px;color:#999;">${getTierDesc(score)}</p>
  </div>
  ` : ""}

  ${score != null ? `
  <!-- ④ Category Breakdown -->
  <div style="background:#FAF7F2;border-radius:10px;padding:20px 24px;margin-bottom:28px;border:1px solid #F0EBE2;">
    <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#1A1410;letter-spacing:1px;text-transform:uppercase;">Category Breakdown</p>
    <p style="margin:0 0 14px;font-size:12px;color:#7A6355;">Your scores across the three key marketing pillars</p>
    <table width="100%" cellpadding="0" cellspacing="0">${catRows}</table>
  </div>
  ` : ""}

  <!-- ⑤ Top Areas to Improve -->
  <div style="background:#1A1410;border-radius:12px;padding:28px;margin-bottom:28px;">
    <h2 style="font-size:18px;color:#FAF7F2;margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;">Your Top Areas to Improve</h2>
    <div style="width:60px;height:2px;background:#E8521A;margin:0 0 10px;"></div>
    <p style="font-size:13px;color:#7A6355;margin:0 0 16px;line-height:1.5;">These are the highest-impact changes we found for your website:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${weaknessRows}</table>
  </div>

  <!-- ⑥ What happens next -->
  <div style="border:1px solid #F0EBE2;border-radius:10px;padding:24px;margin-bottom:28px;">
    <h3 style="font-size:16px;color:#1A1410;margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;">On your free strategy call, we'll:</h3>
    <table cellpadding="0" cellspacing="0" width="100%">
      ${[
        ["1","Walk through your report","Explain what each score means and where you're losing customers."],
        ["2","Identify your top 3 priorities","Focus on what will move the needle fastest for your goals."],
        ["3","Build your action roadmap","You leave with a clear plan — whether you work with us or not."],
      ].map(([num, title, desc]) => `<tr>
        <td style="vertical-align:top;width:32px;padding-bottom:14px;">
          <div style="width:24px;height:24px;background:#E8521A;border-radius:50%;text-align:center;line-height:24px;color:#fff;font-weight:bold;font-size:12px;">${num}</div>
        </td>
        <td style="padding-bottom:14px;padding-left:12px;">
          <strong style="color:#1A1410;font-size:13px;">${title}</strong><br>
          <span style="color:#7A6355;font-size:12px;line-height:1.5;">${desc}</span>
        </td>
      </tr>`).join("")}
    </table>
  </div>

  <!-- ⑦ CTA -->
  <div style="text-align:center;margin:8px 0 28px;">
    <a href="https://orangedoormarketing.com/schedule"
       style="display:inline-block;padding:16px 44px;background:linear-gradient(135deg,#E8521A,#F97316);color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;letter-spacing:0.5px;font-family:Georgia,'Times New Roman',serif;">
      Book My Free Strategy Call
    </a>
    <p style="font-size:12px;color:#7A6355;margin:10px 0 0;">No pressure. No obligation. Just clarity on your next step.</p>
  </div>

  <div style="border-top:1px solid #F0EBE2;padding:24px 0 0;">
    <p style="font-size:13px;color:#7A6355;margin:0;">
      Talk soon,<br><strong style="color:#1A1410;">The Orange Door Team</strong>
    </p>
  </div>
  </div>

  <!-- Footer -->
  <div style="background:#FAF7F2;padding:20px 40px;text-align:center;font-size:11px;color:#999;border-top:1px solid #F0EBE2;">
    Orange Door Consulting · AI-Powered Marketing for Local Businesses<br>
    <span style="color:#E8521A;">Your full report is attached as a PDF.</span>
  </div>
</div>
</body></html>`;
}

// ── Handler ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY is not configured");
    resend = new Resend(resendKey);

    const { prospectId } = await req.json();
    if (!prospectId) throw new Error("prospectId is required");

    const { data: prospect, error: fetchError } = await supabase
      .from("prospects")
      .select("*")
      .eq("id", prospectId)
      .single();

    if (fetchError || !prospect) throw new Error("Prospect not found");

    console.log(`Generating 4-page report for ${prospect.email}...`);

    const pdfBytes   = await generateProspectPDF(prospect as ProspectData);
    const pdfBase64  = btoa(String.fromCharCode(...pdfBytes));
    console.log(`PDF generated: ${pdfBytes.length} bytes`);

    const html = buildEmailHtml(prospect as ProspectData);

    const emailResponse = await resend.emails.send({
      from: Deno.env.get("EMAIL_FROM") || "Orange Door Consultants <hello@orangedoormarketing.com>",
      to: [prospect.email],
      subject: `Your free marketing report for ${prospect.website_url}`,
      html,
      attachments: [
        {
          filename: "Website-Marketing-Report.pdf",
          content: pdfBase64,
        },
      ],
    });

    console.log(`Report sent to ${prospect.email}:`, emailResponse);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-prospect-report error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
