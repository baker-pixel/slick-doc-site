import type { VercelRequest, VercelResponse } from "@vercel/node";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { renderReportHtml } from "./_reportRenderer.generated.mjs";
import type { ReportData } from "../src/components/report/ReportConfig.js";

export const config = {
  maxDuration: 60,
};

const FONT_LINKS = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..600;1,9..40,300..600&family=DM+Serif+Display&display=swap" rel="stylesheet">
`;

/** Pull the same compiled Tailwind CSS the live site serves, from the live site itself --
 * one build output, never a separately-maintained copy that could drift from what's on screen.
 * Guards against ever getting back something that isn't actually CSS (an auth wall, a WAF
 * challenge page, an SPA catch-all rewrite) -- naively concatenating an unexpected HTML
 * response into a <style> tag can break out of it via an embedded </style> and leak that
 * page's markup into the rendered document. */
async function fetchSiteCss(origin: string): Promise<string> {
  // Set automatically by Vercel when "Protection Bypass for Automation" is enabled -- lets
  // this self-fetch succeed even when the deployment itself sits behind the SSO wall (preview
  // deployments only; production isn't protected and doesn't need this).
  const bypassHeaders = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
    : undefined;

  const indexRes = await fetch(origin, { headers: bypassHeaders });
  const html = await indexRes.text();
  const hrefs = [...html.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+\.css)["']/gi)].map((m) => m[1]);
  const cssTexts = await Promise.all(
    hrefs.map(async (href) => {
      const url = href.startsWith("http") ? href : `${origin}${href}`;
      const res = await fetch(url, { headers: bypassHeaders });
      if (!res.ok) return "";
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("css")) return "";
      return res.text();
    }),
  );
  return cssTexts.join("\n");
}

async function launchBrowser() {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (isServerless) {
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
      defaultViewport: { width: 794, height: 1123 },
    });
  }
  // Local dev: @sparticuz/chromium's binary only runs on the Lambda/Linux
  // target platform. Point at a real local Chrome/Chromium instead --
  // PUPPETEER_EXECUTABLE_PATH lets a developer wire up whatever's installed.
  const localPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!localPath) {
    throw new Error("Set PUPPETEER_EXECUTABLE_PATH to a local Chrome/Chromium binary for local dev.");
  }
  return puppeteer.launch({ executablePath: localPath, headless: true, defaultViewport: { width: 794, height: 1123 } });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const data = req.body as ReportData;
  if (!data || typeof data.overallScore !== "number") {
    res.status(400).json({ error: "Invalid report data" });
    return;
  }

  const origin = `https://${req.headers.host}`;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;

  try {
    const [css, bodyHtml] = await Promise.all([
      fetchSiteCss(origin),
      Promise.resolve(renderReportHtml(data)),
    ]);

    const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${FONT_LINKS}
<style>${css}</style>
<style>@page { size: A4; margin: 0; } body { margin: 0; }</style>
</head>
<body>${bodyHtml}</body>
</html>`;

    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", bottom: "0", left: "0", right: "0" } });

    const filenameBase = (data.businessName || data.clientDomain || "report").replace(/[^a-zA-Z0-9]/g, "-");
    const dateStr = new Date().toISOString().split("T")[0];

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Gap-Analysis-${filenameBase}-${dateStr}.pdf"`);
    res.status(200).end(pdf);
  } catch (err) {
    console.error("render-report-pdf error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "PDF render failed" });
  } finally {
    if (browser) await browser.close();
  }
}
