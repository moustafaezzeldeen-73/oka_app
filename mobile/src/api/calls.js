/**
 * Call history and recordings, read from the backend's Salestrail routes.
 *
 * The app never records audio itself — Android has blocked third-party call
 * recording since API 29, and Expo Go could not host a native recorder even if
 * it hadn't. See docs/call-recording.md at the repo root.
 *
 * The backend decides where this data comes from (CALL_PROVIDER), so retiring
 * Salestrail does not change anything in this file.
 */

import { requestJson } from "./client.js";
import * as config from "./config.js";

/** Provider timestamps -> the "Aug 10 · 10:12" format the design uses. */
export function formatCallTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const month = date.toLocaleString("en-US", { month: "short" });
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${month} ${date.getDate()} · ${time}`;
}

/**
 * One customer's calls, shaped into the design's history rows.
 * Returns [] rather than throwing — a missing call log should leave the
 * section showing "no contact yet", not break the order screen.
 */
export async function callHistoryFor(phone, { days = 14, lang = "en" } = {}) {
  if (!config.isBackendReady() || !phone) return [];

  try {
    const payload = await requestJson(
      `${config.backend.baseUrl}/api/calls?phone=${encodeURIComponent(phone)}&days=${days}`,
      { service: "calls" },
    );

    const ar = lang === "ar";

    return (payload.calls || []).map((entry) => ({
      type: "call",
      callId: entry.id,
      time: formatCallTime(entry.startTime),
      dur: entry.durationLabel,
      hasRecording: entry.hasRecording,
      recordingUrl: entry.recordingUrl,
      // An answered call and a missed one read very differently to the rep,
      // so they get distinct wording rather than a generic "call" label.
      ar: entry.answered ? (entry.inbound ? "مكالمة واردة - تم الرد" : "تم الرد") : "لم يتم الرد",
      en: entry.answered ? (entry.inbound ? "Inbound - answered" : "Answered") : "No answer",
      note: entry.answered
        ? ar
          ? entry.inbound
            ? "مكالمة واردة - تم الرد"
            : "تم الرد"
          : entry.inbound
            ? "Inbound - answered"
            : "Answered"
        : ar
          ? "لم يتم الرد"
          : "No answer",
    }));
  } catch {
    return [];
  }
}

/** Resolves the playable audio URL for one call. */
export async function recordingUrlFor(call) {
  if (call.recordingUrl) return call.recordingUrl;
  if (!config.isBackendReady() || !call.callId) return null;

  try {
    const payload = await requestJson(
      `${config.backend.baseUrl}/api/calls/${encodeURIComponent(call.callId)}/recording`,
      { service: "calls" },
    );
    return payload?.url || payload?.recUrl || payload?.recordingUrl || null;
  } catch {
    return null;
  }
}
