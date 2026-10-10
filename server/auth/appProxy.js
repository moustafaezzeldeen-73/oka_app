import crypto from 'node:crypto';

/**
 * Shopify App Proxy — how the website (theme/) reaches this service.
 *
 * Shopify forwards https://<shop>/apps/oka/<path> to <this service>/proxy/<path>
 * and signs the query string with the app's API secret. When a customer is
 * signed in on the storefront it adds `logged_in_customer_id`, which Shopify
 * itself vouches for — so a verified proxy request can act as that customer,
 * exactly as a signed app session does. Every customer route then runs
 * unchanged: requireSession() accepts either.
 *
 * Set SHOPIFY_APP_PROXY_SECRET to the app's API secret key (Partner
 * dashboard → the app → API credentials). Unset, /proxy/* answers 404.
 */

export const PROXY_PREFIX = '/proxy';
/** Parameters Shopify adds to every proxied request. */
const SHOPIFY_PARAMS = ['shop', 'logged_in_customer_id', 'path_prefix', 'timestamp', 'signature'];
/** A signature older than this is refused, so a captured URL can't be replayed for long. */
const MAX_AGE_S = 300;

const secret = () => process.env.SHOPIFY_APP_PROXY_SECRET || '';

/**
 * Shopify's algorithm: every query parameter except `signature`, as
 * `key=value` (repeated keys joined with commas), those strings sorted, joined with
 * no separator, HMAC-SHA256 with the app secret, hex.
 */
export function proxySignature(search, key) {
  const params = new URLSearchParams(search);
  const grouped = new Map();
  for (const [k, v] of params) {
    if (k === 'signature') continue;
    grouped.set(k, [...(grouped.get(k) ?? []), v]);
  }
  const message = [...grouped.keys()]
    .map((k) => `${k}=${grouped.get(k).join(',')}`)
    .sort()
    .join('');
  return crypto.createHmac('sha256', key).update(message).digest('hex');
}

export function verifyProxyRequest(search, { key = secret(), now = Date.now() } = {}) {
  if (!key) return { ok: false, reason: 'not configured' };
  const params = new URLSearchParams(search);
  const given = params.get('signature') ?? '';
  const expected = proxySignature(search, key);
  if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return { ok: false, reason: 'bad signature' };
  }
  const ts = Number(params.get('timestamp'));
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > MAX_AGE_S) return { ok: false, reason: 'stale request' };
  const shop = process.env.SHOPIFY_STORE_DOMAIN ?? process.env.SHOPIFY_SHOP_DOMAIN;
  if (shop && params.get('shop') !== shop) return { ok: false, reason: 'wrong shop' };
  const id = params.get('logged_in_customer_id') ?? '';
  return { ok: true, customerNumericId: /^\d+$/.test(id) ? id : null };
}

/**
 * Express middleware. For /proxy/* it verifies the signature, attaches the
 * storefront customer (if any) as `req.proxySession`, removes Shopify's own
 * parameters and the prefix, and hands the request on to the normal routes.
 */
export function appProxy(req, res, next) {
  if (req.path !== PROXY_PREFIX && !req.path.startsWith(`${PROXY_PREFIX}/`)) return next();
  if (!secret()) return res.status(404).json({ error: 'not found' });

  const q = req.url.indexOf('?');
  const search = q >= 0 ? req.url.slice(q + 1) : '';
  const verdict = verifyProxyRequest(search);
  if (!verdict.ok) return res.status(401).json({ error: `proxy request refused: ${verdict.reason}` });

  req.proxySession = verdict.customerNumericId
    ? {
        identifier: `shopify-customer:${verdict.customerNumericId}`,
        customerId: `gid://shopify/Customer/${verdict.customerNumericId}`,
        via: 'app-proxy',
      }
    : null;

  // Every website request arrives from Shopify's servers, so rate limits key
  // on the customer instead of an IP that all shoppers would share.
  const ipKey = verdict.customerNumericId ? `proxy-customer:${verdict.customerNumericId}` : `proxy:${req.ip}`;
  Object.defineProperty(req, 'ip', { value: ipKey, configurable: true });

  const rest = new URLSearchParams(search);
  SHOPIFY_PARAMS.forEach((k) => rest.delete(k));
  if (req.query && typeof req.query === 'object') SHOPIFY_PARAMS.forEach((k) => delete req.query[k]);
  const path = req.path.slice(PROXY_PREFIX.length) || '/';
  req.url = rest.toString() ? `${path}?${rest}` : path;

  // Customer data — never let Shopify or a browser cache it.
  res.setHeader('Cache-Control', 'no-store');
  return next();
}
