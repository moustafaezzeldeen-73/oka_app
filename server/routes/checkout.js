import { findCustomerProfile } from '../integrations/shopify.js';
import { requireSession, sessionOf } from '../auth/session.js';
import { CheckoutError, placeOrder, quote } from '../services/checkout.js';
import { fail } from '../lib/http.js';
import { ownAddress } from '../lib/ownership.js';
import { rateLimit } from '../lib/rateLimit.js';


export default function checkoutRoutes(app) {
  const checkoutLimit = rateLimit({ windowMs: 60 * 1000, max: 30 });
  const orderLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, key: (req) => req.session?.customerId ?? req.ip });

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
}
