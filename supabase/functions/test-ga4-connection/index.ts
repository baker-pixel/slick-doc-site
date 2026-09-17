import { handleOptions, jsonResponse, errorResponse } from "../_shared/http.ts";
import { getGoogleAccessToken } from "../_shared/googleServiceAccount.ts";

// Real validation for the google_analytics integration_configs row --
// test-api-key (the generic "Test" button other integration types use)
// only checks a hardcoded CAMPAIGN_API_KEY and never looks at this
// integration's actual credentials, so it always reports success/failure
// for the wrong thing here. This mints a real Google OAuth token from the
// service account key, and -- when a GA4 property id is supplied -- runs a
// real (harmless) 1-day report against it, so "Test" actually proves the
// service account can read that client's property.
Deno.serve(async (req) => {
  const opts = handleOptions(req);
  if (opts) return opts;

  try {
    const { client_email, private_key, property_id } = await req.json();
    if (!client_email || !private_key) {
      return errorResponse("client_email and private_key are required", 400);
    }

    const accessToken = await getGoogleAccessToken(
      { client_email, private_key },
      "https://www.googleapis.com/auth/analytics.readonly",
    );

    if (!property_id) {
      return jsonResponse({ success: true, message: "Service account credentials are valid." });
    }

    const today = new Date().toISOString().slice(0, 10);
    const reportRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${property_id}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate: today, endDate: today }],
          metrics: [{ name: "sessions" }],
        }),
      },
    );

    if (!reportRes.ok) {
      const body = await reportRes.text();
      return jsonResponse({
        success: false,
        error: `Credentials are valid, but reading GA4 property ${property_id} failed (${reportRes.status}). Share the property with ${client_email} as a Viewer. Details: ${body}`,
      });
    }

    return jsonResponse({ success: true, message: `Service account can read GA4 property ${property_id}.` });
  } catch (e) {
    return jsonResponse({
      success: false,
      error: e instanceof Error ? e.message : "Unknown error validating GA4 credentials",
    });
  }
});
