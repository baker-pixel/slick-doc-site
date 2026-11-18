import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { CHECKS, RUBRIC_VERSION, computeScores } from "./seoRubric.ts";

Deno.test("a category with no checks is not measured, not a free 100", () => {
  const { subscores } = computeScores([], { pages: ["https://a.test/"], performancePages: [] });
  assertEquals(subscores.off_page, null);
  assertEquals(subscores.on_page, 100);
});

Deno.test("overall score is not lifted by an unmeasured category", () => {
  const findings = [{ category: "on_page" as const, severity: "critical" as const, check_id: "missing_title", page: "https://a.test/" }];
  const { overall_score, subscores } = computeScores(findings, { pages: ["https://a.test/"], performancePages: [] });
  assertEquals(subscores.on_page, 78);
  // technical 100 (0.25), on_page 78 (0.25), content 100 (0.15) => (25+19.5+15)/0.65
  assertEquals(overall_score, Math.round((100 * 0.25 + 78 * 0.25 + 100 * 0.15) / 0.65));
});

Deno.test("every scored category has at least one check, and the rubric is v3", () => {
  assertEquals(RUBRIC_VERSION, "seo-rubric.v3");
  assertEquals(new Set(Object.values(CHECKS).map((c) => c.category)).has("off_page"), false);
});
