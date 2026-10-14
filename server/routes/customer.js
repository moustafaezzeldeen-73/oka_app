import {
  addTags,
  createCustomerAddress,
  deleteCustomerAddress,
  findCustomerAddresses,
  findCustomerOrders,
  getWishlist,
  setDefaultAddress,
  setWishlist,
} from '../integrations/shopify.js';
import { requireSession } from '../auth/session.js';
import { trackOrders } from '../services/tracking.js';
import { registerPushToken, unregisterPushToken } from '../services/notify.js';
import { fail } from '../lib/http.js';
import { ownAddress } from '../lib/ownership.js';
import { mergeTimeline } from '../lib/timeline.js';


export default function customerRoutes(app) {
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
}
