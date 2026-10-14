import crypto from 'node:crypto';

/**
 * Storefront tokens — how the website (theme/) proves which customer is
 * signed in, without a Shopify App Proxy.
 *
 * For a signed-in customer the theme renders, on Shopify's servers,
 *
 *   <customer id>.<unix seconds>.<hex HMAC-SHA256 of "<id>.<seconds>">
 *
 * with Liquid's hmac_sha256 filter and a secret kept in Theme settings
 * (Order service → Storefront key). Shoppers only ever see the signature,
 * never the key, and only Shopify knows who is signed in, so a valid token
 * can only come from a page Shopify rendered for that customer. It is sent as
 * `Authorization: Storefront <token>` and is good for TOKEN_TTL_S.
 *
 * Set STOREFRONT_TOKEN_SECRET here to the same value as the theme's key.
 * Unset, storefront tokens are refused.
 */
const TOKEN_TTL_S = 24 * 60 * 60;
const CLOCK_SKEW_S = 5 * 60;

const secret = () => {
  const s = process.env.STOREFRONT_TOKEN_SECRET ?? '';
  return s.length >= 32 ? s : null;
};

export function storefrontSignature(customerNumericId, issuedAt, key = secret()) {
  return crypto.createHmac('sha256', key).update(`${customerNumericId}.${issuedAt}`).digest('hex');
}

/** { ok, customerNumericId } or { ok: false, reason } for a raw token string. */
export function verifyStorefrontToken(token, now = Date.now()) {
  const key = secret();
  if (!key) return { ok: false, reason: 'storefront tokens are not configured' };
  const m = /^(\d{1,20})\.(\d{9,11})\.([0-9a-f]{64})$/.exec(String(token ?? '').trim());
  if (!m) return { ok: false, reason: 'malformed token' };
  const [, id, ts, sig] = m;
  const expected = storefrontSignature(id, ts, key);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return { ok: false, reason: 'bad signature' };
  const age = now / 1000 - Number(ts);
  if (age > TOKEN_TTL_S) return { ok: false, reason: 'token expired — reload the page' };
  if (age < -CLOCK_SKEW_S) return { ok: false, reason: 'token from the future' };
  return { ok: true, customerNumericId: id };
}

/**
 * Express middleware: a request with `Authorization: Storefront <token>` that
 * verifies becomes that customer's session (`req.proxySession`, the same slot
 * the App Proxy uses, so requireSession accepts it). A bad token is refused
 * outright rather than silently treated as signed out.
 */
export function storefrontAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Storefront ')) return next();
  const verdict = verifyStorefrontToken(header.slice('Storefront '.length));
  if (!verdict.ok) return res.status(401).json({ error: `not signed in: ${verdict.reason}` });
  req.proxySession = {
    identifier: `shopify-customer:${verdict.customerNumericId}`,
    customerId: `gid://shopify/Customer/${verdict.customerNumericId}`,
    via: 'storefront',
  };
  // Rate limits per customer rather than per IP.
  Object.defineProperty(req, 'ip', { value: `storefront-customer:${verdict.customerNumericId}`, configurable: true });
  res.setHeader('Cache-Control', 'no-store');
  return next();
}
