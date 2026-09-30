import { getShippingScheme, hasShopify } from '../integrations/shopify.js';
import { FEE_TIER_THRESHOLD, provinceFor, tableFee } from '../config/zones.js';

/**
 * Shipping estimates from the store's own Shopify zones and rates.
 *
 * A quote with an address is priced by Shopify directly (draftOrderCalculate,
 * see services/checkout.js). Everything before that — the cart with no
 * address yet, the product page, an address Shopify offers no rate for — is
 * priced here from the delivery profile itself, so a rate changed under
 * Settings → Shipping reaches those estimates too. The fee table in
 * config/zones.js is only used when the scheme can't be read at all.
 */

/** Unknown governorate: Cairo, the store's busiest (and cheapest) zone. */
const DEFAULT_PROVINCE = 'C';

const fits = (r, value) => (r.min == null || value >= r.min) && (r.max == null || value <= r.max);

/**
 * What the scheme charges to ship an order worth `value` to `code`, and the
 * next cheaper tier if spending more would unlock one:
 * { price, title, zone, next: { price, at, remaining } | null } or null.
 */
export function rateFor(scheme, code, value) {
  if (!scheme?.zones?.length) return null;
  const zone = scheme.zones.find((z) => z.provinces.includes(code ?? DEFAULT_PROVINCE));
  if (!zone?.rates?.length) return null;

  const current = zone.rates.filter((r) => fits(r, value)).sort((a, b) => a.price - b.price)[0];
  if (!current) return null;

  // The cheapest rate that starts above today's order value, if it would
  // actually save the shopper something.
  const next =
    zone.rates
      .filter((r) => r.min != null && r.min > value && r.price < current.price)
      .sort((a, b) => a.min - b.min)[0] ?? null;

  return {
    price: current.price,
    title: current.title,
    zone: zone.name,
    next: next ? { price: next.price, at: next.min, remaining: Math.ceil(next.min - value) } : null,
  };
}

/** The scheme, or null when Shopify isn't configured or can't be reached. */
export async function schemeOrNull() {
  if (!hasShopify()) return null;
  try {
    return await getShippingScheme();
  } catch (err) {
    console.warn('[oka][shipping] scheme unavailable, using the fee table:', err.message ?? err);
    return null;
  }
}

/**
 * The estimate for `merchandise` going to `address` (optional):
 * { fee, title, remainingForLowerFee, source: 'scheme' | 'table' }.
 */
export function estimate(scheme, merchandise, address) {
  const code = address ? provinceFor(address)?.code ?? null : null;
  const rate = rateFor(scheme, code, merchandise);
  if (rate) {
    return {
      fee: rate.price,
      title: rate.title,
      remainingForLowerFee: rate.next?.remaining ?? 0,
      source: 'scheme',
    };
  }
  return {
    fee: tableFee(merchandise, address),
    title: 'Delivery',
    remainingForLowerFee: Math.max(0, FEE_TIER_THRESHOLD - merchandise),
    source: 'table',
  };
}
