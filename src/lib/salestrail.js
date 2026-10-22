/**
 * Salestrail — the call log and recordings OKA already collects.
 *
 * Why this exists rather than an in-app recorder: since Android 10 a
 * third-party app cannot record the other side of a phone call at all (see
 * docs/call-recording.md). Salestrail's own Android app is the thing that
 * legitimately captures these calls; this client reads what it captured.
 *
 * Endpoint shapes are the ones confirmed against Salestrail's published API:
 *   GET /export/calls/json                     (the call log)
 *   GET /export/calls/{callId}/recording       (the audio for one call)
 *
 * Two parameter details that are easy to get wrong and cost real time:
 *   - The date range parameters are `from` and `to`. Sending
 *     `start_date`/`end_date` returns HTTP 400.
 *   - Query one day at a time. Multi-day ranges get large enough to be
 *     truncated, and a truncated log silently reports customers as
 *     "never called" when they were.
 */

import { config } from "../config.js";
import { requestJson, UpstreamError } from "./httpClient.js";
import { normalizeForBosta } from "../domain/phone.js";

export function isConfigured() {
  return Boolean(config.salestrail.apiKey);
}

async function call(pathname, query = {}) {
  if (!isConfigured()) {
    throw new UpstreamError("Salestrail is not configured — set SALESTRAIL_API_KEY", {
      service: "salestrail",
      status: 503,
    });
  }

  const url = new URL(`${config.salestrail.baseUrl}${pathname}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  return requestJson(url.toString(), {
    service: "salestrail",
    headers: {
      // Salestrail authenticates with an API key header. The header name is
      // configurable because deployments differ; see .env.example.
      [config.salestrail.authHeader]: config.salestrail.apiKey,
    },
  });
}

/**
 * Per-day response cache.
 *
 * `callsForPhone` pulls the whole log then filters, and the log is fetched one
 * day at a time — so a 14-day lookup was 14 HTTP round trips, repeated for
 * every order a rep opened. Past days are immutable once they're over, so they
 * are cached indefinitely; today's is re-fetched after a short TTL because
 * calls are still being added to it.
 */
const dayCache = new Map();
const TODAY_TTL_MS = 120000;

function cacheGet(day, isToday) {
  const hit = dayCache.get(day);
  if (!hit) return null;
  if (isToday && Date.now() - hit.at > TODAY_TTL_MS) return null;
  return hit.rows;
}

/** Exposed for tests and for a manual refresh after a known sync. */
export function clearCallCache() {
  dayCache.clear();
}

/** YYYY-MM-DD for a Date, in Cairo time. */
function cairoDay(date) {
  return new Date(date.getTime() + config.orderWindowTzOffsetHours * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * The call log for a span of days, fetched one day at a time and concatenated
 * — see the truncation note above.
 */
export async function listCalls({ days = 7, endDate = new Date() } = {}) {
  const calls = [];
  const today = cairoDay(new Date());

  for (let offset = 0; offset < days; offset++) {
    const day = cairoDay(new Date(endDate.getTime() - offset * 86400000));
    const isToday = day === today;

    const cached = cacheGet(day, isToday);
    if (cached) {
      calls.push(...cached);
      continue;
    }

    const payload = await call("/export/calls/json", {
      from: `${day}T00:00:00Z`,
      to: `${day}T23:59:59Z`,
    });

    const rows = Array.isArray(payload) ? payload : payload?.calls || payload?.data || [];
    dayCache.set(day, { rows, at: Date.now() });
    calls.push(...rows);
  }

  return calls;
}

/**
 * Normalized call record. Salestrail's field names vary a little by account,
 * so each value is picked from the handful of keys it can arrive under.
 */
export function normalizeCall(row) {
  const pick = (...keys) => {
    for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null) return row[key];
    return null;
  };

  const number = pick("number", "formattedNumber", "phoneNumber", "phone");
  const startTime = pick("startTime", "createdAt", "time");
  const duration = Number(pick("duration", "durationSeconds") || 0);
  const answered = Boolean(pick("answered"));

  return {
    id: pick("id", "callId", "_id"),
    phone: number,
    // Matching against Shopify/Bosta numbers only works on a common format.
    phoneNormalized: normalizeForBosta(number) || null,
    startTime,
    duration,
    answered,
    inbound: Boolean(pick("inbound")),
    rep: pick("userEmail", "user", "userName"),
    // recUrl present means Salestrail actually captured audio for this call.
    // An answered call without one simply was not recorded.
    recordingUrl: pick("recUrl", "recordingUrl"),
    recordingType: pick("recType", "recordingType"),
    raw: row,
  };
}

/** mm:ss, the format the design's history rows show. */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Calls for one customer, newest first, shaped for the app's history rows.
 * Matching is on the normalized phone number, so a Shopify record storing
 * "+201110727746" still matches a call logged as "01110727746".
 */
export async function callsForPhone(phone, { days = 7 } = {}) {
  const target = normalizeForBosta(phone);
  if (!target) return [];

  const calls = (await listCalls({ days })).map(normalizeCall);

  return calls
    .filter((entry) => entry.phoneNormalized === target)
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
}

/** The playable recording reference for one call. */
export async function getRecording(callId) {
  return call(`/export/calls/${encodeURIComponent(callId)}/recording`);
}
