import { cancelOrder, editOrder, isShipped, updateOrderAddress } from '../integrations/shopify.js';
import { requireSession } from '../auth/session.js';
import { trackOrders } from '../services/tracking.js';
import { fail } from '../lib/http.js';
import { ownAddress, ownOrder } from '../lib/ownership.js';
import { mergeTimeline } from '../lib/timeline.js';

/* ── One order: cancel, edit, redirect, status ─────────────────────────── */


export default function orderRoutes(app) {
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
}
