import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decisionLine, splitLearned } from "./learnedLines.ts";

const lines = [
  "3 posts were published.",
  "Review lesson: Small samples limit conclusions.",
  decisionLine("Try this cycle", "social", "post twice a week on LinkedIn"),
  decisionLine("Try this cycle", "prospect", "target firms that sell assessments"),
  decisionLine("Stop", "social", "daily Facebook posts"),
  decisionLine("Keep doing", "prospect", "short subject lines"),
];

Deno.test("splitLearned: facts and lessons stay facts; decisions are split by scope and lose the scope tag", () => {
  assertEquals(splitLearned(lines, "social"), {
    facts: ["3 posts were published.", "Review lesson: Small samples limit conclusions."],
    decisions: ["Try this cycle: post twice a week on LinkedIn", "Stop: daily Facebook posts"],
  });
  assertEquals(splitLearned(lines, "prospect").decisions, ["Try this cycle: target firms that sell assessments", "Keep doing: short subject lines"]);
});

Deno.test("splitLearned: a line that only looks like a decision is a fact", () => {
  assertEquals(splitLearned(["Try this cycle: no scope tag", "Stop (billing): not a scope"], "social"), {
    facts: ["Try this cycle: no scope tag", "Stop (billing): not a scope"], decisions: [],
  });
});
