import { SERVICE_URL, hasService, withTimeout } from './config';

/**
 * Orders & fulfilment.
 *
 * Checkout is native: the app posts the basket here and the order service
 * creates the real Shopify order with the Admin API, then returns the order
 * name. Detailed shipment status — J&T for current orders, Bosta for older
 * ones — also comes back through the service, which is the only place the
 * Shopify Admin and courier credentials live.
 */

async function post(path, body) {
  const res = await withTimeout((signal) =>
    fetch(`${SERVICE_URL}${path}`, {
      method: 'POST',
      signal,
      // Codespaces answers a port-forward request with an HTML login page
      // unless the port is public; asking for JSON makes that failure obvious
      // rather than surfacing as a confusing parse error.
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`service HTTP ${res.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`service returned non-JSON (is the port public?): ${text.slice(0, 120)}`);
  }
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
    console.warn('[oka] EXPO_PUBLIC_OKA_SERVICE_URL is not set — order stays local');
    return { orderNumber: localOrderNumber(), offline: true, reason: 'no-service-url' };
  }
  try {
    const json = await post('/orders', payload);
    if (!json.orderNumber) throw new Error(json.error ?? 'service returned no order number');
    return {
      orderNumber: json.orderNumber,
      shopifyOrderId: json.shopifyOrderId ?? null,
      trackingNumber: json.trackingNumber ?? null,
    };
  } catch (err) {
    // The shopper is never stranded mid-checkout, but the failure must be
    // visible — silently falling back to a local number is how a broken
    // integration hides for a week.
    console.error('[oka] order submission failed:', err?.message ?? err);
    return { orderNumber: localOrderNumber(), offline: true, reason: String(err?.message ?? err) };
  }
}

/**
 * Live shipment status for one order: Shopify's own events plus the courier's
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
      step: json.step ?? 0,
      carrier: json.carrier ?? null,
      stateLabel: json.stateLabel ?? null,
      trackingNumber: json.trackingNumber ?? trackingNumber ?? null,
      courier: json.courier ?? null,
      courierPhone: json.courierPhone ?? null,
      actionNeeded: json.actionNeeded ?? null,
      updates: Array.isArray(json.updates) ? json.updates : [],
      shippingError: json.shippingError ?? json.bostaError ?? null,
    };
  } catch {
    return null;
  }
}
