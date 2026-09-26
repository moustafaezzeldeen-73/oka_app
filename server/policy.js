/**
 * OKA's commercial policy, in one place.
 *
 * Every figure the app shows a shopper — shipping fee, free-shipping line,
 * minimum order, loyalty rates, subscription discount — is decided here and
 * served to the app from GET /storefront-config, so the app and the orders it
 * creates can never disagree. Each value can be overridden from the
 * environment without a code change.
 *
 * The defaults are derived from the store's economics:
 *
 *   margin on product            10%
 *   courier cost per attempt     80 EGP (charged whether or not it delivers)
 *   COD orders that fail         15%
 *
 * Shipping. The courier charges 80 EGP per attempt, so the fee is 80 EGP.
 * The old tiers (36–60 EGP, free above 300) lost 20–44 EGP on every order,
 * and at a 10% margin a 300 EGP basket earns only 30 EGP to absorb that.
 *
 * Free shipping. Waiving 80 EGP only pays for itself when 10% of the basket
 * covers the fee plus the share of failed attempts a delivered order has to
 * carry (15/85 × 80 ≈ 14 EGP): 0.10 × B ≥ 94 → B ≈ 940. Rounded to 1,000.
 *
 * Minimum order. A COD order earns 10% of the basket on the 85% that are
 * delivered and loses the 80 EGP attempt on the 15% that aren't:
 * 0.85 × 0.10 × B − 0.15 × 80 ≥ 0 → B ≥ 141. Rounded to 150.
 *
 * Prepaid perk. A prepaid order removes the failed-attempt risk, worth about
 * 0.15 × 80 = 12 EGP per order, but a card gateway costs roughly
 * 2.75% + 3 EGP. That leaves room for a small, fixed perk, not a percentage:
 * 10 EGP off shipping. It only applies once a gateway is connected.
 *
 * Loyalty. 10 points = 1 EGP. Customers earn 1 point per 10 EGP of delivered
 * product (1% back, a tenth of the margin), credited only after delivery so
 * refused parcels earn nothing. Points are redeemed for single-use vouchers
 * that each need a minimum basket, so a voucher never turns an order into a
 * loss.
 *
 * Subscriptions. A flat 5%. The old 15% weekly tier gave away more than the
 * whole margin on every delivery.
 */

const num = (key, fallback) => {
  const raw = process.env[key];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

export const POLICY = Object.freeze({
  currency: 'EGP',
  shippingFee: num('SHIPPING_FEE_EGP', 80),
  freeShippingMin: num('FREE_SHIPPING_MIN_EGP', 1000),
  minOrder: num('MIN_ORDER_EGP', 150),
  prepaidShippingDiscount: num('PREPAID_SHIPPING_DISCOUNT_EGP', 10),
  subscriptionDiscountPct: num('SUBSCRIPTION_DISCOUNT_PCT', 5),
  loyalty: Object.freeze({
    pointsPerEgp: 10,
    /** Points earned per EGP of delivered product (after discounts). 0.1 = 1 pt / 10 EGP. */
    earnPointsPerEgp: num('LOYALTY_EARN_POINTS_PER_EGP', 0.1),
    voucherDays: num('LOYALTY_VOUCHER_DAYS', 90),
  }),
});

/**
 * Rewards a customer can redeem points for. Each is a single-use voucher for
 * `egp` off an order of at least `minOrder` — never more than about 8–10% of
 * the basket it applies to.
 */
export const REWARDS = Object.freeze([
  { id: 'off20', points: 200, egp: 20, minOrder: 300, en: '20 EGP off orders over 300', ar: 'خصم ٢٠ ج.م على طلب فوق ٣٠٠' },
  { id: 'off50', points: 500, egp: 50, minOrder: 600, en: '50 EGP off orders over 600', ar: 'خصم ٥٠ ج.م على طلب فوق ٦٠٠' },
  { id: 'ship', points: 800, egp: 80, minOrder: 800, en: 'Free delivery (80 EGP off) over 800', ar: 'توصيل مجاني (خصم ٨٠ ج.م) فوق ٨٠٠' },
  { id: 'off150', points: 1500, egp: 150, minOrder: 1500, en: '150 EGP off orders over 1,500', ar: 'خصم ١٥٠ ج.م على طلب فوق ١٥٠٠' },
]);

export const rewardById = (id) => REWARDS.find((r) => r.id === id) ?? null;

/**
 * Payment methods the app may offer. Card and wallet stay off until a
 * gateway is connected (PAYMENT_GATEWAY names it), because offering them
 * without one creates unpaid orders the shopper thinks they have paid for.
 */
export function paymentMethods() {
  const gateway = process.env.PAYMENT_GATEWAY || null;
  return gateway ? ['cod', 'card', 'wallet'] : ['cod'];
}

export const isPrepaid = (method) => method === 'card' || method === 'wallet';

/**
 * Shipping for a basket. `merchandise` is the product total after discounts.
 */
export function shippingFor(merchandise, paymentMethod = 'cod') {
  if (merchandise >= POLICY.freeShippingMin) return 0;
  const perk = isPrepaid(paymentMethod) ? POLICY.prepaidShippingDiscount : 0;
  return Math.max(0, POLICY.shippingFee - perk);
}

/** Points a delivered order earns, from its product total after discounts. */
export const pointsEarned = (merchandise) =>
  Math.floor(Math.max(0, merchandise) * POLICY.loyalty.earnPointsPerEgp);

/** Store credit (EGP) that a number of points is worth. */
export const pointsToEgp = (points) => points / POLICY.loyalty.pointsPerEgp;
