import express from 'express';

import {
  calculateTotals,
  cancelOrder,
  createCustomerAddress,
  createOrder,
  editOrder,
  fetchAdminCatalogue,
  findCustomerAddresses,
  findCustomerLoyalty,
  findCustomerOrders,
  findOrder,
  getWishlist,
  orderIdByName,
  setRedeemed,
  setWishlist,
} from './shopify.js';
import {
  findDeliveriesByPhone,
  findDeliveryByOrderName,
  findDeliveryByTracking,
  pingBosta,
  stepFromState,
  toUpdates,
} from './bosta.js';
import { authenticate, issueToken, verifyToken } from './auth.js';

/**
 * Shopify's own milestones, merged into the Bosta timeline so the order screen
 * shows one story rather than only the courier's half of it. Same shape as
 * Bosta's rows, and only events that have actually happened.
 */
function shopifyEvents(order, lang) {
  const ar = lang === 'ar';
  const fmt = (t) =>
    t
      ? new Date(t).toLocaleString(ar ? 'ar-EG' : 'en-GB', {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          timeZone: 'Africa/Cairo',
        })
      : '';

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
/**
 * OKA order service.
 *
 * The mobile app is a public client: anything bundled into it can be read by
 * anyone who downloads it. So the app holds only the Storefront API public
 * token (catalogue + cart), and everything that needs real authority — creating
 * orders, reading a customer's history, talking to Bosta — happens here.
 *
 * Required environment:
 *   SHOPIFY_SHOP_DOMAIN   e.g. okaegypt.myshopify.com
 *   SHOPIFY_ADMIN_TOKEN   shpat_… (Admin API access token)
 *   BOSTA_API_KEY         Bosta business API key
 * Optional:
 *   PORT (default 8787), SHOPIFY_API_VERSION, ALLOWED_ORIGIN
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
    SHOPIFY_SHOP_DOMAIN: Boolean(process.env.SHOPIFY_SHOP_DOMAIN),
    SHOPIFY_ADMIN_TOKEN: Boolean(process.env.SHOPIFY_ADMIN_TOKEN),
    BOSTA_API_KEY: Boolean(process.env.BOSTA_API_KEY),
  };

  const shopify = await withDeadline(
    findOrder('#1').then(() => ({ ok: true })).catch((e) => ({ ok: false, error: e.message })),
    16000,
    'shopify',
  );
  const bosta = await withDeadline(pingBosta(), 10000, 'bosta');

  res.json({ ok: true, env, shopify, bosta });
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
    const customer = await findCustomerOrders(auth.identifier).catch(() => null);
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
 * A signed-in customer's real orders, each joined to its Bosta delivery so the
 * app can show live shipment state per order.
 */
app.get('/customer/orders', async (req, res) => {
  const s = session(req);
  const identifier = s?.identifier ?? req.query.identifier;
  if (!identifier) return res.status(401).json({ error: 'not signed in' });
  const lang = req.query.lang === 'en' ? 'en' : 'ar';

  try {
    const customer = await findCustomerOrders(identifier);
    if (!customer) return res.json({ customer: null, orders: [] });

    const deliveries = await findDeliveriesByPhone(customer.phone).catch(() => []);
    const byRef = new Map();
    for (const d of deliveries) {
      if (d.businessReference) byRef.set(String(d.businessReference).replace(/^#/, ''), d);
      if (d.trackingNumber) byRef.set(d.trackingNumber, d);
    }

    /**
     * Each order gets its own delivery or none at all.
     *
     * The only trustworthy links are the AWB Shopify recorded on the
     * fulfilment, and an exact businessReference match. Matching on the
     * customer's phone would attach an arbitrary one of their deliveries to
     * every one of their orders — with several orders in flight that is
     * guaranteed to show the wrong shipment somewhere, which is worse than
     * showing none.
     */
    const orders = customer.orders.map((o) => {
      const delivery =
        (o.trackingNumber ? byRef.get(o.trackingNumber) : null) ??
        byRef.get(String(o.name).replace(/^#/, '')) ??
        null;
      const code = delivery?.state?.code ?? null;

      // One chronological story from both systems, oldest first.
      const merged = [...shopifyEvents(o, lang), ...toUpdates(delivery, lang).map((u, i) => ({
        ...u,
        at: delivery ? [
          delivery.createdAt,
          delivery.collectedFromBusiness ?? delivery.state?.pickedUpTime,
          delivery.state?.receivedAtWarehouse?.time,
          delivery.state?.delivering?.time,
          delivery.state?.deliveryTime,
        ].filter(Boolean)[i] ?? null : null,
      }))]
        .filter((r) => r.at)
        .sort((a, b) => new Date(a.at) - new Date(b.at))
        .map(({ at, ...row }) => row);

      const awb = delivery?.trackingNumber ?? o.trackingNumber ?? null;

      return {
        ...o,
        trackingNumber: awb,
        // Distinguishes "no shipment yet" from "shipment exists, no events" —
        // the app says different things for each.
        hasAwb: Boolean(awb),
        hasDelivery: Boolean(delivery),
        bostaStateCode: code,
        stateLabel: delivery?.state?.value ?? null,
        step: o.cancelledAt ? 0 : stepFromState(code),
        courier: delivery?.star?.name ?? null,
        updates: merged,
      };
    });

    return res.json({
      customer: { name: customer.name, email: customer.email, phone: customer.phone,
                  address: customer.address },
      orders,
      staff: Boolean(s?.staff),
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

app.get('/catalogue', async (req, res) => {
  const ids = req.query.ids ? String(req.query.ids).split(',').filter(Boolean) : DEFAULT_CATALOGUE_IDS;
  try {
    const result = await fetchAdminCatalogue(ids);
    return res.json(result);
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
 */
app.post('/orders/:name/edit', async (req, res) => {
  const lines = req.body?.lines;
  if (!Array.isArray(lines)) return res.status(400).json({ error: 'lines[] is required' });
  try {
    const id = await orderIdByName(req.params.name);
    if (!id) return res.status(404).json({ error: `order ${req.params.name} not found` });
    const result = await editOrder(id, lines);
    return res.json(result);
  } catch (err) {
    return fail(res, err);
  }
});

/** Native checkout: turn the app's basket into a real Shopify order. */
app.post('/orders', async (req, res) => {
  try {
    const order = await createOrder(req.body ?? {});
    let trackingNumber = null;
    try {
      const delivery = await findDeliveryByOrderName(order.name);
      trackingNumber = delivery?.trackingNumber ?? null;
    } catch {
      // An AWB usually doesn't exist yet at order time; the status endpoint
      // picks it up on the next poll.
    }
    res.json({
      orderNumber: order.name,
      shopifyOrderId: order.id,
      trackingNumber,
    });
  } catch (err) {
    fail(res, err);
  }
});

/** Merged Shopify fulfilment + Bosta timeline for one order. */
app.get('/orders/status', async (req, res) => {
  const orderName = req.query.order;
  const tracking = req.query.tracking;
  const lang = req.query.lang === 'en' ? 'en' : 'ar';

  if (!orderName && !tracking) {
    return res.status(400).json({ error: 'order or tracking is required' });
  }

  try {
    const shopifyOrder = orderName ? await findOrder(orderName) : null;

    // Prefer an explicit AWB, then Shopify's own tracking number, then a
    // lookup by order name — Bosta records carry it as `businessReference`.
    const awbFromShopify =
      shopifyOrder?.fulfillments?.flatMap((f) => f.trackingInfo ?? [])?.[0]?.number ?? null;
    const knownAwb = tracking ?? awbFromShopify;

    const delivery = knownAwb
      ? await findDeliveryByTracking(knownAwb).catch(() => null)
      : orderName
        ? await findDeliveryByOrderName(orderName, { phone: req.query.phone }).catch(() => null)
        : null;

    const awb = delivery?.trackingNumber ?? knownAwb ?? null;
    const stateCode = delivery?.state?.code ?? null;

    return res.json({
      orderNumber: shopifyOrder?.name ?? orderName ?? null,
      trackingNumber: awb,
      bostaStateCode: stateCode,
      stateLabel: delivery?.state?.value ?? null,
      step: stepFromState(stateCode),
      fulfillmentStatus: shopifyOrder?.displayFulfillmentStatus ?? null,
      financialStatus: shopifyOrder?.displayFinancialStatus ?? null,
      courier: delivery?.star?.name ?? null,
      attempts: delivery?.numberOfAttempts ?? 0,
      updates: toUpdates(delivery, lang),
    });
  } catch (err) {
    return fail(res, err);
  }
});

/**
 * Loyalty balance.
 *
 * The store runs no loyalty app, so the balance is derived the way the app's
 * own earn rules describe it — 1 point per EGP spent — less whatever has been
 * redeemed, which is kept in an `oka.loyalty_redeemed` customer metafield.
 */
app.get('/loyalty', async (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.status(400).json({ error: 'phone is required' });
  try {
    const c = await findCustomerLoyalty(phone);
    if (!c) return res.json({ balance: 0, earned: 0, redeemed: 0, known: false });
    return res.json({
      balance: Math.max(0, c.earned - c.redeemed),
      earned: c.earned,
      redeemed: c.redeemed,
      known: true,
    });
  } catch (err) {
    return fail(res, err);
  }
});

app.post('/loyalty/redeem', async (req, res) => {
  const { phone, cost } = req.body ?? {};
  if (!phone || !cost) return res.status(400).json({ error: 'phone and cost are required' });
  try {
    const c = await findCustomerLoyalty(phone);
    if (!c) return res.status(404).json({ error: 'customer not found' });
    if (c.earned - c.redeemed < Number(cost)) {
      return res.status(409).json({ error: 'insufficient points' });
    }
    await setRedeemed(c.id, c.redeemed + Number(cost));
    return res.json({ ok: true, balance: c.earned - c.redeemed - Number(cost) });
  } catch (err) {
    return fail(res, err);
  }
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`OKA order service listening on :${port}`);
});
