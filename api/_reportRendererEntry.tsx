// Entry point for the pre-bundled report renderer (see
// scripts/bundle-report-renderer.mjs). Kept separate from render-report-pdf.tsx
// because Vercel Functions trace-and-copy (rather than bundle) imports that
// cross the api/ <-> src/ boundary, and neither missing file extensions nor
// the "@/*" path alias survive Node's actual ESM runtime resolver -- pre-bundling
// this one entry with esbuild inlines everything under src/ into a single flat
// file so the deployed function has zero cross-boundary imports left to resolve.
import { renderToStaticMarkup } from "react-dom/server";
import { ReportView } from "@/components/report/ReportView";
import type { ReportData } from "@/components/report/ReportConfig";

export function renderReportHtml(data: ReportData): string {
  return renderToStaticMarkup(<ReportView data={data} printMode />);
}
