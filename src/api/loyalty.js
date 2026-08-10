import { SERVICE_URL, hasService, withTimeout } from './config';
import { LOYALTY_BASE } from '../data';

/**
 * Loyalty points — a live read of the customer's Shopify store credit, at 10
 * points per EGP. Until a customer is signed in, the prototype's demo balance
 * is used instead.
 */
export async function fetchLoyalty(customerPhone) {
  if (!hasService() || !customerPhone) return { balance: LOYALTY_BASE, demo: true };
  try {
    const res = await withTimeout((signal) =>
      fetch(`${SERVICE_URL}/loyalty?phone=${encodeURIComponent(customerPhone)}`, { signal }),
    );
    if (!res.ok) throw new Error(`service-http-${res.status}`);
    const json = await res.json();
    return { balance: Number(json.balance ?? 0), demo: false };
  } catch {
    return { balance: LOYALTY_BASE, demo: true };
  }
}

/** Records a redemption so the balance survives a reinstall. */
export async function redeemReward(customerPhone, rewardId, cost) {
  if (!hasService() || !customerPhone) return { ok: true, offline: true };
  try {
    const res = await withTimeout((signal) =>
      fetch(`${SERVICE_URL}/loyalty/redeem`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: customerPhone, rewardId, cost }),
      }),
    );
    return { ok: res.ok };
  } catch {
    return { ok: false, offline: true };
  }
}
