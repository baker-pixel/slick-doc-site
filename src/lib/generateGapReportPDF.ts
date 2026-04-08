import jsPDF from "jspdf";

// Brand colors
const ORANGE = [232, 93, 36]; // #E85D24
const DARK_TEXT = [30, 30, 30];
const MEDIUM_GRAY = [100, 100, 100];
const LIGHT_GRAY = [160, 160, 160];
const WHITE = [255, 255, 255];
const PAGE_BG = [255, 255, 255];

// Grade colors
const RED = [220, 53, 53];
const AMBER = [217, 150, 30];
const BLUE = [59, 130, 246];
const GREEN = [22, 163, 74];

const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const MARGIN = 20;
const CONTENT_W = PAGE_W - MARGIN * 2;

interface ScoreItem {
  category: string;
  label: string;
  score: number;
  status: string;
}

interface Recommendation {
  title: string;
  description: string;
  priority: string;
}

export interface GapReportPDFData {
  businessName: string;
  websiteUrl?: string;
  firstName?: string;
  overallScore: number;
  overallStatus?: string;
  plainEnglishSummary?: string;
  scores?: ScoreItem[];
  strengths?: string[];
  gaps?: string[];
  recommendations?: Recommendation[];
  executiveSummary?: string;
}

function getGradeInfo(score: number): { label: string; color: number[] } {
  if (score >= 81) return { label: "Strong Performance", color: GREEN };
  if (score >= 56) return { label: "Good Foundation", color: BLUE };
  if (score >= 31) return { label: "Room to Grow", color: AMBER };
  return { label: "Needs Urgent Attention", color: RED };
}

function getScoreColor(score: number): number[] {
  if (score >= 70) return GREEN;
  if (score >= 50) return AMBER;
  if (score >= 30) return [232, 93, 36]; // orange
  return RED;
}

function drawHeaderBar(doc: jsPDF) {
  doc.setFillColor(245, 245, 245);
  doc.rect(0, 0, PAGE_W, 12, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(LIGHT_GRAY[0], LIGHT_GRAY[1], LIGHT_GRAY[2]);
  doc.text("Orange Door — Confidential Report", MARGIN, 8);
}

function drawFooter(doc: jsPDF, pageNum: number) {
  doc.setFillColor(245, 245, 245);
  doc.rect(0, PAGE_H - 12, PAGE_W, 12, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(LIGHT_GRAY[0], LIGHT_GRAY[1], LIGHT_GRAY[2]);
  doc.text(`Page ${pageNum}`, PAGE_W / 2, PAGE_H - 5, { align: "center" });
}

function drawProgressBar(doc: jsPDF, x: number, y: number, width: number, height: number, percent: number, color: number[]) {
  // Background
  doc.setFillColor(235, 235, 235);
  doc.roundedRect(x, y, width, height, height / 2, height / 2, "F");
  // Fill
  if (percent > 0) {
    const fillW = Math.max(height, (width * percent) / 100);
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(x, y, fillW, height, height / 2, height / 2, "F");
  }
}

export function generateGapReportPDF(data: GapReportPDFData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const {
    businessName,
    websiteUrl,
    overallScore,
    plainEnglishSummary,
    scores,
    strengths,
    gaps,
    recommendations,
    executiveSummary,
  } = data;

  const grade = getGradeInfo(overallScore);
  const dateStr = new Date().toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // ============================================================
  // PAGE 1 — Cover
  // ============================================================
  drawHeaderBar(doc);

  // Orange accent bar at top
  doc.setFillColor(ORANGE[0], ORANGE[1], ORANGE[2]);
  doc.rect(0, 12, PAGE_W, 4, "F");

  // Logo wordmark
  let y = 40;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(ORANGE[0], ORANGE[1], ORANGE[2]);
  doc.text("ORANGE DOOR", PAGE_W / 2, y, { align: "center" });
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(MEDIUM_GRAY[0], MEDIUM_GRAY[1], MEDIUM_GRAY[2]);
  doc.text("DIGITAL MARKETING", PAGE_W / 2, y + 5, { align: "center" });

  // Main heading
  y = 75;
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
  doc.text("Your Marketing", PAGE_W / 2, y, { align: "center" });
  doc.text("Gap Analysis", PAGE_W / 2, y + 12, { align: "center" });

  // Decorative line
  y += 22;
  doc.setDrawColor(ORANGE[0], ORANGE[1], ORANGE[2]);
  doc.setLineWidth(0.8);
  doc.line(PAGE_W / 2 - 25, y, PAGE_W / 2 + 25, y);

  // Business name
  y += 14;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
  doc.text(businessName, PAGE_W / 2, y, { align: "center" });

  if (websiteUrl) {
    y += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(MEDIUM_GRAY[0], MEDIUM_GRAY[1], MEDIUM_GRAY[2]);
    const urlDisplay = websiteUrl.length > 60 ? websiteUrl.substring(0, 57) + "..." : websiteUrl;
    doc.text(urlDisplay, PAGE_W / 2, y, { align: "center" });
  }

  // Score display
  y += 25;
  // Score circle background
  doc.setFillColor(grade.color[0], grade.color[1], grade.color[2]);
  doc.circle(PAGE_W / 2, y + 15, 22, "F");
  // Score number
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.text(String(overallScore), PAGE_W / 2, y + 19, { align: "center" });
  doc.setFontSize(8);
  doc.text("/ 100", PAGE_W / 2, y + 26, { align: "center" });

  // Grade badge
  y += 45;
  const badgeW = 60;
  const badgeH = 9;
  doc.setFillColor(grade.color[0], grade.color[1], grade.color[2]);
  doc.roundedRect(PAGE_W / 2 - badgeW / 2, y, badgeW, badgeH, 4, 4, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.text(grade.label, PAGE_W / 2, y + 6.2, { align: "center" });

  // Date
  y += 20;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(MEDIUM_GRAY[0], MEDIUM_GRAY[1], MEDIUM_GRAY[2]);
  doc.text(dateStr, PAGE_W / 2, y, { align: "center" });

  // Tagline at bottom
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(ORANGE[0], ORANGE[1], ORANGE[2]);
  doc.text("Prepared by Orange Door — Your AI Marketing Team", PAGE_W / 2, PAGE_H - 22, { align: "center" });

  drawFooter(doc, 1);

  // ============================================================
  // PAGE 2 — Plain English Summary
  // ============================================================
  doc.addPage();
  drawHeaderBar(doc);
  doc.setFillColor(ORANGE[0], ORANGE[1], ORANGE[2]);
  doc.rect(0, 12, PAGE_W, 4, "F");

  y = 28;
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
  doc.text("What This Means For Your Business", MARGIN, y);

  // Orange underline
  y += 3;
  doc.setDrawColor(ORANGE[0], ORANGE[1], ORANGE[2]);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, MARGIN + 80, y);

  // Summary text
  y += 10;
  const summaryText = plainEnglishSummary || executiveSummary || "Your marketing system has been analyzed across key areas. See the detailed findings below.";
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
  const summaryLines = doc.splitTextToSize(summaryText, CONTENT_W);
  doc.text(summaryLines, MARGIN, y);
  y += summaryLines.length * 5.5 + 10;

  // Three callout boxes
  const boxW = (CONTENT_W - 8) / 3;
  const boxH = 50;
  const boxY = Math.max(y, 100);

  const callouts = [
    {
      title: "Your Biggest Opportunity",
      body: recommendations?.[0]?.title || strengths?.[0] || "Review your full report for details",
      color: ORANGE,
    },
    {
      title: "What's Working",
      body: strengths?.[0] || "See detailed findings below",
      color: GREEN,
    },
    {
      title: "Your Priority This Month",
      body: gaps?.[0] || recommendations?.[0]?.description?.substring(0, 80) || "Check the action plan",
      color: BLUE,
    },
  ];

  callouts.forEach((callout, i) => {
    const bx = MARGIN + i * (boxW + 4);
    // Box background
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(bx, boxY, boxW, boxH, 3, 3, "F");
    // Top accent bar
    doc.setFillColor(callout.color[0], callout.color[1], callout.color[2]);
    doc.rect(bx, boxY, boxW, 2.5, "F");
    // Title
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(callout.color[0], callout.color[1], callout.color[2]);
    doc.text(callout.title, bx + 4, boxY + 10);
    // Body
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
    const bodyLines = doc.splitTextToSize(callout.body, boxW - 8);
    doc.text(bodyLines.slice(0, 5), bx + 4, boxY + 17);
  });

  // Score bar visualization
  const barY = boxY + boxH + 20;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
  doc.text("Your Score Position", MARGIN, barY);

  const barTop = barY + 6;
  const barH = 10;
  const zones = [
    { from: 0, to: 30, color: RED, label: "0-30" },
    { from: 30, to: 55, color: AMBER, label: "31-55" },
    { from: 55, to: 80, color: BLUE, label: "56-80" },
    { from: 80, to: 100, color: GREEN, label: "81-100" },
  ];

  zones.forEach((zone) => {
    const zx = MARGIN + (CONTENT_W * zone.from) / 100;
    const zw = (CONTENT_W * (zone.to - zone.from)) / 100;
    doc.setFillColor(zone.color[0], zone.color[1], zone.color[2]);
    doc.setGlobalAlpha?.(0.2);
    doc.rect(zx, barTop, zw, barH, "F");
    // Label
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(zone.color[0], zone.color[1], zone.color[2]);
    doc.text(zone.label, zx + zw / 2, barTop + barH + 5, { align: "center" });
  });

  // Reset alpha (jsPDF doesn't have setGlobalAlpha, so the zones will be full color — that's fine)
  // Score marker
  const markerX = MARGIN + (CONTENT_W * overallScore) / 100;
  doc.setFillColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
  doc.triangle(markerX - 2, barTop - 1, markerX + 2, barTop - 1, markerX, barTop + 2, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
  doc.text(String(overallScore), markerX, barTop - 3, { align: "center" });

  drawFooter(doc, 2);

  // ============================================================
  // PAGE 3 — Detailed Findings (SYSTEM Scorecard)
  // ============================================================
  doc.addPage();
  drawHeaderBar(doc);
  doc.setFillColor(ORANGE[0], ORANGE[1], ORANGE[2]);
  doc.rect(0, 12, PAGE_W, 4, "F");

  y = 28;
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
  doc.text("Detailed Findings", MARGIN, y);
  y += 3;
  doc.setDrawColor(ORANGE[0], ORANGE[1], ORANGE[2]);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, MARGIN + 50, y);

  y += 10;

  const systemCategories = scores || [
    { category: "S", label: "Search & Visibility", score: 0, status: "critical" },
    { category: "Y", label: "Your Website", score: 0, status: "critical" },
    { category: "S2", label: "Sequences & Email", score: 0, status: "critical" },
    { category: "T", label: "Transactions & Sales", score: 0, status: "critical" },
    { category: "E", label: "Engagement & Reviews", score: 0, status: "critical" },
    { category: "M", label: "Metrics & Analytics", score: 0, status: "critical" },
  ];

  // Table header
  doc.setFillColor(245, 245, 245);
  doc.rect(MARGIN, y, CONTENT_W, 9, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(MEDIUM_GRAY[0], MEDIUM_GRAY[1], MEDIUM_GRAY[2]);
  doc.text("CATEGORY", MARGIN + 4, y + 6);
  doc.text("SCORE", MARGIN + CONTENT_W - 40, y + 6);
  doc.text("STATUS", MARGIN + CONTENT_W - 18, y + 6);
  y += 12;

  systemCategories.forEach((cat, idx) => {
    const rowH = 22;
    const rowY = y;
    const color = getScoreColor(cat.score);
    const letter = cat.category.replace("S2", "S");

    // Alternating row bg
    if (idx % 2 === 0) {
      doc.setFillColor(252, 252, 252);
      doc.rect(MARGIN, rowY, CONTENT_W, rowH, "F");
    }

    // Letter circle
    doc.setFillColor(ORANGE[0], ORANGE[1], ORANGE[2]);
    doc.circle(MARGIN + 8, rowY + rowH / 2, 5, "F");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
    doc.text(letter, MARGIN + 8, rowY + rowH / 2 + 1.5, { align: "center" });

    // Category name
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
    doc.text(cat.label, MARGIN + 18, rowY + 8);

    // Mini progress bar
    const barX = MARGIN + 18;
    const miniBarW = CONTENT_W - 70;
    drawProgressBar(doc, barX, rowY + 12, miniBarW, 3, cat.score, color);

    // Score number
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(`${cat.score}`, MARGIN + CONTENT_W - 34, rowY + rowH / 2 + 1, { align: "center" });

    // Status badge
    const statusLabel = cat.status === "strong" ? "Strong" : cat.status === "moderate" ? "Moderate" : cat.status === "weak" ? "Weak" : "Critical";
    const badgeX = MARGIN + CONTENT_W - 22;
    const bW = 20;
    const bH2 = 6;
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(badgeX, rowY + rowH / 2 - 3, bW, bH2, 2, 2, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
    doc.text(statusLabel, badgeX + bW / 2, rowY + rowH / 2 + 1, { align: "center" });

    y += rowH + 2;
  });

  // Key findings below table
  y += 8;
  if (strengths && strengths.length > 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
    doc.text("✓  Key Strengths", MARGIN, y);
    y += 6;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
    strengths.slice(0, 3).forEach((s) => {
      const lines = doc.splitTextToSize(s, CONTENT_W - 10);
      doc.text(lines, MARGIN + 6, y);
      y += lines.length * 4 + 3;
    });
    y += 4;
  }

  if (gaps && gaps.length > 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(ORANGE[0], ORANGE[1], ORANGE[2]);
    doc.text("⚠  Critical Gaps", MARGIN, y);
    y += 6;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
    gaps.slice(0, 3).forEach((g) => {
      const lines = doc.splitTextToSize(g, CONTENT_W - 10);
      doc.text(lines, MARGIN + 6, y);
      y += lines.length * 4 + 3;
    });
  }

  drawFooter(doc, 3);

  // ============================================================
  // PAGE 4 — Action Plan
  // ============================================================
  doc.addPage();
  drawHeaderBar(doc);
  doc.setFillColor(ORANGE[0], ORANGE[1], ORANGE[2]);
  doc.rect(0, 12, PAGE_W, 4, "F");

  y = 28;
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
  doc.text("Your Top Recommended Actions", MARGIN, y);
  y += 3;
  doc.setDrawColor(ORANGE[0], ORANGE[1], ORANGE[2]);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, MARGIN + 70, y);
  y += 10;

  const actions = recommendations || [];
  const displayActions = actions.slice(0, 10);

  if (displayActions.length === 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(MEDIUM_GRAY[0], MEDIUM_GRAY[1], MEDIUM_GRAY[2]);
    doc.text("Detailed recommendations will be discussed in your strategy call.", MARGIN, y);
    y += 10;
  } else {
    displayActions.forEach((rec, idx) => {
      if (y > 250) {
        drawFooter(doc, 4);
        doc.addPage();
        drawHeaderBar(doc);
        doc.setFillColor(ORANGE[0], ORANGE[1], ORANGE[2]);
        doc.rect(0, 12, PAGE_W, 4, "F");
        y = 24;
      }

      // Number circle
      doc.setFillColor(ORANGE[0], ORANGE[1], ORANGE[2]);
      doc.circle(MARGIN + 5, y + 2, 4, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
      doc.text(String(idx + 1), MARGIN + 5, y + 3.5, { align: "center" });

      // Title
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]);
      const titleLines = doc.splitTextToSize(rec.title, CONTENT_W - 50);
      doc.text(titleLines, MARGIN + 14, y + 3);

      // Priority tag
      const priorityLabel = rec.priority || "Medium Term";
      const effortColor = priorityLabel.toLowerCase().includes("quick") || priorityLabel.toLowerCase().includes("high")
        ? GREEN
        : priorityLabel.toLowerCase().includes("long") || priorityLabel.toLowerCase().includes("low")
          ? AMBER
          : BLUE;
      const tagW = doc.getTextWidth(priorityLabel) + 6;
      doc.setFillColor(effortColor[0], effortColor[1], effortColor[2]);
      doc.roundedRect(MARGIN + CONTENT_W - tagW, y - 1, tagW, 6, 2, 2, "F");
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
      doc.text(priorityLabel, MARGIN + CONTENT_W - tagW / 2, y + 3, { align: "center" });

      // Description
      y += titleLines.length * 5 + 4;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(MEDIUM_GRAY[0], MEDIUM_GRAY[1], MEDIUM_GRAY[2]);
      const descLines = doc.splitTextToSize(rec.description, CONTENT_W - 14);
      doc.text(descLines.slice(0, 2), MARGIN + 14, y);
      y += Math.min(descLines.length, 2) * 4 + 8;
    });
  }

  // CTA Box at bottom
  const ctaY = Math.max(y + 10, PAGE_H - 60);
  doc.setFillColor(ORANGE[0], ORANGE[1], ORANGE[2]);
  doc.roundedRect(MARGIN, ctaY, CONTENT_W, 30, 4, 4, "F");
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.text("Orange Door handles all of this for you.", PAGE_W / 2, ctaY + 12, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Book your free strategy call at orangedoorconsulting.com/schedule", PAGE_W / 2, ctaY + 22, { align: "center" });

  drawFooter(doc, 4);

  // Save
  const filename = `Gap-Analysis-${businessName.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
}
