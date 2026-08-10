/**
 * Bosta client — detailed shipment status.
 *
 * Two endpoints matter here, and the difference between them is the whole
 * reason this module was rewritten:
 *
 *   GET  /deliveries/{trackingNumber}  — one delivery, in full, including
 *        Bosta's own `timeline[]`: the canonical list of milestones with
 *        `value`, `code`, `date`, `done` and a human `desc`. This is the
 *        source of truth for the app's update rows.
 *
 *   POST /deliveries/search            — a page of the business's deliveries.
 *        Its `search` term is IGNORED by the API: passing a tracking number
 *        returns the most recent deliveries, not the matching one (the
 *        response even reports `count: 0` while returning rows). Every lookup
 *        built on it silently resolved to "no delivery", which is why orders
 *        showed only their Shopify events and never a courier, timeline or
 *        action-needed notice. It is now used only for what it actually is —
 *        a recent-deliveries listing — to resolve orders that have no AWB
 *        recorded on the Shopify fulfilment yet.
 */

const BASE = process.env.BOSTA_API_URL || 'https://app.bosta.co/api/v2';

/** Bosta occasionally stalls; an unbounded fetch would hang the whole route. */
const TIMEOUT_MS = Number(process.env.BOSTA_TIMEOUT_MS ?? 8000);

function fetchWithTimeout(url, init) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

function authHeaders() {
  const key = process.env.BOSTA_API_KEY;
  if (!key) throw new Error('Missing required environment variable: BOSTA_API_KEY');
  return { Authorization: key, 'Content-Type': 'application/json' };
}

const sameRef = (a, b) =>
  String(a ?? '').replace(/^#/, '') === String(b ?? '').replace(/^#/, '');

/* ── Single delivery, by tracking number ────────────────────────────────── */

/**
 * Bosta has moved this path between API versions and a wrong one fails as a
 * bare 404, so each candidate is tried once and the winner remembered.
 */
const DETAIL_PATHS = [
  (tn) => `/deliveries/${encodeURIComponent(tn)}`,
  (tn) => `/deliveries/business/${encodeURIComponent(tn)}`,
  (tn) => `/deliveries/tracking-number/${encodeURIComponent(tn)}`,
];
let workingDetailPath = null;

/**
 * The full delivery record for one AWB — the only lookup that is exact.
 *
 * Returns null when Bosta genuinely has no such delivery; throws when Bosta
 * could not be reached or rejected the key, so callers can tell "no shipment"
 * apart from "we failed to ask".
 */
export async function getDelivery(trackingNumber) {
  if (!trackingNumber) return null;
  const candidates = workingDetailPath ? [workingDetailPath] : DETAIL_PATHS;
  let lastError = null;

  for (const buildPath of candidates) {
    const path = buildPath(trackingNumber);
    try {
      const res = await fetchWithTimeout(`${BASE}${path}`, {
        method: 'GET',
        headers: authHeaders(),
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Bosta rejected the API key (${res.status}) — check BOSTA_API_KEY`);
      }
      if (res.status === 404) {
        // A 404 from a path that is otherwise correct means "no such AWB".
        // Only treat it as the definitive answer once the path is proven.
        if (workingDetailPath) return null;
        lastError = new Error(`Bosta ${path} returned 404`);
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        lastError = new Error(`Bosta ${path} returned ${res.status} ${body.slice(0, 160)}`);
        continue;
      }
      const json = await res.json();
      const delivery = json?.data ?? null;
      // A body without a tracking number isn't a delivery — most likely this
      // path answers 200 with something else entirely.
      if (!delivery?.trackingNumber) {
        lastError = new Error(`Bosta ${path} returned no delivery`);
        continue;
      }
      workingDetailPath = buildPath;
      return delivery;
    } catch (err) {
      lastError = err;
      if (String(err.message).includes('rejected the API key')) throw err;
    }
  }
  throw lastError ?? new Error(`Bosta could not fetch delivery ${trackingNumber}`);
}

/* ── Recent deliveries listing ──────────────────────────────────────────── */

const SEARCH_PATHS = ['/deliveries/search', '/deliveries/business/search'];
let workingSearchPath = null;

/**
 * One page of the business's deliveries, newest first.
 *
 * Deliberately sends no `search` term: the API ignores it, and pretending
 * otherwise is what made every lookup silently wrong.
 */
async function listPage({ page = 1, limit = 50 } = {}) {
  const paths = workingSearchPath ? [workingSearchPath] : SEARCH_PATHS;
  let lastError = null;

  for (const path of paths) {
    try {
      const res = await fetchWithTimeout(`${BASE}${path}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ limit, page }),
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Bosta rejected the API key (${res.status}) — check BOSTA_API_KEY`);
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        lastError = new Error(`Bosta ${path} returned ${res.status} ${body.slice(0, 160)}`);
        continue;
      }
      const json = await res.json();
      workingSearchPath = path;
      return json?.data?.deliveries ?? [];
    } catch (err) {
      lastError = err;
      if (String(err.message).includes('rejected the API key')) throw err;
    }
  }
  throw lastError ?? new Error('Bosta delivery listing failed');
}

/** How many pages deep to look for an order that has no AWB on Shopify yet. */
const SCAN_PAGES = Number(process.env.BOSTA_SCAN_PAGES ?? 4);
const SCAN_PAGE_SIZE = 50;

/**
 * Walks recent deliveries looking for one whose `businessReference` is this
 * Shopify order name. AWBs created from Shopify carry the order name there
 * (e.g. "#2610721"), which makes it an exact join — unlike the phone, which
 * belongs to whoever the parcel ships to and need not match the account.
 *
 * Stops at the first match, and gives up after SCAN_PAGES rather than walking
 * the business's entire history for an order Bosta has never seen.
 */
export async function findDeliveryByOrderName(orderName) {
  if (!orderName) return null;
  for (let page = 1; page <= SCAN_PAGES; page += 1) {
    const list = await listPage({ page, limit: SCAN_PAGE_SIZE });
    if (!list.length) return null;
    const hit = list.find((d) => sameRef(d.businessReference, orderName));
    // The listing is a summary; re-fetch so the caller gets the timeline too.
    if (hit) return (await getDelivery(hit.trackingNumber).catch(() => null)) ?? hit;
    if (list.length < SCAN_PAGE_SIZE) return null; // last page reached
  }
  return null;
}

/** Looks a delivery up directly by its AWB — the exact, one-request path. */
export async function findDeliveryByTracking(trackingNumber) {
  return getDelivery(trackingNumber);
}

/**
 * Resolves many Shopify order names to their deliveries in one scan.
 *
 * Looking each one up separately would re-walk the same recent pages once per
 * order; this walks them once and returns whatever it matched, stopping early
 * as soon as every name is accounted for. Values are the listing's summary
 * records — call `getDelivery` on the ones whose timeline you need.
 */
export async function findDeliveriesByOrderNames(orderNames = []) {
  const wanted = new Set(
    orderNames.filter(Boolean).map((n) => String(n).replace(/^#/, '')),
  );
  const found = new Map();
  if (!wanted.size) return found;

  for (let page = 1; page <= SCAN_PAGES && wanted.size; page += 1) {
    const list = await listPage({ page, limit: SCAN_PAGE_SIZE });
    if (!list.length) break;
    for (const d of list) {
      const ref = String(d.businessReference ?? '').replace(/^#/, '');
      if (ref && wanted.has(ref)) {
        found.set(ref, d);
        wanted.delete(ref);
      }
    }
    if (list.length < SCAN_PAGE_SIZE) break; // last page reached
  }
  return found;
}

/** Surfaces the real reason a Bosta call failed, for the /health check. */
export async function pingBosta() {
  try {
    const list = await listPage({ page: 1, limit: 1 });
    return { ok: true, path: workingSearchPath, sample: list.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* ── Timeline ───────────────────────────────────────────────────────────── */

/**
 * Bosta state codes collapsed onto the four steps the app's order screen
 * renders. Kept in sync with `stepFromBostaState` in the app.
 *
 *   10 created · 21/24/30 in transit · 41 out for delivery · 45 delivered
 */
export function stepFromState(code) {
  if (code == null) return 0;
  if (code >= 45) return 3; // Delivered and terminal states
  if (code >= 20) return 2; // Picked up, in transit, out for delivery
  if (code > 10) return 1; // Awaiting pickup
  return 0; // Created
}

/**
 * Bosta's timeline `value` strings, in both languages.
 *
 * Anything not listed still renders — see `humanise` — so a state Bosta adds
 * later shows up as readable text rather than vanishing from the timeline.
 */
const STATE_LABELS = {
  new: ['Order created', 'تم إنشاء الطلب'],
  pickup_requested: ['Pickup requested', 'تم طلب الاستلام'],
  picked_up: ['Collected from OKA', 'تم استلام الشحنة من أوكا'],
  received_at_warehouse: ['Arrived at the hub', 'وصلت إلى المخزن'],
  in_transit: ['In transit between hubs', 'في الطريق بين الفروع'],
  out_for_delivery: ['Out for delivery', 'الطلب خارج للتوصيل'],
  waiting_for_business_action: ['Waiting for action', 'في انتظار إجراء'],
  exception: ['Delivery issue', 'مشكلة في التوصيل'],
  delivered: ['Delivered', 'تم التسليم'],
  returned_to_business: ['Returned to OKA', 'رجعت إلى أوكا'],
  canceled: ['Cancelled', 'ملغي'],
  cancelled: ['Cancelled', 'ملغي'],
  lost: ['Reported lost', 'الشحنة مفقودة'],
  damaged: ['Reported damaged', 'الشحنة تالفة'],
};

/** "waiting_for_business_action" → "Waiting for business action". */
const humanise = (value) => {
  const s = String(value ?? '').replace(/[_-]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
};

const labelFor = (value, ar) => {
  const entry = STATE_LABELS[String(value ?? '').toLowerCase()];
  return entry ? entry[ar ? 1 : 0] : humanise(value);
};

const fmt = (t, ar) => {
  if (!t) return '';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(ar ? 'ar-EG' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Cairo',
  });
};

/**
 * Builds the app's update rows from Bosta's own `timeline`.
 *
 * Only milestones Bosta marks `done` are listed: its timeline always ends
 * with an undone "delivered" placeholder, and rendering that would tell a
 * shopper their parcel had arrived when it hasn't.
 *
 * `desc` carries the detail that makes a row worth reading — "1/3 attempts",
 * or the exception's own reason — so it becomes a second line rather than
 * being dropped. It comes back in English whatever the app's language, since
 * Bosta doesn't localise it; it is appended rather than translated, which is
 * honest about its origin and never invents a meaning for a code.
 *
 * Falls back to reconstructing from scattered `state.*` timestamps for
 * records that carry no timeline (the listing endpoint returns summaries).
 */
export function toUpdates(delivery, lang = 'ar') {
  if (!delivery) return [];
  const ar = lang === 'ar';

  const timeline = Array.isArray(delivery.timeline) ? delivery.timeline : null;
  if (timeline?.length) {
    return timeline
      .filter((t) => t.done && t.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((t) => ({
        text: [labelFor(t.value, ar), t.desc].filter(Boolean).join('\n'),
        time: fmt(t.date, ar),
        done: true,
        at: t.date,
      }));
  }

  return legacyUpdates(delivery, ar);
}

/**
 * The pre-timeline reconstruction, kept for delivery summaries.
 *
 * `state.exception[]` is folded in so a failed attempt still appears; the
 * detail record's timeline covers this far better, so this is a floor rather
 * than the intended path.
 */
function legacyUpdates(delivery, ar) {
  const st = delivery.state ?? {};
  const rows = [
    { value: 'new', at: delivery.createdAt },
    { value: 'picked_up', at: delivery.collectedFromBusiness ?? st.pickedUpTime },
    { value: 'received_at_warehouse', at: st.receivedAtWarehouse?.time },
    { value: 'out_for_delivery', at: st.delivering?.time },
    { value: 'delivered', at: st.deliveryTime },
    ...(st.exception ?? []).map((ex) => ({
      value: 'exception',
      at: ex.time,
      desc: ex.reason,
    })),
  ];

  return rows
    .filter((r) => Boolean(r.at))
    .sort((a, b) => new Date(a.at) - new Date(b.at))
    .map((r) => ({
      text: [labelFor(r.value, ar), r.desc].filter(Boolean).join('\n'),
      time: fmt(r.at, ar),
      done: true,
      at: r.at,
    }));
}

/**
 * Whether this order is stuck pending someone's intervention.
 *
 * `waitingForBusinessAction` is Bosta's own flag for exactly that. The most
 * recent exception says why, and `scheduledAt` says when the courier will try
 * again — both worth surfacing, because "needs attention" with no reason and
 * no date is not actionable.
 */
export function actionNeeded(delivery, lang = 'ar') {
  if (!delivery?.state?.waitingForBusinessAction) return null;
  const ar = lang === 'ar';
  const exceptions = delivery.state.exception ?? [];
  const latest = exceptions[exceptions.length - 1];

  const base = latest?.reason
    ? ar
      ? `الطلب محتاج تدخلك: ${latest.reason}`
      : `This order needs your attention: ${latest.reason}`
    : ar
      ? 'الطلب محتاج تدخلك — راجع حالة الشحنة.'
      : 'This order needs your attention — check the shipment.';

  const when = fmt(latest?.scheduledAt ?? delivery.scheduledAt, ar);
  if (!when) return base;
  return `${base}\n${ar ? 'المحاولة القادمة: ' : 'Next attempt: '}${when}`;
}
