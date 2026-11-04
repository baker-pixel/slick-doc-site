// Run: deno test scripts/edge-error.test.ts
import { friendlyEdgeMessage as f, describeError as d } from "../src/lib/edge-error.ts";

const eq = (a: unknown, b: unknown) => {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)}\n     got ${JSON.stringify(a)}`);
};
const ACCESS = "We couldn't verify your access. Please check your credentials or sign in again.";
const RAW = [
  "Imported 5000 contacts successfully",
  "Campaign limit is 1500 per day",
  "Client 4020 not found",
  "Max tokens exceeded for this prompt",
  "Subscription token missing for client",
  "Gmail API daily quota exceeded",
  "Recipient blocked by suppression list",
  "Resend: 403 domain mismatch",
  "Invalid API key for LinkedIn (401 from provider)",
];

Deno.test("unrelated messages pass through untouched", () => {
  for (const m of RAW) eq(f(m), m);
});
Deno.test("bare 401 / Unauthorized -> access message", () => {
  for (const m of ["Unauthorized", "401 Unauthorized", "Error: Unauthorized", "HTTP 401", "status: 401"]) eq(f(m), ACCESS);
});
Deno.test("real status codes still map", () => {
  eq(f("HTTP 429"), "Too many requests — please wait a moment and try again.");
  eq(f("status 402"), "AI credits have been used up — contact your administrator to add more.");
  eq(f("Error 500"), "Something went wrong on our end. Please try again in a moment — if this persists, contact support.");
});
Deno.test("AI quota still maps; other quotas don't", () => {
  eq(f("OpenAI quota exceeded"), "AI credits have been used up — contact your administrator to add more.");
});
Deno.test("real auth-token errors map", () => {
  const m = "Your login session is invalid — please sign out and sign back in.";
  eq(f("JWT expired"), m);
  eq(f("invalid token"), m);
  eq(f("Token has expired"), m);
});
Deno.test("password / account wording is not email-specific", () => {
  eq(f("Invalid password"), "That password isn't right. Please check it and try again.");
  eq(f("Invalid login credentials"), "The email or password you entered is incorrect. Please try again.");
  eq(f("User not found in client_accounts"), "We couldn't find that account. Please check the details and try again.");
});

Deno.test("describeError hides database/runtime plumbing", () => {
  const fb = "Try again.";
  eq(d(new Error('duplicate key value violates unique constraint "x_pkey"'), fb), "This record already exists — you may be trying to create a duplicate.");
  eq(d(new Error('column "foo" of relation "bar" does not exist'), fb), fb);
  eq(d(new Error("TypeError: Cannot read properties of undefined (reading 'id')"), fb), fb);
  eq(d({ message: "{\"code\":\"PGRST202\"}" }, fb), fb);
  eq(d(new Error("x".repeat(300)), fb), fb);
  eq(d(null, fb), fb);
});
Deno.test("describeError keeps short readable messages and maps known ones", () => {
  eq(d(new Error("That email is already in use by another client")), "That email is already in use by another client");
  eq(d("Unauthorized"), ACCESS);
  eq(d({ message: "Request timed out" }), "The request took too long — please try again.");
});
