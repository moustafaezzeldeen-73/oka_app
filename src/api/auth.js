import { SERVICE_URL, hasService, withTimeout } from './config';

/**
 * Sign-in and the signed-in customer's real orders.
 *
 * TESTING STAGE — the master password and the Google/Apple buttons are
 * placeholders. The password itself lives in the server environment, never
 * here, so the app only ever forwards what the tester typed.
 */

async function call(path, { method = 'GET', body, token } = {}) {
  if (!hasService()) throw new Error('service-not-configured');
  const res = await withTimeout((signal) =>
    fetch(`${SERVICE_URL}${path}`, {
      method,
      signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`service returned non-JSON (is the port public?): ${text.slice(0, 120)}`);
  }
  if (!res.ok) throw new Error(json.error ?? `service HTTP ${res.status}`);
  return json;
}

/**
 * `provider` is 'password' for the master-password path, or 'google'/'apple'
 * for the placeholder buttons.
 */
export function signIn({ identifier, password, provider = 'password' }) {
  return call('/auth/login', { method: 'POST', body: { identifier, password, provider } });
}

export function fetchCustomerOrders({ token, lang }) {
  return call(`/customer/orders?lang=${lang}`, { token });
}

export function fetchCustomerAddresses(token) {
  return call('/customer/addresses', { token });
}

export function cancelShopifyOrder(orderName, token) {
  return call(`/orders/${encodeURIComponent(orderName)}/cancel`, {
    method: 'POST',
    token,
    body: { reason: 'CUSTOMER' },
  });
}

/** `lines` is the desired end state: [{ variantId, quantity }]. */
export function editShopifyOrder(orderName, lines, token) {
  return call(`/orders/${encodeURIComponent(orderName)}/edit`, {
    method: 'POST',
    token,
    body: { lines },
  });
}

/** Saves a new address onto the signed-in customer's Shopify record. */
export function saveCustomerAddress(address, token) {
  return call('/customer/addresses', { method: 'POST', token, body: { address } });
}

/** Wishlist, stored on the customer so it survives a reinstall. */
export function fetchWishlist(token) {
  return call('/customer/wishlist', { token });
}

export function saveWishlist(ids, token) {
  return call('/customer/wishlist', { method: 'POST', token, body: { ids } });
}

/**
 * What the basket actually costs, according to Shopify — shipping tiers and
 * discount codes included, rather than the app's local estimate.
 */
export function calculateCheckout(payload) {
  return call('/checkout/calculate', { method: 'POST', body: payload });
}
