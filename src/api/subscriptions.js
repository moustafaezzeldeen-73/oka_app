import { SERVICE_URL, hasService, withTimeout } from './config';

/**
 * Subscribe & save — a standalone recurring-order mode.
 *
 * The server holds the subscription record and turns it into a real COD
 * Shopify order on each due date; the app only ever reads/writes that record.
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

/** The frequency tiers and their discounts — public, works even signed out. */
export async function fetchSubscriptionFrequencies() {
  const json = await call('/subscription-frequencies');
  return json.frequencies ?? [];
}

export async function fetchSubscriptions(token) {
  const json = await call('/subscriptions', { token });
  return json.subscriptions ?? [];
}

/**
 * `payload` is { frequencyId, items: [{variantId, title, price, quantity}],
 * address, shippingFee, customerName, email }.
 */
export async function createSubscription(payload, token) {
  const json = await call('/subscriptions', { method: 'POST', token, body: payload });
  return json.subscription;
}

/** `patch` is any of { items, frequencyId, address, shippingFee }. */
export async function updateSubscription(id, patch, token) {
  const json = await call(`/subscriptions/${encodeURIComponent(id)}/update`, {
    method: 'POST',
    token,
    body: patch,
  });
  return json.subscription;
}

async function setSubscriptionStatus(id, action, token) {
  const json = await call(`/subscriptions/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    token,
  });
  return json.subscription;
}

export const pauseSubscription = (id, token) => setSubscriptionStatus(id, 'pause', token);
export const resumeSubscription = (id, token) => setSubscriptionStatus(id, 'resume', token);
export const cancelSubscription = (id, token) => setSubscriptionStatus(id, 'cancel', token);
