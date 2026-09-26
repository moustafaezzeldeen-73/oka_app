import crypto from 'node:crypto';

import express from 'express';

import {
  cancelOrder,
  createCustomerAddress,
  deleteCustomerAddress,
  editOrder,
  fetchAdminCatalogue,
  findCustomerAddresses,
  findCustomerOrders,
  findCustomerProfile,
  findOrCreateCustomerByPhone,
  findOrder,
  getWishlist,
  addTags,
  hasShopify,
  isShipped,
  ownsOrder,
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
import { assertAuthConfig, issueToken, requireSession, sessionOf } from './auth.js';
import { otpProvider, startOtp, verifyOtp } from './otp.js';
import { rateLimit } from './rateLimit.js';
import { CheckoutError, placeOrder, quote } from './checkout.js';
import { POLICY, REWARDS, paymentMethods } from './policy.js';
import { PROVINCES } from './zones.js';
import { loyaltySummary, redeem } from './loyalty.js';
import { registerPushToken, unregisterPushToken } from './notify.js';
import { startJobs } from './scheduler.js';
import {
  FREQUENCIES,
  createSubscription,
  listSubscriptions,
  setStatus as setSubscriptionStatus,
  updateSubscription,
} from './subscriptions.js';
// TESTING ONLY — delete this import and the mountTestLogin(app) call below before launch.
import { mountTestLogin, testLoginEnabled } from './testLogin.js';

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
 * anyone who downloads it. So the app holds no credentials, and everything
 * that needs authority — the catalogue, pricing and creating orders, reading
 * a customer's history, talking to J&T and Bosta — happens here.
 *
 * Every route that reads or changes a customer's data requires a signed-in
 * session (auth.js), acts only on that session's own customer, and checks
 * that any order it touches belongs to them.
 *
 * Environment: see .env.example.
 */

assertAuthConfig();

const app = express();
// Behind a proxy (Render, Fly, a load balancer) set TRUST_PROXY_HOPS=1 so rate
// limits key on the real client IP. Unset, X-Forwarded-For is ignored — a
// client could otherwise send a fake one to dodge the limits.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 0));
app.use(express.json({ limit: '256kb' }));

app.use((req, res, next) => {
  const origin = process.env.ALLOWED_ORIGIN;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

/**
 * Errors carrying a `status` are the shopper's to fix and say so; anything
 * else is a dependency failing, logged in full and reported as 502.
 */
const fail = (res, err, status = 502) => {
  const code = err?.status ?? status;
  if (code >= 500) console.error(err);
  res.status(code).json({
    error: err?.message ?? String(err),
    ...(err?.code ? { code: err.code } : {}),
    ...(err?.problems ? { problems: err.problems } : {}),
  });
};

/** Staff-only diagnostics: a STAFF_DEBUG_KEY header, or they don't exist. */
function requireStaff(req, res, next) {
  const want = process.env.STAFF_DEBUG_KEY || '';
  const given = String(req.headers['x-staff-key'] ?? '');
  const ok =
    want.length >= 16 &&
    given.length === want.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want));
  return ok ? next() : res.status(404).json({ error: 'not found' });
}

const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'too many sign-in attempts — try again later' });
const otpPhoneLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  key: (req) => `otp:${String(req.body?.phone ?? '').replace(/\D/g, '').slice(-10)}`,
  message: 'too many codes requested for this number — try again in an hour',
});
const checkoutLimit = rateLimit({ windowMs: 60 * 1000, max: 30 });
const orderLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, key: (req) => req.session?.customerId ?? req.ip });

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

/**
 * Everything the app needs to price and present the store honestly: the
 * shipping policy, payment methods on offer, governorates, loyalty rewards
 * and the subscription discount. Public.
 */
app.get('/storefront-config', (_req, res) => {
  res.json({
    currency: POLICY.currency,
    shippingFee: POLICY.shippingFee,
    freeShippingMin: POLICY.freeShippingMin,
    minOrder: POLICY.minOrder,
    prepaidShippingDiscount: POLICY.prepaidShippingDiscount,
    paymentMethods: paymentMethods(),
    provinces: PROVINCES,
    loyalty: { pointsPerEgp: POLICY.loyalty.pointsPerEgp, earnPointsPerEgp: POLICY.loyalty.earnPointsPerEgp, rewards: REWARDS },
    subscriptionDiscountPct: POLICY.subscriptionDiscountPct,
    signIn: { otp: Boolean(otpProvider()), testLogin: testLoginEnabled() },
    support: {
      whatsapp: process.env.SUPPORT_WHATSAPP || null,
      policiesBaseUrl: process.env.POLICIES_BASE_URL || 'https://www.okaegypt.com/policies',
    },
  });
});

/* ── Sign-in ───────────────────────────────────────────────────────────── */

/** Sends a one-time code to the phone. */
app.post('/auth/otp/start', authLimit, otpPhoneLimit, async (req, res) => {
  try {
    const { phone } = await startOtp(req.body?.phone);
    return res.json({ ok: true, phone });
  } catch (err) {
    return fail(res, err);
  }
});

/** Checks the code, then signs in — creating the account on first use. */
app.post('/auth/otp/verify', authLimit, async (req, res) => {
  const result = verifyOtp(req.body?.phone, req.body?.code);
  if (!result.ok) return res.status(401).json({ error: result.error });
  try {
    const { customer, created } = await findOrCreateCustomerByPhone(result.phone, req.body?.name);
    return res.json({
      token: issueToken({ identifier: result.phone, customerId: customer.id, via: 'otp' }),
      via: 'otp',
      customer,
      created,
    });
  } catch (err) {
    return fail(res, err);
  }
});

/** The signed-in customer, used by the app to restore a saved session. */
app.get('/auth/me', requireSession, async (req, res) => {
  try {
    const customer = await findCustomerProfile(req.session.customerId);
    if (!customer) return res.status(401).json({ error: 'account not found' });
    return res.json({ customer, via: req.session.via, test: Boolean(req.session.test) });
  } catch (err) {
    return fail(res, err);
  }
});

// TESTING ONLY — delete before launch (see server/testLogin.js).
mountTestLogin(app);

/* ── Catalogue ─────────────────────────────────────────────────────────── */

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

/* ── The signed-in customer ────────────────────────────────────────────── */

/**
 * The customer's real orders, each joined to its shipment — J&T for current
 * orders, Bosta for older ones — so the app can show live state.
 */
app.get('/customer/orders', requireSession, async (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : 'ar';
  try {
    const customer = await findCustomerOrders(req.session.customerId);
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
      customer: { name: customer.name, email: customer.email, phone: customer.phone, address: customer.address },
      orders,
      // Present only when a courier call actually failed.
      shippingError: error,
    });
  } catch (err) {
    return fail(res, err);
  }
});

/** The customer's saved addresses, default first. */
app.get('/customer/addresses', requireSession, async (req, res) => {
  try {
    return res.json({ addresses: await findCustomerAddresses(req.session.customerId) });
  } catch (err) {
    return fail(res, err);
  }
});

/** One of the customer's own saved addresses, or a 404-style refusal. */
async function ownAddress(customerId, addressId) {
  if (!addressId) throw Object.assign(new Error('choose a delivery address'), { status: 400, code: 'address' });
  const found = (await findCustomerAddresses(customerId)).find((a) => a.id === addressId);
  if (!found) throw Object.assign(new Error('address not found'), { status: 404, code: 'address' });
  return found;
}

app.post('/customer/addresses', requireSession, async (req, res) => {
  try {
    const result = await createCustomerAddress(req.session.customerId, req.body?.address ?? {}, {
      setAsDefault: Boolean(req.body?.setAsDefault),
    });
    return res.json(result);
  } catch (err) {
    // Validation messages from createCustomerAddress are the shopper's to fix.
    return fail(res, err, /required|choose|valid/i.test(err.message) ? 400 : 502);
  }
});

app.post('/customer/addresses/default', requireSession, async (req, res) => {
  try {
    await ownAddress(req.session.customerId, req.body?.addressId);
    return res.json(await setDefaultAddress(req.session.customerId, req.body.addressId));
  } catch (err) {
    return fail(res, err);
  }
});

app.post('/customer/addresses/delete', requireSession, async (req, res) => {
  try {
    await ownAddress(req.session.customerId, req.body?.addressId);
    return res.json(await deleteCustomerAddress(req.session.customerId, req.body.addressId));
  } catch (err) {
    return fail(res, err);
  }
});

/** Wishlist, stored on the customer so it survives a reinstall. */
app.get('/customer/wishlist', requireSession, async (req, res) => {
  try {
    return res.json(await getWishlist(req.session.customerId));
  } catch (err) {
    return fail(res, err);
  }
});

app.post('/customer/wishlist', requireSession, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 200) : [];
  try {
    return res.json(await setWishlist(req.session.customerId, ids));
  } catch (err) {
    return fail(res, err);
  }
});

/** Registers this device for shipment notifications. */
app.post('/customer/push-token', requireSession, async (req, res) => {
  try {
    const fn = req.body?.remove ? unregisterPushToken : registerPushToken;
    return res.json(await fn(req.session.customerId, req.body?.token));
  } catch (err) {
    return fail(res, err);
  }
});

/**
 * Account deletion request (the App Store requires a way to ask for it in
 * the app). Shopify won't delete a customer who has orders, so the account is
 * tagged for the team to anonymise and the app signs out.
 */
app.post('/customer/delete-request', requireSession, async (req, res) => {
  try {
    await addTags(req.session.customerId, ['deletion-requested', `deletion-requested:${new Date().toISOString().slice(0, 10)}`]);
    console.warn(`[oka][account] deletion requested by ${req.session.customerId}`);
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

/* ── Checkout ──────────────────────────────────────────────────────────── */

/**
 * What a basket costs, priced by the server. Works signed out (the cart
 * shows totals before sign-in); a signed-in customer's own vouchers and
 * chosen address are taken into account.
 */
app.post('/checkout/quote', checkoutLimit, async (req, res) => {
  const s = sessionOf(req);
  try {
    const address = s?.customerId && req.body?.addressId
      ? (await ownAddress(s.customerId, req.body.addressId)).raw
      : null;
    const q = await quote({
      lines: req.body?.lines,
      discountCode: req.body?.discountCode,
      paymentMethod: req.body?.paymentMethod ?? 'cod',
      customerId: s?.customerId ?? null,
      address,
    });
    return res.json(q);
  } catch (err) {
    return fail(res, err, err instanceof CheckoutError ? err.status : 502);
  }
});

/**
 * Places the order. The customer is the session's; the address must be one
 * of theirs; prices, discount and shipping are the server's. Send the same
 * `idempotencyKey` on a retry and the first order comes back.
 */
app.post('/orders', requireSession, orderLimit, async (req, res) => {
  try {
    const customer = await findCustomerProfile(req.session.customerId);
    if (!customer) return res.status(401).json({ error: 'account not found' });
    const addr = await ownAddress(customer.id, req.body?.addressId);

    const result = await placeOrder({
      idempotencyKey: req.body?.idempotencyKey,
      customer,
      address: addr.raw,
      lang: req.body?.lang === 'en' ? 'en' : 'ar',
      lines: req.body?.lines,
      discountCode: req.body?.discountCode,
      paymentMethod: req.body?.paymentMethod ?? 'cod',
    });
    return res.json({
      orderNumber: result.orderNumber,
      shopifyOrderId: result.shopifyOrderId,
      total: result.total,
      shipping: result.quote.shipping,
      discount: result.quote.discount.amount,
      eta: result.quote.eta,
      trackingNumber: null,
    });
  } catch (err) {
    return fail(res, err, err instanceof CheckoutError ? err.status : 502);
  }
});

/* ── One order ─────────────────────────────────────────────────────────── */

/**
 * Loads an order for a mutation or a status read, refusing anything that
 * isn't the session customer's. "Not found" either way, so order numbers
 * can't be probed.
 */
async function ownOrder(req) {
  const order = await findOrder(req.params.name ?? req.query.order);
  if (!ownsOrder(order, req.session.customerId)) {
    throw Object.assign(new Error('order not found'), { status: 404 });
  }
  return order;
}

app.post('/orders/:name/cancel', requireSession, async (req, res) => {
  try {
    const order = await ownOrder(req);
    if (order.cancelledAt) return res.status(409).json({ error: 'this order is already cancelled' });
    if (isShipped(order)) {
      return res.status(409).json({ error: 'this order is already with the courier and can no longer be cancelled' });
    }
    return res.json(await cancelOrder(order.id, 'CUSTOMER'));
  } catch (err) {
    return fail(res, err);
  }
});

/**
 * Applies an edit. `lines` is the desired end state: [{ variantId, quantity }].
 * Refused once the order is fulfilled — the app hides the button then, but an
 * order can be fulfilled between the screen loading and the request arriving.
 */
app.post('/orders/:name/edit', requireSession, async (req, res) => {
  const lines = req.body?.lines;
  if (!Array.isArray(lines)) return res.status(400).json({ error: 'lines[] is required' });
  if (lines.some((l) => !(Number(l?.quantity) >= 0) || Number(l.quantity) > 50)) {
    return res.status(400).json({ error: 'quantities must be between 0 and 50' });
  }
  try {
    const order = await ownOrder(req);
    if (order.cancelledAt) return res.status(409).json({ error: 'this order is cancelled' });
    if (isShipped(order)) {
      return res.status(409).json({ error: 'this order has already been fulfilled and can no longer be edited' });
    }
    return res.json(await editOrder(order.id, lines));
  } catch (err) {
    return fail(res, err);
  }
});

/** Redirects an order to another of the customer's own saved addresses. */
app.post('/orders/:name/address', requireSession, async (req, res) => {
  try {
    const order = await ownOrder(req);
    const addr = await ownAddress(req.session.customerId, req.body?.addressId);
    return res.json(await updateOrderAddress(order, addr.raw));
  } catch (err) {
    const msg = String(err.message ?? err);
    if (msg.includes('already been fulfilled')) return res.status(409).json({ error: msg });
    return fail(res, err);
  }
});

/** Merged Shopify + courier timeline for one of the customer's orders. */
app.get('/orders/status', requireSession, async (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : 'ar';
  if (!req.query.order) return res.status(400).json({ error: 'order is required' });
  try {
    const shopifyOrder = await ownOrder(req);
    const info = shopifyOrder.fulfillments?.flatMap((f) => f.trackingInfo ?? [])?.[0] ?? null;
    const order = {
      name: shopifyOrder.name,
      trackingNumber: info?.number ?? null,
      trackingCompany: info?.company ?? null,
      createdAt: shopifyOrder.createdAt,
      cancelledAt: shopifyOrder.cancelledAt,
      fulfilledAt: shopifyOrder.fulfillments?.[0]?.createdAt ?? null,
    };
    const { byName, error } = await trackOrders([order], lang);
    const t = byName.get(order.name) ?? null;

    return res.json({
      orderNumber: shopifyOrder.name,
      trackingNumber: t?.trackingNumber ?? order.trackingNumber,
      carrier: t?.carrier ?? null,
      stateCode: t?.stateCode ?? null,
      stateLabel: t?.stateLabel ?? null,
      step: order.cancelledAt ? 0 : t?.step ?? 0,
      fulfillmentStatus: shopifyOrder.displayFulfillmentStatus ?? null,
      financialStatus: shopifyOrder.displayFinancialStatus ?? null,
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
app.get('/debug/jt', requireStaff, async (req, res) => {
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
app.get('/debug/bosta', requireStaff, async (req, res) => {
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


/* ── Loyalty ───────────────────────────────────────────────────────────── */

app.get('/loyalty', requireSession, async (req, res) => {
  try {
    return res.json(await loyaltySummary(req.session.customerId));
  } catch (err) {
    return fail(res, err);
  }
});

/** Spends points on a reward and returns its single-use voucher code. */
app.post('/loyalty/redeem', requireSession, rateLimit({ windowMs: 60 * 1000, max: 5 }), async (req, res) => {
  try {
    return res.json(await redeem(req.session.customerId, req.body?.rewardId));
  } catch (err) {
    return fail(res, err);
  }
});

/* ── Subscriptions ─────────────────────────────────────────────────────────
 * A standing instruction the scheduler turns into a COD order on each due
 * date, re-priced from the live catalogue every cycle. See scheduler.js.
 */

app.get('/subscription-frequencies', (_req, res) => {
  res.json({
    frequencies: FREQUENCIES.map(({ id, en, ar, intervalDays, discountPct }) => ({ id, en, ar, intervalDays, discountPct })),
  });
});

app.get('/subscriptions', requireSession, async (req, res) => {
  try {
    return res.json({ subscriptions: await listSubscriptions(req.session.customerId) });
  } catch (err) {
    return fail(res, err);
  }
});

app.post('/subscriptions', requireSession, async (req, res) => {
  try {
    const customer = await findCustomerProfile(req.session.customerId);
    if (!customer) return res.status(401).json({ error: 'account not found' });
    const addr = await ownAddress(customer.id, req.body?.addressId);
    const sub = await createSubscription({
      customerId: customer.id,
      customerName: customer.name || addr.name || null,
      email: customer.email ?? null,
      frequencyId: req.body?.frequencyId,
      items: req.body?.items ?? [],
      address: addr.raw,
    });
    return res.json({ subscription: sub });
  } catch (err) {
    return fail(res, err, 400);
  }
});

app.post('/subscriptions/:id/update', requireSession, async (req, res) => {
  try {
    const patch = { items: req.body?.items, frequencyId: req.body?.frequencyId };
    if (req.body?.addressId) patch.address = (await ownAddress(req.session.customerId, req.body.addressId)).raw;
    const sub = await updateSubscription(req.params.id, req.session.customerId, patch);
    return res.json({ subscription: sub });
  } catch (err) {
    return fail(res, err, 400);
  }
});

/** `status` is one of pause | resume | cancel. */
app.post('/subscriptions/:id/:status(pause|resume|cancel)', requireSession, async (req, res) => {
  const target = { pause: 'paused', resume: 'active', cancel: 'cancelled' }[req.params.status];
  try {
    const sub = await setSubscriptionStatus(req.params.id, req.session.customerId, target);
    return res.json({ subscription: sub });
  } catch (err) {
    return fail(res, err, 400);
  }
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  startJobs();
  console.log(`OKA order service listening on :${port}`);
});
