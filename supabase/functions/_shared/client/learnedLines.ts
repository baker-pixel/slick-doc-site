// The `learned` list mixes two kinds of line: facts from the cycle digest ("3 posts were published")
// and decisions the cycle review made ("Try this cycle (social): ..."). The planners that read it
// must not treat a decision as a fact, and a social planner must not receive a prospect decision.
// This file is the one place that knows both formats.

export type DecisionScope = "social" | "prospect";
export type DecisionVerb = "Keep doing" | "Stop" | "Try this cycle";

const DECISION = /^(Keep doing|Stop|Try this cycle) \((social|prospect)\): /;
export const LESSON_PREFIX = "Review lesson: ";

export const decisionLine = (verb: DecisionVerb, scope: DecisionScope, change: string) => `${verb} (${scope}): ${change}`;

/** Facts and lessons for any planner, plus only the decisions that belong to this planner's scope. */
export function splitLearned(lines: string[], scope: DecisionScope): { facts: string[]; decisions: string[] } {
  const facts: string[] = [], decisions: string[] = [];
  for (const l of lines) {
    const m = DECISION.exec(l);
    if (!m) facts.push(l);
    else if (m[2] === scope) decisions.push(l.replace(DECISION, `${m[1]}: `));
  }
  return { facts, decisions };
}
