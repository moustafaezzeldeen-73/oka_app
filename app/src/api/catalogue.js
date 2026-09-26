import { SERVICE_URL, hasService, withTimeout } from './config';

/**
 * Catalogue, served by the order service rather than fetched from Shopify
 * directly.
 *
 * The app was designed to hold a Storefront token — the one Shopify credential
 * that's actually safe to bundle in a client — but getting one requires either
 * a store-admin custom app (this store's app is a Partner app, which doesn't
 * have that screen) or minting one via the Admin API's
 * `storefrontAccessTokenCreate` mutation. Rather than block on that, the
 * server exposes the same catalogue shape over `/catalogue`, using the Admin
 * token it already holds. The Admin token itself never leaves the server.
 */
export async function fetchServerCatalogue(localIds) {
  if (!hasService()) throw new Error('service-not-configured');

  const qs = localIds?.length ? `?ids=${localIds.join(',')}` : '';
  const res = await withTimeout((signal) =>
    fetch(`${SERVICE_URL}/catalogue${qs}`, { signal, headers: { Accept: 'application/json' } }),
  );
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`service returned non-JSON (is the port public?): ${text.slice(0, 120)}`);
  }
  if (!res.ok) throw new Error(json.error ?? `service HTTP ${res.status}`);

  // Local <Image> sources want a require()'d asset or {uri}; the server sends
  // plain URL strings, so they're wrapped here, once, for every screen.
  return {
    cats: json.cats.map((c) => ({ ...c, img: c.img ? { uri: c.img } : null })),
    products: json.products.map((p) => ({ ...p, img: p.img ? { uri: p.img } : null })),
  };
}
