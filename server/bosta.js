/**
 * Bosta client — detailed shipment status.
 *
 * Bosta deliveries carry the Shopify order name in `businessReference`
 * (e.g. "#2599321"), which is the join key between the two systems.
 */

const BASE = process.env.BOSTA_API_URL || 'https://app.bosta.co/api/v2';

function authHeaders() {
  const key = process.env.BOSTA_API_KEY;
  if (!key) throw new Error('Missing required environment variable: BOSTA_API_KEY');
  return { Authorization: key, 'Content-Type': 'application/json' };
}

/** Finds the delivery created for a given Shopify order name. */
export async function findDeliveryByOrderName(orderName) {
  const res = await fetch(`${BASE}/deliveries/search`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ search: orderName.replace(/^#/, ''), limit: 5, page: 1 }),
  });
  if (!res.ok) throw new Error(`Bosta search returned ${res.status}`);
  const json = await res.json();
  const list = json?.data?.deliveries ?? [];
  return (
    list.find((d) => (d.businessReference || '').replace(/^#/, '') === orderName.replace(/^#/, '')) ??
    list[0] ??
    null
  );
}

/** Public tracking timeline for one AWB. */
export async function trackDelivery(trackingNumber) {
  const res = await fetch(`${BASE}/deliveries/business/${encodeURIComponent(trackingNumber)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Bosta tracking returned ${res.status}`);
  const json = await res.json();
  return json?.data ?? null;
}

/**
 * Bosta state codes collapsed onto the four steps the app's order screen
 * renders. Kept in sync with `stepFromBostaState` in the app.
 */
export function stepFromState(code) {
  if (code == null) return 0;
  if (code >= 45) return 3; // Delivered and terminal states
  if (code >= 20) return 2; // Picked up / in transit / out for delivery
  if (code >= 15) return 1; // Received at warehouse
  return 0; // Created
}

/** Turns a Bosta delivery + its log into the update rows the app displays. */
export function toUpdates(delivery, tracking, lang = 'ar') {
  const ar = lang === 'ar';
  const log = tracking?.TrackingHistory ?? tracking?.trackingHistory ?? [];

  if (Array.isArray(log) && log.length) {
    return log.map((entry) => ({
      text: (ar ? entry.valueAr : entry.value) || entry.value || '',
      time: entry.time || entry.timestamp || '',
      done: true,
    }));
  }

  // No public log yet — report the single state we do know.
  const state = delivery?.state?.value;
  return state
    ? [{ text: state, time: delivery.updatedAt ?? '', done: true }]
    : [];
}
