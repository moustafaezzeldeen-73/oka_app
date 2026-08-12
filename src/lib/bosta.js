/**
 * Bosta client for the OKA warehouse app.
 *
 * Auth: Bosta takes the raw API key in the `Authorization` header — no
 * `Bearer` prefix. Sending one is the usual cause of a silent 401.
 *
 * Two things worth knowing before changing anything here:
 *
 *  - `createDelivery` commits a REAL, billable shipment the moment it
 *    succeeds. There is no sandbox on the production base URL. The
 *    `dryRun` flag below is this app's own guard rail, not Bosta's.
 *  - `printAwb` does NOT reliably return pages in the order the tracking
 *    numbers were passed. Confirmed live. Anything that maps pages back to
 *    orders must read the tracking number off the page itself.
 */

import { config } from "../config.js";
import { requestJson, UpstreamError } from "./httpClient.js";

/** Bosta delivery type codes. */
export const DELIVERY_TYPE = {
  SEND: 10,
  CASH_COLLECTION: 15,
  CUSTOMER_RETURN_PICKUP: 20,
  EXCHANGE: 25,
  SIGN_AND_RETURN: 30,
};

/**
 * Delivery states that mean the shipment has resolved, one way or the other.
 * Used by the outcome loop to decide whether a prediction can be scored yet.
 */
export const TERMINAL_STATES = {
  success: ["Delivered"],
  failure: ["Terminated", "Returned to business", "Lost", "Canceled", "Cancelled"],
};

export function isConfigured() {
  return Boolean(config.bosta.apiKey);
}

async function call(pathname, { method = "GET", body, query } = {}) {
  if (!isConfigured()) {
    throw new UpstreamError("Bosta is not configured — set BOSTA_API_KEY", {
      service: "bosta",
      status: 503,
    });
  }

  const url = new URL(`${config.bosta.baseUrl}${pathname}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const payload = await requestJson(url.toString(), {
    service: "bosta",
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: config.bosta.apiKey,
    },
    body,
  });

  // Bosta wraps everything in { success, message, data }, and can report a
  // logical failure inside an HTTP 200.
  if (payload && payload.success === false) {
    throw new UpstreamError(`Bosta rejected the request: ${payload.message || "unknown reason"}`, {
      service: "bosta",
      body: payload,
    });
  }

  return payload?.data !== undefined ? payload.data : payload;
}

/**
 * Build the create-delivery payload from an already-prepared shipment spec.
 * Split out from `createDelivery` so a dry run can show the exact body that
 * would have been sent.
 */
export function buildDeliveryPayload({
  city,
  zone = "",
  district = "",
  firstLine,
  secondLine = "",
  buildingNumber = "",
  floor = "",
  apartment = "",
  receiverFirstName,
  receiverLastName = "",
  receiverPhone,
  receiverEmail = "",
  codAmount,
  businessReference,
  packageDescription,
  itemsCount = 1,
  notes = "",
  allowToOpenPackage = false,
}) {
  const payload = {
    type: DELIVERY_TYPE.SEND,
    specs: {
      packageType: "Parcel",
      size: "SMALL",
      packageDetails: {
        itemsCount,
        description: packageDescription,
      },
    },
    notes,
    // Bosta treats cod as the amount to collect; 0 means a prepaid delivery.
    cod: Number(codAmount) || 0,
    dropOffAddress: {
      city,
      zone,
      district,
      firstLine,
      secondLine,
      buildingNumber,
      floor,
      apartment,
    },
    receiver: {
      firstName: receiverFirstName,
      lastName: receiverLastName,
      phone: receiverPhone,
      email: receiverEmail,
    },
    businessReference,
    // Defaults to false for every OKA order. Bosta's own default is true, so
    // this must be sent explicitly rather than omitted. Side effect confirmed
    // live: this also flips flexShippingInfo.isOrderEligible to false, because
    // Bosta ties flex-shipping eligibility to open-package permission.
    allowToOpenPackage,
  };

  if (config.bosta.pickupLocationId) {
    payload.pickupAddress = { locationId: config.bosta.pickupLocationId };
  }

  return payload;
}

/**
 * Creates a real shipment. `dryRun` returns the payload without sending it.
 *
 * The app-level `BOSTA_LIVE_SHIPMENTS` switch is enforced by the caller in
 * services/shipping.js, not here, so this stays a thin API binding.
 */
export async function createDelivery(spec, { dryRun = false } = {}) {
  const payload = buildDeliveryPayload(spec);
  if (dryRun) return { dryRun: true, payload };

  const data = await call("/deliveries", { method: "POST", body: payload });
  return {
    dryRun: false,
    id: data?._id || null,
    trackingNumber: data?.trackingNumber || null,
    raw: data,
  };
}

export async function getDelivery(deliveryId) {
  return call(`/deliveries/${encodeURIComponent(deliveryId)}`);
}

export async function trackDelivery(trackingNumber) {
  return call(`/deliveries/business/${encodeURIComponent(trackingNumber)}`);
}

export async function listDeliveries({ page = 1, limit = 50, ...rest } = {}) {
  return call("/deliveries", { query: { page, limit, ...rest } });
}

/**
 * Bosta's own city list. `dropOffAddress.city` has to match one of these
 * names, which is why zones.js keeps a `bostaCity` per province instead of
 * forwarding Shopify's free-text city field.
 */
export async function listCities() {
  return call("/cities");
}

export async function listPickupLocations() {
  return call("/pickup-locations");
}

/**
 * Risk/ranking signals for a shipment's receiver.
 *
 * Field paths are FLAT on this response, not nested — confirmed live June
 * 2026: `receiver_ranking`, not `receiver.ranking`. A null ranking means the
 * customer has no delivery history yet, not a zero score.
 *
 * `isBadAddress: true` can co-occur with a ranking of 100. The risk formula
 * deliberately ignores it, so it is surfaced separately here for the run
 * summary rather than folded into the score.
 */
export async function orderRisk(trackingNumber) {
  const data = await trackDelivery(trackingNumber);
  const pick = (...keys) => {
    for (const key of keys) {
      if (data?.[key] !== undefined && data?.[key] !== null) return data[key];
    }
    return null;
  };

  return {
    trackingNumber,
    ranking: pick("receiver_ranking", "receiverRanking"),
    isBadAddress: Boolean(pick("isBadAddress")),
    addressClarityScore: pick("addressClarityScore"),
    whatsappConfirmed: pick("whatsapp_confirmed", "whatsappConfirmed"),
    deliveryAttempts: pick("delivery_attempts", "deliveryAttempts"),
    // Bosta's own human-readable summary. Independent of this app's
    // classifyRisk() verdict — don't conflate the two.
    bostaVerdict: pick("verdict", "marker"),
    state: data?.state?.value || data?.state || null,
    raw: data,
  };
}

/**
 * AWB labels as base64 PDF.
 *
 * A6 is the real label size (297.12 x 420pt — true ISO A6, 105x148mm) and
 * four tile cleanly onto one A4 sheet, which is why the warehouse prints A6
 * and imposes rather than asking Bosta for A4.
 *
 * Bosta caps a single call at 50 tracking numbers.
 */
export async function printAwb(trackingNumbers, { awbType = "A6", lang = "en" } = {}) {
  const list = [].concat(trackingNumbers);
  if (!list.length) throw new UpstreamError("printAwb needs at least one tracking number", { service: "bosta" });
  if (list.length > 50) {
    throw new UpstreamError(`printAwb accepts at most 50 tracking numbers, got ${list.length}`, {
      service: "bosta",
    });
  }

  const data = await call("/deliveries/awb", {
    method: "POST",
    body: { trackingNumbers: list, type: awbType, lang },
  });

  return {
    count: list.length,
    awbType,
    pdfBase64: data?.data || data?.pdf_base64 || data?.pdfBase64 || null,
    raw: data,
  };
}

/** Chunks a batch into the 50-per-call limit printAwb enforces. */
export function chunkForPrinting(trackingNumbers, size = 50) {
  const chunks = [];
  for (let i = 0; i < trackingNumbers.length; i += size) {
    chunks.push(trackingNumbers.slice(i, i + size));
  }
  return chunks;
}

export function classifyState(state) {
  const value = typeof state === "object" ? state?.value : state;
  if (!value) return "pending";
  if (TERMINAL_STATES.success.includes(value)) return "success";
  if (TERMINAL_STATES.failure.includes(value)) return "failure";
  return "pending";
}
