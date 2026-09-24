/**
 * Time helpers shared by the courier clients and the order routes.
 *
 * Every timestamp the app shows is Cairo wall-clock time, whichever courier or
 * system it came from — Shopify and Bosta send UTC instants, J&T sends Cairo
 * local time with no zone at all.
 */

const CAIRO = 'Africa/Cairo';

/** "3 May, 14:05" / "٣ مايو، ٢:٠٥ م" — the one format every update row uses. */
export function fmtCairo(t, ar) {
  if (!t) return '';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(ar ? 'ar-EG' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: CAIRO,
  });
}

const cairoParts = new Intl.DateTimeFormat('en-US', {
  timeZone: CAIRO,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** How far Cairo is ahead of UTC at instant `ts`, in ms (DST-aware). */
function cairoOffsetMs(ts) {
  const p = Object.fromEntries(
    cairoParts.formatToParts(new Date(ts)).map(({ type, value }) => [type, value]),
  );
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wall - Math.floor(ts / 1000) * 1000;
}

/**
 * "2026-09-21 14:05:33" in Cairo local time → an ISO UTC instant.
 *
 * Sorting J&T scans against Shopify's own events needs both on the same
 * clock; treating J&T's string as UTC would put every scan two or three hours
 * in the future.
 */
export function cairoLocalToIso(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(local ?? ''));
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  let ts = wall - cairoOffsetMs(wall);
  // Near a DST switch the first guess can land on the other side of it.
  const again = wall - cairoOffsetMs(ts);
  if (again !== ts) ts = again;
  return new Date(ts).toISOString();
}
