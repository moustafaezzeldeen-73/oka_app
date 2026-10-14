import { POLICY, REWARDS, pointsEarned, rewardById } from '../config/policy.js';
import { trackOrders } from './tracking.js';
import {
  addTags,
  createVoucher,
  creditLoyaltyPoints,
  debitLoyaltyPoints,
  findCustomerLoyalty,
  findShippedOrders,
} from '../integrations/shopify.js';

/**
 * Loyalty: earn on delivery, redeem into a voucher.
 *
 * Redeeming used to debit store credit and hand back nothing. Now it debits
 * the points and returns a single-use code the shopper applies at checkout.
 * If the voucher can't be created, the points are put back.
 */

export async function loyaltySummary(customerId) {
  const c = await findCustomerLoyalty(customerId);
  return {
    balance: c?.balance ?? 0,
    rewards: REWARDS,
    earnPointsPerEgp: POLICY.loyalty.earnPointsPerEgp,
  };
}

export async function redeem(customerId, rewardId) {
  const reward = rewardById(rewardId);
  if (!reward) throw Object.assign(new Error('unknown reward'), { status: 400 });

  const c = await findCustomerLoyalty(customerId);
  if (!c || c.balance < reward.points) {
    throw Object.assign(new Error('not enough points'), { status: 409 });
  }

  await debitLoyaltyPoints(customerId, reward.points);
  try {
    const voucher = await createVoucher({
      customerId,
      egp: reward.egp,
      minOrder: reward.minOrder,
      days: POLICY.loyalty.voucherDays,
      title: `Loyalty: ${reward.en}`,
    });
    const after = await findCustomerLoyalty(customerId);
    return { ok: true, voucher: { ...voucher, reward }, balance: after?.balance ?? 0 };
  } catch (err) {
    await creditLoyaltyPoints(customerId, reward.points).catch((e) =>
      console.error(`[oka][loyalty] REFUND FAILED for ${customerId} (${reward.points} pts):`, e.message ?? e),
    );
    throw err;
  }
}

/* ── Earning ───────────────────────────────────────────────────────────── */

const CREDITED_TAG = 'loyalty-credited';

/**
 * Credits points for delivered orders, once each.
 *
 * Runs only when LOYALTY_START_DATE (YYYY-MM-DD) is set, and only for orders
 * created on or after it — otherwise switching it on would credit the whole
 * order history at once. An order counts once the courier reports it
 * delivered and it is paid (COD collected), and it is tagged so it is never
 * credited twice.
 */
export async function creditDeliveredOrders() {
  const start = process.env.LOYALTY_START_DATE;
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return { skipped: 'LOYALTY_START_DATE not set' };

  const candidates = (
    await findShippedOrders(`created_at:>=${start} -tag:${CREDITED_TAG}`, 200)
  ).filter((o) => o.customerId);
  if (!candidates.length) return { credited: 0 };

  const { byName } = await trackOrders(candidates, 'en');
  let credited = 0;
  for (const o of candidates) {
    const delivered = byName.get(o.name)?.step === 3;
    if (!delivered || o.outstanding > 0) continue;
    const points = pointsEarned(o.subtotal);
    try {
      // Tag first: a crash between the two steps then misses a credit (fixable
      // by hand) rather than paying it twice.
      await addTags(o.id, [CREDITED_TAG, `loyalty-points:${points}`]);
      if (points > 0) await creditLoyaltyPoints(o.customerId, points);
      credited += 1;
    } catch (err) {
      console.error(`[oka][loyalty] could not credit ${o.name}:`, err.message ?? err);
    }
  }
  return { credited };
}
