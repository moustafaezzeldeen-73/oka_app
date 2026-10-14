import { findCustomerProfile } from '../integrations/shopify.js';
import { requireSession } from '../auth/session.js';
import {
  FREQUENCIES,
  createSubscription,
  listSubscriptions,
  setStatus as setSubscriptionStatus,
  updateSubscription,
} from '../services/subscriptions.js';
import { fail } from '../lib/http.js';
import { ownAddress } from '../lib/ownership.js';


export default function subscriptionRoutes(app) {
  /* ── Subscriptions ─────────────────────────────────────────────────────────
   * A standing instruction the scheduler turns into a COD order on each due
   * date, re-priced from the live catalogue every cycle. See services/jobs.js.
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
}
