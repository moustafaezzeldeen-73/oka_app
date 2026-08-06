import { SERVICE_URL, hasService, withTimeout } from './config';
import { LOYALTY_BASE } from '../data';

/**
 * Loyalty points.
 *
 * The store has no loyalty app and no customer metafield definitions today, so
 * the service derives the balance the same way the prototype's earn rules
 * describe it — 1 point per EGP on delivered orders — minus whatever has been
 * redeemed (stored in an `oka.loyalty_redeemed` customer metafield).
 *
 * Until a customer is signed in, the prototype's demo balance is used.
 */
export async function fetchLoyalty(customerPhone) {
  if (!hasService() || !customerPhone) return { balance: LOYALTY_BASE, demo: true };
  try {
    const res = await withTimeout((signal) =>
      fetch(`${SERVICE_URL}/loyalty?phone=${encodeURIComponent(customerPhone)}`, { signal }),
    );
    if (!res.ok) throw new Error(`service-http-${res.status}`);
    const json = await res.json();
    return {
      balance: Number(json.balance ?? 0),
      earned: Number(json.earned ?? 0),
      redeemed: Number(json.redeemed ?? 0),
      demo: false,
    };
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
