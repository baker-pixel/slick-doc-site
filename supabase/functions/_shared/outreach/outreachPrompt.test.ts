import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { angleBlock, angleForStep, findOutreachViolations, groundedIn, parseAngle, stepBrief } from "./outreachPrompt.ts";

const FACTS = "Vienna Coffee Company. Coffee Roastery & Retail in Maryville, Tennessee. Coffee Sales, Coffee Subscriptions, Gift Cards, Coffee Classes and Tours, Meeting Room Rentals, Catering, Wholesale Coffee Supply. Multiple locations including Downtown Maryville and Maryville College.";

Deno.test("groundedIn needs the observation to reuse the recipient's own facts", () => {
  assert(groundedIn("You roast coffee in Maryville and also sell subscriptions, run classes and supply wholesale.", FACTS));
  assert(!groundedIn("You are a fast-growing leader in premium lifestyle experiences.", FACTS));
  assert(!groundedIn("", FACTS));
});

Deno.test("parseAngle accepts a grounded observation with a real question", () => {
  const a = parseAngle({
    observation: "You roast coffee in Maryville and also run subscriptions, classes and wholesale.",
    question: "With that many offers, how do new people find the classes and wholesale side?",
  }, FACTS);
  assertEquals(a?.question.endsWith("?"), true);
});

Deno.test("parseAngle rejects ungrounded, flattering, non-question, bad-shape or empty angles", () => {
  const good = { observation: "You roast coffee in Maryville and also run subscriptions, classes and wholesale.", question: "How do new people find the classes and wholesale side?" };
  assertEquals(parseAngle({ ...good, observation: "You lead the premium lifestyle experience market with great reach." }, FACTS), null);
  assertEquals(parseAngle({ ...good, observation: "I'm impressed that you roast coffee in Maryville with subscriptions and classes." }, FACTS), null);
  assertEquals(parseAngle({ ...good, question: "Tell me about growth." }, FACTS), null);
  assertEquals(parseAngle({ ...good, question: "Want to grow with us!?" }, FACTS), null);
  assertEquals(parseAngle({ observation: "", question: "" }, FACTS), null);
  assertEquals(parseAngle(null, FACTS), null);
  assertEquals(parseAngle("nope", FACTS), null);
});

Deno.test("angleBlock is empty without an angle and carries both parts with one", () => {
  assertEquals(angleBlock(null), "");
  const b = angleBlock({ observation: "O text here for the test.", question: "Q text here?" });
  assert(b.includes("O text here") && b.includes("Q text here?"));
});

Deno.test("generic subjects are rejected, specific ones pass", () => {
  const html = "<p>Hi there,</p><p>You roast coffee in Maryville. How do people find your classes?</p><p>— Orange Door</p>";
  const opts = { greeting: "Hi there," };
  assert(findOutreachViolations({ subject: "Quick question about marketing", html }, opts).some((v) => v.includes("generic subject")));
  assert(findOutreachViolations({ subject: "Quick question for Vienna Coffee", html }, opts).some((v) => v.includes("generic subject")));
  assert(findOutreachViolations({ subject: "Checking in", html }, opts).some((v) => v.includes("generic subject")));
  assertEquals(findOutreachViolations({ subject: "Maryville coffee classes", html }, opts), []);
});

Deno.test("cold step 1 and 2 briefs tell the writer to use the angle", () => {
  assert(stepBrief(1)!.theme.includes("ANGLE"));
  assert(stepBrief(2)!.theme.includes("DIFFERENT"));
  assertEquals(stepBrief(4)!.maxWords, 55);
});

Deno.test("angleForStep gives each follow-up a different angle and the last step none", () => {
  const a = { observation: "a obs long enough here", question: "a q?" };
  const b = { observation: "b obs long enough here", question: "b q?" };
  assertEquals(angleForStep([a, b], 1), a);
  assertEquals(angleForStep([a, b], 2), b);
  assertEquals(angleForStep([a, b], 3), a);
  assertEquals(angleForStep([a, b], 4), null);
  assertEquals(angleForStep([], 1), null);
});
