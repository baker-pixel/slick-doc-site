// AES-GCM encryption for Google tokens stored at rest. Key: GOOGLE_TOKEN_KEY (base64, 32 bytes).
// Fails closed when the key is missing.
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function key(): Promise<CryptoKey> {
  const raw = Deno.env.get("GOOGLE_TOKEN_KEY");
  if (!raw) throw new Error("GOOGLE_TOKEN_KEY is not configured");
  const bytes = unb64(raw);
  if (bytes.length !== 32) throw new Error("GOOGLE_TOKEN_KEY must be 32 bytes (base64)");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(plain)));
  return `v1:${b64(iv)}:${b64(ct)}`;
}

export async function decryptToken(stored: string): Promise<string> {
  const [v, iv, ct] = stored.split(":");
  if (v !== "v1" || !iv || !ct) throw new Error("Unrecognized token format");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(), unb64(ct));
  return new TextDecoder().decode(pt);
}
