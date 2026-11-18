// Validation of the campaign fields a caller sends to prospect-campaign.
// Pure, so the rules (and their error messages, which the UI shows verbatim)
// are unit tested.

export interface CampaignInput {
  name: string;
  topic: string | null;
  topic_details: string | null;
  audience: "cold" | "existing";
  max_steps: number;
}

const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

export function validateCampaignInput(raw: unknown): { ok: true; value: CampaignInput } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const name = str(r.name);
  if (!name) return { ok: false, error: "Give the campaign a name." };
  if (name.length > 120) return { ok: false, error: "Campaign name is too long (120 characters max)." };

  const topic = str(r.topic);
  if (topic.length > 200) return { ok: false, error: "Topic is too long (200 characters max)." };

  // Details keep their line breaks (people paste short bullet lists).
  const topic_details = typeof r.topic_details === "string" ? r.topic_details.trim() : "";
  if (topic_details.length > 2000) return { ok: false, error: "Details are too long (2,000 characters max)." };

  const audience = r.audience === "existing" ? "existing" : "cold";
  if (r.audience !== undefined && r.audience !== "cold" && r.audience !== "existing") {
    return { ok: false, error: "Audience must be 'cold' or 'existing'." };
  }
  // An announcement to existing contacts has nothing to say without a topic.
  if (audience === "existing" && !topic) {
    return { ok: false, error: "Tell us what the email is about (e.g. \"our new reporting dashboard\")." };
  }

  // Existing contacts get a shorter sequence by default: announce, remind, done.
  const defaultSteps = audience === "existing" ? 2 : 3;
  const maxStepsRaw = r.max_steps === undefined || r.max_steps === null ? defaultSteps : Number(r.max_steps);
  if (!Number.isInteger(maxStepsRaw) || maxStepsRaw < 1 || maxStepsRaw > 4) {
    return { ok: false, error: "Number of emails must be between 1 and 4." };
  }

  return {
    ok: true,
    value: { name, topic: topic || null, topic_details: topic_details || null, audience, max_steps: maxStepsRaw },
  };
}
