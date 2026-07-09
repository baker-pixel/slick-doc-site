import { imageQualityForPlatform, imageSizeForPlatform } from "./socialImagePrompt.ts";

export interface GptImageRequestBody {
  model: "gpt-image-1";
  prompt: string;
  n: 1;
  size: string;
  quality: "medium" | "high";
}

// Shared by every gpt-image-1 caller (generate-social-image,
// sync-fill-missing-images, generate-social-images-batch) so size/quality
// selection can't silently drift between them.
export function buildGptImageRequestBody(prompt: string, platform: string): GptImageRequestBody {
  return {
    model: "gpt-image-1",
    prompt,
    n: 1,
    size: imageSizeForPlatform(platform),
    quality: imageQualityForPlatform(platform),
  };
}

// Calls gpt-image-1 synchronously and returns the raw base64 image data.
// For callers that submit via the OpenAI Batch API instead (generate-social-
// images-batch), use buildGptImageRequestBody() directly as a JSONL line
// rather than calling this.
export async function generateGptImage(openaiKey: string, prompt: string, platform: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildGptImageRequestBody(prompt, platform)),
  });

  if (!res.ok) {
    const errText = await res.text();
    let msg = `Image generation failed (${res.status})`;
    try { msg = JSON.parse(errText)?.error?.message || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }

  const data = await res.json();
  const b64: string | undefined = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data returned from gpt-image-1");
  return b64;
}

// Decodes a gpt-image-1 base64 result and uploads it to the generated-images
// bucket, returning its public URL.
export async function persistGeneratedImage(supabase: any, base64: string, fileName: string): Promise<string> {
  const imageBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const { error: uploadErr } = await supabase.storage
    .from("generated-images")
    .upload(fileName, imageBytes, { contentType: "image/png", upsert: true });
  if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

  const { data: publicData } = supabase.storage.from("generated-images").getPublicUrl(fileName);
  return publicData.publicUrl;
}
