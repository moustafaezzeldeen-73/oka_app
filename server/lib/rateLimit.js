/**
 * A small fixed-window rate limiter, kept in memory.
 *
 * Enough for one server process: it stops a script from hammering sign-in,
 * one-time codes or checkout. Behind several instances, move the counters to
 * a shared store (Redis) so the limit holds across them.
 */
export function rateLimit({ windowMs, max, key = (req) => req.ip, message = 'too many requests' }) {
  const hits = new Map(); // key → { count, resetAt }

  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(k, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    return next();
  };
}
