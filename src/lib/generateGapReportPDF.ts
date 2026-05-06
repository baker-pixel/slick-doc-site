import jsPDF from "jspdf";

// ── Palette ────────────────────────────────────────────────────────────────
const TEAL:       [number,number,number] = [29,  158, 117];  // #1D9E75
const TEAL_BG:    [number,number,number] = [225, 245, 238];  // #E1F5EE
const TEAL_TEXT:  [number,number,number] = [15,  110, 86 ];  // #0F6E56
const AMBER:      [number,number,number] = [239, 159, 39 ];  // #EF9F27
const AMBER_BG:   [number,number,number] = [250, 238, 218];  // #FAEEDA
const AMBER_TEXT: [number,number,number] = [133, 79,  11 ];  // #854F0B
const BLUE:       [number,number,number] = [55,  138, 221];  // #378ADD
const BLUE_BG:    [number,number,number] = [230, 241, 251];  // #E6F1FB
const BLUE_TEXT:  [number,number,number] = [24,  95,  165];  // #185FA5
const RED:        [number,number,number] = [226, 75,  74 ];  // #E24B4A
const RED_BG:     [number,number,number] = [253, 234, 234];  // #FDEAEA
const RED_TEXT:   [number,number,number] = [163, 45,  45 ];  // #A32D2D
const TEXT:       [number,number,number] = [26,  29,  35 ];  // #1A1D23
const MUTED:      [number,number,number] = [138, 143, 155];  // #8A8F9B
const BODY_TXT:   [number,number,number] = [74,  79,  92 ];  // #4A4F5C
const PAGE_BG:    [number,number,number] = [247, 248, 250];  // #F7F8FA
const BORDER:     [number,number,number] = [234, 236, 240];  // #EAECF0
const WHITE:      [number,number,number] = [255, 255, 255];
const CARD_BORDER:[number,number,number] = [220, 224, 228];

const PAGE_W = 210;
const PAGE_H = 297;
const M = 18;
const CW = PAGE_W - M * 2;

export interface GapReportPDFData {
  businessName: string;
  websiteUrl?: string;
  firstName?: string;
  overallScore: number;
  overallStatus?: string;
  plainEnglishSummary?: string;
  scores?: { category: string; label: string; score: number; status: string }[];
  strengths?: string[];
  gaps?: string[];
  recommendations?: { title: string; description: string; priority: string }[];
  executiveSummary?: string;
  biggestOpportunity?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function rgb(doc: jsPDF, type: "fill" | "text" | "draw", c: [number,number,number]) {
  if (type === "fill") doc.setFillColor(c[0], c[1], c[2]);
  else if (type === "text") doc.setTextColor(c[0], c[1], c[2]);
  else doc.setDrawColor(c[0], c[1], c[2]);
}

function gradeColors(score: number): {
  fill: [number,number,number]; bg: [number,number,number]; label: [number,number,number]; name: string
} {
  if (score >= 80) return { fill: TEAL, bg: TEAL_BG, label: TEAL_TEXT, name: "Strong Performance" };
  if (score >= 60) return { fill: AMBER, bg: AMBER_BG, label: AMBER_TEXT, name: "Good Foundation" };
  if (score >= 40) return { fill: BLUE, bg: BLUE_BG, label: BLUE_TEXT, name: "Needs Work" };
  return { fill: RED, bg: RED_BG, label: RED_TEXT, name: "Needs Urgent Attention" };
}

function statusColors(status: string): {
  fill: [number,number,number]; bg: [number,number,number]; label: [number,number,number]
} {
  switch ((status || "").toLowerCase()) {
    case "strong":   return { fill: TEAL,  bg: TEAL_BG,  label: TEAL_TEXT  };
    case "moderate": return { fill: AMBER, bg: AMBER_BG, label: AMBER_TEXT };
    case "weak":     return { fill: BLUE,  bg: BLUE_BG,  label: BLUE_TEXT  };
    default:         return { fill: RED,   bg: RED_BG,   label: RED_TEXT   };
  }
}

function scoreColors(score: number) {
  return statusColors(score >= 70 ? "strong" : score >= 50 ? "moderate" : score >= 30 ? "weak" : "critical");
}

function mapPriority(priority: string, index: number): string {
  const p = (priority || "").toLowerCase();
  if (p.includes("high") || p.includes("quick") || p.includes("immediate") || p.includes("urgent")) return "Quick Win";
  if (p.includes("low") || p.includes("long")) return "Long Term";
  if (p.includes("medium") || p.includes("mid")) return "Medium Term";
  return index < 2 ? "Quick Win" : "Medium Term";
}

function tagColors(tag: string): { fill: [number,number,number]; bg: [number,number,number]; text: [number,number,number] } {
  if (tag === "Quick Win")  return { fill: TEAL,  bg: TEAL_BG,  text: TEAL_TEXT  };
  if (tag === "Long Term")  return { fill: BLUE,  bg: BLUE_BG,  text: BLUE_TEXT  };
  return                           { fill: AMBER, bg: AMBER_BG, text: AMBER_TEXT };
}

function progressBar(
  doc: jsPDF, x: number, y: number, w: number, h: number, pct: number,
  trackColor: [number,number,number], fillColor: [number,number,number]
) {
  rgb(doc, "fill", trackColor);
  doc.roundedRect(x, y, w, h, h / 2, h / 2, "F");
  if (pct > 0) {
    const fw = Math.max(h, (w * pct) / 100);
    rgb(doc, "fill", fillColor);
    doc.roundedRect(x, y, fw, h, h / 2, h / 2, "F");
  }
}

// Draw ring chart using line segments to approximate arc stroke
function drawRing(
  doc: jsPDF, cx: number, cy: number, r: number, lw: number,
  pct: number, trackColor: [number,number,number], fillColor: [number,number,number]
) {
  // Track: full circle
  doc.setDrawColor(trackColor[0], trackColor[1], trackColor[2]);
  doc.setLineWidth(lw);
  doc.circle(cx, cy, r, "S");

  // Fill: partial arc via line segments
  const endDeg = -90 + (pct / 100) * 360;
  const steps = Math.max(4, Math.round((pct / 100) * 120));
  doc.setLineWidth(lw + 0.3);
  for (let i = 0; i < steps; i++) {
    const a1 = (-90 + (pct / 100) * 360 * (i / steps)) * (Math.PI / 180);
    const a2 = (-90 + (pct / 100) * 360 * ((i + 1) / steps)) * (Math.PI / 180);
    doc.setDrawColor(fillColor[0], fillColor[1], fillColor[2]);
    doc.line(cx + r * Math.cos(a1), cy + r * Math.sin(a1), cx + r * Math.cos(a2), cy + r * Math.sin(a2));
  }
  void endDeg;
}

function pageHeader(doc: jsPDF, businessName: string, reportDate: string) {
  // Light header bar
  rgb(doc, "fill", PAGE_BG);
  doc.rect(0, 0, PAGE_W, 12, "F");
  rgb(doc, "draw", BORDER);
  doc.setLineWidth(0.3);
  doc.line(0, 12, PAGE_W, 12);

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  rgb(doc, "text", TEXT);
  doc.text(businessName, M, 8);

  doc.setFont("helvetica", "normal");
  rgb(doc, "text", MUTED);
  doc.text(reportDate + "  ·  Confidential", PAGE_W - M, 8, { align: "right" });
}

function pageFooter(doc: jsPDF, pageNum: number) {
  rgb(doc, "fill", PAGE_BG);
  doc.rect(0, PAGE_H - 10, PAGE_W, 10, "F");
  rgb(doc, "draw", BORDER);
  doc.setLineWidth(0.3);
  doc.line(0, PAGE_H - 10, PAGE_W, PAGE_H - 10);

  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  rgb(doc, "text", MUTED);
  doc.text(`Page ${pageNum}`, PAGE_W / 2, PAGE_H - 3.5, { align: "center" });
  doc.text("orangedoormarketing.com", PAGE_W - M, PAGE_H - 3.5, { align: "right" });
}

function sectionLabel(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  rgb(doc, "text", TEAL_TEXT);
  doc.text(text.toUpperCase(), x, y);
}

function sectionHeading(doc: jsPDF, text: string, x: number, y: number, maxW = CW) {
  doc.setFontSize(17);
  doc.setFont("times", "bold");
  rgb(doc, "text", TEXT);
  const lines = doc.splitTextToSize(text, maxW);
  doc.text(lines, x, y);
  return lines.length;
}

// ── Main export ────────────────────────────────────────────────────────────
export function generateGapReportPDF(data: GapReportPDFData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const {
    businessName, websiteUrl, overallScore,
    plainEnglishSummary, scores, strengths, gaps, recommendations, executiveSummary, biggestOpportunity,
  } = data;

  const grade = gradeColors(overallScore);
  const displayDomain = websiteUrl
    ? websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : businessName;
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  let pageNum = 1;

  // ── PAGE 1: HERO + PILLARS + INSIGHTS ──────────────────────────────────
  rgb(doc, "fill", WHITE);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  pageHeader(doc, displayDomain, dateStr);

  let y = 20;

  // Hero section ─────────────────────────────────────────────────────────
  // Card background
  rgb(doc, "fill", WHITE);
  doc.setDrawColor(CARD_BORDER[0], CARD_BORDER[1], CARD_BORDER[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(M, y, CW, 46, 3, 3, "FD");

  // Ring dial (left)
  const ringCx = M + 24;
  const ringCy = y + 23;
  const ringR  = 14;
  const ringLW = 3.5;
  drawRing(doc, ringCx, ringCy, ringR, ringLW, overallScore, grade.bg, grade.fill);

  // Score text in ring
  doc.setFontSize(14);
  doc.setFont("times", "bold");
  rgb(doc, "text", TEXT);
  doc.text(String(overallScore), ringCx, ringCy + 2.5, { align: "center" });
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  rgb(doc, "text", MUTED);
  doc.text("/ 100", ringCx, ringCy + 8, { align: "center" });

  // Right column
  const heroX = M + 50;
  let heroY = y + 10;

  // Grade label
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  rgb(doc, "text", grade.label);
  doc.text(grade.name.toUpperCase(), heroX, heroY);
  heroY += 7;

  // Headline
  doc.setFontSize(13);
  doc.setFont("times", "bold");
  rgb(doc, "text", TEXT);
  const headline = overallScore >= 80
    ? "Your Marketing Foundation Is Solid"
    : overallScore >= 60
    ? "Good Foundation With Room to Grow"
    : "Significant Opportunities to Unlock";
  const hlLines = doc.splitTextToSize(headline, CW - 56);
  doc.text(hlLines, heroX, heroY);
  heroY += hlLines.length * 6 + 3;

  // Subline
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  rgb(doc, "text", BODY_TXT);
  const sub = overallScore >= 80
    ? `${businessName} scores in the top tier. A few fixes can push into the 90s.`
    : `${businessName} has clear opportunities. Prioritise the actions on the next page.`;
  const subLines = doc.splitTextToSize(sub, CW - 56);
  doc.text(subLines.slice(0, 2), heroX, heroY);

  y += 52;

  // Pillar cards (3 per row) ─────────────────────────────────────────────
  const cats = scores || [];
  if (cats.length > 0) {
    sectionLabel(doc, "Category Scores", M, y + 6);
    y += 12;

    const cols = 3;
    const cardW = (CW - (cols - 1) * 4) / cols;
    const cardH = 28;

    cats.slice(0, 6).forEach((cat, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx2 = M + col * (cardW + 4);
      const cy2 = y + row * (cardH + 4);
      const sc = statusColors(cat.status);

      // Card
      rgb(doc, "fill", WHITE);
      doc.setDrawColor(CARD_BORDER[0], CARD_BORDER[1], CARD_BORDER[2]);
      doc.setLineWidth(0.4);
      doc.roundedRect(cx2, cy2, cardW, cardH, 2, 2, "FD");

      // Score
      doc.setFontSize(13);
      doc.setFont("times", "bold");
      rgb(doc, "text", sc.label);
      doc.text(String(cat.score), cx2 + 4, cy2 + 10);

      // Label
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      rgb(doc, "text", BODY_TXT);
      const lbl = doc.splitTextToSize(cat.label, cardW - 8);
      doc.text(lbl.slice(0, 2), cx2 + 4, cy2 + 16);

      // Progress bar
      progressBar(doc, cx2 + 4, cy2 + cardH - 6, cardW - 8, 2, cat.score, BORDER, sc.fill);
    });

    const rowCount = Math.ceil(Math.min(cats.length, 6) / cols);
    y += rowCount * (cardH + 4) + 2;
  }

  // Insight boxes (2 columns) ────────────────────────────────────────────
  const topStrength = strengths?.[0] || null;
  const topGap = gaps?.[0] || null;

  if ((topStrength || topGap) && y < PAGE_H - 42) {
    y += 4;
    sectionLabel(doc, "Analysis", M, y + 6);
    y += 12;

    const insW = (CW - 5) / 2;
    const insH = 28;

    if (topStrength) {
      // Working card
      rgb(doc, "fill", WHITE);
      doc.setDrawColor(CARD_BORDER[0], CARD_BORDER[1], CARD_BORDER[2]);
      doc.setLineWidth(0.4);
      doc.roundedRect(M, y, insW, insH, 2, 2, "FD");

      // Green dot + label
      rgb(doc, "fill", TEAL);
      doc.circle(M + 5, y + 7, 1.5, "F");
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      rgb(doc, "text", TEAL_TEXT);
      doc.text("WHAT'S WORKING", M + 9, y + 8);

      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      rgb(doc, "text", TEXT);
      const sLines = doc.splitTextToSize(topStrength, insW - 8);
      doc.text(sLines.slice(0, 3), M + 4, y + 16);
    }

    if (topGap) {
      // Gap card
      const gx = M + insW + 5;
      rgb(doc, "fill", WHITE);
      doc.setDrawColor(CARD_BORDER[0], CARD_BORDER[1], CARD_BORDER[2]);
      doc.setLineWidth(0.4);
      doc.roundedRect(gx, y, insW, insH, 2, 2, "FD");

      // Red dot + label
      rgb(doc, "fill", RED);
      doc.circle(gx + 5, y + 7, 1.5, "F");
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      rgb(doc, "text", RED_TEXT);
      doc.text("CRITICAL GAP", gx + 9, y + 8);

      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      rgb(doc, "text", TEXT);
      const gLines = doc.splitTextToSize(topGap, insW - 8);
      doc.text(gLines.slice(0, 3), gx + 4, y + 16);
    }

    y += insH + 4;
  }

  pageFooter(doc, pageNum);

  // ── PAGE 2: EXECUTIVE SUMMARY + ACTION PLAN ────────────────────────────
  doc.addPage();
  pageNum++;

  rgb(doc, "fill", WHITE);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  pageHeader(doc, displayDomain, dateStr);
  y = 20;

  // Executive summary ────────────────────────────────────────────────────
  const summaryText = plainEnglishSummary || executiveSummary || "";
  if (summaryText) {
    sectionLabel(doc, "Executive Summary", M, y + 6);
    y += 11;

    const headLines = sectionHeading(doc, "What this means for your business", M, y);
    y += headLines * 7 + 4;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    rgb(doc, "text", BODY_TXT);
    const sumLines = doc.splitTextToSize(summaryText, CW);
    doc.text(sumLines.slice(0, 5), M, y);
    y += Math.min(sumLines.length, 5) * 4.8 + 8;

    // Opportunity callout
    const opp = biggestOpportunity || recommendations?.[0]?.title || gaps?.[0] || null;
    if (opp) {
      rgb(doc, "fill", TEAL_BG);
      doc.roundedRect(M, y, CW, 20, 2, 2, "F");
      rgb(doc, "fill", TEAL);
      doc.rect(M, y, 2.5, 20, "F");
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      rgb(doc, "text", TEAL_TEXT);
      doc.text("YOUR BIGGEST OPPORTUNITY", M + 7, y + 7);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      rgb(doc, "text", TEXT);
      const oppLines = doc.splitTextToSize(opp, CW - 14);
      doc.text(oppLines.slice(0, 2), M + 7, y + 14);
      y += 28;
    }

    y += 6;
  }

  // Strengths & Gaps ─────────────────────────────────────────────────────
  const sItems = (strengths || []).slice(0, 4);
  const gItems = (gaps || []).slice(0, 4);

  if (sItems.length > 0 || gItems.length > 0) {
    if (y > PAGE_H - 70) {
      pageFooter(doc, pageNum);
      doc.addPage();
      pageNum++;
      rgb(doc, "fill", WHITE);
      doc.rect(0, 0, PAGE_W, PAGE_H, "F");
      pageHeader(doc, displayDomain, dateStr);
      y = 20;
    }

    sectionLabel(doc, "Analysis", M, y + 6);
    y += 11;

    const sgHeadLines = sectionHeading(doc, "Key strengths & critical gaps", M, y);
    y += sgHeadLines * 7 + 6;

    const colW = (CW - 5) / 2;
    const leftX = M;
    const rightX = M + colW + 5;
    const itemTextW = colW - 14;
    const maxItems = Math.max(sItems.length, gItems.length);

    // Column headers
    rgb(doc, "fill", TEAL);
    doc.circle(leftX + 4, y + 3.5, 1.5, "F");
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    rgb(doc, "text", TEAL_TEXT);
    doc.text("WHAT'S WORKING", leftX + 8, y + 4.5);

    rgb(doc, "fill", RED);
    doc.circle(rightX + 4, y + 3.5, 1.5, "F");
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    rgb(doc, "text", RED_TEXT);
    doc.text("CRITICAL GAPS", rightX + 8, y + 4.5);

    y += 10;

    for (let i = 0; i < maxItems; i++) {
      if (y > PAGE_H - 24) {
        pageFooter(doc, pageNum);
        doc.addPage();
        pageNum++;
        rgb(doc, "fill", WHITE);
        doc.rect(0, 0, PAGE_W, PAGE_H, "F");
        pageHeader(doc, displayDomain, dateStr);
        y = 20;
      }

      let leftH = 0;
      let rightH = 0;

      if (i < sItems.length) {
        rgb(doc, "fill", TEAL_BG);
        doc.circle(leftX + 4, y + 3, 3, "F");
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        rgb(doc, "text", TEAL_TEXT);
        doc.text("v", leftX + 4, y + 4.5, { align: "center" });
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        rgb(doc, "text", TEXT);
        const sLines = doc.splitTextToSize(sItems[i], itemTextW);
        doc.text(sLines.slice(0, 2), leftX + 10, y + 4);
        leftH = Math.min(sLines.length, 2) * 4.5 + 4;
      }

      if (i < gItems.length) {
        rgb(doc, "fill", RED_BG);
        doc.circle(rightX + 4, y + 3, 3, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        rgb(doc, "text", RED_TEXT);
        doc.text("!", rightX + 4, y + 4.5, { align: "center" });
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        rgb(doc, "text", TEXT);
        const gLines = doc.splitTextToSize(gItems[i], itemTextW);
        doc.text(gLines.slice(0, 2), rightX + 10, y + 4);
        rightH = Math.min(gLines.length, 2) * 4.5 + 4;
      }

      y += Math.max(leftH, rightH, 10);
    }

    y += 8;
  }

  // Action plan ──────────────────────────────────────────────────────────
  sectionLabel(doc, "Action Plan", M, y + 6);
  y += 11;

  const ahLines = sectionHeading(doc, "Your top recommended actions", M, y);
  y += ahLines * 7 + 2;

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  rgb(doc, "text", MUTED);
  doc.text("Prioritised by impact — address in order for fastest gains.", M, y);
  y += 8;

  const actions = recommendations || [];
  actions.slice(0, 10).forEach((rec, idx) => {
    const tag = mapPriority(rec.priority, idx);
    const tc = tagColors(tag);

    if (y > PAGE_H - 24) {
      pageFooter(doc, pageNum);
      doc.addPage();
      pageNum++;
      rgb(doc, "fill", WHITE);
      doc.rect(0, 0, PAGE_W, PAGE_H, "F");
      pageHeader(doc, displayDomain, dateStr);
      y = 20;
    }

    const rowH = 10;

    // Number circle
    rgb(doc, "fill", tc.fill);
    doc.roundedRect(M, y, 7, 7, 1.5, 1.5, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    rgb(doc, "text", WHITE);
    doc.text(String(idx + 1), M + 3.5, y + 5.3, { align: "center" });

    // Title
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    rgb(doc, "text", TEXT);
    const titleLines = doc.splitTextToSize(rec.title, CW - 42);
    doc.text(titleLines.slice(0, 1), M + 11, y + 5);

    // Tag pill
    const tw = doc.getTextWidth(tag) + 6;
    rgb(doc, "fill", tc.bg);
    doc.roundedRect(M + CW - tw, y, tw, 7, 1.5, 1.5, "F");
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    rgb(doc, "text", tc.text);
    doc.text(tag, M + CW - tw / 2, y + 5, { align: "center" });

    y += rowH;

    // Description (one line)
    if (rec.description) {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      rgb(doc, "text", BODY_TXT);
      const dLines = doc.splitTextToSize(rec.description, CW - 11);
      doc.text(dLines.slice(0, 1), M + 11, y);
      y += 5;
    }

    // Divider
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.3);
    doc.line(M + 11, y, PAGE_W - M, y);
    y += 3;
  });

  // CTA box ──────────────────────────────────────────────────────────────
  const ctaH = 32;
  const ctaY2 = y + 8 > PAGE_H - (ctaH + 14) ? (() => {
    pageFooter(doc, pageNum);
    doc.addPage();
    pageNum++;
    rgb(doc, "fill", WHITE);
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");
    pageHeader(doc, displayDomain, dateStr);
    return 20;
  })() : y + 8;

  rgb(doc, "fill", PAGE_BG);
  doc.setDrawColor(CARD_BORDER[0], CARD_BORDER[1], CARD_BORDER[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(M, ctaY2, CW, ctaH, 3, 3, "FD");

  // Left text — constrained width so it never runs into the button
  const ctaTextMaxW = CW - 62;
  doc.setFontSize(12);
  doc.setFont("times", "bold");
  rgb(doc, "text", TEXT);
  doc.text("Ready to close the gaps?", M + 8, ctaY2 + 12);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  rgb(doc, "text", BODY_TXT);
  const ctaSubLines = doc.splitTextToSize(
    "Book a free 30-minute strategy call and let's build your path to 95+.",
    ctaTextMaxW
  );
  doc.text(ctaSubLines.slice(0, 2), M + 8, ctaY2 + 21);

  // Button — vertically centered in card, right-aligned with consistent padding
  const btnW = 52;
  const btnH = 13;
  const btnX = M + CW - btnW - 4;
  const btnY = ctaY2 + (ctaH - btnH) / 2;

  rgb(doc, "fill", TEAL_TEXT);
  doc.roundedRect(btnX, btnY, btnW, btnH, 2.5, 2.5, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  rgb(doc, "text", TEAL_BG);
  // "→" doesn't render in Helvetica — use plain text only
  doc.text("Schedule Your Call", btnX + btnW / 2, btnY + btnH / 2 + 1.5, { align: "center" });
  doc.link(btnX, btnY, btnW, btnH, { url: "https://orangedoormarketing.com/schedule" });

  pageFooter(doc, pageNum);

  const filename = `Gap-Analysis-${businessName.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
}
