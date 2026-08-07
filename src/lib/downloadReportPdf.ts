import type { ReportData } from "@/components/report/ReportConfig";

/** Requests the server-rendered PDF (api/render-report-pdf.ts, which renders the exact
 * same <ReportView> tree the screen shows) and triggers a browser download. Replaces the
 * old hand-coded jsPDF renderer (generateGapReportPDF.ts) -- one implementation instead
 * of two that could show different things for the same report. */
export async function downloadReportPdf(data: ReportData): Promise<void> {
  const res = await fetch("/api/render-report-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`PDF generation failed (${res.status})`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename="([^"]+)"/);
  const filename = filenameMatch?.[1] || `Gap-Analysis-${(data.businessName || data.clientDomain || "report").replace(/[^a-zA-Z0-9]/g, "-")}.pdf`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
