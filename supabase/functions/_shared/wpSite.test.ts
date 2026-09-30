import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isPublicSiteUrl, normalizeSiteUrl, siteUrlVariants } from "./wpSite.ts";

Deno.test("normalizeSiteUrl strips wp-admin, slash, case, and adds scheme", () => {
  assertEquals(normalizeSiteUrl("https://Site.com/wp-admin/"), "https://site.com");
  assertEquals(normalizeSiteUrl("  site.com/wp-admin/options-general.php "), "https://site.com");
  assertEquals(normalizeSiteUrl("https://site.com/blog/"), "https://site.com/blog");
  assertEquals(normalizeSiteUrl("https://site.com/?x=1#y"), "https://site.com");
  assertEquals(normalizeSiteUrl(""), "");
});

Deno.test("siteUrlVariants covers www and scheme spellings", () => {
  const v = siteUrlVariants("https://www.site.com");
  assertEquals(v.includes("https://site.com"), true);
  assertEquals(v.includes("http://www.site.com"), true);
  assertEquals(siteUrlVariants("https://site.com/blog").includes("https://www.site.com/blog"), true);
});

Deno.test("isPublicSiteUrl rejects internal hosts", () => {
  assertEquals(isPublicSiteUrl("https://site.com"), true);
  for (const u of ["http://localhost", "http://127.0.0.1", "http://169.254.169.254", "http://192.168.1.5", "http://intranet", "http://x.internal"]) {
    assertEquals(isPublicSiteUrl(u), false, u);
  }
});
