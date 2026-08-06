import express from 'express';

import { createOrder, findCustomerLoyalty, findOrder, setRedeemed } from './shopify.js';
import {
  findDeliveryByOrderName,
  findDeliveryByTracking,
  stepFromState,
  toUpdates,
} from './bosta.js';

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

app.get('/health', (_req, res) => res.json({ ok: true }));

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
        ? await findDeliveryByOrderName(orderName).catch(() => null)
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
