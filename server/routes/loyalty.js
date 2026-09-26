import { requireSession } from '../auth/session.js';
import { loyaltySummary, redeem } from '../services/loyalty.js';
import { fail } from '../lib/http.js';
import { rateLimit } from '../lib/rateLimit.js';


export default function loyaltyRoutes(app) {
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
}
