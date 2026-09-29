import { calculateTotals, createOrder } from './shopify.js';
import { dueSubscriptions, markCycleResult } from './subscriptions.js';

/**
 * Turns due subscriptions into real Shopify orders.
 *
 * Runs on a plain hourly interval rather than a cron expression: nothing here
 * is time-sensitive to the minute, and hourly is coarse enough that a bare
 * `setInterval` covers it without adding a cron dependency for one job.
 * `start()` also runs one pass immediately, so a subscription that came due
 * while the server was down or restarting doesn't sit waiting for up to an
 * hour before the app notices.
 *
 * This is an in-process scheduler: it only runs while this server process is
 * running. That is fine for a real, always-on host; a dev server in a
 * Codespace that sleeps or restarts will miss cycles while it's down, same as
 * everything else in server/ that depends on the process staying up.
 */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** The discounted price a subscription line should bill at this cycle. */
function discountedPrice(item, discountPct) {
  return Math.round(Number(item.price) * (1 - discountPct / 100));
}

async function runDueSubscriptions() {
  const due = await dueSubscriptions();
  if (!due.length) return;

  for (const sub of due) {
    try {
      const items = sub.items.map((it) => ({
        ...it,
        priceOverride: discountedPrice(it, sub.discountPct),
      }));
      const customer = {
        name: sub.customerName,
        email: sub.email,
        phone: sub.address?.phone,
        street: [sub.address?.address1, sub.address?.address2].filter(Boolean).join(', '),
        city: sub.address?.city,
        province: sub.address?.province,
      };

      // Shipping is re-read from Shopify every cycle, so a rate changed in
      // Shopify reaches standing subscriptions too. The quote is priced on
      // the discounted lines (title + price, no variant) because that is the
      // order value Shopify's rate tiers are meant to see.
      const quote = await calculateTotals({
        items: items.map((it) => ({
          title: it.title || it.id,
          quantity: it.quantity,
          price: it.priceOverride,
        })),
        customer,
      }).catch(() => null);

      const order = await createOrder({
        items,
        customer,
        customerId: sub.customerId,
        shipping: quote?.shipping ?? sub.shippingFee,
        shippingTitle: quote?.shippingTitle ?? undefined,
        paymentMethod: 'cod',
        lang: 'ar',
        extraTags: ['oka-subscription', `sub-frequency:${sub.frequencyId}`],
        noteExtra: `Subscription ${sub.id} — cycle #${sub.ordersCreated + 1}, ${sub.discountPct}% off`,
      });
      await markCycleResult(sub.id, { ok: true, orderName: order.name });
      console.log(`[subscriptions] created ${order.name} for ${sub.id}`);
    } catch (err) {
      await markCycleResult(sub.id, { ok: false, error: err.message ?? String(err) });
      console.error(`[subscriptions] cycle failed for ${sub.id}:`, err.message ?? err);
    }
  }
}

export function startSubscriptionScheduler() {
  runDueSubscriptions();
  setInterval(runDueSubscriptions, CHECK_INTERVAL_MS);
}
