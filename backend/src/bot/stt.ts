/**
 * Speech-to-text through UzbekVoice.ai.
 *
 * Settings (backend environment):
 *   UZBEKVOICE_API_KEY  — key from the uzbekvoice.ai developer cabinet (required)
 *   UZBEKVOICE_API_URL  — STT endpoint, default https://uzbekvoice.ai/api/v1/stt
 *
 * The key is sent as-is in the Authorization header, so a value like
 * "Bearer xxx" also works if the cabinet issues keys in that form.
 */
const DEFAULT_URL = "https://uzbekvoice.ai/api/v1/stt";

export function sttConfigured(): boolean {
  return Boolean(process.env.UZBEKVOICE_API_KEY);
}

/** Pulls the transcript out of the response, tolerating the shapes the API has used. */
export function readTranscript(data: unknown): string {
  const d = data as Record<string, unknown> | null;
  const result = (d?.result ?? null) as Record<string, unknown> | string | null;
  const candidates = [
    typeof result === "string" ? result : null,
    typeof result === "object" && result ? result.text : null,
    typeof result === "object" && result ? result.conversation_text : null,
    d?.text,
    d?.transcript,
  ];
  for (const c of candidates) if (typeof c === "string" && c.trim()) return c.trim();
  return "";
}

export async function transcribe(audio: Buffer, filename = "voice.ogg", mime = "audio/ogg"): Promise<string> {
  const key = process.env.UZBEKVOICE_API_KEY;
  if (!key) throw new Error("UZBEKVOICE_API_KEY is not set");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), filename);
  form.append("return_offsets", "false");
  form.append("run_diarization", "false");
  form.append("language", "uz");
  form.append("blocking", "true");

  const r = await fetch(process.env.UZBEKVOICE_API_URL || DEFAULT_URL, {
    method: "POST",
    headers: { Authorization: key },
    body: form,
    signal: AbortSignal.timeout(90000),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`UzbekVoice STT failed: HTTP ${r.status} ${body.slice(0, 200)}`);
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    data = { text: body };
  }
  const text = readTranscript(data);
  if (!text) throw new Error(`UzbekVoice STT returned no text: ${body.slice(0, 200)}`);
  return text;
}
