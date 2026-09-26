import { call } from './client';

/**
 * Subscribe & save — a standalone recurring-order mode.
 *
 * The server holds the subscription record and turns it into a real COD
 * Shopify order on each due date; the app only ever reads/writes that record.
 */

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
 * `payload` is { frequencyId, items: [{ variantId, title, quantity }], addressId }.
 * Prices are the server's, looked up live on every cycle.
 */
export async function createSubscription(payload, token) {
  const json = await call('/subscriptions', { method: 'POST', token, body: payload });
  return json.subscription;
}

/** `patch` is any of { items, frequencyId, addressId }. */
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
