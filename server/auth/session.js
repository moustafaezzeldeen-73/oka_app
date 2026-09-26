import crypto from 'node:crypto';

/**
 * Sessions.
 *
 * A session is a signed, self-contained token: { identifier, customerId, via,
 * exp }. The customer id is resolved once at sign-in and travels in the token,
 * so every route can check that an order, address or subscription belongs to
 * the person asking, without trusting anything the app sends.
 *
 * Customers sign in with a one-time code sent to their phone (otp.js). The
 * testing-only "sign in as any customer" route lives in testLogin.js, on its
 * own, so it can be deleted before launch.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = Number(process.env.SESSION_TTL_DAYS ?? 30) * DAY_MS;

const isProduction = () => process.env.NODE_ENV === 'production';

let devSecretWarned = false;

/**
 * The signing secret. Required in production; in development a random one is
 * generated per process (sessions then end when the server restarts), which
 * beats a hard-coded default that anyone reading the repo could sign with.
 */
const DEV_SECRET = crypto.randomBytes(32).toString('hex');
function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (isProduction()) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters in production');
  }
  if (!devSecretWarned) {
    devSecretWarned = true;
    console.warn('[oka][auth] SESSION_SECRET is unset or short — using a random per-process secret');
  }
  return DEV_SECRET;
}

/** Fails fast at startup instead of on the first sign-in. */
export function assertAuthConfig() {
  secret();
}

const sign = (body) => crypto.createHmac('sha256', secret()).update(body).digest('base64url');

export function issueToken({ identifier, customerId, via, test = false }) {
  const payload = {
    identifier,
    customerId: customerId ?? null,
    via,
    ...(test ? { test: true } : {}),
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifyToken(token) {
  const [body, sig] = String(token ?? '').split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** The session a request is acting under, or null. */
export function sessionOf(req) {
  const header = req.headers.authorization ?? '';
  return verifyToken(header.replace(/^Bearer /, ''));
}

/**
 * Route guard: a valid session that resolved to a Shopify customer. Anything
 * that reads or changes a customer's data sits behind this.
 */
export function requireSession(req, res, next) {
  const s = sessionOf(req);
  if (!s?.identifier) return res.status(401).json({ error: 'not signed in' });
  if (!s.customerId) return res.status(401).json({ error: 'no customer account for this session' });
  req.session = s;
  return next();
}
