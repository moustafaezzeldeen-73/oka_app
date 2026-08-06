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

function authHeaders() {
  const key = process.env.BOSTA_API_KEY;
  if (!key) throw new Error('Missing required environment variable: BOSTA_API_KEY');
  return { Authorization: key, 'Content-Type': 'application/json' };
}

const sameRef = (a, b) =>
  String(a ?? '').replace(/^#/, '') === String(b ?? '').replace(/^#/, '');

/** Finds the delivery created for a given Shopify order name. */
export async function findDeliveryByOrderName(orderName) {
  const res = await fetch(`${BASE}/deliveries/search`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ search: String(orderName).replace(/^#/, ''), limit: 10, page: 1 }),
  });
  if (!res.ok) throw new Error(`Bosta search returned ${res.status}`);
  const json = await res.json();
  const list = json?.data?.deliveries ?? [];
  return list.find((d) => sameRef(d.businessReference, orderName)) ?? list[0] ?? null;
}

/** Looks a delivery up directly by its AWB. */
export async function findDeliveryByTracking(trackingNumber) {
  const res = await fetch(`${BASE}/deliveries/search`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ search: trackingNumber, limit: 5, page: 1 }),
  });
  if (!res.ok) throw new Error(`Bosta search returned ${res.status}`);
  const json = await res.json();
  const list = json?.data?.deliveries ?? [];
  return list.find((d) => d.trackingNumber === trackingNumber) ?? list[0] ?? null;
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
