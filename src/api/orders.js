import { SERVICE_URL, hasService, withTimeout } from './config';

/**
 * Orders & fulfilment.
 *
 * Checkout is native: the app posts the basket here and the order service
 * creates the real Shopify order with the Admin API, then returns the order
 * name and (once an AWB exists) the Bosta tracking number. Detailed shipment
 * status also comes back through the service, which is the only place the
 * Admin and Bosta credentials live.
 */

async function post(path, body) {
  const res = await withTimeout((signal) =>
    fetch(`${SERVICE_URL}${path}`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (!res.ok) throw new Error(`service-http-${res.status}`);
  return res.json();
}

async function get(path) {
  const res = await withTimeout((signal) =>
    fetch(`${SERVICE_URL}${path}`, { signal }),
  );
  if (!res.ok) throw new Error(`service-http-${res.status}`);
  return res.json();
}

/** A locally-generated order number, matching the prototype's `OKA-#####`. */
function localOrderNumber() {
  return `OKA-${10000 + Math.floor(Math.random() * 9000)}`;
}

/**
 * Places the order. Falls back to a local order number when the service isn't
 * configured so the flow stays demonstrable without a backend.
 */
export async function submitOrder(payload) {
  if (!hasService()) {
    return { orderNumber: localOrderNumber(), offline: true };
  }
  try {
    const json = await post('/orders', payload);
    return {
      orderNumber: json.orderNumber ?? localOrderNumber(),
      shopifyOrderId: json.shopifyOrderId ?? null,
      trackingNumber: json.trackingNumber ?? null,
    };
  } catch {
    // A failed hand-off must not strand the shopper mid-checkout; the service
    // reconciles from the mirrored Shopify cart.
    return { orderNumber: localOrderNumber(), offline: true };
  }
}

/**
 * Bosta delivery states, collapsed onto the four steps the order screen shows.
 * Codes come from Bosta's `state.code`.
 */
export function stepFromBostaState(code) {
  if (code == null) return 0;
  if (code >= 45) return 3; // Delivered / returned-to-business terminal states
  if (code >= 41) return 2; // Out for delivery
  if (code >= 20) return 2; // Picked up / in transit
  return code >= 15 ? 1 : 0; // Received at warehouse → preparing, else processing
}

/**
 * Live shipment status for one order: Shopify fulfilment plus the Bosta
 * timeline, already merged by the service.
 */
export async function fetchOrderStatus({ orderNumber, trackingNumber }) {
  if (!hasService() || (!orderNumber && !trackingNumber)) return null;
  const qs = new URLSearchParams();
  if (orderNumber) qs.set('order', orderNumber);
  if (trackingNumber) qs.set('tracking', trackingNumber);
  try {
    const json = await get(`/orders/status?${qs.toString()}`);
    return {
      step: json.step ?? stepFromBostaState(json.bostaStateCode),
      stateLabel: json.stateLabel ?? null,
      trackingNumber: json.trackingNumber ?? trackingNumber ?? null,
      updates: Array.isArray(json.updates) ? json.updates : [],
    };
  } catch {
    return null;
  }
}
