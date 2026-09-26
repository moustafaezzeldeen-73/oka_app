import { creditDeliveredOrders } from './loyalty.js';
import { notifyShipmentUpdates } from './notify.js';
import { pickShipping } from './checkout.js';
import { POLICY } from '../config/policy.js';
import { calculateWithShopify, createOrder, fetchVariants, hasShopify } from '../integrations/shopify.js';
import { dueSubscriptions, markCycleResult } from './subscriptions.js';

/**
 * Background jobs, run in this process on plain intervals:
 *
 *   subscriptions  hourly     — turn due subscriptions into COD orders
 *   notifications  30 min     — push shipment progress to customers' phones
 *   loyalty        6 hours    — credit points for delivered orders
 *
 * Run exactly ONE server instance with JOBS_ENABLED unset (or "true"); set
 * JOBS_ENABLED=false on any others, or two schedulers would place every
 * subscription order twice.
 */
const HOUR = 60 * 60 * 1000;

/** A subscription line billed at this cycle's discounted live price. */
const discounted = (price) => Math.round(price * (1 - POLICY.subscriptionDiscountPct / 100));

async function runDueSubscriptions() {
  const due = await dueSubscriptions();
  for (const sub of due) {
    try {
      const variants = await fetchVariants(sub.items.map((it) => it.variantId));
      const lines = sub.items
        .map((it) => ({ ...it, v: variants.get(it.variantId) }))
        .filter((it) => it.v?.active && it.v.available);
      if (!lines.length) throw new Error('none of the subscribed items are available');

      const merchandise = lines.reduce((a, it) => a + discounted(it.v.price) * it.quantity, 0);
      if (merchandise < POLICY.minOrder) {
        throw new Error(`basket is below the ${POLICY.minOrder} EGP minimum`);
      }
      const skipped = sub.items.length - lines.length;

      // The store's own shipping rate for this address, as the website would
      // charge it. Shopify sees full prices here, so a basket that only drops
      // under the fee tier because of the subscription discount keeps the
      // lower fee — the difference favours the subscriber.
      const { shippingRates } = await calculateWithShopify({
        lines: lines.map((it) => ({ variantId: it.variantId, quantity: it.quantity })),
        customerId: sub.customerId,
        address: sub.address,
      });
      const ship = pickShipping({ shippingRates, merchandise, address: sub.address });

      const order = await createOrder({
        lines: lines.map((it) => ({
          variantId: it.variantId,
          quantity: it.quantity,
          unitPrice: discounted(it.v.price),
        })),
        address: sub.address,
        customer: { name: sub.customerName, email: sub.email, phone: sub.address?.phone },
        customerId: sub.customerId,
        shipping: ship.fee,
        shippingTitle: ship.title,
        paymentMethod: 'cod',
        lang: 'ar',
        extraTags: ['oka-subscription', `sub-frequency:${sub.frequencyId}`],
        noteExtra: [
          `Subscription ${sub.id} — cycle #${sub.ordersCreated + 1}, ${POLICY.subscriptionDiscountPct}% off`,
          skipped ? `${skipped} unavailable item(s) skipped` : null,
        ]
          .filter(Boolean)
          .join(' — '),
      });
      await markCycleResult(sub.id, { ok: true, orderName: order.name });
      console.log(`[subscriptions] created ${order.name} for ${sub.id}`);
    } catch (err) {
      await markCycleResult(sub.id, { ok: false, error: err.message ?? String(err) });
      console.error(`[subscriptions] cycle failed for ${sub.id}:`, err.message ?? err);
    }
  }
}

/** Runs `job` now and every `ms`, never overlapping itself. */
function every(ms, label, job) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await job();
      if (result && Object.keys(result).length) console.log(`[jobs] ${label}:`, JSON.stringify(result));
    } catch (err) {
      console.error(`[jobs] ${label} failed:`, err.message ?? err);
    } finally {
      running = false;
    }
  };
  tick();
  setInterval(tick, ms);
}

export function startJobs() {
  if (process.env.JOBS_ENABLED === 'false') {
    console.log('[jobs] disabled on this instance (JOBS_ENABLED=false)');
    return;
  }
  if (!hasShopify()) {
    console.log('[jobs] paused: Shopify credentials are not set in server/.env');
    return;
  }
  every(HOUR, 'subscriptions', runDueSubscriptions);
  every(HOUR / 2, 'notifications', notifyShipmentUpdates);
  every(6 * HOUR, 'loyalty', creditDeliveredOrders);
}
