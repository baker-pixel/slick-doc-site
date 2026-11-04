import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { groupFindings, pagesLabel, type GroupableFinding } from "../../../src/lib/seoFindings.ts";

const f = (id: string, check: string, page: string, over: Partial<GroupableFinding> = {}): GroupableFinding => ({
  id, check_id: check, title: check.replace(/_/g, " "), severity: "warning", pages: [page], impact: 3, effort: 2,
  plain_english: `${check} on a page`, wp_applyable: false, fix: null, ...over,
});

Deno.test("groups keep the action-plan order, merge pages, and take the worst severity", () => {
  const ordered = [
    f("1", "missing_meta_desc", "/a", { severity: "critical", fix: { payload: { value: "x" } }, wp_applyable: true }),
    f("2", "images_missing_alt", "/a"), f("3", "missing_meta_desc", "/b", { severity: "warning" }), f("4", "images_missing_alt", "/b"), f("5", "missing_meta_desc", "/b"),
  ];
  const groups = groupFindings(ordered);
  assertEquals(groups.map((g) => g.check_id), ["missing_meta_desc", "images_missing_alt"]);
  assertEquals(groups[0].items.length, 3);
  assertEquals(groups[0].pages, ["/a", "/b"]); // /b counted once
  assertEquals(groups[0].severity, "critical");
  assertEquals(groups[0].fixable, 1);
});

Deno.test("a shared explanation is kept only when every finding says the same thing", () => {
  const same = groupFindings([f("1", "x", "/a"), f("2", "x", "/b")]);
  assertEquals(same[0].explanation, "x on a page");
  const differs = groupFindings([f("1", "x", "/a", { plain_english: "14 images" }), f("2", "x", "/b", { plain_english: "8 images" })]);
  assertEquals(differs[0].explanation, null);
});

Deno.test("empty input, single findings and labels", () => {
  assertEquals(groupFindings([]), []);
  assertEquals(groupFindings([f("1", "only", "/a")])[0].items.length, 1);
  assertEquals([pagesLabel(1), pagesLabel(58)], ["1 page", "58 pages"]);
});
