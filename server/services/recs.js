import { adminGraphql } from '../integrations/shopify.js';

/**
 * Cross-sell / upsell model, rebuilt nightly from the store's own orders and
 * published as the shop metafield `oka.recs` (JSON). The theme reads it with
 * the catalogue and ranks suggestions in the browser (see O.recommend in
 * theme/assets/oka.js), so nothing here runs per page view.
 *
 *   pop    product -> recency-weighted share of baskets (half-life 30 days)
 *   pairs  product -> [[other, confidence, lift], …]  "bought with" ranked
 *   rebuy  product -> median days between two orders of it by one customer
 *
 * Confidence is smoothed towards the item's base rate so a pair seen once in
 * two baskets does not outrank one seen 200 times in 900:
 *   conf(a→b) = (co(a,b) + K·P(b)) / (n(a) + K)
 */
const K = 5;
const HALF_LIFE_DAYS = 30;
const TOP_PAIRS = 12;
const MIN_CO = 2;
const DAY = 86400000;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

/** orders: [{ createdAt, cancelled, customer, handles: [handle…] }] */
export function buildRecs(orders, now = Date.now()) {
  const baskets = orders
    .filter((o) => !o.cancelled)
    .map((o) => ({ ...o, t: Date.parse(o.createdAt), items: [...new Set(o.handles.filter(Boolean))] }))
    .filter((o) => o.items.length);

  const n = new Map();
  const co = new Map();
  const popW = new Map();
  let wTotal = 0;
  for (const b of baskets) {
    const w = 0.5 ** ((now - b.t) / DAY / HALF_LIFE_DAYS);
    wTotal += w;
    for (const a of b.items) {
      n.set(a, (n.get(a) ?? 0) + 1);
      popW.set(a, (popW.get(a) ?? 0) + w);
      for (const c of b.items) {
        if (c === a) continue;
        const key = `${a}\u0000${c}`;
        co.set(key, (co.get(key) ?? 0) + 1);
      }
    }
  }
  const N = baskets.length;

  const pop = {};
  for (const [h, w] of popW) pop[h] = round(w / (wTotal || 1), 4);

  const byA = new Map();
  for (const [key, c] of co) {
    if (c < MIN_CO) continue;
    const [a, b] = key.split('\u0000');
    const pb = n.get(b) / N;
    const conf = (c + K * pb) / (n.get(a) + K);
    const lift = conf / pb;
    if (lift <= 1) continue;
    if (!byA.has(a)) byA.set(a, []);
    byA.get(a).push([b, round(conf), round(lift, 2)]);
  }
  const pairs = {};
  for (const [a, list] of byA) {
    pairs[a] = list.sort((x, y) => y[1] * Math.log1p(y[2]) - x[1] * Math.log1p(x[2])).slice(0, TOP_PAIRS);
  }

  // Days between consecutive orders of the same product by the same customer.
  const seen = new Map();
  const gaps = new Map();
  for (const b of [...baskets].sort((x, y) => x.t - y.t)) {
    if (!b.customer) continue;
    for (const h of b.items) {
      const key = `${b.customer}\u0000${h}`;
      const prev = seen.get(key);
      if (prev != null) {
        const d = (b.t - prev) / DAY;
        if (d >= 3) {
          if (!gaps.has(h)) gaps.set(h, []);
          gaps.get(h).push(d);
        }
      }
      seen.set(key, b.t);
    }
  }
  const rebuy = {};
  for (const [h, ds] of gaps) if (ds.length >= 3) rebuy[h] = Math.round(median(ds));

  return { v: 1, built: new Date(now).toISOString(), orders: N, pop, pairs, rebuy };
}

/** Parses a bulk-operation JSONL of orders → line items into buildRecs input. */
export function ordersFromJsonl(text) {
  const orders = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row.__parentId) {
      const o = orders.get(row.__parentId);
      if (o && row.product?.handle) o.handles.push(row.product.handle);
    } else {
      orders.set(row.id, {
        createdAt: row.createdAt,
        cancelled: Boolean(row.cancelledAt),
        customer: row.customer?.id ?? null,
        handles: [],
      });
    }
  }
  return [...orders.values()];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Exports the last year of orders with a bulk operation and returns the JSONL. */
async function exportOrders(days = 365) {
  const since = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
  const inner = `{ orders(query: "created_at:>=${since}") { edges { node { id createdAt cancelledAt customer { id } lineItems { edges { node { product { handle } } } } } } } }`;
  const start = await adminGraphql(
    `mutation($q: String!) { bulkOperationRunQuery(query: $q) { bulkOperation { id } userErrors { message } } }`,
    { q: inner },
  );
  const errs = start.bulkOperationRunQuery.userErrors;
  if (errs?.length) throw new Error(errs.map((e) => e.message).join('; '));
  const id = start.bulkOperationRunQuery.bulkOperation.id;
  for (let i = 0; i < 180; i++) {
    await sleep(10000);
    const { node } = await adminGraphql(
      `query($id: ID!) { node(id: $id) { ... on BulkOperation { status url errorCode } } }`,
      { id },
    );
    if (node.status === 'COMPLETED') {
      if (!node.url) return '';
      const res = await fetch(node.url);
      if (!res.ok) throw new Error(`bulk download ${res.status}`);
      return res.text();
    }
    if (['FAILED', 'CANCELED', 'EXPIRED'].includes(node.status)) {
      throw new Error(`bulk export ${node.status} ${node.errorCode ?? ''}`);
    }
  }
  throw new Error('bulk export timed out');
}

/** Rebuilds the model and writes it to the shop metafield oka.recs. */
export async function refreshRecs() {
  const recs = buildRecs(ordersFromJsonl(await exportOrders()));
  const { shop } = await adminGraphql('{ shop { id } }');
  const out = await adminGraphql(
    `mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { message } } }`,
    { m: [{ ownerId: shop.id, namespace: 'oka', key: 'recs', type: 'json', value: JSON.stringify(recs) }] },
  );
  const errs = out.metafieldsSet.userErrors;
  if (errs?.length) throw new Error(errs.map((e) => e.message).join('; '));
  return { orders: recs.orders, products: Object.keys(recs.pairs).length };
}
