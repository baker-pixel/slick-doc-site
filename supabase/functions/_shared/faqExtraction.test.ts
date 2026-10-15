import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { decodeEntities, parseOnPage } from "./seoSignals.ts";
import { buildFaqJsonLd } from "./schemaMarkup.ts";

const qa = (html: string) => parseOnPage(html, "https://a.test/post").qa_pairs;
const LONG = "Know your niche market and write for one reader. Do you consult to bankers? Speak their language. Restaurant owners have a different vocabulary, so learn it before you publish anything.";

Deno.test("decodeEntities: named, decimal and hex entities; unknown ones are left alone", () => {
  assertEquals(decodeEntities("Don&#8217;t &amp; won&#x2019;t &mdash; &hellip; &#039;hi&#039;&nbsp;x"), "Don’t & won’t — … 'hi' x");
  assertEquals(decodeEntities("&notreal; &#99999999; AT&T"), "&notreal; &#99999999; AT&T");
});

Deno.test("a real question with a real answer is extracted, entities decoded", () => {
  const pairs = qa(`<h2>What can I do to grow my Tribe?</h2><p>${LONG} Don&#8217;t rush.</p><h2>Next section</h2><p>x</p>`);
  assertEquals(pairs.length, 1);
  assertEquals(pairs[0].question, "What can I do to grow my Tribe?");
  assertEquals(pairs[0].answer.includes("Don’t rush."), true);
  assertEquals(pairs[0].answer.includes("&#"), false);
});

Deno.test("the contact-form heading is never treated as an FAQ (the Innermetrix bug)", () => {
  const html = `<h2>HAVE QUESTIONS?</h2><form><label>Name</label><input><label>Email</label><input><label>Message</label><textarea></textarea><button>Submit</button></form>`;
  assertEquals(qa(html), []);
  // Even if the heading were phrased differently, a form-only answer is rejected.
  assertEquals(qa(`<h3>Want to talk to someone?</h3><form><label>Name</label><label>Email</label><label>Message</label><input type="submit" value="Submit"></form>`), []);
  assertEquals(qa(`<h3>Want to talk to someone?</h3><p>Name Email Message Submit</p>`), []);
});

Deno.test("call-to-action headings are skipped even with text under them", () => {
  for (const q of ["Ready to get started today?", "Still have questions about our services?", "Want to subscribe to our newsletter?", "Have a question for us?"]) {
    assertEquals(qa(`<h2>${q}</h2><p>${LONG}</p>`), [], q);
  }
});

Deno.test("form, nav and script content inside the answer region is stripped, the real answer stays", () => {
  const pairs = qa(`<h2>How long does onboarding take?</h2><p>${LONG}</p><form><label>Name</label><input></form><script>var x=1;</script>`);
  assertEquals(pairs.length, 1);
  assertEquals(/Name|var x/.test(pairs[0].answer), false);
});

Deno.test("long answers end on a sentence or a word, never mid-word", () => {
  const sentences = Array.from({ length: 30 }, (_, i) => `This is sentence number ${i} about onboarding.`).join(" ");
  const a = qa(`<h2>What happens during onboarding?</h2><p>${sentences}</p><h2>Other?</h2><p>y</p>`)[0].answer;
  assertEquals(a.length <= 400, true);
  assertEquals(a.endsWith("."), true);
  const noStops = "word ".repeat(200).trim();
  const b = qa(`<h2>What is this all about really?</h2><p>${noStops}</p><h2>Other?</h2><p>y</p>`)[0].answer;
  assertEquals(b.endsWith("word…"), true);
});

Deno.test("short or one-word answers are rejected rather than invented", () => {
  assertEquals(qa("<h2>Is this a real question here?</h2><p>Yes.</p>"), []);
  assertEquals(qa("<h2>Is this a real question here?</h2><h2>Another heading</h2>"), []);
});

Deno.test("title and meta description are decoded, so lengths and baselines are real text", () => {
  const p = parseOnPage('<title>The One Reason Why You Aren&#039;t Charging What You&#8217;re Worth &amp; More</title><meta name="description" content="Tom &amp; Jerry&#8217;s guide">', "https://a.test/");
  assertEquals(p.title, "The One Reason Why You Aren't Charging What You’re Worth & More");
  assertEquals(p.meta_description, "Tom & Jerry’s guide");
});

Deno.test("FAQ JSON-LD built from extracted pairs contains no entities, forms or truncated words", () => {
  const html = `<h2>HAVE QUESTIONS?</h2><form><label>Name</label></form><h2>What are some blogging details for successful blogging?</h2><p>${LONG} What&#8217;s in it for the reader, not you.</p>`;
  const json = JSON.stringify(buildFaqJsonLd(qa(html)));
  assertEquals(json.includes("HAVE QUESTIONS"), false);
  assertEquals(json.includes("&#"), false);
  assertEquals(json.includes("What’s in it"), true);
});

Deno.test("an answer that only introduces a list is skipped; a self-contained answer is kept", () => {
  const intro = "(Excerpts taken from the book The Profitable Consultant.) Here are the top 6 tips to building a large and loyal following of readers of your blog. These are in the order in which you should complete them: Write your first five Lead Articles";
  assertEquals(qa(`<h2>What can I do to grow my Tribe through blogging?</h2><p>${intro}</p><h2>Next?</h2><p>x</p>`), []);
  assertEquals(qa(`<h2>How long does onboarding take for a new client?</h2><p>${LONG}</p>`).length, 1);
});
