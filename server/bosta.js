/**
 * Bosta client — detailed shipment status.
 *
 * Bosta deliveries carry the Shopify order name in `businessReference`
 * (e.g. "#2599321"), which is the join key between the two systems.
 *
 * The delivery record returned by the search endpoint already contains every
 * timestamp the app's timeline needs (`state.receivedAtWarehouse.time`,
 * `state.pickedUpTime`, `state.delivering.time`, `state.deliveryTime`), so the
 * timeline is derived from it. There is no separate public tracking endpoint on
 * this API version — `/deliveries/track/{tn}` returns 404.
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

/**
 * Bosta's search endpoint has moved between API versions, and a wrong base URL
 * fails as an unhelpful 404. Each candidate is tried in turn and the one that
 * answers is remembered, so the cost is paid once per process.
 */
const SEARCH_PATHS = ['/deliveries/search', '/deliveries/business/search'];
let workingSearchPath = null;

async function search(term) {
  const paths = workingSearchPath ? [workingSearchPath] : SEARCH_PATHS;
  let lastError = null;

  for (const path of paths) {
    try {
      const res = await fetchWithTimeout(`${BASE}${path}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ search: String(term).replace(/^#/, ''), limit: 20, page: 1 }),
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Bosta rejected the API key (${res.status}) — check BOSTA_API_KEY`);
      }
      if (!res.ok) {
        // Carry the body through: Bosta explains itself in the response, and a
        // bare status code sent us chasing the wrong endpoint once already.
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
  throw lastError ?? new Error('Bosta search failed');
}

/**
 * Finds the delivery for a Shopify order.
 *
 * Bosta's `businessReference` is set by whatever created the AWB, and on this
 * store it does not equal the Shopify order name (Bosta refs look like
 * "#2594621", Shopify order names like "#100121" — different counters
 * entirely). An exact reference match is tried first, in case some orders do
 * use it; otherwise the customer's phone is the only reliable signal, so that
 * is required. Returning "the first search hit" when neither matches used to
 * silently show one customer's shipment on another's order — no match now
 * means no match, not a guess.
 */
export async function findDeliveryByOrderName(orderName, { phone } = {}) {
  const list = await search(orderName);
  const exact = list.find((d) => sameRef(d.businessReference, orderName));
  if (exact) return exact;

  if (phone) {
    const digits = String(phone).replace(/\D/g, '').slice(-10);
    if (digits) {
      const byPhone = list.find((d) =>
        String(d.receiver?.phone ?? '').replace(/\D/g, '').endsWith(digits),
      );
      if (byPhone) return byPhone;
    }
  }
  return null;
}

/** Looks a delivery up directly by its AWB — the one case a bare id is safe. */
export async function findDeliveryByTracking(trackingNumber) {
  const list = await search(trackingNumber);
  return list.find((d) => d.trackingNumber === trackingNumber) ?? null;
}

/** Surfaces the real reason a Bosta call failed, for the /health check. */
export async function pingBosta() {
  try {
    const list = await search('1');
    return { ok: true, path: workingSearchPath, sample: list.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Bosta state codes collapsed onto the four steps the app's order screen
 * renders. Kept in sync with `stepFromBostaState` in the app.
 *
 *   10 Created · 20+ received/in transit · 41 out for delivery · 45 delivered
 */
export function stepFromState(code) {
  if (code == null) return 0;
  if (code >= 45) return 3; // Delivered and terminal states
  if (code >= 20) return 2; // Picked up, in transit, out for delivery
  if (code > 10) return 1; // Awaiting pickup
  return 0; // Created
}

const LABELS = {
  created: ['Order created', 'تم إنشاء الطلب'],
  pickup: ['Collected from OKA', 'تم استلام الشحنة من أوكا'],
  warehouse: ['Arrived at {hub}', 'وصلت إلى {hub}'],
  outForDelivery: ['Out for delivery', 'الطلب خارج للتوصيل'],
  delivered: ['Delivered', 'تم التسليم'],
};

const pick = (key, ar, vars = {}) => {
  let s = LABELS[key][ar ? 1 : 0];
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
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

/** Bosta's own free-text reason, prefixed so it reads as an event, not a label. */
const exceptionText = (ex, ar) => {
  const label = ar ? 'مشكلة في التوصيل' : 'Delivery issue';
  return ex?.reason ? `${label}: ${ex.reason}` : label;
};

/**
 * Builds the update rows the app displays from a delivery record.
 *
 * Only what has actually happened is listed — the current state and everything
 * before it, oldest first. Listing future steps as "Pending" padded the
 * timeline with events that had not occurred and made a Created shipment look
 * like it was already moving.
 *
 * Every milestone Bosta logs is included, not just the five headline ones —
 * `state.exception[]` is Bosta's full log of failed attempts, address issues,
 * reschedules and the like, and used to be dropped entirely except for a single
 * synthetic "attempt" row.
 */
export function toUpdates(delivery, lang = 'ar') {
  if (!delivery) return [];
  const ar = lang === 'ar';
  const st = delivery.state ?? {};
  const hub = st.receivedAtWarehouse?.warehouse?.name ?? (ar ? 'المخزن' : 'the hub');

  const rows = [
    { key: 'created', at: delivery.createdAt },
    { key: 'pickup', at: delivery.collectedFromBusiness ?? st.pickedUpTime },
    { key: 'warehouse', at: st.receivedAtWarehouse?.time, vars: { hub } },
    { key: 'outForDelivery', at: st.delivering?.time },
    { key: 'delivered', at: st.deliveryTime },
    ...(st.exception ?? []).map((ex) => ({
      key: 'exception',
      at: ex.time,
      text: exceptionText(ex, ar),
    })),
  ];

  return rows
    .filter((r) => Boolean(r.at))
    .sort((a, b) => new Date(a.at) - new Date(b.at))
    .map((r) => ({
      text: r.text ?? pick(r.key, ar, r.vars),
      time: fmt(r.at, ar),
      done: true,
      // Kept so callers merging this with another system's timeline (Shopify's
      // own milestones) can re-sort the combined list; the client itself only
      // reads text/time/done.
      at: r.at,
    }));
}

/**
 * Whether this order needs the customer (or staff) to do something before it
 * can move again — Bosta's own `waitingForBusinessAction` flag, with the most
 * recent exception's reason attached so the app can say what, not just that.
 */
export function actionNeeded(delivery, lang = 'ar') {
  if (!delivery?.state?.waitingForBusinessAction) return null;
  const ar = lang === 'ar';
  const exceptions = delivery.state.exception ?? [];
  const latest = exceptions[exceptions.length - 1];
  if (latest?.reason) {
    return ar ? `الطلب محتاج تدخلك: ${latest.reason}` : `This order needs your attention: ${latest.reason}`;
  }
  return ar ? 'الطلب محتاج تدخلك — راجع حالة الشحنة.' : 'This order needs your attention — check the shipment.';
}
