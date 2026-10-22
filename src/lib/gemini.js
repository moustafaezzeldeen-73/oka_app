/**
 * Gemini transcription for call recordings.
 *
 * Runs server-side only. The API key must never reach the phone — an
 * EXPO_PUBLIC_* value is inlined into the app bundle and extractable from the
 * APK, so the device uploads audio here and this service does the billing-
 * bearing work.
 *
 * Two upload paths, chosen by size:
 *   - inline_data for small files (one request, simplest)
 *   - the Files API above INLINE_LIMIT_BYTES, because Gemini caps total
 *     request size around 20MB and base64 inflates payloads by ~33%
 */

import { config } from "../config.js";
import { requestJson, UpstreamError } from "./httpClient.js";

const API_ROOT = "https://generativelanguage.googleapis.com";

// Well under Gemini's ~20MB request ceiling once base64 expansion is counted.
export const INLINE_LIMIT_BYTES = 12 * 1024 * 1024;

export function isConfigured() {
  return Boolean(config.gemini.apiKey);
}

function assertConfigured() {
  if (!isConfigured()) {
    throw new UpstreamError("Gemini is not configured — set GEMINI_API_KEY", {
      service: "gemini",
      status: 503,
    });
  }
}

/**
 * The transcription instruction.
 *
 * OKA's calls are in Egyptian Arabic, so the transcript stays in Egyptian
 * Arabic rather than being flattened into MSA or translated — the rep reading
 * it back needs the words that were actually said. The summary is what the
 * app's history row shows, so it is capped to one short line.
 */
const PROMPT = `This is a recorded sales/support phone call for OKA, an Egyptian e-commerce store.

Return ONLY valid JSON, no markdown fence, with exactly these keys:
{
  "transcript": "the full transcript in Egyptian Arabic, with each turn prefixed by المندوب: or العميل:",
  "summary_ar": "one short sentence in Egyptian Arabic saying what was agreed or what happened",
  "summary_en": "the same single sentence in English",
  "outcome": one of "confirmed" | "cancelled" | "address_changed" | "order_changed" | "no_answer" | "callback_requested" | "other",
  "action_required": "a short sentence if the warehouse must do something, otherwise an empty string"
}

If the audio is silent, unintelligible, or contains no conversation, set outcome to "no_answer" and leave transcript empty.`;

/** Uploads to the Files API and returns the file URI to reference. */
async function uploadFile(buffer, mimeType) {
  const response = await fetch(
    `${API_ROOT}/upload/v1beta/files?uploadType=media&key=${encodeURIComponent(config.gemini.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": mimeType, "X-Goog-Upload-Protocol": "raw" },
      body: buffer,
    },
  );

  const text = await response.text();
  if (!response.ok) {
    throw new UpstreamError(`Gemini file upload failed (${response.status})`, {
      service: "gemini",
      status: response.status,
      body: text,
    });
  }

  const uri = JSON.parse(text)?.file?.uri;
  if (!uri) throw new UpstreamError("Gemini file upload returned no URI", { service: "gemini", body: text });
  return uri;
}

/** Gemini sometimes wraps JSON in a markdown fence despite being told not to. */
function parseModelJson(raw) {
  const cleaned = String(raw || "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // A non-JSON reply is still worth keeping as a raw transcript rather than
    // discarding a call that cost money to process.
    return {
      transcript: cleaned,
      summary_ar: "",
      summary_en: "",
      outcome: "other",
      action_required: "",
      parseFailed: true,
    };
  }
}

/**
 * Transcribes one recording.
 * `audio` is a Buffer; `mimeType` is the recording's type (audio/mp4,
 * audio/amr, audio/3gpp, audio/ogg, audio/wav all work).
 */
export async function transcribeAudio(audio, mimeType = "audio/mp4") {
  assertConfigured();

  const buffer = Buffer.isBuffer(audio) ? audio : Buffer.from(audio);
  if (!buffer.length) {
    throw new UpstreamError("Recording is empty", { service: "gemini", status: 400 });
  }

  const part =
    buffer.length > INLINE_LIMIT_BYTES
      ? { file_data: { mime_type: mimeType, file_uri: await uploadFile(buffer, mimeType) } }
      : { inline_data: { mime_type: mimeType, data: buffer.toString("base64") } };

  const payload = await requestJson(
    `${API_ROOT}/v1beta/models/${config.gemini.model}:generateContent?key=${encodeURIComponent(config.gemini.apiKey)}`,
    {
      service: "gemini",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Audio processing is slow; the default 30s timeout would abort a long call.
      timeoutMs: 180000,
      retries: 1,
      body: {
        contents: [{ parts: [{ text: PROMPT }, part] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      },
    },
  );

  const text = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  if (!text) {
    throw new UpstreamError("Gemini returned no transcript", { service: "gemini", body: payload });
  }

  const parsed = parseModelJson(text);

  return {
    transcript: parsed.transcript || "",
    summaryAr: parsed.summary_ar || "",
    summaryEn: parsed.summary_en || "",
    outcome: parsed.outcome || "other",
    actionRequired: parsed.action_required || "",
    model: config.gemini.model,
    sizeBytes: buffer.length,
    parseFailed: Boolean(parsed.parseFailed),
  };
}
