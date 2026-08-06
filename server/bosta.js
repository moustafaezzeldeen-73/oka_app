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
 * Bosta's `businessReference` is set by whatever created the AWB. It does not
 * always equal the Shopify order name, so an exact reference match is tried
 * first, then the customer phone, then the plain search hit.
 */
export async function findDeliveryByOrderName(orderName, { phone } = {}) {
  const list = await search(orderName);
  const exact = list.find((d) => sameRef(d.businessReference, orderName));
  if (exact) return exact;

  if (phone) {
    const digits = String(phone).replace(/\D/g, '').slice(-10);
    const byPhone = list.find((d) =>
      String(d.receiver?.phone ?? '').replace(/\D/g, '').endsWith(digits),
    );
    if (byPhone) return byPhone;
  }
  return list[0] ?? null;
}

/** Looks a delivery up directly by its AWB. */
export async function findDeliveryByTracking(trackingNumber) {
  const list = await search(trackingNumber);
  return list.find((d) => d.trackingNumber === trackingNumber) ?? list[0] ?? null;
}

/** Every delivery for a customer's phone number — the staff order view. */
export async function findDeliveriesByPhone(phone) {
  if (!phone) return [];
  const digits = String(phone).replace(/\D/g, '').slice(-10);
  const list = await search(digits);
  return list.filter((d) =>
    String(d.receiver?.phone ?? '').replace(/\D/g, '').endsWith(digits),
  );
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
  attempt: ['Delivery attempted', 'تمت محاولة التوصيل'],
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

/**
 * Builds the update rows the app displays from a delivery record. Steps that
 * have not happened yet are still listed, marked `done: false`, so the shopper
 * sees the whole journey rather than only what has elapsed.
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
  ];

  const out = rows.map((r) => ({
    text: pick(r.key, ar, r.vars),
    time: r.at ? fmt(r.at, ar) : ar ? 'قيد الانتظار' : 'Pending',
    done: Boolean(r.at),
  }));

  // A failed attempt is worth surfacing — it usually means the courier could
  // not reach the customer, which is the shopper's cue to act.
  if ((delivery.numberOfAttempts ?? 0) > 0 && !st.deliveryTime) {
    out.splice(4, 0, {
      text: pick('attempt', ar),
      time: fmt(delivery.updatedAt, ar),
      done: true,
    });
  }

  return out;
}
