import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requirePipelineAuth } from "./auth.ts";
import { PIPELINE_CRON_JOBS, PIPELINE_GUARDED_FUNCTIONS } from "./pipelineGuarded.ts";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);
const MIGRATIONS_DIR = new URL("../../../migrations/", import.meta.url);

// --- the two lists must agree --------------------------------------------------

Deno.test("every guarded function actually calls the pipeline guard", () => {
  for (const fn of PIPELINE_GUARDED_FUNCTIONS) {
    const src = Deno.readTextFileSync(new URL(`${fn}/index.ts`, FUNCTIONS_DIR));
    assert(
      /requirePipelineAuth\(|checkPipelineAuth\(/.test(src),
      `${fn}/index.ts is in PIPELINE_GUARDED_FUNCTIONS but never calls requirePipelineAuth/checkPipelineAuth`,
    );
  }
});

Deno.test("every guarded function's cron job gets the secret from a migration", () => {
  const sql = [
    "20261126100000_alert_digest_and_cron_staleness.sql",
    "20261126110000_cron_send_pipeline_secret.sql",
  ].map((f) => Deno.readTextFileSync(new URL(f, MIGRATIONS_DIR))).join("\n");
  assert(sql.includes("x-internal-secret"), "cron migrations never send x-internal-secret");
  for (const [fn, jobs] of Object.entries(PIPELINE_CRON_JOBS)) {
    for (const job of jobs) {
      assert(sql.includes(`'${job}'`), `cron job '${job}' (calls ${fn}) is not covered by a secret-sending migration`);
    }
  }
});

// --- requirePipelineAuth behaviour --------------------------------------------

/** Minimal stand-in for the internal_secrets lookup used by checkInternalSecret. */
function fakeSupabase(secret: string | null) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: secret ? { value: secret } : null }) }) }),
    }),
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: { message: "bad jwt" } }) },
  // deno-lint-ignore no-explicit-any
  } as any;
}

const req = (headers: Record<string, string> = {}, body = "{}") =>
  new Request("http://x/fn", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

async function withEnv<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const old: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) { old[k] = Deno.env.get(k); Deno.env.set(k, vars[k]); }
  try { return await fn(); } finally {
    for (const k of Object.keys(vars)) {
      const prev = old[k];
      if (prev === undefined) Deno.env.delete(k);
      else Deno.env.set(k, prev);
    }
  }
}

Deno.test("requirePipelineAuth: anon key alone is refused with 401", async () => {
  await withEnv({ SUPABASE_SERVICE_ROLE_KEY: "svc-key", ADMIN_PASSWORD: "pw" }, async () => {
    const res = await requirePipelineAuth(req({ Authorization: "Bearer anon-key", apikey: "anon-key" }), fakeSupabase("s3cret"));
    assertEquals(res?.status, 401);
  });
});

Deno.test("requirePipelineAuth: matching x-internal-secret passes, wrong one does not", async () => {
  await withEnv({ SUPABASE_SERVICE_ROLE_KEY: "svc-key", ADMIN_PASSWORD: "pw" }, async () => {
    assertEquals(await requirePipelineAuth(req({ "x-internal-secret": "s3cret" }), fakeSupabase("s3cret")), null);
    assertEquals((await requirePipelineAuth(req({ "x-internal-secret": "nope" }), fakeSupabase("s3cret")))?.status, 401);
    // no secret row in the table must never match an empty/absent header
    assertEquals((await requirePipelineAuth(req({ "x-internal-secret": "" }), fakeSupabase(null)))?.status, 401);
  });
});

Deno.test("requirePipelineAuth: service key and admin password in the body pass; body stays readable", async () => {
  await withEnv({ SUPABASE_SERVICE_ROLE_KEY: "svc-key", ADMIN_PASSWORD: "pw" }, async () => {
    assertEquals(await requirePipelineAuth(req({ Authorization: "Bearer svc-key" }), fakeSupabase(null)), null);
    const r = req({}, JSON.stringify({ password: "pw", batchType: "daily" }));
    assertEquals(await requirePipelineAuth(r, fakeSupabase(null)), null);
    assertEquals((await r.json()).batchType, "daily"); // guard read a clone, handler can still read the body
    assertEquals((await requirePipelineAuth(req({}, JSON.stringify({ password: "wrong" })), fakeSupabase(null)))?.status, 401);
  });
});
