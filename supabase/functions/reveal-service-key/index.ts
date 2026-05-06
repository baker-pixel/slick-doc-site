import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// This endpoint has been permanently disabled.
// Service role keys must never be returned over HTTP.
serve(() =>
  new Response(JSON.stringify({ error: "Gone" }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  })
);
