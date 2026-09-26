/**
 * OKA's commercial policy, in one place.
 *
 * Every figure the app shows a shopper — shipping fee, free-shipping line,
 * minimum order, loyalty rates, subscription discount — is decided here and
 * served to the app from GET /storefront-config, so the app and the orders it
 * creates can never disagree. Each value can be overridden from the
 * environment without a code change.
 *
 * Shipping fees are NOT decided here. The app charges exactly what the
 * website does: for every quote and order with an address, the fee is the
 * store's own Shopify shipping rate (checkout.js). zones.js holds a snapshot
 * of those rates for estimates before an address is known.
 *
 * The other defaults come from the store's economics (10% margin on product,
 * about 15% of COD orders failing, and a courier cost of about 80 EGP per
 * attempt that the customer's fee doesn't fully cover):
 *
 * Minimum order. A COD order earns 10% of the basket on the 85% that are
 * delivered and loses the attempt on the 15% that aren't:
 * 0.85 × 0.10 × B − 0.15 × 80 ≥ 0 → B ≥ 141. Rounded to 150. The website has
 * no minimum; set MIN_ORDER_EGP=0 to match it.
 *
 * Prepaid perk. A prepaid order removes the failed-attempt risk, worth about
 * 0.15 × 80 = 12 EGP, but a card gateway costs roughly 2.75% + 3 EGP. That
 * leaves room for a small fixed perk: 10 EGP off shipping, only once a
 * gateway is connected.
 *
 * Loyalty. 10 points = 1 EGP, and customers earn 1 point per EGP of delivered
 * product — 10% back, as the store chose. Points are credited only after
 * delivery, so refused parcels earn nothing, and are spent as single-use
 * vouchers that each need a minimum basket.
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
  minOrder: num('MIN_ORDER_EGP', 150),
  prepaidShippingDiscount: num('PREPAID_SHIPPING_DISCOUNT_EGP', 10),
  subscriptionDiscountPct: num('SUBSCRIPTION_DISCOUNT_PCT', 5),
  loyalty: Object.freeze({
    pointsPerEgp: 10,
    /** Points earned per EGP of delivered product (after discounts). 1 = 10% back. */
    earnPointsPerEgp: num('LOYALTY_EARN_POINTS_PER_EGP', 1),
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
 * The prepaid perk taken off a shipping fee — the only change the app makes
 * to the store's own rate, and only once a gateway is connected.
 */
export function applyPaymentPerk(fee, paymentMethod = 'cod') {
  return isPrepaid(paymentMethod) ? Math.max(0, fee - POLICY.prepaidShippingDiscount) : fee;
}

/** Points a delivered order earns, from its product total after discounts. */
export const pointsEarned = (merchandise) =>
  Math.floor(Math.max(0, merchandise) * POLICY.loyalty.earnPointsPerEgp);

/** Store credit (EGP) that a number of points is worth. */
export const pointsToEgp = (points) => points / POLICY.loyalty.pointsPerEgp;
