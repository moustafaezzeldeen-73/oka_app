/**
 * Uploads a harvested recording for transcription.
 *
 * The audio is sent to the backend, which calls Gemini and attaches the result
 * to the Shopify order. Transcription is deliberately NOT done on the device:
 * the Gemini key would be inlined into the app bundle and extractable from the
 * APK, and the Shopify write needs the admin token too.
 *
 * Gemini bills per second of audio, so the backend is idempotent on callId and
 * this module never re-uploads a call it has already sent in this session.
 */

// SDK 54 promoted the new File/Directory API to the package root and moved
// the classic helpers to /legacy. `uploadAsync` exists ONLY in legacy — a
// root import silently yields undefined and every upload throws.
import * as FileSystem from "expo-file-system/legacy";
import { requestJson } from "./client.js";
import * as config from "./config.js";

// Calls already uploaded in this session. The backend is the real guard; this
// just avoids pushing the same multi-megabyte file over the warehouse wifi
// twice while a screen re-renders.
const inFlight = new Set();

/** Guess the audio type from the file extension the OEM dialer used. */
function mimeTypeFor(uri) {
  const ext = String(uri || "").split("?")[0].split(".").pop()?.toLowerCase();
  return (
    {
      m4a: "audio/mp4",
      mp4: "audio/mp4",
      aac: "audio/aac",
      amr: "audio/amr",
      "3gp": "audio/3gpp",
      "3gpp": "audio/3gpp",
      ogg: "audio/ogg",
      opus: "audio/ogg",
      wav: "audio/wav",
      mp3: "audio/mpeg",
    }[ext] || "audio/mp4"
  );
}

/** The stored transcript for a call, or null if it hasn't been made yet. */
export async function fetchTranscript(callId) {
  if (!config.isBackendReady() || !callId) return null;
  try {
    return await requestJson(
      `${config.backend.baseUrl}/api/calls/${encodeURIComponent(callId)}/transcript`,
      { service: "transcripts" },
    );
  } catch {
    // 404 simply means "not transcribed yet" — not an error worth surfacing.
    return null;
  }
}

/**
 * Uploads one recording and returns the transcript record.
 * Returns null when there is nothing to do, rather than throwing — a failed
 * transcription must never block the order screen.
 */
export async function transcribeCall(call, { order } = {}) {
  if (!config.isBackendReady() || !call?.callId || !call?.recordingUrl) return null;
  if (inFlight.has(call.callId)) return null;

  inFlight.add(call.callId);
  try {
    const existing = await fetchTranscript(call.callId);
    if (existing) return existing;

    const params = new URLSearchParams({
      mimeType: mimeTypeFor(call.recordingUrl),
      durationLabel: call.dur || "",
    });
    if (order?.shopifyId) params.set("orderId", order.shopifyId);
    if (order?.sh) params.set("orderName", order.sh);
    if (order?.phone) params.set("phone", order.phone);

    // uploadAsync streams the file from disk — a long call can be tens of
    // megabytes and must not be base64'd into JS memory first.
    const response = await FileSystem.uploadAsync(
      `${config.backend.baseUrl}/api/calls/${encodeURIComponent(call.callId)}/transcribe?${params}`,
      call.recordingUrl,
      {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": mimeTypeFor(call.recordingUrl) },
      },
    );

    if (response.status < 200 || response.status >= 300) return null;
    return JSON.parse(response.body);
  } catch {
    return null;
  } finally {
    inFlight.delete(call.callId);
  }
}

/**
 * Transcribes every recorded call in a history list that doesn't have one yet,
 * one at a time so a warehouse phone isn't uploading four files at once.
 * Returns a map of callId -> transcript for the ones that succeeded.
 */
export async function transcribeHistory(history, { order, limit = 3 } = {}) {
  const pending = history.filter((entry) => entry.hasRecording && entry.callId).slice(0, limit);
  const results = {};

  for (const call of pending) {
    const record = await transcribeCall(call, { order });
    if (record) results[call.callId] = record;
  }

  return results;
}
