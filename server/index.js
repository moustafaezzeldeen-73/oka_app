import express from 'express';

import {
  calculateTotals,
  cancelOrder,
  createCustomerAddress,
  createOrder,
  debitLoyaltyPoints,
  editOrder,
  fetchAdminCatalogue,
  findCustomerAddresses,
  findCustomerLoyalty,
  findCustomerOrders,
  findCustomerProfile,
  findOrder,
  getWishlist,
  hasShopify,
  isShipped,
  orderIdByName,
  setDefaultAddress,
  setWishlist,
  updateOrderAddress,
} from './shopify.js';
import {
  actionNeeded,
  findDeliveryByOrderName,
  getDelivery,
  hasBosta,
  pingBosta,
  toUpdates,
} from './bosta.js';
import { findShipmentsByOrderNames, getOrders, hasJT, pingJT, toTracking, trace } from './jt.js';
import { trackOrders } from './shipping.js';
import { fmtCairo } from './timefmt.js';
import { authenticate, issueToken, verifyToken } from './auth.js';
import { startSubscriptionScheduler } from './scheduler.js';
import {
  FREQUENCIES,
  createSubscription,
  listSubscriptions,
  setStatus as setSubscriptionStatus,
  updateSubscription,
} from './subscriptions.js';

/**
 * Shopify's own milestones, merged into the courier's timeline so the order
 * screen shows one story rather than only the courier's half of it. Same
 * shape as the courier rows, and only events that have actually happened.
 */
function shopifyEvents(order, lang) {
  const ar = lang === 'ar';
  const fmt = (t) => fmtCairo(t, ar);

  const rows = [];
  if (order.createdAt) {
    rows.push({
      at: order.createdAt,
      text: ar ? 'تم استلام الطلب' : 'Order received',
      time: fmt(order.createdAt),
      done: true,
    });
  }
  if (order.fulfilledAt) {
    rows.push({
      at: order.fulfilledAt,
      text: ar ? 'تم تجهيز الطلب وشحنه' : 'Order fulfilled and handed to the courier',
      time: fmt(order.fulfilledAt),
      done: true,
    });
  }
  if (order.cancelledAt) {
    rows.push({
      at: order.cancelledAt,
      text: ar ? 'تم إلغاء الطلب' : 'Order cancelled',
      time: fmt(order.cancelledAt),
      done: true,
    });
  }
  return rows;
}

/** Shopify events and courier scans as one chronological story, oldest first. */
const mergeTimeline = (order, tracking, lang) =>
  [...shopifyEvents(order, lang), ...(tracking?.updates ?? [])]
    .filter((r) => r.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at))
    .map(({ at, ...row }) => row);

/**
 * OKA order service.
 *
 * The mobile app is a public client: anything bundled into it can be read by
 * anyone who downloads it. So the app holds no credentials at all, and
 * everything that needs real authority — the catalogue, creating orders,
 * reading a customer's history, talking to J&T and Bosta — happens here.
 *
 * Required environment (see .env.example):
 *   SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN
 *   JT_API_ACCOUNT, JT_PRIVATE_KEY, JT_CUSTOMER_CODE, JT_CUSTOMER_PASSWORD
 * Optional:
 *   BOSTA_API_KEY (history of pre-J&T orders), PORT (default 8787),
 *   SHOPIFY_API_VERSION, JT_API_BASE_URL, ALLOWED_ORIGIN
 */

const app = express();
app.use(express.json({ limit: '256kb' }));

app.use((req, res, next) => {
  const origin = process.env.ALLOWED_ORIGIN;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

const fail = (res, err, status = 502) => {
  console.error(err);
  res.status(status).json({ error: err.message ?? String(err) });
};

/**
 * Health is a diagnostic, so it must always answer — a dependency that hangs
 * is reported as a timeout rather than being allowed to hang the request.
 */
const withDeadline = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: `${label} timed out after ${ms}ms` }), ms)),
  ]);

app.get('/health', async (_req, res) => {
  const env = {
    shopify: hasShopify(),
    jt: hasJT(),
    jtCustomer: Boolean(process.env.JT_CUSTOMER_CODE && process.env.JT_CUSTOMER_PASSWORD),
    bosta: hasBosta(),
  };

  // Checked side by side — one slow dependency no longer delays the others.
  const [shopify, jt, bosta] = await Promise.all([
    withDeadline(
      findOrder('#1').then(() => ({ ok: true })).catch((e) => ({ ok: false, error: e.message })),
      16000,
      'shopify',
    ),
    withDeadline(pingJT(), 12000, 'jt'),
    hasBosta() ? withDeadline(pingBosta(), 10000, 'bosta') : { ok: false, error: 'not configured' },
  ]);

  res.json({ ok: true, env, shopify, jt, bosta });
});

/** Reads the session a request is acting under, if any. */
function session(req) {
  const header = req.headers.authorization ?? '';
  return verifyToken(header.replace(/^Bearer /, ''));
}

/**
 * Sign-in.
 *
 * TESTING ONLY — see server/auth.js. The master password opens any customer's
 * account, and the Google/Apple buttons accept whatever identifier they are
 * given without verifying it. Both must be replaced before release.
 */
app.post('/auth/login', async (req, res) => {
  const { identifier, password, provider } = req.body ?? {};
  const auth = authenticate({ identifier, password, provider });
  if (!auth.ok) return res.status(401).json({ error: auth.error });

  try {
    const customer = await findCustomerProfile(auth.identifier).catch(() => null);
    return res.json({
      token: issueToken({ identifier: auth.identifier, via: auth.via, staff: !!auth.staff }),
      via: auth.via,
      staff: !!auth.staff,
      customer: customer
        ? { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone,
            address: customer.address }
        : { id: null, name: null, email: auth.identifier.includes('@') ? auth.identifier : null,
            phone: auth.identifier.includes('@') ? null : auth.identifier, address: null },
      known: Boolean(customer),
    });
  } catch (err) {
    return fail(res, err);
  }
});

/**
 * A signed-in customer's real orders, each joined to its shipment — J&T for
 * current orders, Bosta for older ones — so the app can show live state.
 */
app.get('/customer/orders', async (req, res) => {
  const s = session(req);
  const identifier = s?.identifier ?? req.query.identifier;
  if (!identifier) return res.status(401).json({ error: 'not signed in' });
  const lang = req.query.lang === 'en' ? 'en' : 'ar';

  try {
    const customer = await findCustomerOrders(identifier);
    if (!customer) return res.json({ customer: null, orders: [] });

    const { byName, error } = await trackOrders(customer.orders, lang);

    const orders = customer.orders.map((o) => {
      const t = byName.get(o.name) ?? null;
      const awb = t?.trackingNumber ?? o.trackingNumber ?? null;
      return {
        ...o,
        trackingNumber: awb,
        carrier: t?.carrier ?? null,
        // Distinguishes "no shipment yet" from "shipment exists, no events" —
        // the app says different things for each.
        hasAwb: Boolean(awb),
        hasDelivery: Boolean(t),
        stateCode: t?.stateCode ?? null,
        stateLabel: t?.stateLabel ?? null,
        step: o.cancelledAt ? 0 : t?.step ?? 0,
        courier: t?.courier ?? null,
        courierPhone: t?.courierPhone ?? null,
        actionNeeded: o.cancelledAt ? null : t?.actionNeeded ?? null,
        updates: mergeTimeline(o, t, lang),
      };
    });

    return res.json({
      customer: { name: customer.name, email: customer.email, phone: customer.phone,
                  address: customer.address },
      orders,
      staff: Boolean(s?.staff),
      // Present only when a courier call actually failed.
      shippingError: error,
    });
  } catch (err) {
    return fail(res, err);
  }
});

/**
 * Product catalogue, served from the Admin API so the app never needs a
 * second Shopify credential. `?ids=` is the app's local category ids
 * (comma-separated); omit it to get the app's default set.
 */
const DEFAULT_CATALOGUE_IDS = [
  'hookahs', 'tobacco', 'accessories', 'oka-parts', 'hoses', 'coal', 'dark-tobacco', 'bowls',
];

/**
 * The catalogue is the same for every shopper and changes rarely, but it is
 * the heaviest query the app makes and every launch asks for it. A short
 * cache — shared by concurrent requests while one is in flight — keeps a
 * burst of app opens from becoming a burst of Admin API calls.
 */
const CATALOGUE_TTL_MS = Number(process.env.CATALOGUE_TTL_MS ?? 60000);
const catalogueCache = new Map(); // key → { at, promise }

app.get('/catalogue', async (req, res) => {
  const ids = req.query.ids ? String(req.query.ids).split(',').filter(Boolean) : DEFAULT_CATALOGUE_IDS;
  const key = ids.join(',');
  let hit = catalogueCache.get(key);
  if (!hit || Date.now() - hit.at > CATALOGUE_TTL_MS) {
    hit = { at: Date.now(), promise: fetchAdminCatalogue(ids) };
    catalogueCache.set(key, hit);
    // A failure is never cached — the next request tries again.
    hit.promise.catch(() => catalogueCache.delete(key));
  }
  try {
    return res.json(await hit.promise);
  } catch (err) {
    return fail(res, err);
  }
});

/** A signed-in customer's real saved addresses. */
app.get('/customer/addresses', async (req, res) => {
  const s = session(req);
  const identifier = s?.identifier ?? req.query.identifier;
  if (!identifier) return res.status(401).json({ error: 'not signed in' });
  try {
    const addresses = await findCustomerAddresses(identifier);
    return res.json({ addresses });
  } catch (err) {
    return fail(res, err);
  }
});

/**
 * What this basket actually costs, according to Shopify — shipping tiers and
 * discount codes included. The app used to compute both from hardcoded tables.
 */
app.post('/checkout/calculate', async (req, res) => {
  try {
    const totals = await calculateTotals(req.body ?? {});
    return res.json(totals);
  } catch (err) {
    return fail(res, err);
  }
});

/** Saves a new address onto the signed-in customer's Shopify record. */
app.post('/customer/addresses', async (req, res) => {
  const s = session(req);
  const identifier = s?.identifier ?? req.body?.identifier;
  if (!identifier) return res.status(401).json({ error: 'not signed in' });
  try {
    const result = await createCustomerAddress(identifier, req.body?.address ?? {});
    return res.json(result);
  } catch (err) {
    return fail(res, err);
  }
});

/** Marks one of the signed-in customer's saved addresses as their default. */
app.post('/customer/addresses/default', async (req, res) => {
  const s = session(req);
  const identifier = s?.identifier ?? req.body?.identifier;
  if (!identifier) return res.status(401).json({ error: 'not signed in' });
  const addressId = req.body?.addressId;
  if (!addressId) return res.status(400).json({ error: 'addressId is required' });
  try {
    const result = await setDefaultAddress(identifier, addressId);
    return res.json(result);
  } catch (err) {
    return fail(res, err);
  }
});

/** Wishlist, stored on the customer so it survives a reinstall. */
app.get('/customer/wishlist', async (req, res) => {
  const s = session(req);
  const identifier = s?.identifier ?? req.query.identifier;
  if (!identifier) return res.status(401).json({ error: 'not signed in' });
  try {
    return res.json(await getWishlist(identifier));
  } catch (err) {
    return fail(res, err);
  }
});

app.post('/customer/wishlist', async (req, res) => {
  const s = session(req);
  const identifier = s?.identifier ?? req.body?.identifier;
  if (!identifier) return res.status(401).json({ error: 'not signed in' });
  try {
    return res.json(await setWishlist(identifier, req.body?.ids ?? []));
  } catch (err) {
    return fail(res, err);
  }
});

/** Cancels a real Shopify order. */
app.post('/orders/:name/cancel', async (req, res) => {
  try {
    const id = await orderIdByName(req.params.name);
    if (!id) return res.status(404).json({ error: `order ${req.params.name} not found` });
    const result = await cancelOrder(id, req.body?.reason ?? 'CUSTOMER');
    return res.json(result);
  } catch (err) {
    return fail(res, err);
  }
});

/**
 * Applies an edit to a real Shopify order. `lines` is the desired end state:
 * [{ variantId, quantity }].
 *
 * Refused once the order is fulfilled. The app hides the button in that case,
 * but an order can be fulfilled between the screen loading and the request
 * arriving, and Shopify would accept the edit — leaving the store's record
 * disagreeing with the parcel already on a courier's van.
 */
app.post('/orders/:name/edit', async (req, res) => {
  const lines = req.body?.lines;
  if (!Array.isArray(lines)) return res.status(400).json({ error: 'lines[] is required' });
  try {
    const order = await findOrder(req.params.name);
    if (!order) return res.status(404).json({ error: `order ${req.params.name} not found` });
    if (isShipped(order)) {
      return res.status(409).json({
        error: 'this order has already been fulfilled and can no longer be edited',
      });
    }
    const result = await editOrder(order.id, lines);
    return res.json(result);
  } catch (err) {
    return fail(res, err);
  }
});

/**
 * Redirects an order to one of the customer's other saved addresses.
 * `address` is the structured record from GET /customer/addresses.
 */
app.post('/orders/:name/address', async (req, res) => {
  const s = session(req);
  if (!s?.identifier) return res.status(401).json({ error: 'not signed in' });
  const address = req.body?.address;
  if (!address) return res.status(400).json({ error: 'address is required' });
  try {
    const result = await updateOrderAddress(req.params.name, address);
    return res.json(result);
  } catch (err) {
    // A fulfilled order is a refusal, not a server fault — the app shows the
    // reason rather than a generic failure.
    const msg = String(err.message ?? err);
    if (msg.includes('already been fulfilled')) return res.status(409).json({ error: msg });
    return fail(res, err);
  }
});

/** Native checkout: turn the app's basket into a real Shopify order. */
app.post('/orders', async (req, res) => {
  try {
    const order = await createOrder(req.body ?? {});
    // No courier lookup here: the AWB is issued later, when the order is
    // packed, so asking now only made every checkout wait on a courier API
    // for an answer that was always "not yet". The order screen picks the
    // shipment up as soon as it exists.
    res.json({
      orderNumber: order.name,
      shopifyOrderId: order.id,
      trackingNumber: null,
    });
  } catch (err) {
    fail(res, err);
  }
});

/** Merged Shopify + courier timeline for one order. */
app.get('/orders/status', async (req, res) => {
  const orderName = req.query.order;
  const tracking = req.query.tracking;
  const lang = req.query.lang === 'en' ? 'en' : 'ar';

  if (!orderName && !tracking) {
    return res.status(400).json({ error: 'order or tracking is required' });
  }

  try {
    const shopifyOrder = orderName ? await findOrder(orderName) : null;
    const info = shopifyOrder?.fulfillments?.flatMap((f) => f.trackingInfo ?? [])?.[0] ?? null;
    const order = {
      name: shopifyOrder?.name ?? orderName ?? tracking,
      trackingNumber: tracking ?? info?.number ?? null,
      trackingCompany: info?.company ?? null,
      createdAt: shopifyOrder?.createdAt ?? null,
      cancelledAt: shopifyOrder?.cancelledAt ?? null,
      fulfilledAt: shopifyOrder?.fulfillments?.[0]?.createdAt ?? null,
    };

    const { byName, error } = await trackOrders([order], lang);
    const t = byName.get(order.name) ?? null;

    return res.json({
      orderNumber: shopifyOrder?.name ?? orderName ?? null,
      trackingNumber: t?.trackingNumber ?? order.trackingNumber,
      carrier: t?.carrier ?? null,
      stateCode: t?.stateCode ?? null,
      stateLabel: t?.stateLabel ?? null,
      step: order.cancelledAt ? 0 : t?.step ?? 0,
      fulfillmentStatus: shopifyOrder?.displayFulfillmentStatus ?? null,
      financialStatus: shopifyOrder?.displayFinancialStatus ?? null,
      courier: t?.courier ?? null,
      courierPhone: t?.courierPhone ?? null,
      actionNeeded: order.cancelledAt ? null : t?.actionNeeded ?? null,
      updates: mergeTimeline(order, t, lang),
      shippingError: error,
    });
  } catch (err) {
    return fail(res, err);
  }
});

/**
 * What J&T actually returns for one order or AWB.
 *
 * `?order=#2745921` shows every J&T shipment filed under that order (including
 * cancelled attempts) and which one the app picked; `?tracking=JEG…` traces
 * one AWB. `?raw=1` adds J&T's own records.
 */
app.get('/debug/jt', async (req, res) => {
  const { tracking, order, raw } = req.query;
  const lang = req.query.lang === 'en' ? 'en' : 'ar';
  if (!tracking && !order) {
    return res.status(400).json({ error: 'tracking or order is required' });
  }
  try {
    let shipments = [];
    let picked = null;
    if (order) {
      const n = String(order).replace(/^#/, '');
      shipments = await getOrders([`SHOPIFY${n}`, `SHOPIFY${n}V2`, `SHOPIFY${n}V3`]);
      picked = (await findShipmentsByOrderNames([order])).get(order) ?? null;
    }
    const awb = tracking ?? picked?.billCode ?? null;
    const scans = awb ? (await trace([awb])).get(awb) ?? [] : [];
    return res.json({
      found: Boolean(awb),
      shipments: shipments.map((r) => ({
        txlogisticId: r.txlogisticId ?? null,
        billCode: r.billCode ?? null,
        orderStatus: r.orderStatus ?? null,
        createOrderTime: r.createOrderTime ?? null,
      })),
      picked: picked?.billCode ?? null,
      scanCount: scans.length,
      tracking: awb ? toTracking(awb, scans, lang) : null,
      ...(raw ? { rawShipments: shipments, rawScans: scans } : {}),
    });
  } catch (err) {
    return res.status(502).json({ found: false, error: String(err.message ?? err) });
  }
});

/**
 * What Bosta actually returns for one AWB or order name.
 *
 * A silent lookup failure looked exactly like a shipment with no events, and
 * cost several rounds of guessing to find. This answers the question directly:
 * which endpoint answered, what the raw state was, and how many timeline rows
 * came back. `?raw=1` returns Bosta's own record for the awkward cases.
 */
app.get('/debug/bosta', async (req, res) => {
  const { tracking, order, raw } = req.query;
  if (!tracking && !order) {
    return res.status(400).json({ error: 'tracking or order is required' });
  }
  try {
    const delivery = tracking
      ? await getDelivery(tracking)
      : await findDeliveryByOrderName(order);

    if (!delivery) {
      return res.json({ found: false, tracking: tracking ?? null, order: order ?? null });
    }
    return res.json({
      found: true,
      trackingNumber: delivery.trackingNumber ?? null,
      businessReference: delivery.businessReference ?? null,
      state: delivery.state?.value ?? null,
      stateCode: delivery.state?.code ?? null,
      waitingForBusinessAction: Boolean(delivery.state?.waitingForBusinessAction),
      exceptionCount: (delivery.state?.exception ?? []).length,
      timelineRows: (delivery.timeline ?? []).length,
      courier: delivery.star?.name ?? null,
      courierPhone: delivery.star?.phone ?? null,
      updates: toUpdates(delivery, req.query.lang === 'en' ? 'en' : 'ar'),
      actionNeeded: actionNeeded(delivery, req.query.lang === 'en' ? 'en' : 'ar'),
      ...(raw ? { rawDelivery: delivery } : {}),
    });
  } catch (err) {
    return res.status(502).json({ found: false, error: String(err.message ?? err) });
  }
});

/**
 * Loyalty balance — live Shopify store credit, at 10 points per EGP. The
 * store runs no separate loyalty app, so the credit balance itself is the
 * points balance; there is nothing else to reconcile.
 */
app.get('/loyalty', async (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.status(400).json({ error: 'phone is required' });
  try {
    const c = await findCustomerLoyalty(phone);
    if (!c) return res.json({ balance: 0, known: false });
    return res.json({ balance: c.balance, known: true });
  } catch (err) {
    return fail(res, err);
  }
});

/**
 * Redeeming a reward debits the equivalent EGP straight off the customer's
 * store credit — the balance shown afterwards is what Shopify itself now
 * holds, not a locally-tracked deduction.
 */
app.post('/loyalty/redeem', async (req, res) => {
  const { phone, cost } = req.body ?? {};
  if (!phone || !cost) return res.status(400).json({ error: 'phone and cost are required' });
  try {
    const c = await findCustomerLoyalty(phone);
    if (!c) return res.status(404).json({ error: 'customer not found' });
    if (c.balance < Number(cost)) {
      return res.status(409).json({ error: 'insufficient points' });
    }
    const result = await debitLoyaltyPoints(c.customerId, Number(cost));
    return res.json({ ok: true, balance: result.balance });
  } catch (err) {
    return fail(res, err);
  }
});

/**
 * Subscriptions — "subscribe & save".
 *
 * A standalone order mode: pick a delivery frequency and a basket, and the
 * scheduler (scheduler.js) turns that into a real COD Shopify order on each
 * due date automatically, at a discount that climbs with frequency. There is
 * no payment gateway behind this — it is a standing instruction, not a
 * billing contract — which is exactly what makes it possible to build on top
 * of the same cash-on-delivery order creation checkout already uses.
 */

/** The frequency tiers and their discounts. Public — no sign-in needed to browse. */
app.get('/subscription-frequencies', (_req, res) => {
  res.json({
    frequencies: FREQUENCIES.map(({ id, en, ar, intervalDays, discountPct }) => ({
      id,
      en,
      ar,
      intervalDays,
      discountPct,
    })),
  });
});

app.get('/subscriptions', async (req, res) => {
  const s = session(req);
  const identifier = s?.identifier ?? req.query.identifier;
  if (!identifier) return res.status(401).json({ error: 'not signed in' });
  try {
    return res.json({ subscriptions: await listSubscriptions(identifier) });
  } catch (err) {
    return fail(res, err);
  }
});

app.post('/subscriptions', async (req, res) => {
  const s = session(req);
  const identifier = s?.identifier ?? req.body?.identifier;
  if (!identifier) return res.status(401).json({ error: 'not signed in' });
  try {
    // The account's real Shopify id, so each cycle's order links back to it
    // the same way a native checkout order does — without it, Shopify's own
    // email/phone matching can silently miss.
    const customer = await findCustomerProfile(identifier).catch(() => null);
    const sub = await createSubscription({
      identifier,
      customerId: customer?.id ?? null,
      customerName: req.body?.customerName ?? customer?.name ?? null,
      email: req.body?.email ?? customer?.email ?? null,
      frequencyId: req.body?.frequencyId,
      items: req.body?.items ?? [],
      address: req.body?.address ?? {},
      shippingFee: req.body?.shippingFee,
    });
    return res.json({ subscription: sub });
  } catch (err) {
    return fail(res, err, 400);
  }
});

app.post('/subscriptions/:id/update', async (req, res) => {
  const s = session(req);
  if (!s?.identifier) return res.status(401).json({ error: 'not signed in' });
  try {
    const sub = await updateSubscription(req.params.id, s.identifier, req.body ?? {});
    return res.json({ subscription: sub });
  } catch (err) {
    return fail(res, err, 400);
  }
});

/** `status` is one of pause | resume | cancel. */
app.post('/subscriptions/:id/:status(pause|resume|cancel)', async (req, res) => {
  const s = session(req);
  if (!s?.identifier) return res.status(401).json({ error: 'not signed in' });
  const target = { pause: 'paused', resume: 'active', cancel: 'cancelled' }[req.params.status];
  try {
    const sub = await setSubscriptionStatus(req.params.id, s.identifier, target);
    return res.json({ subscription: sub });
  } catch (err) {
    return fail(res, err, 400);
  }
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  startSubscriptionScheduler();
  console.log(`OKA order service listening on :${port}`);
});
