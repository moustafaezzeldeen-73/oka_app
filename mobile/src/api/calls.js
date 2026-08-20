/**
 * Call history and recordings.
 *
 * The app never records audio itself — Android has blocked third-party call
 * recording since API 29, and Expo Go could not host a native recorder even if
 * it hadn't. See docs/call-recording.md at the repo root.
 *
 * Two sources, tried in order:
 *   1. The device's own call log, plus whatever the phone's system dialer
 *      recorded. Free, no server, but needs a development build.
 *   2. The backend's configured call provider (CALL_PROVIDER).
 */

import { requestJson } from "./client.js";
import * as config from "./config.js";
import * as device from "./callProviders/device.js";

/** Provider timestamps -> the "Aug 10 · 10:12" format the design uses. */
export function formatCallTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const month = date.toLocaleString("en-US", { month: "short" });
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${month} ${date.getDate()} · ${time}`;
}

/** Provider rows -> the design's history rows. */
function toHistoryRows(rows, lang) {
  const ar = lang === "ar";

  return rows.map((entry) => {
    // An answered call and a missed one read very differently to the rep, so
    // they get distinct wording rather than a generic "call" label.
    const arNote = entry.answered
      ? entry.inbound
        ? "مكالمة واردة - تم الرد"
        : "تم الرد"
      : "لم يتم الرد";
    const enNote = entry.answered ? (entry.inbound ? "Inbound - answered" : "Answered") : "No answer";

    return {
      type: "call",
      callId: entry.id,
      time: formatCallTime(entry.startTime),
      dur: entry.durationLabel,
      hasRecording: Boolean(entry.hasRecording),
      recordingUrl: entry.recordingUrl || null,
      ar: arNote,
      en: enNote,
      note: ar ? arNote : enNote,
    };
  });
}

/**
 * One customer's calls, shaped into the design's history rows.
 * Returns [] rather than throwing — a missing call log should leave the
 * section showing "no contact yet", not break the order screen.
 */
export async function callHistoryFor(phone, { days = 14, lang = "en" } = {}) {
  if (!phone) return [];

  // The device's own log is preferred when this build can read it: free, no
  // server, and it carries the recordings the phone's dialer made. Falls
  // through to the backend when the module isn't linked (Expo Go) or the
  // device has nothing for this number.
  let rows = [];
  if (device.isAvailable()) {
    rows = await device.callsForPhone(phone, { days });
  }

  if (!rows.length) {
    if (!config.isBackendReady()) return [];
    try {
      const payload = await requestJson(
        `${config.backend.baseUrl}/api/calls?phone=${encodeURIComponent(phone)}&days=${days}`,
        { service: "calls" },
      );
      rows = payload.calls || [];
    } catch {
      return [];
    }
  }

  return toHistoryRows(rows, lang);
}

/**
 * Why the device provider isn't supplying data, for the UI to explain.
 * null means it is working (or the backend is covering it).
 */
export function deviceStatus() {
  return device.isAvailable() ? null : device.unavailableReason();
}

/** Resolves the playable audio URL for one call. */
export async function recordingUrlFor(call) {
  // Device recordings are already a playable file:// URI.
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
