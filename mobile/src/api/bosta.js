/**
 * Bosta, direct-from-device. Used for the tracking timeline, the courier card,
 * and the customer ranking / address-clarity tiles on the order detail screen.
 *
 * The API key goes in `Authorization` with NO `Bearer` prefix.
 */

import { requestJson, ApiError } from "./client.js";
import { bosta as cfg } from "./config.js";

/**
 * Bosta state -> the 5-step timeline the design draws. Bosta emits many more
 * states than the mockup has rows, so everything is folded onto the nearest
 * phase rather than adding steps the design has no room for.
 */
const PHASE_BY_STATE = {
  "Created": 0,
  "Pending pickup": 0,
  "Waiting for route": 0,
  "Picked up": 1,
  "Received at warehouse": 1,
  "In transit": 2,
  "In transit between hubs": 2,
  "Out for delivery": 3,
  "Delivered": 4,
};

export function phaseForState(state) {
  const value = typeof state === "object" ? state?.value : state;
  if (!value) return 0;
  if (PHASE_BY_STATE[value] !== undefined) return PHASE_BY_STATE[value];
  // Exceptions (Terminated, Returned, Lost) are not a forward phase — hold the
  // shipment at "out for delivery" so the timeline never claims delivery.
  return 3;
}

async function call(pathname, { method = "GET", body } = {}) {
  if (!cfg.apiKey) throw new ApiError("Bosta API key is not configured", { service: "bosta" });

  const payload = await requestJson(`${cfg.baseUrl}${pathname}`, {
    service: "bosta",
    method,
    headers: { "Content-Type": "application/json", Authorization: cfg.apiKey },
    body,
  });

  if (payload && payload.success === false) {
    throw new ApiError(`Bosta: ${payload.message || "request rejected"}`, { service: "bosta", body: payload });
  }
  return payload?.data !== undefined ? payload.data : payload;
}

export const trackDelivery = (trackingNumber) =>
  call(`/deliveries/business/${encodeURIComponent(trackingNumber)}`);

/**
 * Everything the detail screen needs about one shipment, flattened.
 * Risk fields are flat on Bosta's response — `receiver_ranking`, not
 * `receiver.ranking`. A null ranking means no history yet, not zero, which is
 * why the design renders "—" rather than "0%".
 */
export async function shipmentSignals(trackingNumber) {
  const data = await trackDelivery(trackingNumber);
  const pick = (...keys) => {
    for (const key of keys) if (data?.[key] !== undefined && data?.[key] !== null) return data[key];
    return null;
  };

  const courier = data?.star || data?.courier || null;
  const courierName = courier?.name || [courier?.firstName, courier?.lastName].filter(Boolean).join(" ") || "";

  return {
    trackingNumber,
    state: data?.state?.value || data?.state || null,
    phase: phaseForState(data?.state),
    ranking: pick("receiver_ranking", "receiverRanking"),
    clarity: pick("addressClarityScore"),
    isBadAddress: Boolean(pick("isBadAddress")),
    courier: courierName ? { name: courierName, phone: courier?.phone || "" } : null,
    // Bosta returns the state history under a few different keys depending on
    // endpoint; the timeline falls back to synthesised times when absent.
    timeline: data?.transitEvents || data?.stateHistory || [],
    raw: data,
  };
}
