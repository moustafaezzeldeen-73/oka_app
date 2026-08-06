import crypto from 'node:crypto';

/**
 * Sign-in for the testing stage.
 *
 * A master password opens any customer's real orders. That is deliberately a
 * staff/testing capability, so the password lives in the server environment and
 * is never shipped in the app bundle, and every use is logged with the customer
 * it was used against.
 *
 * The Google and Apple buttons in the app are placeholders: they hand this
 * endpoint whatever identifier the tester supplies and it is accepted without
 * verification. That is fine for testing and MUST be replaced before release —
 * see `REPLACE_BEFORE_RELEASE` below.
 */

// Both paths accept unverified identities. Neither may survive to production.
export const REPLACE_BEFORE_RELEASE = ['master-password', 'social-placeholder'];

const MASTER = process.env.STAFF_MASTER_PASSWORD ?? '0000';
const SECRET = process.env.SESSION_SECRET ?? 'oka-dev-session-secret';

/** Constant-time compare, so the master password can't be probed by timing. */
function matches(given) {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(MASTER);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** A signed, self-contained session token — no session store to keep. */
export function issueToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  const [body, sig] = String(token ?? '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return null;
  }
}

/**
 * Resolves a sign-in attempt.
 *
 * `provider` is 'password' for the master-password path, or 'google'/'apple'
 * for the placeholder buttons, which are accepted as-is during testing.
 */
export function authenticate({ identifier, password, provider = 'password' }) {
  if (!identifier) return { ok: false, error: 'identifier is required' };

  if (provider === 'google' || provider === 'apple') {
    console.warn(`[oka][placeholder-auth] accepted ${provider} sign-in for ${identifier}`);
    return { ok: true, identifier, via: provider, unverified: true };
  }

  if (!matches(password)) return { ok: false, error: 'invalid password' };

  console.warn(`[oka][master-password] staff opened the account of ${identifier}`);
  return { ok: true, identifier, via: 'master-password', staff: true };
}
