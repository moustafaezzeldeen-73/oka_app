import { POLICY, isPrepaid, paymentMethods, shippingFor } from './policy.js';
import { createOrder, evaluateDiscount, fetchVariants, retireVoucher } from './shopify.js';
import { etaFor } from './zones.js';

/**
 * Checkout, priced entirely on the server.
 *
 * The app sends only what the shopper chose — variant ids, quantities, a
 * discount code, a saved address and a payment method. Prices come from the
 * live variants, the discount from Shopify's own rules, and shipping from
 * policy.js. The quote the shopper agrees to and the order that is created
 * are computed by the same function, so they cannot drift apart.
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
  const discount = discountCode
    ? await evaluateDiscount({ lines, discountCode, customerId })
    : { code: null, amount: 0, applied: false, message: null };
  const merchandise = Math.max(0, subtotal - discount.amount);
  const shipping = shippingFor(merchandise, paymentMethod);

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
    freeShippingMin: POLICY.freeShippingMin,
    remainingForFreeShipping: Math.max(0, POLICY.freeShippingMin - merchandise),
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
