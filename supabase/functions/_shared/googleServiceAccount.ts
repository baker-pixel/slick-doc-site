import { SignJWT, importPKCS8 } from "https://esm.sh/jose@5";

// Mints a short-lived OAuth access token for a Google service account via
// the standard JWT bearer flow (RFC 7523) -- used by sync-ga4-analytics
// (and any future Google Data API integration) to call Google APIs without
// a per-client OAuth dance. The client only has to grant the service
// account's email "Viewer" access on their GA4 property once.
export interface GoogleServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export async function getGoogleAccessToken(
  key: GoogleServiceAccountKey,
  scope: string,
): Promise<string> {
  const tokenUri = key.token_uri || "https://oauth2.googleapis.com/token";
  const privateKey = await importPKCS8(key.private_key, "RS256");

  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(key.client_email)
    .setAudience(tokenUri)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  if (!data.access_token) throw new Error("Google token exchange returned no access_token");
  return data.access_token as string;
}
