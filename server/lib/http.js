import crypto from 'node:crypto';

/**
 * Errors carrying a `status` are the shopper's to fix and say so; anything
 * else is a dependency failing, logged in full and reported as 502.
 */
export const fail = (res, err, status = 502) => {
  const code = err?.status ?? status;
  if (code >= 500) console.error(err);
  res.status(code).json({
    error: err?.message ?? String(err),
    ...(err?.code ? { code: err.code } : {}),
    ...(err?.problems ? { problems: err.problems } : {}),
  });
};

/** Staff-only diagnostics: a STAFF_DEBUG_KEY header, or they don't exist. */
export function requireStaff(req, res, next) {
  const want = process.env.STAFF_DEBUG_KEY || '';
  const given = String(req.headers['x-staff-key'] ?? '');
  const ok =
    want.length >= 16 &&
    given.length === want.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want));
  return ok ? next() : res.status(404).json({ error: 'not found' });
}
