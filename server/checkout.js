import { POLICY, applyPaymentPerk, isPrepaid, paymentMethods } from './policy.js';
import { calculateWithShopify, createOrder, fetchVariants, retireVoucher } from './shopify.js';
import { FEE_TIER_THRESHOLD, etaFor, tableFee } from './zones.js';

/**
 * Checkout, priced entirely on the server.
 *
 * The app sends only what the shopper chose — variant ids, quantities, a
 * discount code, a saved address and a payment method. Prices come from the
 * live variants, and the discount and shipping from Shopify itself — the
 * same rules and rates the website's checkout uses. The quote the shopper
 * agrees to and the order that is created are computed by the same
 * function, so they cannot drift apart.
 */

export class CheckoutError extends Error {
  constructor(message, { status = 400, code } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const MAX_QTY = 50;

/** [{ variantId, quantity }] → merged, validated lines. */
function cleanLines(raw) {
  if (!Array.isArray(raw) || !raw.length) throw new CheckoutError('your basket is empty', { code: 'empty' });
  const merged = new Map();
  for (const l of raw) {
    const q = Math.floor(Number(l?.quantity));
    if (!l?.variantId || !Number.isFinite(q) || q <= 0) continue;
    merged.set(l.variantId, Math.min(MAX_QTY, (merged.get(l.variantId) ?? 0) + q));
  }
  if (!merged.size) throw new CheckoutError('your basket is empty', { code: 'empty' });
  return [...merged].map(([variantId, quantity]) => ({ variantId, quantity }));
}

/**
 * The store's shipping for this basket. With an address it is the cheapest
 * rate Shopify offers for it (what the website would charge); without one,
 * an estimate from the store's fee table.
 */
export function pickShipping({ shippingRates, merchandise, address }) {
  if (address && shippingRates.length) {
    const best = shippingRates.reduce((a, r) => (r.price < a.price ? r : a));
    return { fee: best.price, title: best.title, source: 'shopify' };
  }
  if (address) {
    console.warn('[oka][checkout] Shopify offered no shipping rate for this address; using the fee table');
  }
  return { fee: tableFee(merchandise, address), title: 'Delivery', source: address ? 'table' : 'estimate' };
}

/**
 * The full quote. `address` (a saved-address `raw` record) is optional so the
 * cart can show totals before an address is chosen; the delivery estimate
 * then covers the widest zone.
 */
export async function quote({ lines: rawLines, discountCode, customerId, address, paymentMethod = 'cod' }) {
  if (!paymentMethods().includes(paymentMethod)) {
    throw new CheckoutError('this payment method is not available yet', { code: 'payment' });
  }
  const lines = cleanLines(rawLines);
  const variants = await fetchVariants(lines.map((l) => l.variantId));

  const problems = [];
  const priced = lines.map((l) => {
    const v = variants.get(l.variantId);
    if (!v || !v.active) {
      problems.push({ variantId: l.variantId, reason: 'unavailable' });
      return null;
    }
    if (!v.available || (v.stock != null && v.stock < l.quantity)) {
      problems.push({ variantId: l.variantId, reason: 'stock', available: v.available ? v.stock ?? 0 : 0 });
    }
    return { ...l, title: v.title, unitPrice: v.price, lineTotal: v.price * l.quantity };
  });
  if (problems.length) {
    throw Object.assign(
      new CheckoutError('some items are no longer available in that quantity', { status: 409, code: 'stock' }),
      { problems },
    );
  }

  const subtotal = priced.reduce((a, l) => a + l.lineTotal, 0);
  const { discount, shippingRates } = await calculateWithShopify({ lines, discountCode, customerId, address });
  const merchandise = Math.max(0, subtotal - discount.amount);
  const ship = pickShipping({ shippingRates, merchandise, address });
  const shipping = applyPaymentPerk(ship.fee, paymentMethod);

  return {
    lines: priced,
    subtotal,
    discount,
    shipping,
    total: merchandise + shipping,
    currency: POLICY.currency,
    paymentMethod,
    prepaid: isPrepaid(paymentMethod),
    minOrder: POLICY.minOrder,
    belowMinimum: merchandise < POLICY.minOrder,
    shippingTitle: ship.title,
    // 'shopify' = the store's own rate for this address; otherwise an estimate.
    shippingSource: ship.source,
    feeTierThreshold: FEE_TIER_THRESHOLD,
    remainingForLowerFee: Math.max(0, FEE_TIER_THRESHOLD - merchandise),
    eta: etaFor(address ?? {}),
  };
}

/**
 * Orders placed recently, by idempotency key, so a double tap or a retry after
 * a dropped connection returns the first order instead of creating a second.
 */
const placed = new Map(); // key → { at, promise }
const IDEMPOTENCY_MS = 24 * 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of placed) if (now - v.at > IDEMPOTENCY_MS) placed.delete(k);
}, 60 * 60 * 1000).unref();

/**
 * Places an order for a signed-in customer. `address` must already be
 * resolved from the customer's own saved addresses by the caller.
 */
export function placeOrder({ idempotencyKey, customer, address, lang, ...input }) {
  const key = idempotencyKey ? `${customer.id}:${idempotencyKey}` : null;
  if (key && placed.has(key)) return placed.get(key).promise;

  const promise = (async () => {
    const q = await quote({ ...input, customerId: customer.id, address });
    if (input.discountCode && !q.discount.applied) {
      throw new CheckoutError(q.discount.message ?? 'this discount code does not apply', { code: 'discount' });
    }
    if (q.belowMinimum) {
      throw new CheckoutError(`the minimum order is ${POLICY.minOrder} EGP`, { code: 'minimum' });
    }

    const order = await createOrder({
      lines: q.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      address,
      customer,
      customerId: customer.id,
      shipping: q.shipping,
      shippingTitle: q.shippingTitle,
      discount: q.discount.applied ? { code: q.discount.code, amount: q.discount.amount } : null,
      paymentMethod: q.paymentMethod,
      lang,
    });

    // A loyalty voucher is single-use; retire it now that an order carries it.
    if (q.discount.applied) {
      retireVoucher(q.discount.code).catch((err) =>
        console.error(`[oka][checkout] could not retire voucher ${q.discount.code}:`, err.message ?? err),
      );
    }

    return {
      orderNumber: order.name,
      shopifyOrderId: order.id,
      total: Number(order.totalPriceSet?.shopMoney?.amount ?? q.total),
      quote: q,
    };
  })();

  if (key) {
    placed.set(key, { at: Date.now(), promise });
    // Only a success is remembered; a failure can be retried with the same key.
    promise.catch(() => placed.delete(key));
  }
  return promise;
}
