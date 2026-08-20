/**
 * Recording -> Gemini -> Shopify.
 *
 * The phone harvests audio its own dialer recorded and uploads it here; this
 * service transcribes it and attaches the result to the order.
 *
 * ## Where it lands on the order, and why
 *
 * Shopify's Admin API has **no mutation that writes an order timeline
 * comment**. Confirmed against the live schema: of 454 mutations the only
 * `comment*` ones (`commentApprove`, `commentDelete`, `commentSpam`,
 * `commentNotSpam`) operate on blog article comments, and nothing else creates
 * a timeline entry. So the transcript is attached in the two places that are
 * writable and visible:
 *
 *   - **Order note** — a one-line dated summary. This is what the merchant
 *     sees on the order page itself, and is the closest writable equivalent
 *     to a timeline comment.
 *   - **Order metafield** (`oka.call_transcripts`, JSON) — the full transcript
 *     history, appended to, so nothing is lost when a second call happens.
 *
 * ## Cost control
 *
 * Gemini bills per second of audio, so every transcription is recorded in the
 * `transcripts` ledger keyed by call id and never repeated. Re-uploading the
 * same call is a no-op that returns the stored result.
 */

import * as shopify from "../lib/shopify.js";
import * as gemini from "../lib/gemini.js";
import { append, readAll } from "../lib/ledger.js";
import { config } from "../config.js";

export const METAFIELD_NAMESPACE = "oka";
export const METAFIELD_KEY = "call_transcripts";

/** Cairo-time stamp for the note line. */
function cairoStamp(date = new Date()) {
  return new Date(date.getTime() + config.orderWindowTzOffsetHours * 3600 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 16);
}

/** Previously transcribed calls, keyed by call id. */
export function transcriptsByCallId() {
  const map = new Map();
  for (const entry of readAll("transcripts")) {
    if (entry.callId) map.set(entry.callId, entry);
  }
  return map;
}

export function existingTranscript(callId) {
  return transcriptsByCallId().get(callId) || null;
}

/** Appends to the metafield's JSON array rather than replacing it. */
async function appendToMetafield(orderId, record) {
  let history = [];
  try {
    const existing = await shopify.getOrderMetafield(orderId, METAFIELD_NAMESPACE, METAFIELD_KEY);
    if (existing?.value) {
      const parsed = JSON.parse(existing.value);
      if (Array.isArray(parsed)) history = parsed;
    }
  } catch {
    // A malformed or missing metafield must not lose the new transcript —
    // start a fresh array rather than aborting.
    history = [];
  }

  history.push(record);

  await shopify.setOrderMetafield(orderId, {
    namespace: METAFIELD_NAMESPACE,
    key: METAFIELD_KEY,
    type: "json",
    value: history,
  });

  return history.length;
}

/**
 * Transcribes one recording and attaches it to the order.
 *
 * `audio` is a Buffer of the recording as harvested from the handset.
 * Returns the stored record; re-running for the same `callId` returns the
 * existing one without calling Gemini again.
 */
export async function transcribeAndAttach({
  orderId,
  orderName,
  callId,
  phone,
  audio,
  mimeType = "audio/mp4",
  durationLabel = "",
  startTime = null,
}) {
  if (!callId) throw new Error("callId is required — it is the idempotency key");

  const already = existingTranscript(callId);
  if (already) return { ...already, reused: true };

  const result = await gemini.transcribeAudio(audio, mimeType);

  const record = {
    callId,
    orderId: orderId || null,
    orderName: orderName || null,
    phone: phone || null,
    startTime,
    durationLabel,
    transcript: result.transcript,
    summaryAr: result.summaryAr,
    summaryEn: result.summaryEn,
    outcome: result.outcome,
    actionRequired: result.actionRequired,
    model: result.model,
    sizeBytes: result.sizeBytes,
    parseFailed: result.parseFailed,
  };

  // Logged before the Shopify write: a transcription that succeeded has
  // already been paid for, and must not be repeated if attaching fails.
  append("transcripts", record);

  const attached = { note: false, metafield: false, errors: [] };

  if (orderId) {
    const summary = record.summaryEn || record.summaryAr || "(no summary)";
    const line = `[${cairoStamp()}] Call ${durationLabel || ""} — ${summary}${
      record.actionRequired ? ` | ACTION: ${record.actionRequired}` : ""
    }`.replace(/\s+/g, " ");

    try {
      const note = await shopify.getOrderNote(orderId);
      await shopify.appendOrderNote(orderId, line, note);
      attached.note = true;
    } catch (error) {
      attached.errors.push(`note: ${error.message}`);
    }

    try {
      await appendToMetafield(orderId, record);
      attached.metafield = true;
    } catch (error) {
      attached.errors.push(`metafield: ${error.message}`);
    }
  }

  return { ...record, reused: false, attached };
}
