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
  findOrder,
  getWishlist,
  isShipped,
  orderIdByName,
  setDefaultAddress,
  setWishlist,
  updateOrderAddress,
} from './shopify.js';
import {
  actionNeeded,
  findDeliveriesByOrderNames,
  findDeliveryByOrderName,
  findDeliveryByTracking,
  getDelivery,
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

    /**
     * Bosta failures are reported, not swallowed.
     *
     * Every lookup here used to end in `.catch(() => null)`, so an outage, a
     * bad key or a moved endpoint was indistinguishable from "this order has
     * no shipment" — the app just showed a short timeline and no courier,
     * with nothing anywhere saying why. Errors are collected and returned so
     * the client can say the difference out loud.
     */
    const bostaErrors = [];
    const note = (err) => {
      const msg = String(err?.message ?? err);
      if (!bostaErrors.includes(msg)) bostaErrors.push(msg);
      return null;
    };

    /**
     * Orders with an AWB on their Shopify fulfilment resolve exactly, one
     * request each. Everything else is matched by `businessReference` in a
     * single scan of recent deliveries, shared across all of them, rather
     * than re-walking those pages once per order.
     */
    const needRefLookup = customer.orders.filter((o) => !o.trackingNumber).map((o) => o.name);
    const byRef = needRefLookup.length
      ? await findDeliveriesByOrderNames(needRefLookup).catch((e) => {
          note(e);
          return new Map();
        })
      : new Map();

    const orders = await Promise.all(customer.orders.map(async (o) => {
      let delivery = null;

      if (o.trackingNumber) {
        delivery = await findDeliveryByTracking(o.trackingNumber).catch(note);
      } else {
        const summary = byRef.get(String(o.name).replace(/^#/, '')) ?? null;
        // The scan returns summaries; the detail record is what carries the
        // timeline, so it's re-fetched for the orders that actually matched.
        if (summary?.trackingNumber) {
          delivery = (await getDelivery(summary.trackingNumber).catch(note)) ?? summary;
        }
      }
      const code = delivery?.state?.code ?? null;

      // One chronological story from both systems, oldest first.
      const merged = [...shopifyEvents(o, lang), ...toUpdates(delivery, lang)]
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
        courierPhone: delivery?.star?.phone ?? null,
        actionNeeded: actionNeeded(delivery, lang),
        updates: merged,
      };
    }));

    return res.json({
      customer: { name: customer.name, email: customer.email, phone: customer.phone,
                  address: customer.address },
      orders,
      staff: Boolean(s?.staff),
      // Present only when a Bosta call actually failed — the app uses it to
      // say "we couldn't reach the courier" instead of implying no shipment.
      bostaError: bostaErrors.length ? bostaErrors.join('; ') : null,
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

    let bostaError = null;
    const noteErr = (err) => {
      bostaError = String(err?.message ?? err);
      return null;
    };

    const delivery = knownAwb
      ? await findDeliveryByTracking(knownAwb).catch(noteErr)
      : orderName
        ? await findDeliveryByOrderName(orderName).catch(noteErr)
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
      courierPhone: delivery?.star?.phone ?? null,
      attempts: delivery?.numberOfAttempts ?? 0,
      actionNeeded: actionNeeded(delivery, lang),
      updates: toUpdates(delivery, lang),
      bostaError,
    });
  } catch (err) {
    return fail(res, err);
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

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`OKA order service listening on :${port}`);
});
