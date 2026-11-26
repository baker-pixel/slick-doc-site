import jsPDF from "jspdf";
import { format } from "date-fns";

export interface PdfKpi { label: string; value: string; trend?: number }
export interface PdfReportInput {
  businessName?: string;
  days: number;
  kpis: PdfKpi[];
  insights: string[];
  highlights: string[];
  sourceNote?: string;
}

// Brand orange (hsl(24 95% 53%) from index.css --primary).
const BRAND: [number, number, number] = [249, 112, 21];
const INK: [number, number, number] = [33, 33, 33];
const MUTED: [number, number, number] = [110, 110, 110];
const PAGE_W = 210;
const MARGIN = 20;

/** Builds the performance PDF from the same numbers the Analytics tab shows for the selected range. */
export function generatePerformancePdf(input: PdfReportInput): void {
  const doc = new jsPDF();
  const end = new Date();
  const start = new Date(end.getTime() - (input.days - 1) * 86_400_000);

  doc.setFillColor(...BRAND);
  doc.rect(0, 0, PAGE_W, 38, "F");
  doc.setFontSize(22); doc.setTextColor(255, 255, 255);
  doc.text("Performance Report", MARGIN, 19);
  doc.setFontSize(11);
  doc.text(input.businessName || "Client Report", MARGIN, 28);
  doc.setFontSize(9);
  doc.text(`${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")} (last ${input.days} days)`, MARGIN, 34);

  doc.setFontSize(15); doc.setTextColor(...INK);
  doc.text("Key Metrics", MARGIN, 52);

  const GUTTER = 7;
  const BOX_W = (PAGE_W - 2 * MARGIN - GUTTER) / 2;
  const BOX_H = 30;
  input.kpis.forEach((k, i) => {
    const x = MARGIN + (i % 2) * (BOX_W + GUTTER);
    const y = 58 + Math.floor(i / 2) * (BOX_H + GUTTER);
    doc.setFillColor(247, 247, 248); doc.setDrawColor(230, 230, 230);
    doc.roundedRect(x, y, BOX_W, BOX_H, 2, 2, "FD");
    doc.setFontSize(8.5); doc.setTextColor(...MUTED);
    doc.text(k.label.toUpperCase(), x + 5, y + 9);
    doc.setFontSize(17); doc.setTextColor(...INK);
    doc.text(k.value, x + 5, y + 20);
    if (k.trend !== undefined) {
      const up = k.trend >= 0;
      doc.setFontSize(9);
      const color: [number, number, number] = up ? [22, 163, 74] : [220, 38, 38];
      doc.setTextColor(...color);
      doc.text(`${up ? "+" : "-"}${Math.abs(k.trend)}% vs previous ${input.days} days`, x + 5, y + 26);
    }
  });

  let y = 58 + Math.ceil(input.kpis.length / 2) * (BOX_H + GUTTER) + 6;
  const section = (title: string, items: string[]) => {
    if (items.length === 0) return;
    doc.setFontSize(15); doc.setTextColor(...INK);
    doc.text(title, MARGIN, y); y += 8;
    doc.setFontSize(10); doc.setTextColor(60, 60, 60);
    for (const item of items) {
      const lines = doc.splitTextToSize(`•  ${item}`, PAGE_W - 2 * MARGIN - 6);
      doc.text(lines, MARGIN, y);
      y += lines.length * 5.5 + 2;
    }
    y += 4;
  };
  section("What changed", input.insights);
  section("Highlights", input.highlights);

  doc.setDrawColor(225, 225, 225);
  doc.line(MARGIN, 280, PAGE_W - MARGIN, 280);
  doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  doc.text(`${input.businessName || "Client"} · Orange Door Marketing${input.sourceNote ? ` · ${input.sourceNote}` : ""}`, MARGIN, 286);
  doc.text(`Generated ${format(new Date(), "MMMM d, yyyy")}`, PAGE_W - MARGIN, 286, { align: "right" });

  doc.save(`performance-report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
