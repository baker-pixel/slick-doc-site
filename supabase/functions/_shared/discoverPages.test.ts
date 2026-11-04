import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { discoverPages } from "./seoSignals.ts";

// The audit's page picker against a Yoast-style site: posts in the FIRST child sitemap, real pages in the second.
const FILES: Record<string, string> = {
  "https://a.com/robots.txt": "User-agent: *\nDisallow: /private/",
  "https://a.com/sitemap.xml": `<sitemapindex><sitemap><loc>https://a.com/post-sitemap.xml</loc></sitemap><sitemap><loc>https://a.com/page-sitemap.xml</loc></sitemap><sitemap><loc>https://a.com/author-sitemap.xml</loc></sitemap></sitemapindex>`,
  "https://a.com/post-sitemap.xml": `<urlset>${Array.from({ length: 16 }, (_, i) => `<url><loc>https://a.com/blog/post-${i}/</loc></url>`).join("")}</urlset>`,
  "https://a.com/page-sitemap.xml": `<urlset><url><loc>https://a.com/assessments/</loc></url><url><loc>https://a.com/about/</loc></url><url><loc>https://a.com/contact/</loc></url><url><loc>https://a.com/private/x/</loc></url></urlset>`,
  "https://a.com/author-sitemap.xml": `<urlset><url><loc>https://a.com/author/jay/</loc></url></urlset>`,
  "https://a.com/": "<html><body><a href='/blog/post-1/'>x</a></body></html>",
};

Deno.test("audit page picker reads every child sitemap and keeps the real pages in a small sample", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = ((input: Request | URL | string) => {
    const url = String(input);
    const body = FILES[url];
    return Promise.resolve(body ? new Response(body, { status: 200 }) : new Response("", { status: 404 }));
  }) as typeof fetch;
  try {
    const { pages } = await discoverPages("https://a.com/", 5);
    assertEquals(pages.length, 5);
    for (const must of ["https://a.com/", "https://a.com/assessments", "https://a.com/about", "https://a.com/contact"]) {
      assertEquals(pages.some((p) => p.replace(/\/$/, "") === must.replace(/\/$/, "")), true, must);
    }
    assertEquals(pages.some((p) => p.includes("/private/") || p.includes("/author/")), false);
  } finally {
    globalThis.fetch = real;
  }
});
