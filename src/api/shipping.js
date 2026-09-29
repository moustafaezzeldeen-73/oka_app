import { SERVICE_URL, hasService, withTimeout } from './config';

/**
 * Shipping, as configured in Shopify.
 *
 * The app has no rate table of its own any more. It reads the store's zones
 * and rates from the service (GET /shipping/scheme, which reads Shopify's
 * delivery profile) and prices everything from that; checkout then asks
 * Shopify for the final figure. Changing a rate in Shopify changes the app.
 */

export async function fetchShippingScheme() {
  if (!hasService()) return null;
  const res = await withTimeout((signal) =>
    fetch(`${SERVICE_URL}/shipping/scheme`, { signal, headers: { Accept: 'application/json' } }),
  );
  if (!res.ok) throw new Error(`shipping scheme HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json.zones) && json.zones.length ? json : null;
}

/** Same folding as server/provinces.js, so both sides agree on a match. */
function fold(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .replace(/(^|\s)ال/g, '$1')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** The app's four city choices, before a real address is known. */
const CITY_BUCKETS = { cityCairo: 'C', cityGiza: 'GZ', cityAlex: 'ALX' };

/** Governorate code for the first of `texts` that names one, else null. */
export function resolveProvince(scheme, ...texts) {
  const provinces = scheme?.provinces ?? [];
  const matchers = provinces
    .flatMap((p) => [p.en, p.ar, ...(p.aliases ?? [])].map((n) => ({ key: fold(n), code: p.code })))
    .filter((m) => m.key)
    .sort((a, b) => b.key.length - a.key.length);

  for (const text of texts) {
    if (!text) continue;
    if (CITY_BUCKETS[text]) return CITY_BUCKETS[text];
    const raw = String(text).trim();
    const byCode = provinces.find((p) => p.code === raw.toUpperCase());
    if (byCode) return byCode.code;
    const f = fold(raw);
    if (!f) continue;
    const exact = matchers.find((m) => m.key === f);
    if (exact) return exact.code;
    const padded = ` ${f} `;
    const inside = matchers.find((m) => m.key.length > 2 && padded.includes(` ${m.key} `));
    if (inside) return inside.code;
  }
  return null;
}

const fits = (r, value) => (r.min == null || value >= r.min) && (r.max == null || value <= r.max);

/**
 * What Shopify would charge to ship an order worth `value` to `code`, and
 * the next cheaper tier if spending more would unlock one.
 *
 * Returns null when the scheme or the governorate is unknown — the caller
 * shows its estimate as such rather than inventing a price.
 */
export function shippingFor(scheme, code, value) {
  if (!scheme || !code) return null;
  const zone = scheme.zones.find((z) => z.provinces.includes(code));
  if (!zone || !zone.rates.length) return null;

  const current = zone.rates.filter((r) => fits(r, value)).sort((a, b) => a.price - b.price)[0];
  if (!current) return null;

  // The cheapest rate that starts above today's order value, if it would
  // actually save the shopper something.
  const next = zone.rates
    .filter((r) => r.min != null && r.min > value && r.price < current.price)
    .sort((a, b) => a.min - b.min)[0] ?? null;

  return {
    price: current.price,
    title: current.title,
    zone: zone.name,
    next: next ? { price: next.price, at: next.min, remaining: Math.ceil(next.min - value) } : null,
  };
}
